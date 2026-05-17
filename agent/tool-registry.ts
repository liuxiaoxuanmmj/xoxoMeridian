import type { AgentTool, ToolExecutionContext, ToolResult } from "@/agent/types";
import { createMemoTool } from "@/agent/tools/memo-tool";
import { createMemorySetTool, createMemoryRecallTool } from "@/agent/tools/memory-tool";

import {
  createScheduleCancelTool,
  createScheduleCreateTool,
  createScheduleListTool,
  createScheduleUpdateTool
} from "@/agent/tools/schedule-tool";
import { createTimezoneTool } from "@/agent/tools/timezone-tool";
import { createWeatherTool } from "@/agent/tools/weather-tool";

export class ToolRegistry {
  private readonly tools = new Map<string, AgentTool>();

  register(tool: AgentTool) {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool already registered: ${tool.name}`);
    }

    this.tools.set(tool.name, tool);
  }

  list() {
    return Array.from(this.tools.values());
  }

  get(name: string) {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Tool is not registered or allowed: ${name}`);
    }

    return tool;
  }

  async execute(name: string, input: unknown, context: ToolExecutionContext): Promise<ToolResult> {
    const tool = this.get(name);
    const call = await context.tracer.startToolCall(tool.name, input);

    try {
      const output = await tool.execute(input, context);
      await context.tracer.completeToolCall(call.id, call.startedAt, output);
      return {
        toolName: tool.name,
        output
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Tool execution failed";
      await context.tracer.failToolCall(call.id, call.startedAt, message);
      throw error;
    }
  }
}

export function createToolRegistry() {
  const registry = new ToolRegistry();
  registry.register(createWeatherTool());
  registry.register(createTimezoneTool());
  registry.register(createMemoTool());

  registry.register(createScheduleCreateTool());
  registry.register(createScheduleListTool());
  registry.register(createScheduleCancelTool());
  registry.register(createScheduleUpdateTool());
  registry.register(createMemorySetTool());
  registry.register(createMemoryRecallTool());
  return registry;
}
