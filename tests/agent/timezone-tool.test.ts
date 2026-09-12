import { describe, expect, it } from "vitest";

import { createTimezoneTool } from "@/agent/tools/timezone-tool";

const participants = [
  {
    userId: "u1",
    user: {
      id: "u1",
      displayName: "Alice",
      profile: { timezone: "Asia/Shanghai" },
    },
  },
  {
    userId: "u2",
    user: {
      id: "u2",
      displayName: "Bob",
      profile: { timezone: "Europe/London" },
    },
  },
];

function makeContext(requestedById: string | null) {
  return {
    taskId: "task-1",
    roomId: "room-1",
    agentId: "agent-1",
    requestedById,
    prisma: {} as never,
    tracer: {} as never,
    runtimeContext: { participants } as never,
  };
}

describe("timezone.compare", () => {
  it("compares from requester to partner when the requester is second", async () => {
    const result = (await createTimezoneTool().execute({}, makeContext("u2"))) as {
      from: { label: string; timezone: string };
      to: { label: string; timezone: string };
    };

    expect(result.from).toMatchObject({ label: "Bob", timezone: "Europe/London" });
    expect(result.to).toMatchObject({ label: "Alice", timezone: "Asia/Shanghai" });
  });

  it("keeps explicit labels and timezones ahead of participant defaults", async () => {
    const result = (await createTimezoneTool().execute(
      {
        fromLabel: "东京",
        fromTimezone: "Asia/Tokyo",
        toLabel: "纽约",
        toTimezone: "America/New_York",
      },
      makeContext("u2")
    )) as {
      from: { label: string; timezone: string };
      to: { label: string; timezone: string };
    };

    expect(result.from).toMatchObject({ label: "东京", timezone: "Asia/Tokyo" });
    expect(result.to).toMatchObject({ label: "纽约", timezone: "America/New_York" });
  });

  it("uses neutral defaults instead of guessing by position without a requester", async () => {
    const result = (await createTimezoneTool().execute({}, makeContext(null))) as {
      from: { label: string; timezone: string };
      to: { label: string; timezone: string };
    };

    expect(result.from).toMatchObject({ label: "本人", timezone: "Asia/Shanghai" });
    expect(result.to).toMatchObject({ label: "对方", timezone: "Europe/London" });
  });
});
