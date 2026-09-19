import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const authState = vi.hoisted(() => ({ userId: "" }));
vi.mock("@/lib/auth", () => ({
  requireCurrentUser: vi.fn(async () => ({ id: authState.userId })),
}));

import { ExecutionTracer } from "@/agent/execution-tracer";
import { ToolValidationError } from "@/agent/tool-errors";
import { createToolRegistry } from "@/agent/tool-registry";
import type { RuntimeContext, ToolExecutionContext } from "@/agent/types";
import { POST as postMemo } from "@/app/api/rooms/[roomId]/memos/route";
import { PATCH as patchMemo } from "@/app/api/rooms/[roomId]/memos/[memoId]/route";
import { POST as postJob } from "@/app/api/rooms/[roomId]/scheduled-jobs/route";
import { PATCH as patchJob } from "@/app/api/rooms/[roomId]/scheduled-jobs/[jobId]/route";
import { prisma } from "@/lib/prisma";
import { createTestRoom, createTestUser, resetTestDatabase } from "@/tests/integration/support/database";

beforeEach(resetTestDatabase);
afterAll(() => prisma.$disconnect());

const longMemo = { title: "标".repeat(500), content: "文".repeat(20_000) };
const schedule = { fireAt: "2030-05-09T21:15:00+08:00", timezone: "Asia/Shanghai", prompt: "提醒休息" };
let requestId = 0;

function request(body: unknown, method = "PATCH") {
  return new Request("http://localhost/api/rooms/life-contract", {
    method,
    headers: { "Content-Type": "application/json", "x-forwarded-for": `192.0.2.${++requestId}` },
    body: JSON.stringify(body),
  });
}

async function fixture() {
  const room = await createTestRoom();
  const user = await createTestUser();
  authState.userId = user.id;
  await prisma.roomParticipant.create({ data: { roomId: room.id, userId: user.id, role: "owner" } });
  const agent = await prisma.agent.create({ data: { slug: "life-assistant", displayName: "生活助手", description: "字段一致性测试" } });
  const task = await prisma.agentTask.create({
    data: { roomId: room.id, agentId: agent.id, requestedById: user.id, status: "running", input: { normalizedContent: "保存生活信息" } },
  });
  const context: ToolExecutionContext = {
    prisma, taskId: task.id, roomId: room.id, agentId: agent.id, requestedById: user.id,
    runtimeContext: { participants: [] } as unknown as RuntimeContext,
    tracer: new ExecutionTracer(prisma, task.id, room.id),
  };
  const registry = createToolRegistry();
  let step = 0;
  return {
    room, user, agent, task,
    execute: (name: string, input: unknown) => registry.execute(name, input, context, { stepKey: `fields:${++step}` }),
    memoPost: (body: unknown) => postMemo(request(body, "POST"), { params: Promise.resolve({ roomId: room.id }) }),
    memoPatch: (memoId: string, body: unknown) => patchMemo(request(body), { params: Promise.resolve({ roomId: room.id, memoId }) }),
    jobPost: (body: unknown) => postJob(request(body, "POST"), { params: Promise.resolve({ roomId: room.id }) }),
    jobPatch: (jobId: string, body: unknown) => patchJob(request(body), { params: Promise.resolve({ roomId: room.id, jobId }) }),
  };
}

describe("Memo/Schedule Agent 与 HTTP 字段持久化一致性", () => {
  it("Agent 创建和更新的边界长度备忘录都可经 HTTP 原样保存", async () => {
    const f = await fixture();
    const input = { title: ` \n${longMemo.title}\t `, content: ` \n${longMemo.content}\t ` };
    const result = await f.execute("memo.create", input);
    const memoId = (result.output as { memoId: string }).memoId;
    expect(await prisma.memo.findUniqueOrThrow({ where: { id: memoId } })).toMatchObject(longMemo);
    const created = await f.memoPost(input);
    expect(created.status).toBe(201);
    const httpMemo = (await created.json()).memo;
    expect(await prisma.memo.findUniqueOrThrow({ where: { id: httpMemo.id } })).toMatchObject(longMemo);

    expect((await f.memoPatch(memoId, { ...longMemo, pinned: true })).status).toBe(200);
    expect(await prisma.memo.findUniqueOrThrow({ where: { id: memoId } })).toMatchObject({ ...longMemo, pinned: true });
    const edited = { title: "改" + longMemo.title.slice(1), content: "改" + longMemo.content.slice(1) };
    await f.execute("memo.update", { memoId, title: ` ${edited.title} `, content: ` ${edited.content} ` });
    expect(await prisma.memo.findUniqueOrThrow({ where: { id: memoId } })).toMatchObject(edited);
    expect((await f.memoPatch(memoId, edited)).status).toBe(200);
    expect(await prisma.memo.findUniqueOrThrow({ where: { id: memoId } })).toMatchObject({ ...edited, pinned: true });
    expect(await prisma.toolCall.count({ where: { taskId: f.task.id, status: "completed" } })).toBe(2);
  });

  it("Agent 计划的较长描述经 HTTP 原样保存，描述编辑不移动一次性时刻", async () => {
    const f = await fixture();
    const description = "描".repeat(500);
    const result = await f.execute("schedule.create", { ...schedule, description: ` ${description} ` });
    const jobId = (result.output as { jobId: string }).jobId;
    const created = await f.jobPost({ ...schedule, description: ` ${description} ` });
    expect(created.status).toBe(201);
    const httpId = (await created.json()).job.id;
    for (const id of [jobId, httpId]) {
      const stored = await prisma.scheduledJob.findUniqueOrThrow({ where: { id } });
      expect(stored.payload).toMatchObject({ description, prompt: schedule.prompt, runOnce: true });
      expect(stored.nextRunAt.toISOString()).toBe("2030-05-09T13:15:00.000Z");
    }
    expect((await f.jobPatch(jobId, { description })).status).toBe(200);
    const edited = "改" + description.slice(1);
    await f.execute("schedule.update", { jobId, description: ` ${edited} ` });
    expect((await f.jobPatch(jobId, { description: edited })).status).toBe(200);
    const stored = await prisma.scheduledJob.findUniqueOrThrow({ where: { id: jobId } });
    expect(stored.payload).toMatchObject({ description: edited, runOnce: true });
    expect(stored.nextRunAt.toISOString()).toBe("2030-05-09T13:15:00.000Z");
    expect(stored.cron).toBe("15 21 * * *");
    expect(stored.enabled).toBe(true);
  });

  it.each([null, "", " \n\t "])("两条入口创建/清空描述 %j 均保存 null，省略则保留", async (description) => {
    const f = await fixture();
    const result = await f.execute("schedule.create", { ...schedule, description });
    const jobId = (result.output as { jobId: string }).jobId;
    const response = await f.jobPost({ ...schedule, description });
    expect(response.status).toBe(201);
    const httpId = (await response.json()).job.id;
    for (const id of [jobId, httpId]) {
      expect((await prisma.scheduledJob.findUniqueOrThrow({ where: { id } })).payload).toMatchObject({ description: null });
    }
    await f.execute("schedule.update", { jobId, description: "保留描述" });
    expect((await f.jobPatch(jobId, { prompt: "提醒喝水" })).status).toBe(200);
    expect((await prisma.scheduledJob.findUniqueOrThrow({ where: { id: jobId } })).payload).toMatchObject({ description: "保留描述" });
    expect((await f.jobPatch(jobId, { description })).status).toBe(200);
    await f.execute("schedule.update", { jobId, prompt: "提醒走动" });
    expect((await prisma.scheduledJob.findUniqueOrThrow({ where: { id: jobId } })).payload).toMatchObject({ description: null });
    await f.execute("schedule.update", { jobId, description: "再次填写" });
    await f.execute("schedule.update", { jobId, description });
    expect((await prisma.scheduledJob.findUniqueOrThrow({ where: { id: jobId } })).payload).toMatchObject({ description: null });
  });

  it.each([
    { field: "title", value: "标".repeat(501) },
    { field: "content", value: "文".repeat(20_001) },
    { field: "description", value: "描".repeat(501) },
  ])("$field 超限在两条入口的 create/update 都被拒绝且无写入", async ({ field, value }) => {
    const f = await fixture();
    const isMemo = field !== "description";
    const result = await f.execute(isMemo ? "memo.create" : "schedule.create", isMemo ? { title: "原始", content: "原文" } : { ...schedule, description: "原始" });
    const id = isMemo ? (result.output as { memoId: string }).memoId : (result.output as { jobId: string }).jobId;
    const read = () => isMemo ? prisma.memo.findUniqueOrThrow({ where: { id } }) : prisma.scheduledJob.findUniqueOrThrow({ where: { id } });
    const before = await read();
    const input = { ...(isMemo ? { title: "原始", content: "原文" } : schedule), [field]: value };
    expect((await (isMemo ? f.memoPost(input) : f.jobPost(input))).status).toBe(400);
    expect((await (isMemo ? f.memoPatch(id, { [field]: value }) : f.jobPatch(id, { [field]: value }))).status).toBe(400);
    await expect(f.execute(isMemo ? "memo.create" : "schedule.create", input)).rejects.toBeInstanceOf(ToolValidationError);
    await expect(f.execute(isMemo ? "memo.update" : "schedule.update", { [isMemo ? "memoId" : "jobId"]: id, [field]: value })).rejects.toBeInstanceOf(ToolValidationError);
    expect(await read()).toEqual(before);
    expect(await prisma.memo.count() + await prisma.scheduledJob.count()).toBe(1);
    expect(await prisma.toolCall.count({ where: { taskId: f.task.id } })).toBe(1);
  });

  it("超过现行上限的旧字段可通过部分更新完整保留，包含原始首尾空白", async () => {
    const f = await fixture();
    const legacy = { title: ` ${"标".repeat(501)} `, content: ` ${"文".repeat(20_001)} ` };
    const memo = await prisma.memo.create({ data: { roomId: f.room.id, ...legacy } });
    await f.execute("memo.update", { memoId: memo.id, pinned: true });
    expect((await f.memoPatch(memo.id, { pinned: false })).status).toBe(200);
    expect(await prisma.memo.findUniqueOrThrow({ where: { id: memo.id } })).toMatchObject({ ...legacy, pinned: false });
    const description = ` ${"描".repeat(501)} `;
    const result = await f.execute("schedule.create", schedule);
    const jobId = (result.output as { jobId: string }).jobId;
    await prisma.scheduledJob.update({ where: { id: jobId }, data: { payload: { prompt: schedule.prompt, description, runOnce: true } } });
    await f.execute("schedule.update", { jobId, prompt: "提醒喝水" });
    expect((await f.jobPatch(jobId, { prompt: "提醒走动" })).status).toBe(200);
    const stored = await prisma.scheduledJob.findUniqueOrThrow({ where: { id: jobId } });
    expect(stored.payload).toMatchObject({ description, prompt: "提醒走动", runOnce: true });
    expect(stored.nextRunAt.toISOString()).toBe("2030-05-09T13:15:00.000Z");
  });
});
