import { dispatchPendingAgentTasks } from "@/agent/task-dispatcher";

const pollMs = Number(process.env.AGENT_WORKER_POLL_MS ?? 3000);
let stopped = false;

process.on("SIGINT", () => {
  stopped = true;
});

process.on("SIGTERM", () => {
  stopped = true;
});

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log(`Agent worker started. Polling every ${pollMs}ms.`);

  while (!stopped) {
    try {
      const results = await dispatchPendingAgentTasks(3);
      if (results.length > 0) {
        console.log(`Processed ${results.length} agent task(s).`);
      }
    } catch (error) {
      console.error("Agent worker polling failed:", error);
    }

    await sleep(pollMs);
  }

  console.log("Agent worker stopped.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
