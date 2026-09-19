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

async function readEvent(reader: ReadableStreamDefaultReader<Uint8Array>) {
  const { done, value } = await reader.read();
  expect(done).toBe(false);
  const [event, data] = new TextDecoder().decode(value).trim().split("\n");
  return { event: event.slice("event: ".length), data: JSON.parse(data.slice("data: ".length)) };
}

const initialSnapshot = { room: { id: "room-1" }, messages: [], agentStatus: { isWorking: true } };

const abortControllers: AbortController[] = [];
function createAbortController() {
  const controller = new AbortController();
  abortControllers.push(controller);
  return controller;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();

  mockRequireCurrentUser.mockResolvedValue({ id: "user-1" });
  mockAssertRoomAccess.mockResolvedValue({ id: "participant-1" });
  mockCookies.mockResolvedValue({
    get: () => ({ value: "session-token" }),
  });
  mockVerifySession.mockReturnValue({ sessionId: "session-1" });
  mockSessionFindUnique.mockResolvedValue({ id: "session-1", expiresAt: new Date(Date.now() + 60_000) });
  mockRoomParticipantFindUnique.mockResolvedValue({ id: "participant-1" });
  mockGetRoomSnapshot.mockResolvedValue(initialSnapshot);
});

afterEach(() => {
  for (const controller of abortControllers.splice(0)) controller.abort();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("GET /api/rooms/[roomId]/stream", () => {
  it("skips overlapping ticks until a slow snapshot settles, preserving message and Agent state order", async () => {
    const { reader, response } = await openRoomStream(createAbortController());
    expect(response.headers.get("Content-Type")).toBe("text/event-stream");
    expect(await readEvent(reader)).toEqual({ event: "snapshot", data: initialSnapshot });

    const pendingSnapshot = deferred<unknown>();
    const latestSnapshot = { ...initialSnapshot, messages: [{ id: "message-2" }], agentStatus: { isWorking: false } };
    mockGetRoomSnapshot.mockReturnValueOnce(pendingSnapshot.promise).mockResolvedValue(latestSnapshot);
    await vi.advanceTimersByTimeAsync(8_000);
    expect(mockGetRoomSnapshot).toHaveBeenCalledTimes(2);
    expect(mockSessionFindUnique).toHaveBeenCalledTimes(2);
    expect(mockRoomParticipantFindUnique).toHaveBeenCalledTimes(2);

    pendingSnapshot.resolve(initialSnapshot);
    expect(await readEvent(reader)).toEqual({ event: "snapshot", data: initialSnapshot });
    await vi.advanceTimersByTimeAsync(2_000);
    expect(await readEvent(reader)).toEqual({ event: "snapshot", data: latestSnapshot });
    expect(mockGetRoomSnapshot).toHaveBeenCalledTimes(3);
  });

  it("recovers on the normal polling cadence after initial and slow polling failures", async () => {
    mockGetRoomSnapshot.mockRejectedValueOnce(new Error("Initial snapshot failed"));
    const { reader } = await openRoomStream(createAbortController());
    expect(await readEvent(reader)).toEqual({ event: "error", data: { error: "Initial snapshot failed" } });
    await vi.advanceTimersByTimeAsync(2_000);
    expect(await readEvent(reader)).toEqual({ event: "snapshot", data: initialSnapshot });

    const pendingSnapshot = deferred<unknown>();
    mockGetRoomSnapshot.mockReturnValueOnce(pendingSnapshot.promise);
    await vi.advanceTimersByTimeAsync(8_000);
    expect(mockGetRoomSnapshot).toHaveBeenCalledTimes(3);
    pendingSnapshot.reject(new Error("Polling snapshot failed"));
    expect(await readEvent(reader)).toEqual({ event: "error", data: { error: "Polling snapshot failed" } });
    await vi.advanceTimersByTimeAsync(1_999);
    expect(mockGetRoomSnapshot).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(1);
    expect(await readEvent(reader)).toEqual({ event: "snapshot", data: initialSnapshot });
    expect(mockGetRoomSnapshot).toHaveBeenCalledTimes(4);
  });

  it.each(["session", "participant"] as const)("does not overlap ticks while the %s check is pending", async (boundary) => {
    const { reader } = await openRoomStream(createAbortController());
    await readEvent(reader);
    const pending = deferred<unknown>();
    const dependency = boundary === "session" ? mockSessionFindUnique : mockRoomParticipantFindUnique;
    dependency.mockReturnValueOnce(pending.promise);
    await vi.advanceTimersByTimeAsync(8_000);
    expect(dependency).toHaveBeenCalledTimes(2);
    expect(mockGetRoomSnapshot).toHaveBeenCalledOnce();
    pending.reject(new Error("Access check failed"));
    expect(await readEvent(reader)).toEqual({ event: "error", data: { error: "Access check failed" } });
    await vi.advanceTimersByTimeAsync(2_000);
    expect(await readEvent(reader)).toEqual({ event: "snapshot", data: initialSnapshot });
  });

  it.each(["initial", "polling"] as const)("keeps a slow %s snapshot isolated to its own connection", async (phase) => {
    const pending = deferred<unknown>();
    if (phase === "initial") mockGetRoomSnapshot.mockReturnValueOnce(pending.promise);
    const first = await openRoomStream(createAbortController());
    if (phase === "polling") {
      await readEvent(first.reader);
      mockGetRoomSnapshot.mockReturnValueOnce(pending.promise);
    }
    await vi.advanceTimersByTimeAsync(2_000);
    const second = await openRoomStream(createAbortController());
    expect(await readEvent(second.reader)).toEqual({ event: "snapshot", data: initialSnapshot });
    pending.resolve(initialSnapshot);
    expect(await readEvent(first.reader)).toEqual({ event: "snapshot", data: initialSnapshot });
  });

  for (const phase of ["initial", "polling"] as const) {
    for (const close of ["abort", "cancel"] as const) {
      it.each(["snapshot", "error"] as const)(`does not write %s after ${close} during the ${phase} snapshot`, async (result) => {
        const pending = deferred<unknown>();
        if (phase === "initial") mockGetRoomSnapshot.mockReturnValueOnce(pending.promise);
        const abortController = createAbortController();
        const { reader } = await openRoomStream(abortController);
        if (phase === "polling") {
          await readEvent(reader);
          mockGetRoomSnapshot.mockReturnValueOnce(pending.promise);
          await vi.advanceTimersByTimeAsync(2_000);
        } else {
          await vi.advanceTimersByTimeAsync(0);
        }
        const expectedQueries = phase === "initial" ? 1 : 2;
        expect(mockGetRoomSnapshot).toHaveBeenCalledTimes(expectedQueries);
        const cancellation = close === "cancel" ? reader.cancel() : abortController.abort();
        if (result === "snapshot") pending.resolve(initialSnapshot);
        else pending.reject(new Error("Snapshot failed after disconnect"));
        await cancellation;
        await expect(reader.read()).resolves.toEqual({ done: true, value: undefined });
        await vi.advanceTimersByTimeAsync(8_000);
        expect(mockGetRoomSnapshot).toHaveBeenCalledTimes(expectedQueries);
        expect(mockSessionFindUnique).toHaveBeenCalledTimes(expectedQueries);
        expect(vi.getTimerCount()).toBe(0);
      });
    }
  }

  it.each(["session", "participant"] as const)("does not start the next query after abort during the %s check", async (boundary) => {
    const pending = deferred<unknown>();
    const dependency = boundary === "session" ? mockSessionFindUnique : mockRoomParticipantFindUnique;
    dependency.mockReturnValueOnce(pending.promise);
    const abortController = createAbortController();
    const { reader } = await openRoomStream(abortController);
    await vi.advanceTimersByTimeAsync(0);
    expect(dependency).toHaveBeenCalledOnce();
    abortController.abort();
    pending.resolve({ id: "late-result", expiresAt: new Date(Date.now() + 60_000) });
    await vi.advanceTimersByTimeAsync(8_000);
    expect(mockGetRoomSnapshot).not.toHaveBeenCalled();
    expect(mockRoomParticipantFindUnique).toHaveBeenCalledTimes(boundary === "session" ? 0 : 1);
    await expect(reader.read()).resolves.toEqual({ done: true, value: undefined });
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["deleted", "expired", "roomDeleted"] as const)("sends %s terminal event and stops polling", async (reason) => {
    const { reader } = await openRoomStream(createAbortController());
    await readEvent(reader);
    if (reason === "roomDeleted") mockRoomParticipantFindUnique.mockResolvedValue(null);
    else mockSessionFindUnique.mockResolvedValue(reason === "deleted" ? null : { id: "session-1", expiresAt: new Date(0) });
    await vi.advanceTimersByTimeAsync(2_000);
    expect(await readEvent(reader)).toEqual(reason === "roomDeleted"
      ? { event: "roomDeleted", data: {} }
      : { event: "kicked", data: { reason: "session_deleted" } });
    await expect(reader.read()).resolves.toEqual({ done: true, value: undefined });
    await vi.advanceTimersByTimeAsync(8_000);
    expect(mockSessionFindUnique).toHaveBeenCalledTimes(2);
    expect(mockGetRoomSnapshot).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not query or schedule a stream for an already aborted request", async () => {
    const controller = createAbortController();
    controller.abort();
    const { reader } = await openRoomStream(controller);
    await expect(reader.read()).resolves.toEqual({ done: true, value: undefined });
    expect(mockSessionFindUnique).not.toHaveBeenCalled();
    expect(mockGetRoomSnapshot).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
