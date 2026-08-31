import { randomUUID } from "node:crypto";
import { hostname } from "node:os";

import type { Prisma, PrismaClient } from "@prisma/client";

import type { AgentTaskLeaseOwnership } from "@/agent/types";
import { prisma } from "@/lib/prisma";

type AgentTaskClaimClient = Pick<PrismaClient, "agentTask">;
type AgentTaskTransactionClient = Pick<PrismaClient, "$transaction">;

export type AgentTaskClaimOptions = {
  workerId?: string;
  attemptId?: string;
  leaseDurationMs?: number;
  now?: Date;
};

export const DEFAULT_AGENT_TASK_LEASE_MS = 60_000;

const runtimeWorkerId = `${hostname()}:${process.pid}:${randomUUID()}`;

export class AgentTaskLeaseLostError extends Error {
  constructor(readonly taskId: string, readonly attemptId: string) {
    super(`Agent task lease lost: ${taskId} (${attemptId})`);
    this.name = "AgentTaskLeaseLostError";
  }
}

export function getRuntimeWorkerId() {
  return runtimeWorkerId;
}

export async function claimAgentTask(
  taskId: string,
  options: AgentTaskClaimOptions = {},
  client: AgentTaskClaimClient = prisma
) {
  const claimedAt = options.now ?? new Date();
  const attemptId = options.attemptId ?? randomUUID();
  const workerId = options.workerId ?? runtimeWorkerId;
  const leaseDurationMs = options.leaseDurationMs ?? DEFAULT_AGENT_TASK_LEASE_MS;
  const leaseExpiresAt = new Date(claimedAt.getTime() + leaseDurationMs);
  const result = await client.agentTask.updateMany({
    where: {
      id: taskId,
      OR: [
        { status: { in: ["pending", "failed"] } },
        {
          status: "running",
          OR: [
            { leaseExpiresAt: null },
            { leaseExpiresAt: { lte: claimedAt } }
          ]
        }
      ]
    },
    data: {
      status: "running",
      attemptCount: { increment: 1 },
      attemptId,
      workerId,
      heartbeatAt: claimedAt,
      leaseExpiresAt,
      startedAt: claimedAt,
      completedAt: null,
      finalMessageId: null,
      error: null
    }
  });

  return {
    claimed: result.count === 1,
    claimedAt,
    attemptId,
    workerId,
    leaseExpiresAt,
    leaseDurationMs
  };
}

export async function renewAgentTaskLease(
  taskId: string,
  ownership: AgentTaskLeaseOwnership,
  client: AgentTaskClaimClient = prisma,
  now = new Date()
) {
  const leaseExpiresAt = new Date(now.getTime() + ownership.leaseDurationMs);
  const result = await client.agentTask.updateMany({
    where: {
      id: taskId,
      status: "running",
      attemptId: ownership.attemptId,
      workerId: ownership.workerId,
      leaseExpiresAt: { gt: now }
    },
    data: {
      heartbeatAt: now,
      leaseExpiresAt
    }
  });

  return {
    renewed: result.count === 1,
    heartbeatAt: now,
    leaseExpiresAt
  };
}

export async function assertAgentTaskLease(
  taskId: string,
  ownership: AgentTaskLeaseOwnership,
  client: AgentTaskClaimClient = prisma,
  now = new Date()
) {
  const task = await client.agentTask.findFirst({
    where: {
      id: taskId,
      status: "running",
      attemptId: ownership.attemptId,
      workerId: ownership.workerId,
      leaseExpiresAt: { gt: now }
    },
    select: { id: true }
  });

  if (!task) {
    throw new AgentTaskLeaseLostError(taskId, ownership.attemptId);
  }
}

export async function withAgentTaskLease<T>(
  taskId: string,
  ownership: AgentTaskLeaseOwnership,
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
  client: AgentTaskTransactionClient = prisma
) {
  return client.$transaction(async (tx) => {
    const lease = await renewAgentTaskLease(taskId, ownership, tx);
    if (!lease.renewed) {
      throw new AgentTaskLeaseLostError(taskId, ownership.attemptId);
    }
    return operation(tx);
  });
}

export function startAgentTaskHeartbeat(input: {
  taskId: string;
  ownership: AgentTaskLeaseOwnership;
  intervalMs: number;
  client?: AgentTaskClaimClient;
}) {
  const client = input.client ?? prisma;
  let stopped = false;
  let leaseLost = false;
  let renewal: Promise<void> | null = null;

  const tick = () => {
    if (stopped || renewal) return;
    renewal = renewAgentTaskLease(input.taskId, input.ownership, client)
      .then((result) => {
        if (!result.renewed) leaseLost = true;
      })
      .catch((error) => {
        console.error("[agent-runtime] task heartbeat failed", error);
      })
      .finally(() => {
        renewal = null;
      });
  };

  const timer = setInterval(tick, input.intervalMs);
  timer.unref();

  return {
    async assertActive() {
      if (leaseLost) {
        throw new AgentTaskLeaseLostError(input.taskId, input.ownership.attemptId);
      }
      await assertAgentTaskLease(input.taskId, input.ownership, client);
    },
    async stop() {
      stopped = true;
      clearInterval(timer);
      await renewal;
    }
  };
}
