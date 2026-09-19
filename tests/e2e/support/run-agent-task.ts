import { runAgentTask } from "@/agent/agent-runtime";
import { prisma } from "@/lib/prisma";

const [taskId] = process.argv.slice(2);
if (!taskId || process.env.NODE_ENV !== "test") {
  throw new Error("仅允许在隔离测试环境中执行指定 taskId。");
}

try {
  await runAgentTask(taskId, { workerId: "e2e-plan-validation-worker" });
} finally {
  await prisma.$disconnect();
}
