import type { Prisma } from "@prisma/client";

import { buildAgentContext } from "@/agent/context-builder";
import {
  beginAgentStep,
  completeAgentStep,
  executeDurableToolStep,
  AgentStepConflictError
} from "@/agent/durable-step";
import { runPostTaskHooks } from "@/agent/post-task";
import { ExecutionTracer } from "@/agent/execution-tracer";
import { createLLMProvider } from "@/agent/llm-provider";
import { buildClarifyPlan, repairPlan } from "@/agent/plan-repair";
import { formatIssuesForLLM, validatePlan } from "@/agent/plan-validator";
import {
  AgentRuntimeBudget,
  AgentRuntimeBudgetExceededError,
  getBudgetLimitMessage,
  openAgentRuntimeBudget
} from "@/agent/runtime-budget";
import {
  SCHEDULER_BLOCKED_TOOLS,
  TRIGGER_SCHEDULED_JOB,
} from "@/agent/scheduler-tick";
import {
  AgentTaskLeaseLostError,
  claimAgentTask,
  getRuntimeWorkerId,
  startAgentTaskHeartbeat
} from "@/agent/task-claim";
import { ToolApprovalRequiredError } from "@/agent/tool-approval";
import { createToolRegistry } from "@/agent/tool-registry";
import type {
  AgentPlan,
  AgentTaskLeaseOwnership,
  LLMPlanRequest,
  LLMPlanResult,
  LLMProvider,
  ToolResult
} from "@/agent/types";
import { appendChatLog } from "@/lib/chat-log-file";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";

export type RunAgentTaskOptions = {
  workerId?: string;
  leaseDurationMs?: number;
  heartbeatIntervalMs?: number;
};

export async function runAgentTask(
  taskId: string,
  options: RunAgentTaskOptions = {}
) {
  const leaseDurationMs = options.leaseDurationMs ?? env.AGENT_TASK_LEASE_MS;
  const workerId = options.workerId ?? getRuntimeWorkerId();
  const claim = await claimAgentTask(taskId, { workerId, leaseDurationMs });
  const task = await prisma.agentTask.findUnique({
    where: { id: taskId },
    include: {
      agent: true,
      sourceMessage: true,
      requestedBy: true
    }
  });

  if (!task) {
    throw new Error(`Agent task not found: ${taskId}`);
  }

  if (!claim.claimed) {
    return task;
  }

  const lease: AgentTaskLeaseOwnership = {
    attemptId: claim.attemptId,
    workerId: claim.workerId,
    leaseDurationMs: claim.leaseDurationMs
  };
  const heartbeat = startAgentTaskHeartbeat({
    taskId: task.id,
    ownership: lease,
    intervalMs: options.heartbeatIntervalMs ?? env.AGENT_TASK_HEARTBEAT_MS
  });
  const tracer = new ExecutionTracer(prisma, task.id, task.roomId, lease);
  let budget: AgentRuntimeBudget | null = null;

  try {
    await tracer.markRunning(claim.claimedAt);
    budget = await openAgentRuntimeBudget({
      taskId: task.id,
      roomId: task.roomId,
      lease
    });
    const runtimeBudget = budget;
    runtimeBudget.assertWithinDeadline();
    const runtimeContext = await buildAgentContext(task.roomId);
    await heartbeat.assertActive();
    runtimeBudget.assertWithinDeadline();
    await tracer.event("agent.context.built", {
      recentMessageCount: runtimeContext.recentMessages.length,
      memoCount: runtimeContext.memos.length
    });

    const registry = createToolRegistry();
    const prompt = getTaskPrompt(task.input);
    const trigger = getTaskTrigger(task.input);
    const allTools = registry.list().map((tool) => ({
      name: tool.name,
      description: tool.description,
      schema: tool.schema
    }));
    // When a task is invoked by the scheduler (a fired scheduled job),
    // the agent must EXECUTE the action, not re-schedule it. Strip the writeable
    // scheduling tools from what the LLM sees so it physically cannot recurse.
    const availableTools = filterToolsForTrigger(allTools, trigger);
    const availableToolNames = availableTools.map((t) => t.name);

    const planCheckpoint = await beginAgentStep({
      taskId: task.id,
      roomId: task.roomId,
      lease,
      stepKey: "plan",
      kind: "plan",
      stepInput: { prompt, availableTools: availableToolNames }
    });
    let plan = planCheckpoint.step.status === "completed"
      ? readPersistedAgentPlan(planCheckpoint.step.output)
      : readPersistedAgentPlan(task.plan);
    if (planCheckpoint.step.status === "completed" && !plan) {
      throw new AgentStepConflictError("Durable plan step has invalid persisted output.");
    }
    if (plan) {
      await tracer.event("agent.plan.resumed", {
        intent: plan.intent,
        requiredTools: plan.requiredTools
      });
      if (planCheckpoint.step.status !== "completed") {
        await completeAgentStep({
          taskId: task.id,
          roomId: task.roomId,
          lease,
          stepKey: "plan",
          output: plan,
          taskData: { plan: plan as Prisma.InputJsonObject }
        });
      }
    } else {
      const provider = createLLMProvider();
      await tracer.event("agent.llm.started", {
        provider: provider.name,
        model: provider.model,
        availableTools: availableToolNames
      });
      const planRequest: LLMPlanRequest = {
        prompt,
        roomContext: runtimeContext.roomContext,
        availableTools,
        agentSystemPrompt: task.agent.systemPrompt
      };
      const planResult = await runBudgetedPlanCall({
        budget: runtimeBudget,
        provider,
        request: planRequest,
        inputSummary: prompt.slice(0, 240),
        requestPayload: {
          prompt,
          roomContext: runtimeContext.roomContext,
          availableTools: availableToolNames
        },
        roomId: task.roomId,
        taskId: task.id,
        assertLease: heartbeat.assertActive
      });
      plan = planResult;
      await tracer.event("agent.llm.completed", {
        intent: plan.intent,
        requiredTools: plan.requiredTools
      });

      // --- Plan consistency check -------------------------------------------
      // The LLM sometimes produces a final_response_text that does not match its
      // tool_inputs (e.g. promising "今晚只发一次" while only calling schedule.cancel).
      // We validate the plan; on issues we retry once with structured feedback,
      // and if the retry still fails we fall back to a safe "ask user to confirm"
      // reply rather than executing a mismatched plan.
      let planIssues = validatePlan(plan, prompt);
      if (planIssues.length > 0) {
        await tracer.event("agent.plan.validation.failed", {
          attempt: 1,
          issueCodes: planIssues.map((i) => i.code),
          issues: planIssues
        });

        try {
          const retryRequest: LLMPlanRequest = {
            prompt,
            roomContext: runtimeContext.roomContext,
            availableTools,
            agentSystemPrompt: task.agent.systemPrompt,
            validationFeedback: {
              previousPlan: plan,
              issues: formatIssuesForLLM(planIssues)
            }
          };
          const retryResult = await runBudgetedPlanCall({
            budget: runtimeBudget,
            provider,
            request: retryRequest,
            inputSummary: `[retry] ${prompt.slice(0, 230)}`,
            requestPayload: {
              prompt,
              roomContext: runtimeContext.roomContext,
              availableTools: availableToolNames,
              validationFeedback: {
                previousPlan: plan,
                issues: planIssues
              }
            },
            roomId: task.roomId,
            taskId: task.id,
            assertLease: heartbeat.assertActive
          });
          plan = retryResult;
          await tracer.event("agent.plan.validation.retry.completed", {
            intent: plan.intent,
            requiredTools: plan.requiredTools
          });
        } catch (error) {
          if (error instanceof AgentRuntimeBudgetExceededError) throw error;
          const message = error instanceof Error ? error.message : "LLM retry failed";
          await tracer.event("agent.plan.validation.retry.failed", { error: message });
        }

        planIssues = validatePlan(plan, prompt);
        if (planIssues.length > 0) {
          const repairedFromCodes = planIssues.map((i) => i.code);
          const { repaired, remainingIssues } = repairPlan(plan, prompt, planIssues);
          plan = repaired;
          await tracer.event("agent.plan.validation.repaired", {
            repairedFromCodes,
            remainingCodes: remainingIssues.map((i) => i.code),
            remainingIssues
          });

          if (remainingIssues.length > 0) {
            await tracer.event("agent.plan.validation.fallback", {
              issueCodes: remainingIssues.map((i) => i.code),
              issues: remainingIssues,
              discardedPlan: plan
            });
            plan = buildClarifyPlan(remainingIssues, prompt);
          }
        }
      }
      // ------------------------------------------------------------------------

      await completeAgentStep({
        taskId: task.id,
        roomId: task.roomId,
        lease,
        stepKey: "plan",
        output: plan,
        taskData: { plan: plan as Prisma.InputJsonObject }
      });
    }

    const toolResults: ToolResult[] = [];
    let stepIndex = 0;
    for (const toolName of plan.requiredTools) {
      const args = plan.toolInputs[toolName];
      const argList = Array.isArray(args) ? args : [args ?? {}];
      for (const arg of argList) {
        await heartbeat.assertActive();
        stepIndex += 1;
        const output = await executeDurableToolStep({
          registry,
          toolName,
          toolInput: arg,
          stepKey: `tool:${stepIndex}`,
          context: {
            prisma,
            taskId: task.id,
            roomId: task.roomId,
            agentId: task.agentId,
            requestedById: task.requestedById,
            runtimeContext,
            tracer,
            lease,
            signal: runtimeBudget.signal,
            reserveToolCall: (reservation) => runtimeBudget.reserveToolCall(reservation)
          }
        });
        toolResults.push(output);
      }
    }

    await heartbeat.assertActive();
    await runtimeBudget.assertCanFinalize();
    const content = renderAgentReply(plan, toolResults);
    const result = { plan, toolResults };
    const finalCheckpoint = await beginAgentStep({
      taskId: task.id,
      roomId: task.roomId,
      lease,
      stepKey: "final",
      kind: "final",
      stepInput: {
        intent: plan.intent,
        toolStepCount: stepIndex,
        content
      }
    });
    if (finalCheckpoint.step.status === "completed") {
      throw new AgentStepConflictError(
        "Final step is completed while its AgentTask is still claimable."
      );
    }
    const finalMessage = await tracer.completeWithMessage(
      {
        roomId: task.roomId,
        senderType: "agent",
        senderAgentId: task.agentId,
        content,
        targetType: "all",
        metadata: {
          taskId: task.id,
          intent: plan.intent,
          confidence: plan.confidence,
          toolResults
        } as Prisma.InputJsonObject
      },
      result
    );

    await appendChatLog(task.roomId, {
      kind: "message.agent",
      messageId: finalMessage.id,
      senderAgentId: task.agentId,
      taskId: task.id,
      status: "completed",
      content,
      createdAt: finalMessage.createdAt
    });

    runPostTaskHooks(task.roomId);

    return prisma.agentTask.findUniqueOrThrow({
      where: { id: task.id },
      include: {
        steps: true,
        toolCalls: true,
        llmCalls: true,
        finalMessage: true,
        eventLogs: true
      }
    });
  } catch (error) {
    if (error instanceof AgentRuntimeBudgetExceededError) {
      let finalMessage;
      try {
        const content = getBudgetLimitMessage(error.reason);
        finalMessage = await tracer.limitExceededWithMessage(
          {
            roomId: task.roomId,
            senderType: "agent",
            senderAgentId: task.agentId,
            content,
            targetType: "all",
            status: "failed",
            metadata: {
              taskId: task.id,
              limitReason: error.reason,
              details: error.details
            } as Prisma.InputJsonObject
          },
          error.reason,
          error.details
        );
      } catch (failureError) {
        if (failureError instanceof AgentTaskLeaseLostError) {
          return findAgentTaskWithTrace(task.id);
        }
        throw failureError;
      }
      await appendChatLog(task.roomId, {
        kind: "message.agent",
        messageId: finalMessage.id,
        senderAgentId: task.agentId,
        taskId: task.id,
        status: "failed",
        content: finalMessage.content,
        createdAt: finalMessage.createdAt
      });
      return findAgentTaskWithTrace(task.id);
    }
    if (error instanceof ToolApprovalRequiredError) {
      return prisma.agentTask.findUniqueOrThrow({
        where: { id: task.id },
        include: {
          toolCalls: true,
          steps: true,
          llmCalls: true,
          finalMessage: true,
          eventLogs: true,
          toolApprovals: true
        }
      });
    }
    if (error instanceof AgentTaskLeaseLostError) {
      return prisma.agentTask.findUniqueOrThrow({
        where: { id: task.id },
        include: {
          toolCalls: true,
          steps: true,
          llmCalls: true,
          finalMessage: true,
          eventLogs: true,
          toolApprovals: true
        }
      });
    }
    const message = error instanceof Error ? error.message : "Agent task failed";
    let finalMessage;
    try {
      finalMessage = await tracer.failWithMessage(
        {
        roomId: task.roomId,
        senderType: "agent",
        senderAgentId: task.agentId,
        content: "我刚才处理这个任务时遇到了问题，已经把错误记录下来了。你可以稍后重试，或者把任务说得更具体一点。",
        targetType: "all",
        status: "failed",
        metadata: {
          taskId: task.id,
          error: message
        }
        },
        message
      );
    } catch (failureError) {
      if (failureError instanceof AgentTaskLeaseLostError) {
        return prisma.agentTask.findUniqueOrThrow({
          where: { id: task.id },
          include: {
            toolCalls: true,
            steps: true,
            llmCalls: true,
            finalMessage: true,
            eventLogs: true,
            toolApprovals: true
          }
        });
      }
      throw failureError;
    }
    await appendChatLog(task.roomId, {
      kind: "message.agent",
      messageId: finalMessage.id,
      senderAgentId: task.agentId,
      taskId: task.id,
      status: "failed",
      content: finalMessage.content,
      createdAt: finalMessage.createdAt
    });
    return prisma.agentTask.findUniqueOrThrow({
      where: { id: task.id },
      include: {
        steps: true,
        toolCalls: true,
        llmCalls: true,
        finalMessage: true,
        eventLogs: true
      }
    });
  } finally {
    budget?.dispose();
    await heartbeat.stop();
  }
}

async function runBudgetedPlanCall(input: {
  budget: AgentRuntimeBudget;
  provider: LLMProvider;
  request: LLMPlanRequest;
  inputSummary: string;
  requestPayload: unknown;
  roomId: string;
  taskId: string;
  assertLease: () => Promise<void>;
}): Promise<LLMPlanResult> {
  const reservation = await input.budget.reserveModelTurn({
    provider: input.provider.name,
    model: input.provider.model,
    inputSummary: input.inputSummary,
    request: input.request,
    requestPayload: input.requestPayload
  });
  const startedAt = Date.now();
  let result: LLMPlanResult | null = null;
  let completedLogAttempted = false;
  try {
    result = await input.provider.plan({
      ...input.request,
      maxCompletionTokens: reservation.maxCompletionTokens,
      signal: input.budget.signal
    });
    await input.assertLease();
    await input.budget.completeModelTurn(
      reservation,
      result,
      Date.now() - startedAt
    );
    completedLogAttempted = true;
    await appendCompletedLLMLog(input, result, startedAt);
    return result;
  } catch (error) {
    if (!(error instanceof AgentTaskLeaseLostError)) {
      try {
        await input.budget.failModelTurn(
          reservation,
          error,
          Date.now() - startedAt
        );
      } catch (traceError) {
        if (traceError instanceof AgentTaskLeaseLostError) throw traceError;
        console.error("[agent-runtime] failed to persist budgeted LLM failure", traceError);
      }
    }
    if (result) {
      if (!completedLogAttempted) {
        completedLogAttempted = true;
        await appendCompletedLLMLog(input, result, startedAt);
      }
    } else {
      const message = error instanceof Error ? error.message : "LLM planning failed";
      await appendChatLog(input.roomId, {
        kind: "llm.call",
        taskId: input.taskId,
        provider: input.provider.name,
        model: input.provider.model,
        status: "failed",
        durationMs: Date.now() - startedAt,
        requestPayload: input.requestPayload,
        error: message
      });
    }
    throw error;
  }
}

async function appendCompletedLLMLog(
  input: {
    provider: LLMProvider;
    requestPayload: unknown;
    roomId: string;
    taskId: string;
  },
  result: LLMPlanResult,
  startedAt: number
) {
  await appendChatLog(input.roomId, {
    kind: "llm.call",
    taskId: input.taskId,
    provider: input.provider.name,
    model: input.provider.model,
    status: "completed",
    durationMs: Date.now() - startedAt,
    requestPayload: input.requestPayload,
    responsePayload: result.rawResponse ?? result,
    tokens: {
      prompt: result.usage?.promptTokens,
      completion: result.usage?.completionTokens,
      total: result.usage?.totalTokens
    }
  });
}

function findAgentTaskWithTrace(taskId: string) {
  return prisma.agentTask.findUniqueOrThrow({
    where: { id: taskId },
    include: {
      steps: true,
      toolCalls: true,
      llmCalls: true,
      finalMessage: true,
      eventLogs: true,
      toolApprovals: true
    }
  });
}

export function readPersistedAgentPlan(value: unknown): AgentPlan | null {
  if (!isRecord(value)) return null;
  if (typeof value.intent !== "string") return null;
  if (typeof value.confidence !== "number") return null;
  if (!isStringArray(value.requiredTools)) return null;
  if (!isStringArray(value.taskSteps)) return null;
  if (typeof value.finalResponsePlan !== "string") return null;
  if (typeof value.finalResponseText !== "string") return null;
  if (!isRecord(value.toolInputs)) return null;

  return {
    intent: value.intent,
    confidence: value.confidence,
    requiredTools: value.requiredTools,
    taskSteps: value.taskSteps,
    finalResponsePlan: value.finalResponsePlan,
    finalResponseText: value.finalResponseText,
    toolInputs: value.toolInputs
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function getTaskPrompt(input: unknown) {
  if (typeof input === "object" && input !== null && "normalizedContent" in input) {
    const value = (input as { normalizedContent?: unknown }).normalizedContent;
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return JSON.stringify(input);
}

function getTaskTrigger(input: unknown): string | undefined {
  if (typeof input === "object" && input !== null && "trigger" in input) {
    const value = (input as { trigger?: unknown }).trigger;
    if (typeof value === "string") return value;
  }
  return undefined;
}

const SCHEDULER_TRIGGERS = new Set<string>([TRIGGER_SCHEDULED_JOB]);
const SCHEDULER_BLOCKED_TOOL_SET = new Set<string>(SCHEDULER_BLOCKED_TOOLS);

function isTriggeredByScheduler(trigger: string | undefined): boolean {
  return trigger !== undefined && SCHEDULER_TRIGGERS.has(trigger);
}

export function filterToolsForTrigger<T extends { name: string }>(
  tools: T[],
  trigger: string | undefined
): T[] {
  if (!isTriggeredByScheduler(trigger)) return tools;
  return tools.filter((t) => !SCHEDULER_BLOCKED_TOOL_SET.has(t.name));
}

function renderAgentReply(plan: AgentPlan, toolResults: ToolResult[]) {
  const byTool = new Map(toolResults.map((r) => [r.toolName, r]));

  if (byTool.has("weather.get")) {
    const output = byTool.get("weather.get")?.output as
      | {
          provider?: string;
          city?: string;
          condition?: string;
          temperatureC?: number;
          feelsLikeC?: number;
          humidityPercent?: number;
          wind?: { direction?: string; scale?: string };
          forecast?: Array<{
            date: string;
            tempMinC?: number;
            tempMaxC?: number;
            textDay?: string;
          }>;
          advice?: string;
        }
      | undefined;

    if (output?.provider === "qweather") {
      const city = output.city ?? "对方那边";
      const cond = output.condition ?? "未知";
      const temp = output.temperatureC;
      const feels = output.feelsLikeC;
      const wind = output.wind?.direction && output.wind?.scale
        ? `${output.wind.direction} ${output.wind.scale} 级`
        : null;
      const humidity = output.humidityPercent !== undefined ? `湿度 ${output.humidityPercent}%` : null;
      const parts = [
        `${city}现在${cond}，${temp !== undefined ? `${temp}°C` : "温度未知"}`,
        feels !== undefined ? `体感 ${feels}°C` : null,
        humidity,
        wind
      ].filter(Boolean);

      let body = parts.join("，") + "。";
      if (output.forecast && output.forecast.length > 0) {
        const preview = output.forecast
          .slice(0, 3)
          .map(
            (d) =>
              `${d.date.slice(5)} ${d.textDay ?? ""} ${d.tempMinC ?? "--"}~${d.tempMaxC ?? "--"}°C`
          )
          .join("；");
        body += `\n未来几天：${preview}。`;
      }
      if (output.advice) body += `\n${output.advice}`;
      return body;
    }

    return `${output?.city ?? "对方那边"}现在天气：${output?.condition ?? "已查询"}，约 ${output?.temperatureC ?? "--"}°C。${
      output?.advice ?? "出门前再看一眼实时天气会更稳。"
    }`;
  }

  if (byTool.has("timezone.compare")) {
    const output = byTool.get("timezone.compare")?.output as
      | {
          from?: { label?: string; time?: string };
          to?: { label?: string; time?: string };
          suggestion?: string;
        }
      | undefined;
    return `${output?.from?.label ?? "你"}这边是 ${output?.from?.time ?? "当前时间未知"}；${
      output?.to?.label ?? "对方"
    }那边是 ${output?.to?.time ?? "当前时间未知"}。${output?.suggestion ?? ""}`;
  }

  if (byTool.has("memo.create")) {
    const output = byTool.get("memo.create")?.output as { title?: string } | undefined;
    return `备忘录已保存：${output?.title ?? "新的备忘录"}。`;
  }

  if (byTool.has("web.search")) {
    const output = byTool.get("web.search")?.output as
      | {
          provider?: "tavily" | "mock";
          query?: string;
          answer?: string;
          results?: Array<{
            title: string;
            url: string;
            content: string;
            score: number;
            publishedDate?: string;
          }>;
          fallbackReason?: string;
        }
      | undefined;

    if (!output) {
      return plan.finalResponseText || "搜索完成。";
    }

    const parts: string[] = [];

    // AI 摘要（如果有）
    if (output.answer) {
      parts.push(output.answer);
    }

    // 搜索结果列表
    if (output.results && output.results.length > 0) {
      const resultLines = output.results
        .slice(0, 3) // 最多显示 3 条
        .map((r, i) => {
          const title = r.title || "无标题";
          const snippet = r.content.slice(0, 80) + (r.content.length > 80 ? "..." : "");
          const url = r.url;
          // 为前端卡片展示预留：包含完整 URL，前端可以渲染为可点击链接
          return `${i + 1}. ${title}\n   ${snippet}\n   ${url}`;
        })
        .join("\n\n");

      if (output.answer) {
        parts.push(`\n相关来源：\n${resultLines}`);
      } else {
        parts.push(`关于「${output.query}」的搜索结果：\n${resultLines}`);
      }
    }

    // Mock 降级提示
    if (output.provider === "mock" && output.fallbackReason) {
      parts.push(`\n（注：当前使用模拟数据，原因：${output.fallbackReason}）`);
    }

    return parts.join("\n");
  }

  if (plan.finalResponseText) {
    return plan.finalResponseText;
  }

  return "我已经把你的请求记下了，可以再补充一些细节让我更准确地帮到你。";
}
