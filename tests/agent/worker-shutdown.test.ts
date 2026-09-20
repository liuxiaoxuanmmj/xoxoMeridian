import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const WORKER_START_BUDGET_MS = 30_000;
// Compose 未声明 stop grace，容器默认在 10 秒后 SIGKILL；旧实现只有等当前 sleep
// 结束（本用例把 poll 设为 30 秒）才会退出，因此这个预算能区分修复前后。
const SHUTDOWN_BUDGET_MS = 8_000;
const OUTPUT_POLL_MS = 100;
// 让两个 loop 的 sleep 远长于 shutdown 预算，从而区分「响应信号」与「睡醒后才发现要停」。
const WORKER_POLL_MS = 30_000;

// 显式构造子进程环境：不继承宿主 .env，也不指向真实数据库（硬约束 9）。
// 数据库地址必然拒绝连接，两个 loop 因而很快进入 sleep，复现「停机只能等睡眠结束」的场景。
const workerEnv: NodeJS.ProcessEnv = {
  PATH: process.env.PATH ?? "",
  HOME: process.env.HOME ?? "",
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://worker:worker@127.0.0.1:1/worker-shutdown?connect_timeout=1",
  APP_BASE_URL: "http://127.0.0.1:3000",
  SESSION_SECRET: "w".repeat(32),
  INVITE_CODE: "worker-shutdown-invite",
  AGENT_WORKER_POLL_MS: String(WORKER_POLL_MS),
};

function startWorker() {
  const spawnOptions: SpawnOptions = {
    cwd: REPO_ROOT,
    env: workerEnv,
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

function waitForExit(child: ChildProcess, budgetMs: number) {
  return new Promise<{ code: number | null; signal: NodeJS.Signals | null } | null>((resolve) => {
    const timer = setTimeout(() => resolve(null), budgetMs);
    child.once("exit", (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal });
    });
  });
}

async function waitForOutput(readOutput: () => string, marker: string, budgetMs: number) {
  const deadline = Date.now() + budgetMs;
  while (Date.now() < deadline) {
    if (readOutput().includes(marker)) return true;
    await new Promise((resolve) => setTimeout(resolve, OUTPUT_POLL_MS));
  }
  return false;
}

describe("agent worker - 进程级 shutdown", () => {
  it(
    "收到 SIGTERM 后在容器宽限期内退出",
    async () => {
      const { child, readOutput } = startWorker();
      try {
        const started = await waitForOutput(
          readOutput,
          "[worker] scheduler loop started",
          WORKER_START_BUDGET_MS
        );
        expect(started, `worker 未在预算内启动；输出：${readOutput().slice(-500)}`).toBe(true);

        const signaledAt = Date.now();
        child.kill("SIGTERM");
        const exit = await waitForExit(child, SHUTDOWN_BUDGET_MS);
        const elapsed = Date.now() - signaledAt;

        expect(
          exit,
          `worker 未在 ${SHUTDOWN_BUDGET_MS}ms 内响应 SIGTERM；输出：${readOutput().slice(-500)}`
        ).not.toBeNull();
        expect(elapsed).toBeLessThan(SHUTDOWN_BUDGET_MS);
        expect(exit?.code).toBe(0);
        expect(readOutput()).toContain("[worker] stopped");
      } finally {
        if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
      }
    },
    60_000
  );
});
