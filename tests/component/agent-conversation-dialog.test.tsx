import { useState } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AgentConversationDialog from "@/components/agent-entry/AgentConversationDialog";
import { useAgentConversation } from "@/components/agent-entry/use-agent-conversation";
import type { AgentConversationSnapshot, AgentConversationSendResult, AgentConversationTask } from "@/lib/agent-conversation-types";
import { mockServer } from "@/tests/mocks/server";

const navigation = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => navigation }));
const invalid = vi.fn();
const feedback = vi.fn();
const timestamp = "2026-09-22T00:00:00.000Z";
function snapshot(id = "user-a"): AgentConversationSnapshot {
  return { currentUser: { id, displayName: id, avatarLabel: "我" }, agent: { id: "agent", displayName: "小助手", enabled: true }, roomId: null, messages: [], tasks: [], pendingApprovals: [] };
}
function task(status: AgentConversationTask["status"] = "pending"): AgentConversationTask {
  return { id: "task-1", status, sourceMessageId: "message-1", finalMessageId: null, createdAt: timestamp, updatedAt: timestamp, error: null };
}
function accepted(body: { clientMessageId: string; content: string }, id = "user-a"): AgentConversationSendResult {
  return { currentUserId: id, roomId: `room-${id}`, message: { id: "message-1", ...body, role: "user", createdAt: timestamp, taskId: "task-1" }, task: task(), replayed: false };
}
function deferred() {
  let resolve!: (value: Response) => void;
  const promise = new Promise<Response>((done) => { resolve = done; });
  return { promise, resolve };
}
function Harness({ principalId = "user-a" }: { principalId?: string }) {
  const [open, setOpen] = useState(true);
  const conversation = useAgentConversation({ principalId, open, onIdentityInvalid: invalid, onFeedback: feedback });
  return <>
    <button type="button" onClick={() => setOpen(true)}>打开测试对话</button>
    <button type="button" onClick={conversation.refresh}>刷新测试快照</button>
    {open && <AgentConversationDialog conversation={conversation} principalId={principalId} titleId="dialog-title"
      reducedMotion={true} onClose={() => setOpen(false)} onIdentityInvalid={invalid} />}
  </>;
}

beforeEach(() => {
  invalid.mockReset(); feedback.mockReset(); navigation.refresh.mockReset();
  mockServer.use(http.get("/api/agent/conversation", () => HttpResponse.json(snapshot())));
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
async function loaded() { await screen.findByText("今天有什么想聊的？直接告诉我就好。"); }

describe("私聊消息与请求生命周期", () => {
  it("清空按钮位于关闭按钮左侧，取消确认或接口失败保留消息，成功后不再显示旧快照", async () => {
    const current = snapshot();
    current.roomId = "room-user-a";
    current.messages = [accepted({ clientMessageId: crypto.randomUUID(), content: "待清空消息" }).message];
    current.tasks = [task()];
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const deletion = vi.fn(() => new HttpResponse(null, { status: 503 }));
    mockServer.use(
      http.get("/api/agent/conversation", () => HttpResponse.json(current)),
      http.delete("/api/agent/conversation", deletion),
    );
    const user = userEvent.setup(); render(<Harness />);
    expect(await screen.findByText("待清空消息")).toBeVisible();
    const clear = screen.getByRole("button", { name: "清空与小助手的聊天记录" });
    const close = screen.getByRole("button", { name: "关闭对话" });
    expect(clear.querySelector("svg")).not.toBeNull();
    expect(clear.compareDocumentPosition(close) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.touchStart(clear);
    expect(clear).toHaveAttribute("data-touch-hint", "true");
    expect(clear).toHaveTextContent("清空");
    await user.click(clear);
    expect(deletion).not.toHaveBeenCalled();
    expect(screen.getByText("待清空消息")).toBeVisible();
    confirm.mockReturnValue(true);
    await user.click(clear);
    expect(await screen.findByRole("alert")).toHaveTextContent("清空失败");
    expect(screen.getByText("待清空消息")).toBeVisible();
    mockServer.use(http.delete("/api/agent/conversation", ({ request }) => {
      expect(request.headers.get("X-Agent-Viewer-Id")).toBe("user-a");
      current.messages = []; current.tasks = [];
      return HttpResponse.json({ currentUserId: "user-a", roomId: "room-user-a" });
    }));
    clear.focus();
    await user.keyboard("{Enter}");
    await waitFor(() => expect(screen.queryByText("待清空消息")).toBeNull());
    expect(screen.getByText("今天有什么想聊的？直接告诉我就好。")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "刷新测试快照" }));
    expect(screen.queryByText("待清空消息")).toBeNull();
  });

  it("清空成功后丢弃此前在途的旧快照", async () => {
    const old = deferred();
    const prior = snapshot();
    prior.messages = [accepted({ clientMessageId: crypto.randomUUID(), content: "迟到的旧消息" }).message];
    let reads = 0;
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.spyOn(globalThis, "fetch").mockImplementation((_url, init) => {
      if (init?.method === "DELETE") return Promise.resolve(Response.json({ currentUserId: "user-a", roomId: "room-user-a" }));
      reads += 1;
      return reads === 1 ? old.promise : Promise.resolve(Response.json(snapshot()));
    });
    const user = userEvent.setup(); render(<Harness />);
    await user.click(screen.getByRole("button", { name: "清空与小助手的聊天记录" }));
    await act(async () => old.resolve(Response.json(prior)));
    await waitFor(() => expect(reads).toBe(2));
    expect(screen.queryByText("迟到的旧消息")).toBeNull();
    expect(await screen.findByText("今天有什么想聊的？直接告诉我就好。")).toBeVisible();
  });

  it("POST 响应失败后 GET 确认入库，清除对应错误及重试入口且只展示一次消息", async () => {
    let current = snapshot();
    mockServer.use(
      http.get("/api/agent/conversation", () => HttpResponse.json(current)),
      http.post("/api/agent/conversation/messages", async ({ request }) => {
        const body = await request.json() as { clientMessageId: string; content: string };
        const result = accepted(body);
        current = { ...snapshot(), messages: [result.message], tasks: [result.task] };
        return HttpResponse.error();
      }),
    );
    const user = userEvent.setup(); render(<Harness />); await loaded();
    await user.type(screen.getByRole("textbox"), "实际上已入库");
    await user.click(screen.getByRole("button", { name: "发送" }));
    await screen.findByRole("button", { name: "重试原消息" });
    expect(screen.getByRole("alert")).toHaveTextContent("消息未确认送达");
    await user.click(screen.getByRole("button", { name: "刷新测试快照" }));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(screen.queryByRole("button", { name: "重试原消息" })).toBeNull();
    expect(screen.getAllByText("实际上已入库")).toHaveLength(1);
    expect(screen.getByRole("status")).toHaveTextContent("正在等待小助手…");
  });

  it("GET 先确认消息时，迟到的 POST 传输错误不恢复未送达提示", async () => {
    const post = deferred(); let current = snapshot();
    vi.spyOn(globalThis, "fetch").mockImplementation((url, init) => {
      if (String(url).endsWith("/messages")) {
        const result = accepted(JSON.parse(init?.body as string));
        current = { ...snapshot(), messages: [result.message], tasks: [result.task] };
        return post.promise;
      }
      return Promise.resolve(Response.json(current));
    });
    const user = userEvent.setup(); render(<Harness />); await loaded();
    await user.type(screen.getByRole("textbox"), "比响应更早的确认");
    await user.click(screen.getByRole("button", { name: "发送" }));
    await user.click(screen.getByRole("button", { name: "刷新测试快照" }));
    await waitFor(() => expect(screen.queryByText("你 · 发送中")).toBeNull());
    await act(async () => post.resolve(new Response(null, { status: 503 })));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("button", { name: "重试原消息" })).toBeNull();
    expect(screen.getAllByText("比响应更早的确认")).toHaveLength(1);
  });

  it("GET 只确认另一条消息时不误清当前消息的发送错误", async () => {
    const attempts: AgentConversationSendResult[] = [];
    let current = snapshot();
    mockServer.use(
      http.get("/api/agent/conversation", () => HttpResponse.json(current)),
      http.post("/api/agent/conversation/messages", async ({ request }) => {
        const body = await request.json() as { clientMessageId: string; content: string };
        const result = accepted(body); result.message.id = `message-${attempts.length}`;
        attempts.push(result);
        return new HttpResponse(null, { status: attempts.length === 1 ? 503 : 409 });
      }),
    );
    const user = userEvent.setup(); render(<Harness />); await loaded();
    await user.type(screen.getByRole("textbox"), "消息A"); await user.click(screen.getByRole("button", { name: "发送" }));
    await screen.findByRole("button", { name: "重试原消息" });
    await user.type(screen.getByRole("textbox"), "消息B"); await user.click(screen.getByRole("button", { name: "发送" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("发送标识发生冲突"));
    current = { ...snapshot(), messages: [attempts[0].message], tasks: [attempts[0].task] };
    await user.click(screen.getByRole("button", { name: "刷新测试快照" }));
    await waitFor(() => expect(screen.getAllByRole("button", { name: "重试原消息" })).toHaveLength(1));
    expect(screen.getByRole("alert")).toHaveTextContent("发送标识发生冲突");
  });

  it("GET 持续失败时 POST 确认消息与等待任务仍可见，恢复快照后去重并更新完成状态", async () => {
    let readFails = true;
    let result!: AgentConversationSendResult;
    const reads = vi.fn(() => readFails
      ? new HttpResponse(null, { status: 503 })
      : HttpResponse.json({ ...snapshot(), messages: [result.message], tasks: [{ ...result.task, status: "completed" }] }));
    mockServer.use(
      http.get("/api/agent/conversation", reads),
      http.post("/api/agent/conversation/messages", async ({ request }) => {
        const body = await request.json() as { clientMessageId: string; content: string };
        result = accepted(body); return HttpResponse.json(result, { status: 201 });
      }),
    );
    const user = userEvent.setup(); render(<Harness />);
    await screen.findByRole("button", { name: "重新读取" });
    await user.type(screen.getByRole("textbox"), "读取失败也已经送达");
    await user.click(screen.getByRole("button", { name: "发送" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("正在等待小助手…"));
    await waitFor(() => expect(reads).toHaveBeenCalledTimes(2));
    expect(screen.getAllByText("读取失败也已经送达")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "重试原消息" })).toBeNull();
    expect(screen.queryByText("你 · 发送中")).toBeNull();
    await user.click(screen.getByRole("button", { name: "关闭对话" }));
    await user.click(screen.getByRole("button", { name: "打开测试对话" }));
    expect(screen.getAllByText("读取失败也已经送达")).toHaveLength(1);
    expect(screen.getByRole("status")).toHaveTextContent("正在等待小助手…");
    readFails = false;
    await user.click(screen.getByRole("button", { name: "重新读取" }));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(screen.getAllByText("读取失败也已经送达")).toHaveLength(1);
    expect(screen.getByRole("status")).not.toHaveTextContent("正在等待小助手…");
  });

  it("首次 GET 尚未返回时 POST 确认即可展示消息，不依赖快照先成功", async () => {
    const first = deferred();
    vi.spyOn(globalThis, "fetch").mockImplementation((url, init) => String(url).endsWith("/messages")
      ? Promise.resolve(Response.json(accepted(JSON.parse(init?.body as string))))
      : first.promise);
    const user = userEvent.setup(); render(<Harness />);
    await user.type(screen.getByRole("textbox"), "先确认的消息");
    await user.click(screen.getByRole("button", { name: "发送" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("正在等待小助手…"));
    expect(screen.getAllByText("先确认的消息")).toHaveLength(1);
    expect(screen.queryByText("正在读取对话…")).toBeNull();
    await act(async () => first.resolve(new Response(null, { status: 503 })));
    await screen.findByRole("button", { name: "重新读取" });
    expect(screen.getAllByText("先确认的消息")).toHaveLength(1);
  });

  it("发送携带预期身份，保留原文；迟到成功不会清空随后输入的新草稿", async () => {
    let body!: { clientMessageId: string; content: string };
    let viewer: string | null = null;
    let release!: () => void;
    let current = snapshot();
    mockServer.use(
      http.get("/api/agent/conversation", () => HttpResponse.json(current)),
      http.post("/api/agent/conversation/messages", async ({ request }) => {
        viewer = request.headers.get("X-Agent-Viewer-Id"); body = await request.json() as typeof body;
        await new Promise<void>((resolve) => { release = resolve; });
        const result = accepted(body); current = { ...current, messages: [result.message], tasks: [result.task] };
        return HttpResponse.json(result);
      }),
    );
    const user = userEvent.setup(); render(<Harness />); await loaded();
    fireEvent.change(screen.getByRole("textbox", { name: "消息" }), { target: { value: "/agent @助手\n  保留缩进" } });
    await user.click(screen.getByRole("button", { name: "发送" }));
    await waitFor(() => expect(release).toBeDefined());
    await user.type(screen.getByRole("textbox"), "下一句话");
    await act(async () => release());
    await waitFor(() => expect(screen.getByRole("button", { name: "发送" })).toBeEnabled());
    expect(viewer).toBe("user-a"); expect(body.content).toBe("/agent @助手\n  保留缩进");
    expect(screen.getByRole("textbox")).toHaveValue("下一句话");
    expect(screen.getByRole("status")).toHaveTextContent("正在等待小助手…");
  });

  it("失败重试锁定原内容和幂等 ID，编辑的新草稿用新 ID 发送", async () => {
    const submissions: Array<{ content: string; clientMessageId: string }> = [];
    mockServer.use(http.post("/api/agent/conversation/messages", async ({ request }) => {
      const body = await request.json() as (typeof submissions)[number]; submissions.push(body);
      return submissions.length === 1 ? HttpResponse.json({ error: "unavailable" }, { status: 503 }) : HttpResponse.json(accepted(body));
    }));
    const user = userEvent.setup(); render(<Harness />); await loaded();
    await user.type(screen.getByRole("textbox"), "原消息"); await user.click(screen.getByRole("button", { name: "发送" }));
    await screen.findByRole("button", { name: "重试原消息" });
    await user.type(screen.getByRole("textbox"), "新消息");
    await user.click(screen.getByRole("button", { name: "重试原消息" }));
    await waitFor(() => expect(submissions).toHaveLength(2));
    expect(submissions[1]).toEqual(submissions[0]); expect(screen.getByRole("textbox")).toHaveValue("新消息");
    await waitFor(() => expect(screen.getByRole("button", { name: "发送" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "发送" }));
    await waitFor(() => expect(submissions).toHaveLength(3));
    expect(submissions[2].content).toBe("新消息"); expect(submissions[2].clientMessageId).not.toBe(submissions[0].clientMessageId);
  });

  it("中文输入法候选 Enter 不发送，正常 Enter 发送且 Shift+Enter 保留换行", async () => {
    const post = vi.fn(async ({ request }: { request: Request }) => HttpResponse.json(accepted(await request.json())));
    mockServer.use(http.post("/api/agent/conversation/messages", post));
    const user = userEvent.setup(); render(<Harness />); await loaded();
    const textbox = screen.getByRole("textbox"); fireEvent.change(textbox, { target: { value: "中文" } });
    fireEvent.compositionStart(textbox); fireEvent.keyDown(textbox, { key: "Enter", isComposing: true });
    expect(post).not.toHaveBeenCalled(); fireEvent.compositionEnd(textbox);
    await user.click(textbox); await user.keyboard("{Shift>}{Enter}{/Shift}");
    expect(textbox).toHaveValue("中文\n"); expect(post).not.toHaveBeenCalled();
    await user.keyboard("{Enter}"); await waitFor(() => expect(post).toHaveBeenCalledOnce());
  });

  it("首次读取、手动刷新、发送后刷新共享串行调度，旧快照不能抹掉确认消息", async () => {
    const first = deferred(); const second = deferred(); const reads: AbortSignal[] = [];
    const fetcher = vi.spyOn(globalThis, "fetch").mockImplementation((url, init) => {
      if (String(url).endsWith("/messages")) return Promise.resolve(Response.json(accepted(JSON.parse(init?.body as string))));
      reads.push(init?.signal as AbortSignal); return reads.length === 1 ? first.promise : second.promise;
    });
    const user = userEvent.setup(); render(<Harness />);
    await user.click(screen.getByRole("button", { name: "刷新测试快照" }));
    await user.type(screen.getByRole("textbox"), "发送期间"); await user.click(screen.getByRole("button", { name: "发送" }));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    expect(reads).toHaveLength(1);
    await act(async () => first.resolve(Response.json(snapshot())));
    await waitFor(() => expect(reads).toHaveLength(2));
    const next = snapshot(); next.messages = [{ id: "new", clientMessageId: null, role: "user", content: "已确认消息", createdAt: timestamp, taskId: null }];
    await act(async () => second.resolve(Response.json(next)));
    expect(await screen.findByText("已确认消息")).toBeVisible();
  });

  it("关窗/重开等待旧读取结束，忽略迟到结果；隐藏停止并在可见后立即读取", async () => {
    const first = deferred(); const second = deferred();
    const fetcher = vi.spyOn(globalThis, "fetch").mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise).mockResolvedValue(Response.json(snapshot()));
    const user = userEvent.setup(); render(<Harness />);
    const signal = fetcher.mock.calls[0][1]?.signal;
    await user.click(screen.getByRole("button", { name: "关闭对话" }));
    expect(signal?.aborted).toBe(true);
    await user.click(screen.getByRole("button", { name: "打开测试对话" }));
    expect(fetcher).toHaveBeenCalledOnce();
    const stale = snapshot(); stale.messages = [{ id: "stale", clientMessageId: null, role: "agent", content: "迟到旧读取", createdAt: timestamp, taskId: null }];
    await act(async () => first.resolve(Response.json(stale)));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    expect(screen.queryByText("迟到旧读取")).toBeNull();
    await act(async () => second.resolve(Response.json(snapshot()))); await loaded();
    vi.useFakeTimers();
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    await act(async () => { await vi.advanceTimersByTimeAsync(30000); });
    expect(fetcher).toHaveBeenCalledTimes(2);
    visibility.mockReturnValue("visible"); act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("换号卸载旧读取/发送且迟到结果不会污染新用户或清除新草稿", async () => {
    const staleRead = deferred(); const staleSend = deferred();
    let reads = 0; let oldBody!: { content: string; clientMessageId: string };
    const fetcher = vi.spyOn(globalThis, "fetch").mockImplementation((url, init) => {
      if (String(url).endsWith("/messages")) { oldBody = JSON.parse(init?.body as string); return staleSend.promise; }
      reads += 1; return reads === 1 ? staleRead.promise : Promise.resolve(Response.json(snapshot("user-b")));
    });
    const user = userEvent.setup(); const view = render(<Harness key="user-a" />);
    await user.type(screen.getByRole("textbox"), "A 的秘密"); await user.click(screen.getByRole("button", { name: "发送" }));
    const oldSignals = fetcher.mock.calls.map((call) => call[1]?.signal);
    view.rerender(<Harness key="user-b" principalId="user-b" />); await loaded();
    expect(oldSignals.every((signal) => signal?.aborted)).toBe(true);
    await user.type(screen.getByRole("textbox"), "B 的草稿");
    await act(async () => { staleRead.resolve(Response.json(snapshot())); staleSend.resolve(Response.json(accepted(oldBody))); });
    expect(screen.queryByText("A 的秘密")).toBeNull(); expect(screen.getByRole("textbox")).toHaveValue("B 的草稿");
    expect(invalid).not.toHaveBeenCalled(); expect(feedback).not.toHaveBeenCalled();
  });

  it.each([401, 403])("读取 %s 清除身份，失败不继续合并私聊", async (status) => {
    mockServer.use(http.get("/api/agent/conversation", () => new HttpResponse(null, { status })));
    const view = render(<Harness />);
    await waitFor(() => expect(invalid).toHaveBeenCalledOnce()); view.unmount();
  });

  it("快照响应身份不匹配时拒绝内容", async () => {
    mockServer.use(http.get("/api/agent/conversation", () => HttpResponse.json(snapshot("user-b"))));
    const view = render(<Harness />); await waitFor(() => expect(invalid).toHaveBeenCalledOnce());
    expect(screen.queryByText("今天有什么想聊的？直接告诉我就好。")).toBeNull(); view.unmount();
  });

  it("旧完成历史不庆祝，新任务完成仅反馈一次并显示最新任务状态", async () => {
    let current = { ...snapshot(), tasks: [task("completed")] };
    mockServer.use(http.get("/api/agent/conversation", () => HttpResponse.json(current)));
    const user = userEvent.setup(); render(<Harness />); await loaded(); expect(feedback).not.toHaveBeenCalled();
    current = { ...current, tasks: [{ ...task("running"), id: "new-task" }, task("failed")] };
    await user.click(screen.getByRole("button", { name: "刷新测试快照" }));
    expect(await screen.findByText("小助手正在思考…")).toBeVisible();
    feedback.mockClear(); current.tasks[0] = { ...current.tasks[0], status: "completed" };
    await user.click(screen.getByRole("button", { name: "刷新测试快照" }));
    await waitFor(() => expect(feedback).toHaveBeenCalledExactlyOnceWith("reply"));
    await user.click(screen.getByRole("button", { name: "刷新测试快照" }));
    await act(async () => {}); expect(feedback).toHaveBeenCalledOnce();
  });

  it("关窗后继续观察进行中任务，完成时提醒一次并停止后台读取", async () => {
    let current = { ...snapshot(), tasks: [task("running")] };
    const reads = vi.fn(() => HttpResponse.json(current));
    mockServer.use(http.get("/api/agent/conversation", reads));
    const user = userEvent.setup(); render(<Harness />);
    expect(await screen.findByText("小助手正在思考…")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "关闭对话" }));
    await waitFor(() => expect(reads.mock.calls.length).toBeGreaterThanOrEqual(2));
    current = { ...current, tasks: [task("completed")] };
    await waitFor(() => expect(feedback).toHaveBeenCalledExactlyOnceWith("reply"), { timeout: 4500 });
    const completedReads = reads.mock.calls.length;
    await new Promise((resolve) => setTimeout(resolve, 2200));
    expect(reads).toHaveBeenCalledTimes(completedReads);
    await user.click(screen.getByRole("button", { name: "打开测试对话" }));
    expect(screen.getByRole("status")).not.toHaveTextContent("小助手正在思考…");
  }, 8000);

  it("关窗期间任务失败仍给出失败提醒", async () => {
    let current = { ...snapshot(), tasks: [task("running")] };
    mockServer.use(http.get("/api/agent/conversation", () => HttpResponse.json(current)));
    const user = userEvent.setup(); render(<Harness />);
    expect(await screen.findByText("小助手正在思考…")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "关闭对话" }));
    current = { ...current, tasks: [task("failed")] };
    await waitFor(() => expect(feedback).toHaveBeenCalledExactlyOnceWith("failure"), { timeout: 4500 });
  }, 6000);

  it("仍在执行的旧任务不被更新的完成任务清掉等待状态", async () => {
    mockServer.use(http.get("/api/agent/conversation", () => HttpResponse.json({
      ...snapshot(), tasks: [{ ...task("completed"), id: "new-task" }, task("running")],
    })));
    render(<Harness />);
    expect(await screen.findByText("小助手正在思考…")).toBeVisible();
  });

  it.each([401, 403])("发送 %s 触发身份清理且不会把结果写入会话", async (status) => {
    mockServer.use(http.post("/api/agent/conversation/messages", () => new HttpResponse(null, { status })));
    const user = userEvent.setup(); const view = render(<Harness />); await loaded();
    await user.type(screen.getByRole("textbox"), "尚未获准"); await user.click(screen.getByRole("button", { name: "发送" }));
    await waitFor(() => expect(invalid).toHaveBeenCalledOnce()); view.unmount();
  });

  it("读取失败可以手动重试，成功后清理错误提示", async () => {
    let failed = true;
    mockServer.use(http.get("/api/agent/conversation", () => failed ? new HttpResponse(null, { status: 500 }) : HttpResponse.json(snapshot())));
    const user = userEvent.setup(); render(<Harness />);
    expect(await screen.findByRole("alert")).toHaveTextContent("暂时无法读取对话");
    failed = false; await user.click(screen.getByRole("button", { name: "重新读取" }));
    await loaded(); expect(screen.queryByRole("alert")).toBeNull();
  });
});
