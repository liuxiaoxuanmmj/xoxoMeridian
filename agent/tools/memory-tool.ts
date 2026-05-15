import type { AgentTool } from "@/agent/types";

type MemorySetInput = {
  key?: string;
  value?: string;
  scope?: "shared" | "me" | "her";
  source?: string;
};

type MemoryRecallInput = {
  prefix?: string;
  limit?: number;
};

const KEY_PATTERN = /^[a-z0-9._-]{1,80}$/i;
const VALUE_MAX = 1000;

export function createMemorySetTool(): AgentTool<MemorySetInput> {
  return {
    name: "memory.set",
    description:
      "Persist a stable, high-signal fact about the room or its participants for future conversations. " +
      "Use ONLY for durable things: allergies, lasting preferences, important relationship dates, recurring routines, long-term goals, addresses/timezones. " +
      "DO NOT use for: ephemeral moods, one-off questions, recent chat content (already in context), or anything you're not confident will still matter next week. " +
      "Keys MUST be dotted, lowercase, and scoped: 'shared.<topic>' for room-level facts, 'me.<topic>' for the requester, 'her.<topic>' for the partner. " +
      "Examples: 'her.allergy.peanut'='confirmed 2026-05', 'shared.anniversary'='2024-10-12', 'me.timezone'='Asia/Shanghai'. " +
      "Existing keys are upserted (overwritten), so prefer stable key names over timestamped ones.",
    schema: {
      type: "object",
      required: ["key", "value"],
      properties: {
        key: { type: "string", description: "Dotted lowercase key. Must start with 'shared.', 'me.', or 'her.'" },
        value: { type: "string", description: "The fact to remember, ideally <200 chars." },
        scope: { type: "string", enum: ["shared", "me", "her"], description: "Optional: redundant if key already starts with the scope prefix." },
        source: { type: "string", description: "Optional provenance, defaults to 'agent-runtime'." }
      }
    },
    async execute(input, context) {
      const key = input.key?.trim().toLowerCase();
      const value = input.value?.trim();

      if (!key) throw new Error("Memory key is required.");
      if (!value) throw new Error("Memory value is required.");
      if (!KEY_PATTERN.test(key)) {
        throw new Error("Memory key must be dotted lowercase ([a-z0-9._-], 1-80 chars), e.g. 'her.allergy.peanut'.");
      }
      if (!key.startsWith("shared.") && !key.startsWith("me.") && !key.startsWith("her.")) {
        throw new Error("Memory key must start with 'shared.', 'me.', or 'her.'");
      }
      if (value.length > VALUE_MAX) {
        throw new Error(`Memory value too long (${value.length} > ${VALUE_MAX}).`);
      }

      const userId = resolveUserId(key, context);

      const memory = await context.prisma.memory.upsert({
        where: { roomId_key: { roomId: context.roomId, key } },
        update: { value, source: input.source ?? "agent-runtime", userId },
        create: { roomId: context.roomId, key, value, source: input.source ?? "agent-runtime", userId }
      });

      return { memoryId: memory.id, key: memory.key, value: memory.value };
    }
  };
}

export function createMemoryRecallTool(): AgentTool<MemoryRecallInput> {
  return {
    name: "memory.recall",
    description:
      "Retrieve previously persisted facts about this room. Useful when you need to verify a remembered detail before acting (e.g. confirming an allergy before suggesting food). " +
      "Returns up to `limit` rows ordered by recency. Optional `prefix` filter (e.g. 'her.') narrows by key namespace.",
    schema: {
      type: "object",
      properties: {
        prefix: { type: "string", description: "Optional key prefix filter, e.g. 'her.' or 'shared.anniversary'." },
        limit: { type: "number", description: "Max rows to return, default 20, max 50." }
      }
    },
    async execute(input, context) {
      const prefix = input.prefix?.trim().toLowerCase();
      const limit = Math.min(Math.max(input.limit ?? 20, 1), 50);

      const memories = await context.prisma.memory.findMany({
        where: {
          roomId: context.roomId,
          ...(prefix ? { key: { startsWith: prefix } } : {})
        },
        orderBy: { updatedAt: "desc" },
        take: limit,
        select: { key: true, value: true, updatedAt: true }
      });

      return { count: memories.length, memories };
    }
  };
}

function resolveUserId(
  key: string,
  context: {
    requestedById: string | null;
    runtimeContext: { participants: Array<{ user: { id: string } }> };
  }
): string | null {
  const scope = key.split(".")[0];
  if (scope === "shared") return null;

  if (scope === "me") return context.requestedById ?? null;

  if (scope === "her") {
    // "her" = the other human participant in the 2-person room (not the
    // requester). We can't rely on demoRole anymore — auth is plain
    // email/password and either user could be the requester.
    if (!context.requestedById) return null;
    const other = context.runtimeContext.participants.find(
      (p) => p.user.id !== context.requestedById
    );
    return other?.user.id ?? null;
  }

  return null;
}
