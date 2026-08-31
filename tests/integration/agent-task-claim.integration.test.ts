import { spawn } from "node:child_process";
import { resolve } from "node:path";

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { ExecutionTracer } from "@/agent/execution-tracer";
import { beginAgentStep } from "@/agent/durable-step";
import {
  AgentTaskLeaseLostError,
  claimAgentTask,
  renewAgentTaskLease
} from "@/agent/task-claim";
import { prisma } from "@/lib/prisma";
import {
  createTestRoom,
  resetTestDatabase
} from "@/tests/integration/support/database";

beforeEach(async () => {
  await resetTestDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("AgentTask atomic claim", () => {
  it("allows only one concurrent caller to claim the same task", async () => {
    const room = await createTestRoom();
    const agent = await prisma.agent.create({
      data: {
        slug: "claim-test-agent",
        displayName: "Claim Test Agent",
        description: "Verifies atomic task claiming"
      }
    });
    const task = await prisma.agentTask.create({
      data: {
        roomId: room.id,
        agentId: agent.id,
        input: { normalizedContent: "hello" }
      }
    });

    const claims = await Promise.all(
      Array.from({ length: 12 }, () => claimAgentTask(task.id, {}, prisma))
    );

    const winner = claims.find((claim) => claim.claimed);
    if (!winner) throw new Error("No concurrent caller claimed the task.");
    expect(claims.filter((claim) => claim.claimed)).toHaveLength(1);
    const heartbeatAt = new Date(winner.claimedAt.getTime() + 1_000);
    await expect(renewAgentTaskLease(task.id, {
      attemptId: winner.attemptId,
      workerId: winner.workerId,
      leaseDurationMs: winner.leaseDurationMs
    }, prisma, heartbeatAt)).resolves.toMatchObject({
      renewed: true,
      heartbeatAt,
      leaseExpiresAt: new Date(heartbeatAt.getTime() + winner.leaseDurationMs)
    });
    await expect(
      prisma.agentTask.findUniqueOrThrow({ where: { id: task.id } })
    ).resolves.toMatchObject({
      status: "running",
      attemptCount: 1,
      error: null,
      completedAt: null,
      finalMessageId: null
    });
  });

  it("recovers a lease after a Worker is force-killed and fences the old attempt", async () => {
    const room = await createTestRoom();
    const agent = await prisma.agent.create({
      data: {
        slug: "crash-recovery-agent",
        displayName: "Crash Recovery Agent",
        description: "Verifies expired lease recovery"
      }
    });
    const task = await prisma.agentTask.create({
      data: {
        roomId: room.id,
        agentId: agent.id,
        input: { normalizedContent: "recover after crash" }
      }
    });

    const crashedClaim = await claimInWorkerProcessAndKill(task.id, "worker-crashed");
    expect(crashedClaim.claimed).toBe(true);
    const expiredAt = new Date(crashedClaim.leaseExpiresAt);

    await expect(claimAgentTask(task.id, {
      workerId: "worker-too-early",
      now: new Date(expiredAt.getTime() - 1)
    }, prisma)).resolves.toMatchObject({ claimed: false });

    const takeover = await claimAgentTask(task.id, {
      workerId: "worker-recovery",
      leaseDurationMs: 60_000,
      now: new Date(expiredAt.getTime() + 1)
    }, prisma);
    expect(takeover).toMatchObject({ claimed: true, workerId: "worker-recovery" });
    expect(takeover.attemptId).not.toBe(crashedClaim.attemptId);

    await expect(renewAgentTaskLease(task.id, {
      attemptId: crashedClaim.attemptId,
      workerId: crashedClaim.workerId,
      leaseDurationMs: crashedClaim.leaseDurationMs
    }, prisma, new Date(expiredAt.getTime() + 2))).resolves.toMatchObject({
      renewed: false
    });

    const staleTracer = new ExecutionTracer(prisma, task.id, room.id, {
      attemptId: crashedClaim.attemptId,
      workerId: crashedClaim.workerId,
      leaseDurationMs: crashedClaim.leaseDurationMs
    });
    await expect(staleTracer.completeWithMessage({
      roomId: room.id,
      senderType: "agent",
      senderAgentId: agent.id,
      content: "stale result",
      targetType: "all"
    }, { stale: true })).rejects.toBeInstanceOf(AgentTaskLeaseLostError);
    await expect(prisma.message.count({ where: { roomId: room.id } })).resolves.toBe(0);

    const recoveryTracer = new ExecutionTracer(prisma, task.id, room.id, {
      attemptId: takeover.attemptId,
      workerId: takeover.workerId,
      leaseDurationMs: takeover.leaseDurationMs
    });
    await beginAgentStep({
      taskId: task.id,
      roomId: room.id,
      lease: {
        attemptId: takeover.attemptId,
        workerId: takeover.workerId,
        leaseDurationMs: takeover.leaseDurationMs
      },
      stepKey: "final",
      kind: "final",
      stepInput: { content: "recovered result" }
    });
    await recoveryTracer.completeWithMessage({
      roomId: room.id,
      senderType: "agent",
      senderAgentId: agent.id,
      content: "recovered result",
      targetType: "all"
    }, { recovered: true });

    await expect(
      prisma.agentTask.findUniqueOrThrow({ where: { id: task.id } })
    ).resolves.toMatchObject({
      status: "completed",
      attemptCount: 2,
      attemptId: takeover.attemptId,
      workerId: null,
      leaseExpiresAt: null,
      result: { recovered: true }
    });
    await expect(prisma.message.count({ where: { roomId: room.id } })).resolves.toBe(1);
  });
});

type SerializedClaim = {
  claimed: boolean;
  attemptId: string;
  workerId: string;
  leaseExpiresAt: string;
  leaseDurationMs: number;
};

async function claimInWorkerProcessAndKill(taskId: string, workerId: string) {
  const fixture = resolve("tests/integration/fixtures/claim-agent-task-and-wait.ts");
  const child = spawn(
    process.execPath,
    ["--import", "tsx", fixture, taskId, workerId, "60000"],
    {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"]
    }
  );

  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });

  const claim = await new Promise<SerializedClaim>((resolveClaim, reject) => {
    let stdout = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      const newline = stdout.indexOf("\n");
      if (newline === -1) return;
      try {
        resolveClaim(JSON.parse(stdout.slice(0, newline)) as SerializedClaim);
      } catch (error) {
        reject(error);
      }
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code !== null && code !== 0) {
        reject(new Error(`claim Worker exited before readiness (${code}/${signal}): ${stderr}`));
      }
    });
  });

  child.kill("SIGKILL");
  await new Promise<void>((resolveExit, reject) => {
    child.once("close", (_code, signal) => {
      if (signal !== "SIGKILL") {
        reject(new Error(`claim Worker was not force-killed: ${signal ?? "no signal"}`));
        return;
      }
      resolveExit();
    });
  });

  return claim;
}
