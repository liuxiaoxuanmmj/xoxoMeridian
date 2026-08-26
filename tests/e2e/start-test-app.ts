import { execFile, spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";

import { E2E_INVITE_CODE } from "./support/credentials";

const execFileAsync = promisify(execFile);
const port = "3100";
const baseURL = `http://127.0.0.1:${port}`;
const dataDir = await mkdtemp(join(tmpdir(), "xoxo-meridian-e2e-"));
let postgres: StartedPostgreSqlContainer;
try {
  postgres = await new PostgreSqlContainer("postgres:16-alpine")
    .withDatabase("xoxo_meridian_e2e")
    .withUsername("xoxo_e2e")
    .withPassword("xoxo_e2e_password")
    .start();
} catch (error) {
  await rm(dataDir, { recursive: true, force: true });
  throw new Error(
    "无法启动 E2E 所需的 PostgreSQL Testcontainer。请确认 Docker daemon 可用且当前用户可访问；E2E 不会静默跳过。",
    { cause: error }
  );
}
const databaseUrl = postgres.getConnectionUri();
const appEnv: NodeJS.ProcessEnv = {
  ...process.env,
  NODE_ENV: "development",
  DATABASE_URL: databaseUrl,
  DIRECT_URL: databaseUrl,
  APP_BASE_URL: baseURL,
  NEXT_PUBLIC_APP_URL: baseURL,
  SESSION_SECRET: "xoxo-e2e-session-secret-at-least-thirty-two-characters",
  INVITE_CODE: E2E_INVITE_CODE,
  DEMO_ROOM_SLUG: "e2e-room",
  EMAIL_PROVIDER: "mock",
  EMAIL_FROM: "e2e@example.com",
  LLM_PROVIDER: "openai-compatible",
  LLM_API_KEY: "",
  WEATHER_PROVIDER: "mock",
  ATLAS_STORAGE_PROVIDER: "local",
  ATLAS_UPLOAD_DIR: join(dataDir, "atlas-uploads"),
  CHAT_LOG_DIR: join(dataDir, "chat-logs"),
  AGENT_TASK_INLINE_RUN: "false",
};
const prismaCli = resolve("node_modules/prisma/build/index.js");

await execFileAsync(process.execPath, [prismaCli, "migrate", "deploy"], {
  cwd: process.cwd(),
  env: appEnv,
});
await execFileAsync(process.execPath, ["--import", "tsx", "prisma/seed.ts"], {
  cwd: process.cwd(),
  env: appEnv,
});

const nextCli = resolve("node_modules/next/dist/bin/next");
const server = spawn(
  process.execPath,
  [nextCli, "dev", "--webpack", "--hostname", "127.0.0.1", "--port", port],
  { cwd: process.cwd(), env: appEnv, stdio: "inherit" }
);

let shuttingDown = false;

async function shutdown(exitCode: number) {
  if (shuttingDown) return;
  shuttingDown = true;
  server.kill("SIGTERM");
  await postgres.stop().catch(() => undefined);
  await rm(dataDir, { recursive: true, force: true });
  process.exit(exitCode);
}

process.on("SIGTERM", () => void shutdown(0));
process.on("SIGINT", () => void shutdown(130));
server.on("exit", (code) => void shutdown(code ?? 1));
