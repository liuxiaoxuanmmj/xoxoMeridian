import { runAgentTask } from "@/agent/agent-runtime";

export async function runTaskById(taskId: string) {
  return runAgentTask(taskId);
}
