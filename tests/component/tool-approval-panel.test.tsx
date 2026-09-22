import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ToolApprovalPanel } from "@/components/chat/ToolApprovalPanel";
import { mockServer } from "@/tests/mocks/server";

const navigation = vi.hoisted(() => ({
  refresh: vi.fn()
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: navigation.refresh })
}));

afterEach(() => { vi.restoreAllMocks(); navigation.refresh.mockReset(); });
const privateApproval = { id: "approval-private", taskId: "task-private", toolName: "memo.delete", risk: "high" as const, input: { memoId: "memo-private" }, requestedAt: "2026-09-22T00:00:00.000Z" };

describe("ToolApprovalPanel", () => {
  it("私聊审批附带预期用户，完成只刷新弹窗快照", async () => {
    let viewer: string | null = null;
    mockServer.use(http.post("/api/agent/tasks/task-private/approvals", ({ request }) => {
      viewer = request.headers.get("X-Agent-Viewer-Id"); return HttpResponse.json({ ok: true });
    }));
    const completed = vi.fn(); const user = userEvent.setup();
    render(<ToolApprovalPanel approvals={[privateApproval]} expectedViewerId="user-a" onComplete={completed} />);
    await user.click(screen.getByRole("button", { name: "批准并执行" }));
    await waitFor(() => expect(completed).toHaveBeenCalledOnce());
    expect(viewer).toBe("user-a"); expect(navigation.refresh).not.toHaveBeenCalled();
  });

  it.each([401, 403])("私聊审批 %s 触发身份失效，不继续执行刷新", async (status) => {
    mockServer.use(http.post("/api/agent/tasks/task-private/approvals", () => new HttpResponse(null, { status })));
    const invalid = vi.fn(); const completed = vi.fn(); const user = userEvent.setup();
    render(<ToolApprovalPanel approvals={[privateApproval]} expectedViewerId="user-a" onComplete={completed} onIdentityInvalid={invalid} />);
    await user.click(screen.getByRole("button", { name: "拒绝" }));
    await waitFor(() => expect(invalid).toHaveBeenCalledOnce());
    expect(completed).not.toHaveBeenCalled(); expect(navigation.refresh).not.toHaveBeenCalled();
  });

  it("换号中止旧审批，传输忽略 abort 的迟到成功不能隐藏新身份审批或刷新", async () => {
    let resolve!: (response: Response) => void;
    const stale = new Promise<Response>((done) => { resolve = done; });
    const fetcher = vi.spyOn(globalThis, "fetch").mockReturnValue(stale);
    const completed = vi.fn(); const user = userEvent.setup();
    const view = render(<ToolApprovalPanel approvals={[privateApproval]} expectedViewerId="user-a" onComplete={completed} />);
    await user.click(screen.getByRole("button", { name: "批准并执行" }));
    const signal = fetcher.mock.calls[0][1]?.signal;
    view.rerender(<ToolApprovalPanel approvals={[privateApproval]} expectedViewerId="user-b" onComplete={completed} />);
    expect(signal?.aborted).toBe(true);
    await act(async () => resolve(Response.json({ ok: true })));
    expect(screen.getByRole("button", { name: "批准并执行" })).toBeEnabled();
    expect(completed).not.toHaveBeenCalled(); expect(navigation.refresh).not.toHaveBeenCalled();
  });

  it("submits an explicit approval and removes the decided request", async () => {
    let submittedBody: unknown;
    mockServer.use(
      http.post(
        "http://localhost:3000/api/agent/tasks/task-1/approvals",
        async ({ request }) => {
          submittedBody = await request.json();
          return HttpResponse.json({ ok: true });
        }
      )
    );
    const user = userEvent.setup();
    render(
      <ToolApprovalPanel
        approvals={[
          {
            id: "approval-1",
            taskId: "task-1",
            toolName: "memo.delete",
            risk: "high",
            input: { memoId: "memo-1" },
            requestedAt: "2026-08-30T00:00:00.000Z"
          }
        ]}
      />
    );

    expect(screen.getByText(/永久删除备忘录 memo-1/)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "批准并执行" }));

    await waitFor(() => {
      expect(screen.queryByRole("region", { name: "待审批的 Agent 操作" })).not.toBeInTheDocument();
    });
    expect(submittedBody).toEqual({
      approvalId: "approval-1",
      decision: "approve"
    });
    expect(navigation.refresh).toHaveBeenCalledOnce();
  });
});
