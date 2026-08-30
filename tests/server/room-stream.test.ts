import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockAssertRoomAccess,
  mockCookies,
  mockGetRoomSnapshot,
  mockRequireCurrentUser,
  mockRoomParticipantFindUnique,
  mockSessionFindUnique,
  mockVerifySession,
} = vi.hoisted(() => ({
  mockAssertRoomAccess: vi.fn(),
  mockCookies: vi.fn(),
  mockGetRoomSnapshot: vi.fn(),
  mockRequireCurrentUser: vi.fn(),
  mockRoomParticipantFindUnique: vi.fn(),
  mockSessionFindUnique: vi.fn(),
  mockVerifySession: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: mockCookies,
}));

vi.mock("@/lib/access", () => ({
  assertRoomAccess: mockAssertRoomAccess,
}));

vi.mock("@/lib/auth", () => ({
  USER_COOKIE: "xoxo_session",
  requireCurrentUser: mockRequireCurrentUser,
  verifySession: mockVerifySession,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    roomParticipant: {
      findUnique: mockRoomParticipantFindUnique,
    },
    session: {
      findUnique: mockSessionFindUnique,
    },
  },
}));

vi.mock("@/lib/room-snapshot", () => ({
  getRoomSnapshot: mockGetRoomSnapshot,
}));

import { GET } from "@/app/api/rooms/[roomId]/stream/route";

type Deferred<T> = {
  promise: Promise<T>;
  reject: (reason?: unknown) => void;
  resolve: (value: T) => void;
};

function deferred<T>(): Deferred<T> {
  let reject!: Deferred<T>["reject"];
  let resolve!: Deferred<T>["resolve"];
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

async function openRoomStream(abortController: AbortController) {
  const response = await GET(
    new Request("http://localhost/api/rooms/room-1/stream", {
      signal: abortController.signal,
    }),
    { params: Promise.resolve({ roomId: "room-1" }) },
  );
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("Expected the room stream response to have a body.");
  }
  return { reader, response };
}

let scheduledSnapshot: (() => unknown) | undefined;

beforeEach(() => {
  vi.clearAllMocks();
  scheduledSnapshot = undefined;
  vi.spyOn(globalThis, "setInterval").mockImplementation(((callback: () => void) => {
    scheduledSnapshot = callback;
    return 1 as unknown as ReturnType<typeof setInterval>;
  }) as typeof setInterval);
  vi.spyOn(globalThis, "clearInterval").mockImplementation(() => undefined);

  mockRequireCurrentUser.mockResolvedValue({ id: "user-1" });
  mockAssertRoomAccess.mockResolvedValue({ id: "participant-1" });
  mockCookies.mockResolvedValue({
    get: () => ({ value: "session-token" }),
  });
  mockVerifySession.mockReturnValue(null);
  mockRoomParticipantFindUnique.mockResolvedValue({ id: "participant-1" });
  mockGetRoomSnapshot.mockResolvedValue({ room: { id: "room-1" } });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/rooms/[roomId]/stream", () => {
  it.each([
    {
      name: "snapshot",
      settle: (pending: Deferred<unknown>) => pending.resolve({ room: { id: "room-1" } }),
    },
    {
      name: "error",
      settle: (pending: Deferred<unknown>) => pending.reject(new Error("Snapshot failed")),
    },
  ])("does not enqueue $name when the client disconnects during the initial snapshot", async ({ settle }) => {
    const pendingSnapshot = deferred<unknown>();
    mockGetRoomSnapshot.mockReturnValueOnce(pendingSnapshot.promise);
    const abortController = new AbortController();
    const { reader } = await openRoomStream(abortController);
    await flushMicrotasks();
    expect(mockGetRoomSnapshot).toHaveBeenCalledOnce();

    abortController.abort();
    settle(pendingSnapshot);

    await expect(reader.read()).resolves.toEqual({ done: true, value: undefined });
    expect(scheduledSnapshot).toBeUndefined();
  });

  it("settles an in-flight snapshot without writing to a closed controller", async () => {
    const abortController = new AbortController();
    const { reader, response } = await openRoomStream(abortController);

    expect(response.headers.get("Content-Type")).toBe("text/event-stream");
    await expect(reader.read()).resolves.toMatchObject({ done: false });
    await flushMicrotasks();
    expect(scheduledSnapshot).toBeDefined();

    const pendingSnapshot = deferred<unknown>();
    mockGetRoomSnapshot.mockReturnValueOnce(pendingSnapshot.promise);
    const inFlightSnapshot = scheduledSnapshot?.();
    await flushMicrotasks();
    expect(mockGetRoomSnapshot).toHaveBeenCalledTimes(2);

    abortController.abort();
    await expect(reader.read()).resolves.toEqual({ done: true, value: undefined });
    pendingSnapshot.reject(new Error("Snapshot failed after disconnect"));

    await expect(inFlightSnapshot).resolves.toBeUndefined();
  });
});
