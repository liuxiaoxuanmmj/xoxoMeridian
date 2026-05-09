import type { PrismaClient } from "@prisma/client";

import type { ExecutionTracer } from "@/agent/execution-tracer";

export type AgentPlan = {
  intent: string;
  confidence: number;
  requiredTools: string[];
  taskSteps: string[];
  finalResponsePlan: string;
  finalResponseText: string;
  toolInputs: Record<string, unknown>;
};

export type LLMToolDescriptor = {
  name: string;
  description: string;
  schema: unknown;
};

export type StructuredRoomContext = {
  room: { name: string; slug: string };
  participants: Array<{
    displayName: string;
    role: string | null;
    city: string | null;
    timezone: string | null;
  }>;
  recentMessages: Array<{ from: string; content: string; at: string }>;
  pinnedMemos: Array<{ title: string; content: string }>;
  notes: Array<{ content: string; color: string }>;
  activeReminders: Array<{ title: string; dueAt: string | null; timezone: string | null }>;
  activeSchedules: Array<{
    jobId: string;
    cron: string;
    timezone: string;
    nextRunAt: string;
    description: string | null;
  }>;
  semanticMemory: Array<{ key: string; value: string }>;
  summaries: Array<{ summary: string; createdAt: string }>;
};

export type LLMPlanRequest = {
  prompt: string;
  roomContext: StructuredRoomContext;
  availableTools: LLMToolDescriptor[];
  validationFeedback?: {
    previousPlan: AgentPlan;
    issues: string;
  };
};

export type LLMPlanResult = AgentPlan & {
  rawResponse?: unknown;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
};

export interface LLMProvider {
  name: string;
  model: string;
  plan(request: LLMPlanRequest): Promise<LLMPlanResult>;
}

export type RuntimeContext = Awaited<ReturnType<typeof import("@/agent/context-builder").buildAgentContext>>;

export type ToolExecutionContext = {
  prisma: PrismaClient;
  taskId: string;
  roomId: string;
  agentId: string;
  requestedById: string | null;
  runtimeContext: RuntimeContext;
  tracer: ExecutionTracer;
};

export interface AgentTool<Input = unknown, Output = unknown> {
  name: string;
  description: string;
  schema: unknown;
  execute(input: Input, context: ToolExecutionContext): Promise<Output>;
}

export type ToolResult = {
  toolName: string;
  output: unknown;
};
