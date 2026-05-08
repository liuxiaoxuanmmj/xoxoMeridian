import { dispatchPendingAgentTasks } from "@/agent/task-dispatcher";
import { schedulerTick, clearAllTimers } from "@/agent/scheduler-tick";
import { env } from "@/lib/env";

const SCHEDULER_TICK_MS = 5_000;
const SCHEDULER_JITTER_MS = 1_000;
const DISPATCH_MAX_BACKOFF_MS = 60_000;

let stopped = false;

process.on("SIGINT", () => { stopped = true; clearAllTimers(); });
process.on("SIGTERM", () => { stopped = true; clearAllTimers(); });

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function dispatchLoop() {
  let consecutiveErrors = 0;
  console.log(`[worker] dispatch loop started, base poll ${env.AGENT_WORKER_POLL_MS}ms`);

  while (!stopped) {
    try {
      const results = await dispatchPendingAgentTasks(3);
      if (results.length > 0) console.log(`[worker] processed ${results.length} task(s)`);
      consecutiveErrors = 0;
    } catch (error) {
      consecutiveErrors += 1;
      console.error("[worker] dispatch failed:", error);
    }
    const wait = consecutiveErrors === 0
      ? env.AGENT_WORKER_POLL_MS
      : Math.min(env.AGENT_WORKER_POLL_MS * 2 ** consecutiveErrors, DISPATCH_MAX_BACKOFF_MS);
    await sleep(wait);
  }
}

async function schedulerLoop() {
  console.log(`[worker] scheduler loop started, tick ~${SCHEDULER_TICK_MS}ms`);

  while (!stopped) {
    try {
      const result = await schedulerTick();
      const moved =
        result.reminders.fired + result.reminders.skipped + result.reminders.failed +
        result.jobs.fired + result.jobs.skipped + result.jobs.failed;
      if (moved > 0) console.log("[worker] scheduler tick:", result);
    } catch (error) {
      console.error("[worker] scheduler tick failed:", error);
    }
    const jitter = Math.floor((Math.random() - 0.5) * SCHEDULER_JITTER_MS);
    await sleep(SCHEDULER_TICK_MS + jitter);
  }
}

async function main() {
  await Promise.all([dispatchLoop(), schedulerLoop()]);
  console.log("[worker] stopped");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
