import { HttpResponse, http } from "msw";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { MemoModal, ScheduledJobModal } from "@/components/chat/LifePanelModals";
import { memoPatchSchema, memoPostSchema, scheduledJobPatchSchema, scheduledJobPostSchema } from "@/lib/validation";
import { mockServer } from "@/tests/mocks/server";

const memo = {
  id: "memo-1", title: "标".repeat(500), content: "文".repeat(20_000),
  pinned: false, createdAt: "2026-09-13T00:00:00.000Z",
};
const job = {
  id: "job-1", cron: "0 9 * * *", timezone: "Asia/Shanghai",
  nextRunAt: "2030-05-09T01:00:00.000Z",
  payload: { description: "描".repeat(500), prompt: "提醒休息", runOnce: false },
};

function captureSubmission(kind: "memos" | "scheduled-jobs", editing = true) {
  const bodies: Record<string, unknown>[] = [];
  const schema = kind === "memos"
    ? (editing ? memoPatchSchema : memoPostSchema)
    : (editing ? scheduledJobPatchSchema : scheduledJobPostSchema);
  const method = editing ? http.patch : http.post;
  mockServer.use(method(`http://localhost:3000/api/rooms/:roomId/${kind}${editing ? "/:id" : ""}`, async ({ request }) => {
    const body = await request.json() as Record<string, unknown>;
    bodies.push(body);
    return schema.safeParse(body).success
      ? HttpResponse.json({ ok: true })
      : HttpResponse.json({ error: "字段不符合约束" }, { status: 400 });
  }));
  return bodies;
}

describe("生活表单跨入口字段", () => {
  it("可编辑 Agent 备忘录边界长度的标题和内容，保存不截断", async () => {
    const bodies = captureSubmission("memos");
    const onSuccess = vi.fn();
    const user = userEvent.setup();
    render(<MemoModal isOpen roomId="room-1" memo={memo} onClose={vi.fn()} onSuccess={onSuccess} />);
    for (const label of ["标题 *", "内容 *"]) {
      await user.click(screen.getByLabelText(label));
      await user.keyboard("{End}{Backspace}新");
    }
    await user.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledOnce());
    expect(bodies).toEqual([{ title: "标".repeat(499) + "新", content: "文".repeat(19_999) + "新", pinned: false }]);
  });

  it("超出现行上限的旧备忘录可仅改置顶，原文本完整保留并显示说明", async () => {
    const bodies = captureSubmission("memos");
    const onSuccess = vi.fn();
    const user = userEvent.setup();
    const legacy = { ...memo, title: "标".repeat(501), content: " 文".repeat(10_001) + " " };
    render(<MemoModal isOpen roomId="room-1" memo={legacy} onClose={vi.fn()} onSuccess={onSuccess} />);
    expect(screen.getByLabelText("标题 *")).toHaveValue(legacy.title);
    expect(screen.getByLabelText("内容 *")).toHaveValue(legacy.content);
    expect(screen.getByLabelText("标题 *")).toHaveAccessibleDescription(/旧记录.*完整保留.*500/);
    expect(screen.getByLabelText("内容 *")).toHaveAccessibleDescription(/旧记录.*完整保留.*20000/);
    await user.click(screen.getByRole("checkbox", { name: "置顶" }));
    await user.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledOnce());
    expect(bodies).toEqual([{ pinned: true }]);
  });

  it("新建备忘录按共享上限输入，额外字符无法输入", async () => {
    const bodies = captureSubmission("memos", false);
    const onSuccess = vi.fn();
    const user = userEvent.setup();
    render(<MemoModal isOpen roomId="room-1" onClose={vi.fn()} onSuccess={onSuccess} />);
    expect(screen.getByLabelText("标题 *")).toHaveValue("新的备忘录");
    await user.clear(screen.getByLabelText("标题 *"));
    await user.paste(memo.title);
    await user.keyboard("多");
    await user.click(screen.getByLabelText("内容 *"));
    await user.paste(memo.content);
    await user.keyboard("多");
    await user.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledOnce());
    expect(bodies).toEqual([{ title: memo.title, content: memo.content, pinned: false }]);
  });

  it("可编辑 Agent 计划的 500 字符描述，并可显式清空为 null", async () => {
    const bodies = captureSubmission("scheduled-jobs");
    const onSuccess = vi.fn();
    const user = userEvent.setup();
    render(<ScheduledJobModal isOpen roomId="room-1" job={job} currentUserId="user-1" participants={[]} onClose={vi.fn()} onSuccess={onSuccess} />);
    await user.click(screen.getByLabelText("任务描述"));
    await user.keyboard("{End}{Backspace}新");
    await user.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(bodies[0]).toMatchObject({ description: "描".repeat(499) + "新" });
    await user.clear(screen.getByLabelText("任务描述"));
    await user.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(2));
    expect(bodies[1]).toMatchObject({ description: null });
  });

  it("旧计划较长描述不妨碍修改执行指令，未改描述不进入 PATCH", async () => {
    const bodies = captureSubmission("scheduled-jobs");
    const onSuccess = vi.fn();
    const user = userEvent.setup();
    const legacy = { ...job, payload: { ...job.payload, description: " 描".repeat(300) + " " } };
    render(<ScheduledJobModal isOpen roomId="room-1" job={legacy} currentUserId="user-1" participants={[]} onClose={vi.fn()} onSuccess={onSuccess} />);
    expect(screen.getByLabelText("任务描述")).toHaveValue(legacy.payload.description);
    expect(screen.getByLabelText("任务描述")).toHaveAccessibleDescription(/旧记录.*完整保留.*500/);
    await user.clear(screen.getByLabelText("执行指令 *"));
    await user.type(screen.getByLabelText("执行指令 *"), "提醒喝水");
    await user.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledOnce());
    expect(bodies[0]).toMatchObject({ prompt: "提醒喝水" });
    expect(bodies[0]).not.toHaveProperty("description");
  });

  it("新建计划允许描述留空", async () => {
    const bodies = captureSubmission("scheduled-jobs", false);
    const onSuccess = vi.fn();
    const user = userEvent.setup();
    render(<ScheduledJobModal isOpen roomId="room-1" currentUserId="user-1" participants={[]} onClose={vi.fn()} onSuccess={onSuccess} />);
    await user.type(screen.getByLabelText("执行指令 *"), "提醒喝水");
    await user.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledOnce());
    expect(bodies[0]).toMatchObject({ description: null });
  });
});
