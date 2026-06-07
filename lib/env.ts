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
  INVITE_CODE: z.string().min(8, "INVITE_CODE must be at least 8 chars"),
  PASSWORD_MIN_LENGTH: z.coerce.number().int().min(6).default(8),

  DEMO_ROOM_SLUG: z.string().default("our-room"),

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

  TAVILY_API_KEY: z.string().optional().default(""),

  EMAIL_PROVIDER: z.string().default("mock"),
  EMAIL_API_KEY: z.string().optional().default(""),
  EMAIL_FROM: z.string().email().default("noreply@example.com"),

  // TurboSMTP API (REST API 方式)
  TURBOSMTP_CONSUMER_KEY: z.string().optional().default(""),
  TURBOSMTP_CONSUMER_SECRET: z.string().optional().default(""),
  TURBOSMTP_REGION: z.enum(["us", "eu"]).optional().default("us"),

  // SMTP 通用配置（支持 TurboSMTP SMTP、Gmail SMTP 等）
  SMTP_HOST: z.string().optional().default(""),
  SMTP_PORT: z.coerce.number().int().positive().optional().default(587),
  SMTP_SECURE: z
    .enum(["true", "false"])
    .optional()
    .default("false")
    .transform((v) => v === "true"),
  SMTP_USER: z.string().optional().default(""),
  SMTP_PASSWORD: z.string().optional().default(""),

  AGENT_WORKER_POLL_MS: z.coerce.number().int().positive().default(3000),
  AGENT_TASK_INLINE_RUN: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  AGENT_DEBUG_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  CHAT_LOG_DIR: z.string().optional(),
  ATLAS_STORAGE_PROVIDER: z.enum(["local", "aliyun-oss"]).default("local"),
  ATLAS_UPLOAD_DIR: z.string().optional().default("data/atlas-uploads"),
  ALIYUN_OSS_REGION: z.string().optional().default(""),
  ALIYUN_OSS_BUCKET: z.string().optional().default(""),
  ALIYUN_OSS_ACCESS_KEY_ID: z.string().optional().default(""),
  ALIYUN_OSS_ACCESS_KEY_SECRET: z.string().optional().default(""),
  ALIYUN_OSS_ENDPOINT: z.string().optional().default(""),
  ALIYUN_OSS_PREFIX: z.string().optional().default("atlas/"),

  LOGIN_VISUALS_MANIFEST_URL: z.string().url().optional().or(z.literal("")).default(""),
  LOGIN_VISUALS_CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  LOGIN_VISUALS_IMAGE_SRC: z.string().optional().default(""),
});

const lenientPlaceholders = {
  DATABASE_URL: "postgresql://placeholder@localhost:5432/placeholder",
  APP_BASE_URL: "http://localhost:3000",
  SESSION_SECRET: "build-time-placeholder-build-time-placeholder",
  INVITE_CODE: "build-time-placeholder",
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

  if (result.data.ATLAS_STORAGE_PROVIDER === "aliyun-oss") {
    const missing = [
      ["ALIYUN_OSS_REGION", result.data.ALIYUN_OSS_REGION],
      ["ALIYUN_OSS_BUCKET", result.data.ALIYUN_OSS_BUCKET],
      ["ALIYUN_OSS_ACCESS_KEY_ID", result.data.ALIYUN_OSS_ACCESS_KEY_ID],
      ["ALIYUN_OSS_ACCESS_KEY_SECRET", result.data.ALIYUN_OSS_ACCESS_KEY_SECRET],
    ].filter(([, value]) => !value);

    if (missing.length > 0 && !isBuildPhase && !isTest) {
      console.error(
        `[env] ATLAS_STORAGE_PROVIDER=aliyun-oss requires: ${missing
          .map(([key]) => key)
          .join(", ")}`
      );
      process.exit(1);
    }
  }

  return result.data;
}

export const env = parseEnv();

if (!env.LLM_API_KEY && env.NODE_ENV === "production") {
  console.warn(
    "[env] LLM_API_KEY is empty. Falling back to mock-local-planner. Set LLM_API_KEY to enable real LLM calls."
  );
}
