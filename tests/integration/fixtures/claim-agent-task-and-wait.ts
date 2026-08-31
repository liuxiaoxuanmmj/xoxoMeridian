import { claimAgentTask } from "@/agent/task-claim";

const [taskId, workerId, leaseDurationRaw] = process.argv.slice(2);
if (!taskId || !workerId || !leaseDurationRaw) {
  throw new Error("taskId, workerId and leaseDurationMs are required.");
}

const claim = await claimAgentTask(taskId, {
  workerId,
  leaseDurationMs: Number(leaseDurationRaw)
});
process.stdout.write(`${JSON.stringify(claim)}\n`);

setInterval(() => undefined, 60_000);
