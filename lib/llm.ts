import { env } from "@/lib/env";

export type CallLLMOptions = {
  systemPrompt: string;
  userContent: string;
  temperature?: number;
  jsonMode?: boolean;
  maxTokens?: number;
  timeoutMs?: number;
};

export type CallLLMResult = {
  content: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
};

type OpenAICompatibleResponse = {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
};

export function isLLMAvailable(): boolean {
  return env.LLM_PROVIDER !== "mock" && !!env.LLM_API_KEY;
}

export async function callLLM(options: CallLLMOptions): Promise<CallLLMResult> {
  if (!isLLMAvailable()) {
    throw new Error("LLM is not available (mock provider or missing API key)");
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? env.LLM_TIMEOUT_MS
  );

  try {
    const response = await fetch(
      `${env.LLM_BASE_URL.replace(/\/$/, "")}/chat/completions`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.LLM_API_KEY}`,
          "Content-Type": "application/json",
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: env.LLM_MODEL,
          temperature: options.temperature ?? 0.3,
          ...(options.jsonMode && { response_format: { type: "json_object" } }),
          ...(options.maxTokens && { max_tokens: options.maxTokens }),
          messages: [
            { role: "system", content: options.systemPrompt },
            { role: "user", content: options.userContent },
          ],
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`LLM API error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as OpenAICompatibleResponse;
    const content = data.choices[0]?.message?.content;

    if (!content) {
      throw new Error("LLM response missing content");
    }

    return {
      content,
      usage: data.usage
        ? {
            promptTokens: data.usage.prompt_tokens,
            completionTokens: data.usage.completion_tokens,
            totalTokens: data.usage.total_tokens,
          }
        : undefined,
    };
  } finally {
    clearTimeout(timeout);
  }
}
