import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process";
import { fileURLToPath } from "node:url";

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { createTestRoom } from "@/tests/integration/support/database";

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const START_BUDGET_MS = 30_000;
const RECOVERY_BUDGET_MS = 20_000;
const OUTPUT_POLL_MS = 100;
const RECOVERED_MARKER = "[worker] recovered 1 timeline projection(s)";

beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "Room", "Agent", "AgentTask", "ToolCall", "Post" RESTART IDENTITY CASCADE'
  );
});

afterAll(async () => {
  await prisma.$disconnect();
});

/** 真实数据库上的「完成事实已提交、投影终态未推进」状态。 */
async function seedPendingProjection() {
  const room = await createTestRoom();
  const agent = await prisma.agent.create({
    data: { slug: "recovery-agent", displayName: "恢复助手", description: "Worker 恢复测试" },
  });
  const task = await prisma.agentTask.create({
    data: {
      roomId: room.id,
      agentId: agent.id,
      status: "completed",
      completedAt: new Date("2026-09-20T08:00:00.000Z"),
      result: { summary: "已完成但投影缺失" },
      input: { prompt: "让 Worker 补做这条投影" },
    },
  });
  await prisma.toolCall.create({
    data: {
      taskId: task.id,
      stepKey: "weather.get",
      toolName: "weather.get",
      status: "completed",
      durationMs: 8,
    },
  });
  return { room, task };
}

function startWorker(databaseUrl: string) {
  // 显式构造子进程环境（硬约束 9：不继承宿主 .env）；这里指向测试容器的临时数据库。
  const env: NodeJS.ProcessEnv = {
    PATH: process.env.PATH ?? "",
    HOME: process.env.HOME ?? "",
    NODE_ENV: "test",
    DATABASE_URL: databaseUrl,
    DIRECT_URL: databaseUrl,
    APP_BASE_URL: "http://127.0.0.1:3000",
    SESSION_SECRET: "w".repeat(32),
    INVITE_CODE: "worker-recovery-invite",
    LLM_PROVIDER: "mock",
    LLM_API_KEY: "",
    AGENT_WORKER_POLL_MS: "1000",
  };
  const spawnOptions: SpawnOptions = {
    cwd: REPO_ROOT,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  };
  const child = spawn(process.execPath, ["--import", "tsx", "agent/agent-worker.ts"], spawnOptions);
  let output = "";
  child.stdout?.on("data", (chunk: Buffer) => {
    output += chunk.toString();
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    output += chunk.toString();
  });
  return { child, readOutput: () => output };
}

async function waitForMarker(readOutput: () => string, marker: string, budgetMs: number) {
  const deadline = Date.now() + budgetMs;
  while (Date.now() < deadline) {
    if (readOutput().includes(marker)) return true;
    await new Promise((resolve) => setTimeout(resolve, OUTPUT_POLL_MS));
  }
  return false;
}

function waitForExit(child: ChildProcess, budgetMs: number) {
  return new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => resolve(false), budgetMs);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve(true);
    });
  });
}

describe("Agent Worker 的时间线投影恢复", () => {
  it("启动后自行补做缺失的投影，且只写一条", async () => {
    const { room, task } = await seedPendingProjection();
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error("DATABASE_URL is required for the worker recovery test.");

    const { child, readOutput } = startWorker(databaseUrl);
    try {
      const recovered = await waitForMarker(readOutput, RECOVERED_MARKER, START_BUDGET_MS + RECOVERY_BUDGET_MS);
      expect(
        recovered,
        `Worker 未在预算内补做投影；输出：${readOutput().slice(-800)}`
      ).toBe(true);

      const posts = await prisma.post.findMany({ where: { roomId: room.id } });
      expect(posts).toHaveLength(1);
      expect(posts[0]).toMatchObject({ type: "agent_log", agentTaskId: task.id });
      expect(await prisma.agentTask.findUniqueOrThrow({ where: { id: task.id } })).toMatchObject({
        timelineProjectedAt: expect.any(Date),
      });
    } finally {
      child.kill("SIGTERM");
      await waitForExit(child, 10_000);
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    }

    // 再跑一个循环周期也不得产生第二条。
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    expect(await prisma.post.count({ where: { roomId: room.id } })).toBe(1);
  }, 90_000);
});
