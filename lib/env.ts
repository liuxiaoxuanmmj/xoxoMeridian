import { z } from "zod";

const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";
const isTest = process.env.NODE_ENV === "test" || process.env.VITEST !== undefined;

const baseSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  DATABASE_URL: z.string().min(1),
  DIRECT_URL: z.string().min(1).optional(),

  APP_BASE_URL: z.string().url(),
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
  ALLOWED_ORIGINS: z.string().optional().default(""),

  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 chars"),
  SESSION_MAX_AGE_SECONDS: z.coerce.number().int().positive().default(60 * 60 * 24 * 7),
  DEMO_LOGIN_PASSWORD: z.string().min(8, "DEMO_LOGIN_PASSWORD must be at least 8 chars"),

  DEMO_ROOM_SLUG: z.string().default("our-room"),
  DEMO_MY_EMAIL: z.string().email().default("me@example.com"),
  DEMO_HER_EMAIL: z.string().email().default("her@example.com"),

  LLM_PROVIDER: z.string().default("openai-compatible"),
  LLM_API_KEY: z.string().optional().default(""),
  LLM_BASE_URL: z.string().url().default("https://api.openai.com/v1"),
  LLM_MODEL: z.string().default("gpt-4.1-mini"),
  LLM_TIMEOUT_MS: z.coerce.number().int().positive().default(20000),

  WEATHER_PROVIDER: z.string().default("mock"),
  WEATHER_API_KEY: z.string().optional().default(""),
  WEATHER_BASE_URL: z.string().optional().default(""),
  QWEATHER_API_HOST: z.string().optional().default("devapi.qweather.com"),
  QWEATHER_GEOAPI_HOST: z.string().optional().default("geoapi.qweather.com"),

  AGENT_WORKER_POLL_MS: z.coerce.number().int().positive().default(3000),
  AGENT_TASK_INLINE_RUN: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  AGENT_DEBUG_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
});

const lenientPlaceholders = {
  DATABASE_URL: "postgresql://placeholder@localhost:5432/placeholder",
  APP_BASE_URL: "http://localhost:3000",
  SESSION_SECRET: "build-time-placeholder-build-time-placeholder",
  DEMO_LOGIN_PASSWORD: "build-time-placeholder",
} as const;

function parseEnv() {
  const source: Record<string, string | undefined> = { ...process.env };

  if (isBuildPhase || isTest) {
    for (const [key, fallback] of Object.entries(lenientPlaceholders)) {
      if (!source[key] || source[key] === "") {
        source[key] = fallback;
      }
    }
  }

  const result = baseSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");

    const message = `Invalid environment configuration:\n${issues}`;

    if (isBuildPhase || isTest) {
      console.warn(`[env] ${message}`);
      return baseSchema.parse({ ...source, ...lenientPlaceholders });
    }

    console.error(`[env] ${message}`);
    process.exit(1);
  }

  return result.data;
}

export const env = parseEnv();

if (!env.LLM_API_KEY && env.NODE_ENV === "production") {
  console.warn(
    "[env] LLM_API_KEY is empty. Falling back to mock-local-planner. Set LLM_API_KEY to enable real LLM calls."
  );
}
