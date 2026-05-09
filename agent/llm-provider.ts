import { SCHEDULER_BLOCKED_TOOLS, TRIGGER_MARKER } from "@/agent/scheduler-tick";
import type { AgentPlan, LLMPlanRequest, LLMPlanResult, LLMProvider } from "@/agent/types";
import { env } from "@/lib/env";

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
  if (env.LLM_PROVIDER === "mock" || !env.LLM_API_KEY) {
    return createMockLLMProvider();
  }

  return createOpenAICompatibleProvider({
    apiKey: env.LLM_API_KEY,
    baseURL: env.LLM_BASE_URL,
    model: env.LLM_MODEL,
    timeoutMs: env.LLM_TIMEOUT_MS
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
          finalResponseText: "我已经查到天气了，会在房间里温柔地告诉你具体情况。",
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
          finalResponseText: "我已经把双方所在时区的当前时间整理好了。",
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
          finalResponseText: "备忘录已经记下了。",
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
          finalResponseText: "便签已经贴到右侧面板了。",
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
          finalResponsePlan: "告诉用户提醒事项已经创建，并说明已经展示在右侧提醒列表。",
          finalResponseText: "提醒已经帮你设好，放在右侧提醒列表里了。",
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
        requiredTools: [],
        taskSteps: ["直接回复用户"],
        finalResponsePlan: "直接回答用户的问题。",
        finalResponseText: "我是这个房间的小助手，可以帮你查天气、对时区、记便签、写备忘和设提醒。",
        toolInputs: {}
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
      final_response_text: plan.finalResponseText,
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
                  "你是本地生活助手 Agent 的任务规划器。只返回 JSON，不要 Markdown，不要代码块包裹。" +
                  "必须从 available_tools 中选择工具，不能发明工具；如果用户的请求不需要任何工具（例如自我介绍、闲聊、能力问答），required_tools 留空数组。" +
                  "**tool_inputs 中每个工具的参数字段必须严格按照 available_tools[i].schema 里列出的字段名命名**，不要自行发明字段名（例如 schema 写 title 就不能写 message）。" +
                  "schema 里 required 列出的字段必须提供。" +
                  "如果**同一个工具需要被调用多次**（例如要写多条记忆），把 tool_inputs[tool] 写成对象数组，每个元素是一次调用的参数，例如 tool_inputs['memory.set'] = [{key,value},{key,value}]；只调用一次时直接给单个对象即可。" +
                  "final_response_text 是**实际发给用户的中文回复正文**，要直接、温暖、口语化，可以引用 room_context 里的事实。" +
                  "不要把 final_response_text 写成对自己动作的描述（错误示例：'介绍自己是 Agent'；正确示例：'我是这个房间的小助手，可以帮你查天气、记便签、设提醒'）。" +
                  "final_response_plan 是给开发者看的内部规划摘要，与 final_response_text 不同。" +
                  // memory guidance
                  "【关于记忆】room_context.semantic_memory 是**已经记住的稳定事实**（如过敏、生日、偏好、时区），优先用它而不是凭空猜。" +
                  "当你**新观察到**这类持久事实时，主动调用 memory.set 把它写入；只记**下周仍然重要**的事情（过敏、长期偏好、纪念日、地址、时区、长期目标），" +
                  "**不要**记一次性心情、临时想法、刚发生的对话内容（已经在 recent_messages 里）、或不确定的事情。" +
                  "memory.set 的 key 必须是点分小写并以 'shared.'（房间共享）/'me.'（请求者）/'her.'（对方）开头，例如 'her.allergy.peanut'、'shared.anniversary'、'me.timezone'。" +
                  "同一 key 会覆盖旧值，所以用稳定命名而不是带时间戳。" +
                  "如果不确定某个事实是否已经记过，可以先用 memory.recall 查一下再决定要不要 memory.set。" +
                  // scheduling guidance
                  "【关于定时任务】当用户说的是**一次性时间点**（如'今晚八点/明天早上/后天/下周三/4月5日'等，且未出现'每/以后每/每天/每周'），" +
                  "必须走一次性路径：优先用 reminder.create 并给出 dueAt；若必须由 agent 执行某个 prompt（例如'今晚八点给我发一首诗'），" +
                  "用 **schedule.create 的 fireAt 字段**（ISO-8601 带时区偏移，例如 '2026-05-09T20:40:00+08:00'），它会自动以 runOnce 单次触发。" +
                  "不要再用 cron+runOnce 表达'今天某点某分'这种**绝对时间点**：planning 延迟几秒就可能把当前时间推过目标分钟，cron 的 next() 会直接跳到第二天。" +
                  "只有当用户是**真正的重复周期**（每周六、每天早上、工作日晚上）时才用 cron。" +
                  "当用户想**修改**已有定时任务（例如'改成每晚'/'其实我只要今晚一次'），优先用 schedule.update，而不是 cancel+create。" +
                  "final_response_text 中的承诺必须与 tool_inputs 的动作一一对应：" +
                  "说'每天/每晚'就必须有不带 runOnce 的 schedule.create(cron=...) 或 runOnce=false 的 schedule.update；" +
                  "说'只今晚一次/只一次/某个具体时间'就必须有 reminder.create、schedule.create(fireAt=...) 或 schedule.update(runOnce=true)。" +
                  "若用户消息里同时出现了旧任务要取消 + 新任务要安排，请在同一轮里同时输出取消和创建/更新两类工具调用。" +
                  // triggered-fire awareness
                  `【关于已触发的任务】如果 user_prompt 以'${TRIGGER_MARKER}'开头，意味着系统**已经触发**了你之前安排好的任务——直接执行其中描述的动作并写到 final_response_text，**不要**再调用 ${SCHEDULER_BLOCKED_TOOLS.join(" / ")} 安排新任务。这一轮的 user_prompt 不是用户的请求，而是触发回调。` +
                  // validation retry handling
                  "如果本轮 user 消息的 JSON 里出现了 validation_feedback 字段，说明上一轮的 plan 被一致性校验拦下了。" +
                  "请认真阅读 validation_feedback.issues 逐条修正，重新生成完整的 plan（不是在上一轮上打补丁），输出仍然只能是 JSON。"
              },
              {
                role: "user",
                content: JSON.stringify({
                  user_prompt: request.prompt,
                  room_context: request.roomContext,
                  available_tools: request.availableTools,
                  validation_feedback: request.validationFeedback
                    ? {
                        note: "上一轮的 plan 存在以下不一致，请根据反馈重新生成 plan，注意修正 tool_inputs 与 final_response_text 的一致性：",
                        previous_plan: request.validationFeedback.previousPlan,
                        issues: request.validationFeedback.issues
                      }
                    : undefined,
                  required_shape: {
                    intent: "string",
                    confidence: "number between 0 and 1",
                    required_tools: "string[] (must be subset of available_tools[].name, empty if user just chats)",
                    task_steps: "string[] (internal plan, dev-facing)",
                    final_response_plan: "string (internal plan summary, dev-facing)",
                    final_response_text: "string (the actual reply shown to the user, in Chinese, written in first person as the assistant)",
                    tool_inputs: "object keyed by tool name; each value's fields MUST match that tool's schema.properties exactly"
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
          ...coercePlan(parsed, request.availableTools.map((t) => t.name)),
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
    finalResponseText: typeof raw.final_response_text === "string" ? raw.final_response_text.trim() : "",
    toolInputs: toolInputs as Record<string, unknown>
  };
}
