import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authState = vi.hoisted(() => ({ userId: "" }));

vi.mock("@/lib/auth", () => ({
  requireCurrentUser: vi.fn(async () => ({ id: authState.userId }))
}));

import { POST as dispatchAgent } from "@/app/api/agent/dispatch/route";
import { getAgentRuntimeBudgetCreateData } from "@/agent/runtime-budget";
import { createHumanMessage } from "@/lib/messages";
import { prisma } from "@/lib/prisma";
import {
  createTestRoom,
  createTestUser,
  resetTestDatabase
} from "@/tests/integration/support/database";

const EVENT_DELAY_TRIGGER = "delay_agent_created_event";
const EVENT_DELAY_FUNCTION = "delay_agent_created_event";
const EVENT_FAILURE_TRIGGER = "fail_agent_created_event";
const EVENT_FAILURE_FUNCTION = "fail_agent_created_event";

beforeEach(async () => {
  await resetTestDatabase();
});

afterEach(async () => {
  await dropEventTrigger(EVENT_DELAY_TRIGGER, EVENT_DELAY_FUNCTION);
  await dropEventTrigger(EVENT_FAILURE_TRIGGER, EVENT_FAILURE_FUNCTION);
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function dropEventTrigger(triggerName: string, functionName: string) {
  await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${triggerName} ON "EventLog"`);
  await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS ${functionName}()`);
}

async function createDispatchFixture() {
  const room = await createTestRoom();
  const user = await createTestUser();
  authState.userId = user.id;
  await prisma.roomParticipant.create({
    data: {
      roomId: room.id,
      userId: user.id,
      role: "owner"
    }
  });
  await prisma.agent.create({
    data: {
      slug: "life-assistant",
      displayName: "生活助手",
      description: "Agent dispatch atomicity test"
    }
  });
  const message = await prisma.message.create({
    data: {
      roomId: room.id,
      senderId: user.id,
      senderType: "human",
      content: "请帮我整理今天的计划"
    }
  });

  return { room, user, message };
}

function submitDispatch(roomId: string, sourceMessageId: string, clientIp: string) {
  return dispatchAgent(
    new Request("http://localhost/api/agent/dispatch", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": clientIp
      },
      body: JSON.stringify({ roomId, sourceMessageId })
    })
  );
}

describe("explicit Agent dispatch atomicity", () => {
  it("returns one stable Task for concurrent dispatches of the same source message", async () => {
    const { room, message } = await createDispatchFixture();

    await prisma.$executeRawUnsafe(`
      CREATE FUNCTION ${EVENT_DELAY_FUNCTION}() RETURNS trigger AS $$
      BEGIN
        IF NEW.type = 'agent.task.created' THEN
          PERFORM pg_sleep(0.5);
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER ${EVENT_DELAY_TRIGGER}
      BEFORE INSERT ON "EventLog"
      FOR EACH ROW EXECUTE FUNCTION ${EVENT_DELAY_FUNCTION}()
    `);

    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    let responses: Response[];
    try {
      responses = await Promise.all([
        submitDispatch(room.id, message.id, "198.51.100.51"),
        submitDispatch(room.id, message.id, "198.51.100.52")
      ]);
    } finally {
      consoleError.mockRestore();
    }

    expect(responses.map((response) => response.status).sort()).toEqual([200, 201]);
    const bodies = await Promise.all(responses.map((response) => response.json()));
    expect(new Set(bodies.map((body) => body.task.id)).size).toBe(1);

    const tasks = await prisma.agentTask.findMany({
      where: { sourceMessageId: message.id }
    });
    expect(tasks).toHaveLength(1);
    await expect(
      prisma.eventLog.count({
        where: {
          agentTaskId: tasks[0].id,
          type: "agent.task.created"
        }
      })
    ).resolves.toBe(1);
  });

  it("rolls back the Task when its created Event fails and permits a clean retry", async () => {
    const { room, message } = await createDispatchFixture();

    await prisma.$executeRawUnsafe(`
      CREATE FUNCTION ${EVENT_FAILURE_FUNCTION}() RETURNS trigger AS $$
      BEGIN
        IF NEW.type = 'agent.task.created' THEN
          RAISE EXCEPTION 'simulated agent created Event failure';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER ${EVENT_FAILURE_TRIGGER}
      BEFORE INSERT ON "EventLog"
      FOR EACH ROW EXECUTE FUNCTION ${EVENT_FAILURE_FUNCTION}()
    `);

    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    let failedResponse: Response;
    try {
      failedResponse = await submitDispatch(room.id, message.id, "198.51.100.61");
    } finally {
      consoleError.mockRestore();
    }
    expect(failedResponse.status).toBe(500);
    await expect(
      prisma.agentTask.count({ where: { sourceMessageId: message.id } })
    ).resolves.toBe(0);
    await expect(
      prisma.eventLog.count({
        where: {
          roomId: room.id,
          type: "agent.task.created"
        }
      })
    ).resolves.toBe(0);

    await dropEventTrigger(EVENT_FAILURE_TRIGGER, EVENT_FAILURE_FUNCTION);

    const retryResponse = await submitDispatch(room.id, message.id, "198.51.100.62");
    expect(retryResponse.status).toBe(201);
    const retryBody = await retryResponse.json();
    const task = await prisma.agentTask.findUniqueOrThrow({
      where: { sourceMessageId: message.id }
    });
    expect(retryBody.task.id).toBe(task.id);
    await expect(
      prisma.eventLog.count({
        where: {
          agentTaskId: task.id,
          type: "agent.task.created"
        }
      })
    ).resolves.toBe(1);
  });

  it("keeps automatic message dispatch on the same Task and Event derivation contract", async () => {
    const { room, user } = await createDispatchFixture();

    const result = await createHumanMessage({
      roomId: room.id,
      userId: user.id,
      content: "@小助手，请提醒我晚上散步"
    });

    expect(result.task).not.toBeNull();
    if (!result.task) throw new Error("Expected automatic dispatch to create a Task");
    expect(result.task).toMatchObject({
      roomId: room.id,
      sourceMessageId: result.message.id,
      requestedById: user.id,
      status: "pending",
      ...getAgentRuntimeBudgetCreateData(),
      input: {
        rawContent: "@小助手，请提醒我晚上散步",
        normalizedContent: "请提醒我晚上散步",
        trigger: "mention",
        sourceMessageId: result.message.id
      }
    });
    await expect(
      prisma.eventLog.count({
        where: {
          agentTaskId: result.task.id,
          type: "agent.task.created"
        }
      })
    ).resolves.toBe(1);
  });
});
