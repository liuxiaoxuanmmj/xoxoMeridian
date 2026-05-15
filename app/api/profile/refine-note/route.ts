import { z } from "zod";

import { errorToResponse, jsonError, jsonOk } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { enforceRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  text: z.string().min(1).max(2000),
});

const REFINE_SYSTEM_PROMPT =
  "你是 xoxo Meridian 的小助手。用户即将把这段自我介绍交给 AI 助手做长期参考。" +
  "请把它整理成一段更清晰、温暖、可被 AI 理解的第二人称背景说明（“你”为用户）。" +
  "要求：保留所有事实（过敏、偏好、时区、纪念日、地址、长期目标等）；" +
  "不要新增用户没说过的事实；不要使用 Markdown；" +
  "输出纯文本一段或几段，控制在 1500 字以内；语气自然、不夸张。" +
  "只输出润色后的正文，不要前后加任何说明。";

type OpenAICompatibleResponse = {
  choices?: Array<{ message?: { content?: string } }>;
};

// POST /api/profile/refine-note
// Auth-guarded /me-only helper. Sends the user's profileNote to the configured
// LLM with a strict "preserve facts, no markdown" system prompt and returns the
// refined text. Not registered as an agent tool to prevent in-room misuse.
export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();

    const limited = enforceRateLimit(request, `refine-note:${user.id}`, 10, 60 * 60_000);
    if (limited) return limited;

    const raw = await request.json().catch(() => null);
    const parsed = BodySchema.safeParse(raw);
    if (!parsed.success) {
      return jsonError("invalid_body", 400, parsed.error.issues);
    }

    if (env.LLM_PROVIDER === "mock" || !env.LLM_API_KEY) {
      return jsonOk({ refined: parsed.data.text, reason: "llm_disabled" });
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), env.LLM_TIMEOUT_MS);

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
            temperature: 0.4,
            messages: [
              { role: "system", content: REFINE_SYSTEM_PROMPT },
              { role: "user", content: parsed.data.text },
            ],
          }),
        }
      );

      if (!response.ok) {
        return jsonError("llm_failed", 502, { status: response.status });
      }

      const payload = (await response.json()) as OpenAICompatibleResponse;
      const content = payload.choices?.[0]?.message?.content?.trim() ?? "";
      if (!content) {
        return jsonError("llm_failed", 502, { reason: "empty_content" });
      }

      return jsonOk({ refined: content.slice(0, 2000) });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return jsonError("llm_failed", 502, { reason: message });
    } finally {
      clearTimeout(timer);
    }
  } catch (error) {
    return errorToResponse(error);
  }
}
