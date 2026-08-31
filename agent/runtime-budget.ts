import {
  Prisma,
  type AgentTaskLimitReason,
  type PrismaClient
} from "@prisma/client";

import {
  withAgentTaskLease
} from "@/agent/task-claim";
import type {
  AgentTaskLeaseOwnership,
  LLMPlanRequest,
  LLMPlanResult
} from "@/agent/types";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";

const TOKEN_ESTIMATE_CHARS = 4;
const PROVIDER_PROMPT_OVERHEAD_TOKENS = 8192;
const MICROS_PER_UNIT = 1_000_000;

type RuntimeBudgetClient = Pick<PrismaClient, "$transaction">;

export type AgentRuntimeBudgetCreateData = {
  maxTurns: number;
  maxToolCalls: number;
  maxRuntimeMs: number;
  maxTokens: number;
  maxCostMicros: number;
  maxCompletionTokens: number;
  inputCostMicrosPerMillionTokens: number;
  outputCostMicrosPerMillionTokens: number;
};

export type ModelTurnReservation = {
  llmCallId: string;
  turnIndex: number;
  reservedTokens: number;
  reservedCostMicros: number;
  maxCompletionTokens: number;
};

export class AgentRuntimeBudgetExceededError extends Error {
  constructor(
    readonly reason: AgentTaskLimitReason,
    readonly details: Record<string, unknown>
  ) {
    super(`Agent runtime budget exceeded: ${reason}`);
    this.name = "AgentRuntimeBudgetExceededError";
  }
}

export function getAgentRuntimeBudgetCreateData(): AgentRuntimeBudgetCreateData {
  return {
    maxTurns: env.AGENT_MAX_TURNS,
    maxToolCalls: env.AGENT_MAX_TOOL_CALLS,
    maxRuntimeMs: env.AGENT_MAX_RUNTIME_MS,
    maxTokens: env.AGENT_MAX_TOKENS,
    maxCostMicros: env.AGENT_MAX_COST_MICROS,
    maxCompletionTokens: env.AGENT_LLM_MAX_COMPLETION_TOKENS,
    inputCostMicrosPerMillionTokens: env.AGENT_LLM_INPUT_COST_MICROS_PER_MILLION_TOKENS,
    outputCostMicrosPerMillionTokens: env.AGENT_LLM_OUTPUT_COST_MICROS_PER_MILLION_TOKENS
  };
}

export async function openAgentRuntimeBudget(input: {
  taskId: string;
  roomId: string;
  lease: AgentTaskLeaseOwnership;
  now?: Date;
  client?: RuntimeBudgetClient;
}) {
  const client = input.client ?? prisma;
  const openedAt = input.now ?? new Date();
  const snapshot = await withAgentTaskLease(
    input.taskId,
    input.lease,
    async (tx) => {
      const task = await tx.agentTask.findUniqueOrThrow({
        where: { id: input.taskId },
        select: {
          deadlineAt: true,
          maxRuntimeMs: true,
          maxTurns: true,
          maxToolCalls: true,
          maxTokens: true,
          maxCostMicros: true
        }
      });
      const deadlineAt = task.deadlineAt
        ?? new Date(openedAt.getTime() + task.maxRuntimeMs);
      if (!task.deadlineAt) {
        await tx.agentTask.update({
          where: { id: input.taskId },
          data: { deadlineAt }
        });
        await tx.eventLog.create({
          data: {
            roomId: input.roomId,
            agentTaskId: input.taskId,
            type: "agent.budget.initialized",
            payload: {
              deadlineAt: deadlineAt.toISOString(),
              maxRuntimeMs: task.maxRuntimeMs,
              maxTurns: task.maxTurns,
              maxToolCalls: task.maxToolCalls,
              maxTokens: task.maxTokens,
              maxCostMicros: task.maxCostMicros
            }
          }
        });
      }
      return { deadlineAt };
    },
    client
  );

  return new AgentRuntimeBudget({
    taskId: input.taskId,
    roomId: input.roomId,
    lease: input.lease,
    deadlineAt: snapshot.deadlineAt,
    client
  });
}

export class AgentRuntimeBudget {
  private readonly controller = new AbortController();
  private readonly deadlineTimer: ReturnType<typeof setTimeout> | null;

  readonly signal = this.controller.signal;

  constructor(private readonly input: {
    taskId: string;
    roomId: string;
    lease: AgentTaskLeaseOwnership;
    deadlineAt: Date;
    client: RuntimeBudgetClient;
  }) {
    const remainingMs = input.deadlineAt.getTime() - Date.now();
    if (remainingMs <= 0) {
      this.controller.abort(this.deadlineError());
      this.deadlineTimer = null;
    } else {
      this.deadlineTimer = setTimeout(() => {
        this.controller.abort(this.deadlineError());
      }, remainingMs);
      this.deadlineTimer.unref();
    }
  }

  assertWithinDeadline() {
    if (this.signal.aborted || Date.now() >= this.input.deadlineAt.getTime()) {
      const reason = this.signal.reason;
      if (reason instanceof AgentRuntimeBudgetExceededError) throw reason;
      throw this.deadlineError();
    }
  }

  async reserveModelTurn(input: {
    provider: string;
    model: string;
    inputSummary: string;
    request: LLMPlanRequest;
    requestPayload: unknown;
  }): Promise<ModelTurnReservation> {
    this.assertWithinDeadline();
    const estimatedPromptTokens = estimateModelInputTokens(input.request);
    return withAgentTaskLease(
      this.input.taskId,
      this.input.lease,
      async (tx) => {
        const task = await tx.agentTask.findUniqueOrThrow({
          where: { id: this.input.taskId },
          select: {
            deadlineAt: true,
            maxTurns: true,
            maxTokens: true,
            maxCostMicros: true,
            maxCompletionTokens: true,
            inputCostMicrosPerMillionTokens: true,
            outputCostMicrosPerMillionTokens: true,
            turnsUsed: true,
            tokensUsed: true,
            costUsedMicros: true
          }
        });
        assertPersistedDeadline(task.deadlineAt, this.input.deadlineAt);
        if (task.turnsUsed >= task.maxTurns) {
          throw limitError("max_turns", task.turnsUsed, task.maxTurns);
        }

        const remainingTokens = task.maxTokens - task.tokensUsed;
        if (remainingTokens <= estimatedPromptTokens) {
          throw limitError("max_tokens", task.tokensUsed, task.maxTokens, {
            estimatedPromptTokens
          });
        }
        const promptCostMicros = calculateModelCostMicros({
          promptTokens: estimatedPromptTokens,
          completionTokens: 0,
          inputRate: task.inputCostMicrosPerMillionTokens,
          outputRate: task.outputCostMicrosPerMillionTokens
        });
        const remainingCostMicros = task.maxCostMicros - task.costUsedMicros;
        if (
          remainingCostMicros < promptCostMicros
          || (
            remainingCostMicros === promptCostMicros
            && task.outputCostMicrosPerMillionTokens > 0
          )
        ) {
          throw limitError("max_cost", task.costUsedMicros, task.maxCostMicros, {
            estimatedPromptCostMicros: promptCostMicros
          });
        }

        const completionByTokens = remainingTokens - estimatedPromptTokens;
        const completionByCost = task.outputCostMicrosPerMillionTokens === 0
          ? task.maxCompletionTokens
          : Math.floor(
              (remainingCostMicros - promptCostMicros)
              * MICROS_PER_UNIT
              / task.outputCostMicrosPerMillionTokens
            );
        const maxCompletionTokens = Math.min(
          task.maxCompletionTokens,
          completionByTokens,
          completionByCost
        );
        if (maxCompletionTokens < 1) {
          throw limitError("max_cost", task.costUsedMicros, task.maxCostMicros);
        }

        const reservedTokens = estimatedPromptTokens + maxCompletionTokens;
        const reservedCostMicros = calculateModelCostMicros({
          promptTokens: estimatedPromptTokens,
          completionTokens: maxCompletionTokens,
          inputRate: task.inputCostMicrosPerMillionTokens,
          outputRate: task.outputCostMicrosPerMillionTokens
        });
        const turnIndex = task.turnsUsed + 1;
        const call = await tx.lLMCall.create({
          data: {
            taskId: this.input.taskId,
            provider: input.provider,
            model: input.model,
            turnIndex,
            inputSummary: input.inputSummary,
            requestPayload: toJsonValue(input.requestPayload),
            reservedTokens,
            reservedCostMicros,
            status: "running"
          }
        });
        await tx.agentTask.update({
          where: { id: this.input.taskId },
          data: {
            turnsUsed: turnIndex,
            tokensUsed: task.tokensUsed + reservedTokens,
            costUsedMicros: task.costUsedMicros + reservedCostMicros
          }
        });
        await tx.eventLog.create({
          data: {
            roomId: this.input.roomId,
            agentTaskId: this.input.taskId,
            type: "agent.budget.model.reserved",
            payload: {
              llmCallId: call.id,
              turnIndex,
              reservedTokens,
              reservedCostMicros,
              maxCompletionTokens
            }
          }
        });
        return {
          llmCallId: call.id,
          turnIndex,
          reservedTokens,
          reservedCostMicros,
          maxCompletionTokens
        };
      },
      this.input.client
    );
  }

  async completeModelTurn(
    reservation: ModelTurnReservation,
    result: LLMPlanResult,
    durationMs: number
  ) {
    const completed = await withAgentTaskLease(
      this.input.taskId,
      this.input.lease,
      async (tx) => {
        const [call, task] = await Promise.all([
          tx.lLMCall.findUniqueOrThrow({
            where: { id: reservation.llmCallId }
          }),
          tx.agentTask.findUniqueOrThrow({
            where: { id: this.input.taskId },
            select: {
              maxTokens: true,
              maxCostMicros: true,
              inputCostMicrosPerMillionTokens: true,
              outputCostMicrosPerMillionTokens: true,
              tokensUsed: true,
              costUsedMicros: true
            }
          })
        ]);
        if (call.status !== "running") {
          return { reason: null as AgentTaskLimitReason | null };
        }

        const actualUsage = normalizeModelUsage(
          result.usage,
          reservation,
          task.inputCostMicrosPerMillionTokens,
          task.outputCostMicrosPerMillionTokens
        );
        const tokensUsed = Math.max(
          0,
          task.tokensUsed - reservation.reservedTokens + actualUsage.totalTokens
        );
        const costUsedMicros = Math.max(
          0,
          task.costUsedMicros - reservation.reservedCostMicros + actualUsage.costMicros
        );
        const reason: AgentTaskLimitReason | null = tokensUsed > task.maxTokens
          ? "max_tokens"
          : costUsedMicros > task.maxCostMicros
            ? "max_cost"
            : null;

        await tx.agentTask.update({
          where: { id: this.input.taskId },
          data: { tokensUsed, costUsedMicros }
        });
        await tx.lLMCall.update({
          where: { id: reservation.llmCallId },
          data: {
            responsePayload: toJsonValue(result.rawResponse ?? result),
            promptTokens: actualUsage.promptTokens,
            completionTokens: actualUsage.completionTokens,
            totalTokens: actualUsage.totalTokens,
            costMicros: actualUsage.costMicros,
            status: "completed",
            durationMs
          }
        });
        await tx.eventLog.create({
          data: {
            roomId: this.input.roomId,
            agentTaskId: this.input.taskId,
            type: "agent.budget.model.reconciled",
            payload: {
              llmCallId: reservation.llmCallId,
              turnIndex: reservation.turnIndex,
              totalTokens: actualUsage.totalTokens,
              costMicros: actualUsage.costMicros,
              tokensUsed,
              costUsedMicros,
              exceededReason: reason
            }
          }
        });
        return { reason, tokensUsed, costUsedMicros };
      },
      this.input.client
    );

    if (completed.reason) {
      const value = completed.reason === "max_tokens"
        ? completed.tokensUsed
        : completed.costUsedMicros;
      throw limitError(completed.reason, value, undefined);
    }
  }

  async failModelTurn(
    reservation: ModelTurnReservation,
    error: unknown,
    durationMs: number
  ) {
    const message = error instanceof Error ? error.message : "LLM planning failed";
    await withAgentTaskLease(
      this.input.taskId,
      this.input.lease,
      async (tx) => {
        const updated = await tx.lLMCall.updateMany({
          where: { id: reservation.llmCallId, status: "running" },
          data: { status: "failed", error: message, durationMs }
        });
        if (updated.count === 0) return;
        await tx.eventLog.create({
          data: {
            roomId: this.input.roomId,
            agentTaskId: this.input.taskId,
            type: "agent.budget.model.failed",
            payload: {
              llmCallId: reservation.llmCallId,
              turnIndex: reservation.turnIndex,
              reservedTokens: reservation.reservedTokens,
              reservedCostMicros: reservation.reservedCostMicros,
              error: message
            }
          }
        });
      },
      this.input.client
    );
  }

  async reserveToolCall(input: {
    toolName: string;
    stepKey: string;
    attempt: number;
  }) {
    this.assertWithinDeadline();
    await withAgentTaskLease(
      this.input.taskId,
      this.input.lease,
      async (tx) => {
        const task = await tx.agentTask.findUniqueOrThrow({
          where: { id: this.input.taskId },
          select: {
            deadlineAt: true,
            maxToolCalls: true,
            toolCallsUsed: true
          }
        });
        assertPersistedDeadline(task.deadlineAt, this.input.deadlineAt);
        if (task.toolCallsUsed >= task.maxToolCalls) {
          throw limitError(
            "max_tool_calls",
            task.toolCallsUsed,
            task.maxToolCalls,
            input
          );
        }
        const toolCallsUsed = task.toolCallsUsed + 1;
        await tx.agentTask.update({
          where: { id: this.input.taskId },
          data: { toolCallsUsed }
        });
        await tx.eventLog.create({
          data: {
            roomId: this.input.roomId,
            agentTaskId: this.input.taskId,
            type: "agent.budget.tool.reserved",
            payload: { ...input, toolCallsUsed }
          }
        });
      },
      this.input.client
    );
  }

  async assertCanFinalize() {
    this.assertWithinDeadline();
    await withAgentTaskLease(
      this.input.taskId,
      this.input.lease,
      async (tx) => {
        const task = await tx.agentTask.findUniqueOrThrow({
          where: { id: this.input.taskId },
          select: { deadlineAt: true }
        });
        assertPersistedDeadline(task.deadlineAt, this.input.deadlineAt);
      },
      this.input.client
    );
  }

  dispose() {
    if (this.deadlineTimer) clearTimeout(this.deadlineTimer);
  }

  private deadlineError() {
    return new AgentRuntimeBudgetExceededError("max_runtime", {
      deadlineAt: this.input.deadlineAt.toISOString()
    });
  }
}

export function estimateModelInputTokens(request: LLMPlanRequest) {
  let serializedLength = 0;
  try {
    serializedLength = JSON.stringify(request).length;
  } catch {
    serializedLength = request.prompt.length;
  }
  return Math.ceil(serializedLength / TOKEN_ESTIMATE_CHARS)
    + PROVIDER_PROMPT_OVERHEAD_TOKENS;
}

export function calculateModelCostMicros(input: {
  promptTokens: number;
  completionTokens: number;
  inputRate: number;
  outputRate: number;
}) {
  const numerator = input.promptTokens * input.inputRate
    + input.completionTokens * input.outputRate;
  return Math.ceil(numerator / MICROS_PER_UNIT);
}

export function getBudgetLimitMessage(reason: AgentTaskLimitReason) {
  const labels: Record<AgentTaskLimitReason, string> = {
    max_turns: "Model 回合数",
    max_tool_calls: "工具调用次数",
    max_runtime: "运行时限",
    max_tokens: "Token 用量",
    max_cost: "成本"
  };
  return `本次任务已达到${labels[reason]}上限，Runtime 已安全停止；你可以缩小任务范围后重试。`;
}

function normalizeModelUsage(
  usage: LLMPlanResult["usage"],
  reservation: ModelTurnReservation,
  inputRate: number,
  outputRate: number
) {
  if (!usage) {
    return {
      promptTokens: null,
      completionTokens: null,
      totalTokens: reservation.reservedTokens,
      costMicros: reservation.reservedCostMicros
    };
  }
  const promptTokens = nonnegativeInteger(usage.promptTokens);
  const completionTokens = nonnegativeInteger(usage.completionTokens);
  const reportedTotal = nonnegativeInteger(usage.totalTokens);
  const totalTokens = reportedTotal
    ?? (promptTokens !== null || completionTokens !== null
      ? (promptTokens ?? 0) + (completionTokens ?? 0)
      : reservation.reservedTokens);
  const costMicros = promptTokens !== null || completionTokens !== null
    ? calculateModelCostMicros({
        promptTokens: promptTokens ?? 0,
        completionTokens: completionTokens ?? 0,
        inputRate,
        outputRate
      })
    : Math.ceil(totalTokens * Math.max(inputRate, outputRate) / MICROS_PER_UNIT);
  return { promptTokens, completionTokens, totalTokens, costMicros };
}

function nonnegativeInteger(value: number | undefined) {
  return Number.isInteger(value) && (value ?? -1) >= 0 ? value! : null;
}

function assertPersistedDeadline(actual: Date | null, expected: Date) {
  if (!actual || actual.getTime() !== expected.getTime()) {
    throw new Error("Agent runtime deadline changed after initialization.");
  }
  if (Date.now() >= actual.getTime()) {
    throw new AgentRuntimeBudgetExceededError("max_runtime", {
      deadlineAt: actual.toISOString()
    });
  }
}

function limitError(
  reason: AgentTaskLimitReason,
  used: number | undefined,
  limit: number | undefined,
  details: Record<string, unknown> = {}
) {
  return new AgentRuntimeBudgetExceededError(reason, {
    used,
    limit,
    ...details
  });
}

function toJsonValue(value: unknown) {
  if (value === undefined || value === null) return Prisma.JsonNull;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
