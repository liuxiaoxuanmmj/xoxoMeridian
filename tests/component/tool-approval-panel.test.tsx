import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";

import { ToolApprovalPanel } from "@/components/chat/ToolApprovalPanel";
import { mockServer } from "@/tests/mocks/server";

const navigation = vi.hoisted(() => ({
  refresh: vi.fn()
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: navigation.refresh })
}));

describe("ToolApprovalPanel", () => {
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
