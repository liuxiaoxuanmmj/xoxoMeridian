import type { PrismaClient } from "@prisma/client";

import type { ExecutionTracer } from "@/agent/execution-tracer";

export type AgentPlan = {
  intent: string;
  confidence: number;
  requiredTools: string[];
  taskSteps: string[];
  finalResponsePlan: string;
  toolInputs: Record<string, unknown>;
};

export type LLMPlanRequest = {
  prompt: string;
  roomContext: string;
  availableTools: string[];
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
