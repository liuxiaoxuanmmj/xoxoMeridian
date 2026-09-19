import type { Prisma } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { runAgentTask } from "@/agent/agent-runtime";
import { buildAgentContext } from "@/agent/context-builder";
import { beginAgentStep, completeAgentStep, executeDurableToolStep } from "@/agent/durable-step";
import { ExecutionTracer } from "@/agent/execution-tracer";
import { claimAgentTask } from "@/agent/task-claim";
import { createToolRegistry } from "@/agent/tool-registry";
import type { AgentPlan } from "@/agent/types";
import { prisma } from "@/lib/prisma";
import { cancelOnlyPlan, scheduleClarificationPrompt } from "@/tests/fixtures/schedule-clarification";
import { createTestRoom, createTestUser, resetTestDatabase } from "@/tests/integration/support/database";

const planner = vi.hoisted(() => vi.fn());
vi.mock("@/agent/llm-provider", () => ({
  createLLMProvider: () => ({ name: "test-planner", model: "test-model", plan: planner })
}));

beforeEach(async () => {
  planner.mockReset().mockRejectedValue(new Error("恢复计划不应重新调用 Planner"));
  await resetTestDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

const validPlan: AgentPlan = {
  intent: "create_memo",
  confidence: 0.9,
  requiredTools: ["memo.create"],
  taskSteps: ["保存备忘"],
  finalResponsePlan: "确认保存",
  finalResponseText: "备忘录已经保存成功。",
  toolInputs: { "memo.create": { content: "周末散步" } }
};

async function fixture(plan?: unknown) {
  const room = await createTestRoom();
  const user = await createTestUser();
  await prisma.roomParticipant.create({ data: { roomId: room.id, userId: user.id } });
  const agent = await prisma.agent.create({
    data: { slug: "plan-validation-agent", displayName: "测试助手", description: "验证计划恢复" }
  });
  const task = await prisma.agentTask.create({
    data: {
      roomId: room.id,
      agentId: agent.id,
      requestedById: user.id,
      input: { normalizedContent: "帮我记录周末散步", trigger: "mention" },
      ...(plan === undefined ? {} : { plan: plan as Prisma.InputJsonObject })
    }
  });
  return { room, user, agent, task };
}

async function checkpoint(
  data: Awaited<ReturnType<typeof fixture>>,
  plan: unknown,
  availableTools = createToolRegistry().list().map((tool) => tool.name)
) {
  const claim = await claimAgentTask(data.task.id, { workerId: "old-worker", leaseDurationMs: 60_000 });
  expect(claim.claimed).toBe(true);
  const lease = { attemptId: claim.attemptId, workerId: claim.workerId, leaseDurationMs: claim.leaseDurationMs };
  await beginAgentStep({
    taskId: data.task.id, roomId: data.room.id, lease, stepKey: "plan", kind: "plan",
    stepInput: { prompt: "帮我记录周末散步", requestedById: data.user.id, availableTools }
  });
  await completeAgentStep({
    taskId: data.task.id, roomId: data.room.id, lease, stepKey: "plan", output: plan,
    taskData: { plan: plan as Prisma.InputJsonObject }
  });
  return lease;
}

async function expireLease(taskId: string) {
  await prisma.agentTask.update({ where: { id: taskId }, data: { leaseExpiresAt: new Date(0) } });
}

async function expectRejected(data: Awaited<ReturnType<typeof fixture>>, code: string) {
  await runAgentTask(data.task.id, { workerId: "recovery-worker" });
  const task = await prisma.agentTask.findUniqueOrThrow({
    where: { id: data.task.id },
    include: { finalMessage: true, toolCalls: true, steps: true, eventLogs: true }
  });
  expect(task).toMatchObject({
    status: "failed",
    toolCallsUsed: 0,
    finalMessage: {
      status: "failed",
      metadata: expect.objectContaining({ errorCategory: "validation" })
    }
  });
  expect(task.finalMessage?.content).toContain("任务未完成");
  expect(task.finalMessage?.content).not.toContain(validPlan.finalResponseText);
  expect(task.error).toMatch(/plan validation/i);
  expect(task.error!.length).toBeLessThanOrEqual(512);
  expect(task.toolCalls).toHaveLength(0);
  expect(task.steps.filter((step) => step.kind === "tool")).toHaveLength(0);
  expect(task.eventLogs).toEqual(expect.arrayContaining([
    expect.objectContaining({
      type: "agent.plan.validation.failed",
      payload: expect.objectContaining({ issueCodes: expect.arrayContaining([code]) })
    }),
    expect.objectContaining({ type: "agent.task.failed" })
  ]));
  await expect(prisma.memo.count()).resolves.toBe(0);
  await expect(prisma.scheduledJob.count()).resolves.toBe(0);
  await expect(prisma.message.count({ where: { roomId: data.room.id } })).resolves.toBe(1);
  return task;
}

describe("Agent plan validation before any durable Tool execution", () => {
  it.each([
    ["unknown_tool", { ...validPlan, requiredTools: ["memo.create", "memo.retired"] }],
    ["invalid_tool_input", { ...validPlan, toolInputs: { "memo.create": [{ content: "不能先保存" }, {}] } }],
    ["empty_tool_calls", { ...validPlan, toolInputs: { "memo.create": [] } }],
    ["invalid_structure", { intent: "create_memo" }]
  ])("rejects invalid AgentTask.plan (%s) without replanning or partial writes", async (code, plan) => {
    const data = await fixture(plan);
    await expectRejected(data, code as string);
    expect(planner).not.toHaveBeenCalled();
  });

  it("revalidates a completed checkpoint against a Registry that removed a Tool", async () => {
    const data = await fixture();
    await checkpoint(data, {
      ...validPlan,
      requiredTools: ["memo.create", "memo.retired"],
      toolInputs: { ...validPlan.toolInputs, "memo.retired": {} }
    }, [...createToolRegistry().list().map((tool) => tool.name), "memo.retired"]);
    await expireLease(data.task.id);
    await expectRejected(data, "unknown_tool");
    expect(planner).not.toHaveBeenCalled();
  });

  it("revalidates legacy checkpoint inputs against current Registry schemas", async () => {
    const data = await fixture();
    await checkpoint(data, { ...validPlan, toolInputs: { "memo.create": { body: "旧参数名称" } } });
    await expireLease(data.task.id);
    await expectRejected(data, "invalid_tool_input");
    expect(planner).not.toHaveBeenCalled();
  });

  it("rejects a checkpoint action after the trigger changes to scheduled.job", async () => {
    const data = await fixture();
    await checkpoint(data, {
      ...validPlan,
      requiredTools: ["schedule.create"],
      toolInputs: { "schedule.create": { cron: "0 9 * * *", timezone: "Asia/Shanghai", prompt: "提醒散步" } }
    });
    await prisma.agentTask.update({
      where: { id: data.task.id },
      data: { input: { normalizedContent: "帮我记录周末散步", trigger: "scheduled.job" } }
    });
    await expireLease(data.task.id);
    await expectRejected(data, "tool_not_allowed");
    expect(planner).not.toHaveBeenCalled();
  });

  it("uses completed checkpoint output as authority even if Task.plan looks valid", async () => {
    const data = await fixture();
    await checkpoint(data, { ...validPlan, requiredTools: [], toolInputs: {} });
    await prisma.agentTask.update({ where: { id: data.task.id }, data: { plan: validPlan as Prisma.InputJsonObject } });
    await prisma.agentStep.update({
      where: { taskId_stepKey: { taskId: data.task.id, stepKey: "plan" } },
      data: { output: { ...validPlan, confidence: 2 } as Prisma.InputJsonObject }
    });
    await expireLease(data.task.id);
    await expectRejected(data, "invalid_structure");
  });

  it("rejects invalid live Planner results before saving a completed plan or Tool", async () => {
    const data = await fixture();
    planner.mockResolvedValue({ ...validPlan, requiredTools: ["memo.create", "memo.retired"] });
    const task = await expectRejected(data, "unknown_tool");
    expect(planner).toHaveBeenCalledTimes(1);
    expect(task.steps).toEqual(expect.arrayContaining([
      expect.objectContaining({ stepKey: "plan", status: "failed", errorCategory: "validation" })
    ]));
  });

  it("does not reuse a previous plan when a semantic retry returns an invalid contract", async () => {
    const data = await fixture();
    await prisma.agentTask.update({
      where: { id: data.task.id }, data: { input: { normalizedContent: "明天提醒我散步" } }
    });
    planner.mockResolvedValueOnce({
      ...validPlan,
      requiredTools: ["schedule.create"],
      toolInputs: { "schedule.create": { cron: "0 9 * * *", timezone: "Asia/Shanghai", prompt: "提醒散步" } }
    }).mockResolvedValueOnce({ ...validPlan, requiredTools: ["memo.retired"] });
    await expectRejected(data, "unknown_tool");
    expect(planner).toHaveBeenCalledTimes(2);
  });

  it("completes a legitimate zero-Tool conversation", async () => {
    const data = await fixture();
    planner.mockResolvedValue({ ...validPlan, requiredTools: [], toolInputs: {}, finalResponseText: "你好。" });
    await expect(runAgentTask(data.task.id)).resolves.toMatchObject({
      status: "completed", toolCallsUsed: 0, finalMessage: { content: "你好。" }
    });
  });

  it("keeps the active Job unchanged and never confirms cancellation when semantic repair needs clarification", async () => {
    const data = await fixture();
    const job = await prisma.scheduledJob.create({ data: {
      roomId: data.room.id, agentId: data.agent.id, createdById: data.user.id,
      cron: "0 20 * * *", timezone: "Asia/Shanghai", enabled: true,
      nextRunAt: new Date("2099-09-13T12:00:00Z"),
      payload: { prompt: "提醒散步", description: "原有晚间计划", runOnce: false }
    } });
    await prisma.agentTask.update({ where: { id: data.task.id }, data: {
      input: { normalizedContent: scheduleClarificationPrompt, trigger: "mention" }
    } });
    planner.mockResolvedValue(cancelOnlyPlan(job.id));

    await runAgentTask(data.task.id);

    const saved = await prisma.agentTask.findUniqueOrThrow({
      where: { id: data.task.id }, include: { finalMessage: true, toolCalls: true, eventLogs: true, steps: true }
    });
    expect(planner).toHaveBeenCalledTimes(2);
    expect(saved.status).toBe("completed");
    expect(saved.toolCallsUsed).toBe(0);
    expect(saved.toolCalls).toEqual([]);
    expect(saved.steps.filter((step) => step.kind === "tool")).toEqual([]);
    expect(saved.eventLogs).toEqual(expect.arrayContaining([expect.objectContaining({
      type: "agent.plan.validation.fallback",
      payload: expect.objectContaining({ issueCodes: ["one_shot_promise_without_create"] })
    })]));
    await expect(prisma.scheduledJob.findMany({ where: { roomId: data.room.id } })).resolves.toEqual([job]);
    expect(saved.finalMessage?.content).toMatch(/(?:具体|确认).*(?:时间|什么时候|日期)/);
    expect(saved.finalMessage?.content).not.toMatch(/已经.*(?:取消|创建|更新|安排)|已(?:取消|创建|更新|安排)|帮你取消/);
    expect(saved.finalMessage?.metadata).toMatchObject({ intent: "clarify_schedule", toolResults: [] });
    await expect(prisma.message.count({ where: { roomId: data.room.id } })).resolves.toBe(1);
  });

  it("replays a valid completed Tool and preserves the remaining calls and requester", async () => {
    const plan = {
      ...validPlan,
      toolInputs: { "memo.create": [{ content: "第一条" }, { content: "第二条" }] }
    };
    const data = await fixture();
    const lease = await checkpoint(data, plan);
    await executeDurableToolStep({
      registry: createToolRegistry(), toolName: "memo.create", toolInput: plan.toolInputs["memo.create"][0], stepKey: "tool:1",
      context: {
        prisma, taskId: data.task.id, roomId: data.room.id, agentId: data.agent.id, requestedById: data.user.id,
        runtimeContext: await buildAgentContext(data.room.id, data.user.id),
        tracer: new ExecutionTracer(prisma, data.task.id, data.room.id, lease), lease
      }
    });
    await expireLease(data.task.id);
    await expect(runAgentTask(data.task.id)).resolves.toMatchObject({
      status: "completed", attemptCount: 2, finalMessage: { content: "备忘录已保存：新的备忘录。" }
    });
    const memos = await prisma.memo.findMany({ orderBy: { createdAt: "asc" } });
    expect(memos.map((memo) => ({ content: memo.content, createdById: memo.createdById }))).toEqual([
      { content: "第一条", createdById: data.user.id }, { content: "第二条", createdById: data.user.id }
    ]);
    await expect(prisma.toolCall.count({ where: { taskId: data.task.id } })).resolves.toBe(2);
    await expect(prisma.message.count({ where: { roomId: data.room.id } })).resolves.toBe(1);
    expect(planner).not.toHaveBeenCalled();
  });
});
