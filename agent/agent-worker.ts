import { dispatchPendingAgentTasks } from "@/agent/task-dispatcher";
import { getRuntimeWorkerId } from "@/agent/task-claim";
import {
  schedulerTick,
  clearAllTimers,
  drainSchedulerTasks,
  SCHEDULER_DRAIN_TIMEOUT_MS,
} from "@/agent/scheduler-tick";
import { createStopController, interruptibleSleep } from "@/agent/worker-lifecycle";
import { recoverPendingTimelineProjections } from "@/lib/agent-posts";
import { cleanupExpiredSessions } from "@/lib/auth";
import { cleanupExpiredResetTokens } from "@/lib/password-reset";
import { env } from "@/lib/env";

const SCHEDULER_TICK_MS = 5_000;
const SCHEDULER_JITTER_MS = 1_000;
const DISPATCH_MAX_BACKOFF_MS = 60_000;
const SESSION_CLEANUP_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

const workerId = getRuntimeWorkerId();
const shutdown = createStopController();

function requestShutdown() {
  shutdown.stop();
  clearAllTimers();
}

process.on("SIGINT", requestShutdown);
process.on("SIGTERM", requestShutdown);

const sleep = (ms: number) => interruptibleSleep(ms, shutdown);

async function dispatchLoop() {
  let consecutiveErrors = 0;
  console.log(`[worker] dispatch loop started, base poll ${env.AGENT_WORKER_POLL_MS}ms`);

  while (!shutdown.stopped) {
    try {
      const results = await dispatchPendingAgentTasks(3, { workerId });
      if (results.length > 0) console.log(`[worker] processed ${results.length} task(s)`);
      consecutiveErrors = 0;
    } catch (error) {
      consecutiveErrors += 1;
      console.error("[worker] dispatch failed:", error);
    }
    // 投影补做与任务分发互相隔离：任一侧失败都不拖住另一侧，也不影响退避计数。
    try {
      const recovered = await recoverPendingTimelineProjections();
      if (recovered > 0) {
        console.log(`[worker] recovered ${recovered} timeline projection(s)`);
      }
    } catch (error) {
      console.error("[worker] timeline projection recovery failed:", error);
    }
    const wait = consecutiveErrors === 0
      ? env.AGENT_WORKER_POLL_MS
      : Math.min(env.AGENT_WORKER_POLL_MS * 2 ** consecutiveErrors, DISPATCH_MAX_BACKOFF_MS);
    await sleep(wait);
  }
}

async function schedulerLoop() {
  console.log(`[worker] scheduler loop started, tick ~${SCHEDULER_TICK_MS}ms`);
  let lastCleanup = Date.now();

  while (!shutdown.stopped) {
    try {
      const result = await schedulerTick();
      const moved =
        result.jobs.fired + result.jobs.skipped + result.jobs.failed;
      if (moved > 0) console.log("[worker] scheduler tick:", result);

      // Periodic session cleanup
      const now = Date.now();
      if (now - lastCleanup >= SESSION_CLEANUP_INTERVAL_MS) {
        try {
          await cleanupExpiredSessions();
          await cleanupExpiredResetTokens();
          console.log("[worker] expired sessions and reset tokens cleaned");
          lastCleanup = now;
        } catch (error) {
          console.error("[worker] cleanup failed:", error);
        }
      }
    } catch (error) {
      console.error("[worker] scheduler tick failed:", error);
    }
    const jitter = Math.floor((Math.random() - 0.5) * SCHEDULER_JITTER_MS);
    await sleep(SCHEDULER_TICK_MS + jitter);
  }
}

async function main() {
  await Promise.all([dispatchLoop(), schedulerLoop()]);
  const drained = await drainSchedulerTasks(SCHEDULER_DRAIN_TIMEOUT_MS);
  console.log(`[worker] stopped${drained ? "" : " (scheduler drain timed out)"}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
