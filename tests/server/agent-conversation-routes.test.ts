import { randomUUID } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: vi.fn(), snapshot: vi.fn(), send: vi.fn(), rateLimit: vi.fn(), runTask: vi.fn(),
  env: { AGENT_TASK_INLINE_RUN: false }
}));

vi.mock("@/lib/auth", () => ({ requireCurrentUser: mocks.user }));
vi.mock("@/lib/env", () => ({ env: mocks.env }));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: mocks.rateLimit }));
vi.mock("@/agent/agent-runtime", () => ({ runAgentTask: mocks.runTask }));
vi.mock("@/lib/agent-conversation", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/agent-conversation")>(),
  getAgentConversationSnapshot: mocks.snapshot,
  sendAgentConversationMessage: mocks.send
}));

import { GET } from "@/app/api/agent/conversation/route";
import { POST } from "@/app/api/agent/conversation/messages/route";

const user = { id: "viewer-a", displayName: "A", avatarLabel: "A" };
const accepted = {
  currentUserId: user.id, roomId: "private-a", replayed: false,
  message: { id: "message-a", role: "user", content: "正文", taskId: "task-a" },
  task: { id: "task-a", status: "pending" }
};

function request(body?: unknown, viewer: string | null = user.id) {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (viewer !== null) headers.set("X-Agent-Viewer-Id", viewer);
  return new Request("http://localhost/api/agent/conversation", {
    method: body === undefined ? "GET" : "POST", headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
}

function expectNoStore(response: Response) {
  expect(response.headers.get("Cache-Control")).toContain("private, no-store");
  expect(response.headers.get("CDN-Cache-Control")).toBe("no-store");
  expect(response.headers.get("Vary")).toContain("Cookie");
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.env.AGENT_TASK_INLINE_RUN = false;
  mocks.user.mockResolvedValue(user);
  mocks.snapshot.mockResolvedValue({ currentUser: user, roomId: null, messages: [], tasks: [], pendingApprovals: [] });
  mocks.send.mockResolvedValue(accepted);
  mocks.rateLimit.mockReturnValue(null);
  mocks.runTask.mockResolvedValue(undefined);
});

describe("私聊 Route 契约", () => {
  it("读取采用真实身份前置条件并禁止私有响应被 CDN 缓存", async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    expectNoStore(response);
    expect(await response.json()).toMatchObject({ currentUser: user, roomId: null });
    expect(mocks.snapshot).toHaveBeenCalledWith(user);
  });

  it.each([
    [null, 400], [" ", 400], ["viewer-b", 401]
  ] as const)("身份头 %s 拒绝读写且不调用领域层", async (viewer, status) => {
    for (const response of [
      await GET(request(undefined, viewer)),
      await POST(request({ content: "旧草稿", clientMessageId: randomUUID() }, viewer))
    ]) {
      expect(response.status).toBe(status);
      expectNoStore(response);
    }
    expect(mocks.snapshot).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it.each([
    { content: "", clientMessageId: randomUUID() },
    { content: "   ", clientMessageId: randomUUID() },
    { content: "a".repeat(4001), clientMessageId: randomUUID() },
    { content: 42, clientMessageId: randomUUID() },
    { content: "正文", clientMessageId: "not-a-uuid" },
    { content: "正文" },
    { content: "正文", clientMessageId: randomUUID(), roomId: "other-room" }
  ])("非法请求 %j 在写库前被拒绝", async (body) => {
    const response = await POST(request(body));
    expect(response.status).toBe(400);
    expectNoStore(response);
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.runTask).not.toHaveBeenCalled();
  });

  it("私聊正文仅 trim，保持换行、触发词和代码缩进，生产模式只接受任务", async () => {
    const content = "  /agent @agent\n\n    const value = 1;  ";
    const clientMessageId = randomUUID();
    const response = await POST(request({ content, clientMessageId }));
    expect(response.status).toBe(201);
    expectNoStore(response);
    expect(mocks.send).toHaveBeenCalledWith({ userId: user.id, content: content.trim(), clientMessageId });
    expect(mocks.runTask).not.toHaveBeenCalled();
  });

  it("只有显式 inline 新接受任务才执行，幂等重放不重新执行", async () => {
    mocks.env.AGENT_TASK_INLINE_RUN = true;
    const body = { content: "正文", clientMessageId: randomUUID() };
    expect((await POST(request(body))).status).toBe(201);
    expect(mocks.runTask).toHaveBeenCalledExactlyOnceWith(accepted.task.id);
    mocks.send.mockResolvedValue({ ...accepted, replayed: true });
    const response = await POST(request(body));
    expect(response.status).toBe(200);
    expectNoStore(response);
    expect(mocks.runTask).toHaveBeenCalledTimes(1);
  });

  it("身份失效、限流和 Agent 禁用都返回禁缓存错误且不执行任务", async () => {
    mocks.user.mockRejectedValueOnce(new Response("Unauthorized", { status: 401 }));
    const unauthorized = await GET(request());
    expect(unauthorized.status).toBe(401);
    expectNoStore(unauthorized);
    mocks.rateLimit.mockReturnValueOnce(new Response("Too many requests", { status: 429 }));
    const limited = await POST(request({ content: "正文", clientMessageId: randomUUID() }));
    expect(limited.status).toBe(429);
    expectNoStore(limited);
    expect(mocks.send).not.toHaveBeenCalled();
    mocks.send.mockRejectedValueOnce(Response.json({ error: "助手暂不可用" }, { status: 503 }));
    const unavailable = await POST(request({ content: "正文", clientMessageId: randomUUID() }));
    expect(unavailable.status).toBe(503);
    expectNoStore(unavailable);
    expect(mocks.runTask).not.toHaveBeenCalled();
  });

  it("未知失败沿统一错误边界隐藏原始内部错误，成功和错误使用相同隐私缓存契约", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      mocks.snapshot.mockRejectedValueOnce(new Error("private_database_credential"));
      const response = await GET(request());
      expect(response.status).toBe(500);
      expectNoStore(response);
      expect(await response.json()).toEqual({ error: "Internal server error" });
      expect(log).toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
  });
});
