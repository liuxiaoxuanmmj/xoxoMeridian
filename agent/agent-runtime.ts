import type { Prisma } from "@prisma/client";

import { buildAgentContext } from "@/agent/context-builder";
import { ExecutionTracer } from "@/agent/execution-tracer";
import { createLLMProvider } from "@/agent/llm-provider";
import { createToolRegistry } from "@/agent/tool-registry";
import type { AgentPlan, ToolResult } from "@/agent/types";
import { prisma } from "@/lib/prisma";

export async function runAgentTask(taskId: string) {
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

  if (task.status === "completed" || task.status === "running") {
    return task;
  }

  const tracer = new ExecutionTracer(prisma, task.id, task.roomId);

  try {
    await tracer.markRunning();
    const runtimeContext = await buildAgentContext(task.roomId);
    await tracer.event("agent.context.built", {
      recentMessageCount: runtimeContext.recentMessages.length,
      memoCount: runtimeContext.memos.length,
      noteCount: runtimeContext.notes.length,
      reminderCount: runtimeContext.reminders.length
    });

    const registry = createToolRegistry();
    const provider = createLLMProvider();
    const prompt = getTaskPrompt(task.input);
    const availableTools = registry.list().map((tool) => tool.name);

    const llmStartedAt = Date.now();
    await tracer.event("agent.llm.started", {
      provider: provider.name,
      model: provider.model,
      availableTools
    });

    let plan: AgentPlan;
    try {
      const planResult = await provider.plan({
        prompt,
        roomContext: runtimeContext.roomContext,
        availableTools
      });

      plan = planResult;
      await prisma.lLMCall.create({
        data: {
          taskId: task.id,
          provider: provider.name,
          model: provider.model,
          inputSummary: prompt.slice(0, 240),
          requestPayload: {
            prompt,
            roomContext: runtimeContext.roomContext,
            availableTools
          },
          responsePayload: planResult.rawResponse ?? planResult,
          promptTokens: planResult.usage?.promptTokens,
          completionTokens: planResult.usage?.completionTokens,
          totalTokens: planResult.usage?.totalTokens,
          status: "completed",
          durationMs: Date.now() - llmStartedAt
        }
      });
      await tracer.event("agent.llm.completed", { intent: plan.intent, requiredTools: plan.requiredTools });
    } catch (error) {
      const message = error instanceof Error ? error.message : "LLM planning failed";
      await prisma.lLMCall.create({
        data: {
          taskId: task.id,
          provider: provider.name,
          model: provider.model,
          inputSummary: prompt.slice(0, 240),
          requestPayload: { prompt, availableTools },
          status: "failed",
          error: message,
          durationMs: Date.now() - llmStartedAt
        }
      });
      throw error;
    }

    await prisma.agentTask.update({
      where: { id: task.id },
      data: { plan: plan as Prisma.InputJsonObject }
    });

    const toolResults: ToolResult[] = [];
    for (const toolName of plan.requiredTools) {
      const output = await registry.execute(toolName, plan.toolInputs[toolName] ?? {}, {
        prisma,
        taskId: task.id,
        roomId: task.roomId,
        agentId: task.agentId,
        requestedById: task.requestedById,
        runtimeContext,
        tracer
      });
      toolResults.push(output);
    }

    const content = renderAgentReply(plan, toolResults);
    const finalMessage = await prisma.message.create({
      data: {
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
      }
    });

    await tracer.markCompleted(finalMessage.id, {
      plan,
      toolResults
    });

    return prisma.agentTask.findUniqueOrThrow({
      where: { id: task.id },
      include: { toolCalls: true, llmCalls: true, finalMessage: true, eventLogs: true }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Agent task failed";
    const finalMessage = await prisma.message.create({
      data: {
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
      }
    });
    await tracer.markFailed(message, finalMessage.id);
    return prisma.agentTask.findUniqueOrThrow({
      where: { id: task.id },
      include: { toolCalls: true, llmCalls: true, finalMessage: true, eventLogs: true }
    });
  }
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

function renderAgentReply(plan: AgentPlan, toolResults: ToolResult[]) {
  const first = toolResults[0];

  if (plan.intent === "create_reminder") {
    const output = first?.output as { title?: string; dueAt?: string | Date | null; timezone?: string } | undefined;
    return `已经帮你创建提醒：${output?.title ?? "新的提醒"}。MVP 阶段我会先把它放到右侧提醒列表里，之后可以接通知推送。`;
  }

  if (plan.intent === "get_weather") {
    const output = first?.output as { city?: string; condition?: string; temperatureC?: number; advice?: string } | undefined;
    return `${output?.city ?? "她那边"}现在天气：${output?.condition ?? "已查询"}，约 ${output?.temperatureC ?? "--"}°C。${
      output?.advice ?? "出门前再看一眼实时天气会更稳。"
    }`;
  }

  if (plan.intent === "compare_timezone") {
    const output = first?.output as {
      from?: { label?: string; time?: string };
      to?: { label?: string; time?: string };
      suggestion?: string;
    } | undefined;
    return `${output?.from?.label ?? "你"}这边是 ${output?.from?.time ?? "当前时间未知"}；${
      output?.to?.label ?? "她"
    }那边是 ${output?.to?.time ?? "当前时间未知"}。${output?.suggestion ?? ""}`;
  }

  if (plan.intent === "create_memo") {
    const output = first?.output as { title?: string } | undefined;
    return `备忘录已保存：${output?.title ?? "新的备忘录"}。`;
  }

  if (plan.intent === "create_note") {
    return "便签已经贴到右侧面板了。";
  }

  return `我已经处理了这个任务：${plan.finalResponsePlan}`;
}
