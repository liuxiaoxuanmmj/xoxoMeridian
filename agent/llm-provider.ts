import type { AgentPlan, LLMPlanRequest, LLMPlanResult, LLMProvider } from "@/agent/types";

type OpenAICompatibleResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
};

export function createLLMProvider(): LLMProvider {
  const provider = process.env.LLM_PROVIDER ?? "openai-compatible";
  const apiKey = process.env.LLM_API_KEY;

  if (provider === "mock" || !apiKey) {
    return createMockLLMProvider();
  }

  return createOpenAICompatibleProvider({
    apiKey,
    baseURL: process.env.LLM_BASE_URL ?? "https://api.openai.com/v1",
    model: process.env.LLM_MODEL ?? "gpt-4.1-mini",
    timeoutMs: Number(process.env.LLM_TIMEOUT_MS ?? 20000)
  });
}

export function createMockLLMProvider(): LLMProvider {
  return {
    name: "mock-local-planner",
    model: "mock-structured-planner",
    async plan(request: LLMPlanRequest): Promise<LLMPlanResult> {
      const prompt = request.prompt.trim();
      const lowerPrompt = prompt.toLowerCase();
      const hasWeather = prompt.includes("天气") || lowerPrompt.includes("weather");
      const hasTimezone = prompt.includes("时差") || prompt.includes("时间") || lowerPrompt.includes("timezone");
      const hasMemo = prompt.includes("备忘") || lowerPrompt.includes("memo");
      const hasNote = prompt.includes("便签") || prompt.includes("小纸条") || lowerPrompt.includes("note");
      const hasReminder = prompt.includes("提醒") || lowerPrompt.includes("remind") || prompt.includes("明天");

      if (hasWeather) {
        return withRaw({
          intent: "get_weather",
          confidence: 0.82,
          requiredTools: ["weather.get"],
          taskSteps: ["读取对方城市", "查询天气", "回复聊天室"],
          finalResponsePlan: "用简短温暖的方式说明对方城市天气。",
          toolInputs: {
            "weather.get": {
              city: "London"
            }
          }
        });
      }

      if (hasTimezone) {
        return withRaw({
          intent: "compare_timezone",
          confidence: 0.84,
          requiredTools: ["timezone.compare"],
          taskSteps: ["读取双方时区", "计算当前时间", "说明适合联系窗口"],
          finalResponsePlan: "告诉用户两地当前时间和联系建议。",
          toolInputs: {
            "timezone.compare": {
              fromLabel: "我",
              fromTimezone: "Asia/Shanghai",
              toLabel: "她",
              toTimezone: "Europe/London"
            }
          }
        });
      }

      if (hasMemo) {
        return withRaw({
          intent: "create_memo",
          confidence: 0.78,
          requiredTools: ["memo.create"],
          taskSteps: ["整理备忘录标题", "写入备忘录", "回复聊天室"],
          finalResponsePlan: "告诉用户备忘录已经保存。",
          toolInputs: {
            "memo.create": {
              title: "新的备忘录",
              content: prompt.replace(/^(帮我)?(创建|新增)?备忘录[:：\s]*/u, "") || prompt
            }
          }
        });
      }

      if (hasNote) {
        return withRaw({
          intent: "create_note",
          confidence: 0.78,
          requiredTools: ["note.create"],
          taskSteps: ["整理便签内容", "写入便签", "回复聊天室"],
          finalResponsePlan: "告诉用户便签已经贴到右侧面板。",
          toolInputs: {
            "note.create": {
              content: prompt.replace(/^(帮我)?(创建|新增)?(便签|小纸条)[:：\s]*/u, "") || prompt,
              color: "sage"
            }
          }
        });
      }

      if (hasReminder) {
        return withRaw({
          intent: "create_reminder",
          confidence: 0.88,
          requiredTools: ["reminder.create"],
          taskSteps: ["解析提醒内容", "解析提醒时间", "创建提醒事项", "回复聊天室"],
          finalResponsePlan: "告诉用户提醒事项已经创建，并说明目前 MVP 会先展示在提醒列表。",
          toolInputs: {
            "reminder.create": {
              title: extractReminderTitle(prompt),
              body: prompt,
              naturalDue: prompt.includes("明天") ? "tomorrow morning" : "unspecified",
              timezone: "Asia/Shanghai"
            }
          }
        });
      }

      return withRaw({
        intent: "chat_assist",
        confidence: 0.5,
        requiredTools: ["note.create"],
        taskSteps: ["把用户请求记录成便签", "回复聊天室"],
        finalResponsePlan: "说明已经记录下来，后续可以补充更明确的任务。",
        toolInputs: {
          "note.create": {
            content: prompt,
            color: "warm"
          }
        }
      });
    }
  };
}

function withRaw(plan: AgentPlan): LLMPlanResult {
  return {
    ...plan,
    rawResponse: {
      intent: plan.intent,
      confidence: plan.confidence,
      required_tools: plan.requiredTools,
      task_steps: plan.taskSteps,
      final_response_plan: plan.finalResponsePlan,
      tool_inputs: plan.toolInputs
    }
  };
}

function extractReminderTitle(prompt: string) {
  const cleaned = prompt
    .replace(/^@小助手/u, "")
    .replace(/^\/agent/u, "")
    .replace(/明天/u, "")
    .replace(/提醒我/u, "")
    .replace(/提醒/u, "")
    .trim();

  return cleaned || "新的提醒";
}

function createOpenAICompatibleProvider(config: {
  apiKey: string;
  baseURL: string;
  model: string;
  timeoutMs: number;
}): LLMProvider {
  return {
    name: "openai-compatible",
    model: config.model,
    async plan(request: LLMPlanRequest): Promise<LLMPlanResult> {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

      try {
        const response = await fetch(`${config.baseURL.replace(/\/$/, "")}/chat/completions`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            "Content-Type": "application/json"
          },
          signal: controller.signal,
          body: JSON.stringify({
            model: config.model,
            temperature: 0.2,
            response_format: { type: "json_object" },
            messages: [
              {
                role: "system",
                content:
                  "你是本地生活助手 Agent 的任务规划器。只返回 JSON，不要 Markdown。必须从 available_tools 中选择工具，不能发明工具。"
              },
              {
                role: "user",
                content: JSON.stringify({
                  user_prompt: request.prompt,
                  room_context: request.roomContext,
                  available_tools: request.availableTools,
                  required_shape: {
                    intent: "string",
                    confidence: "number between 0 and 1",
                    required_tools: "string[]",
                    task_steps: "string[]",
                    final_response_plan: "string",
                    tool_inputs: "object keyed by tool name"
                  }
                })
              }
            ]
          })
        });

        if (!response.ok) {
          throw new Error(`LLM request failed with ${response.status}: ${await response.text()}`);
        }

        const payload = (await response.json()) as OpenAICompatibleResponse;
        const content = payload.choices?.[0]?.message?.content;
        if (!content) {
          throw new Error("LLM response did not contain message content.");
        }

        const parsed = JSON.parse(content);
        return {
          ...coercePlan(parsed, request.availableTools),
          rawResponse: payload,
          usage: {
            promptTokens: payload.usage?.prompt_tokens,
            completionTokens: payload.usage?.completion_tokens,
            totalTokens: payload.usage?.total_tokens
          }
        };
      } finally {
        clearTimeout(timeout);
      }
    }
  };
}

function coercePlan(raw: Record<string, unknown>, availableTools: string[]): AgentPlan {
  const requiredTools = Array.isArray(raw.required_tools)
    ? raw.required_tools.filter((tool): tool is string => typeof tool === "string" && availableTools.includes(tool))
    : [];

  const toolInputs = typeof raw.tool_inputs === "object" && raw.tool_inputs !== null ? raw.tool_inputs : {};

  return {
    intent: typeof raw.intent === "string" ? raw.intent : "unknown",
    confidence: typeof raw.confidence === "number" ? raw.confidence : 0.5,
    requiredTools,
    taskSteps: Array.isArray(raw.task_steps) ? raw.task_steps.map(String) : [],
    finalResponsePlan: typeof raw.final_response_plan === "string" ? raw.final_response_plan : "回复用户任务已处理。",
    toolInputs: toolInputs as Record<string, unknown>
  };
}
