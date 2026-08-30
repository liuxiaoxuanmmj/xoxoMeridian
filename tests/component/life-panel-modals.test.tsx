import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { MemoModal, ScheduledJobModal } from "@/components/chat/LifePanelModals";

const modalCallbacks = {
  onClose: vi.fn(),
  onSuccess: vi.fn(),
};

const participants = [
  {
    id: "user-1",
    displayName: "Alice",
    avatarLabel: "A",
    profile: {
      city: "Shanghai",
      country: "CN",
      timezone: "Asia/Shanghai",
    },
  },
];

describe("LifePanel modals", () => {
  it("restores memo values after the modal closes and reopens", async () => {
    const memo = {
      id: "memo-1",
      title: "原始标题",
      content: "原始内容",
      pinned: true,
      createdAt: "2026-08-27T00:00:00.000Z",
    };
    const user = userEvent.setup();
    const { rerender } = render(
      <MemoModal
        isOpen
        roomId="room-1"
        memo={memo}
        {...modalCallbacks}
      />
    );

    await user.clear(screen.getByLabelText("标题 *"));
    await user.type(screen.getByLabelText("标题 *"), "尚未保存的标题");

    rerender(
      <MemoModal
        isOpen={false}
        roomId="room-1"
        memo={memo}
        {...modalCallbacks}
      />
    );
    rerender(
      <MemoModal
        isOpen
        roomId="room-1"
        memo={memo}
        {...modalCallbacks}
      />
    );

    expect(screen.getByLabelText("标题 *")).toHaveValue("原始标题");
    expect(screen.getByLabelText("内容 *")).toHaveValue("原始内容");
    expect(screen.getByLabelText("置顶")).toBeChecked();
  });

  it("initializes one-time job fields from the selected job", () => {
    render(
      <ScheduledJobModal
        isOpen
        roomId="room-1"
        participants={participants}
        job={{
          id: "job-1",
          cron: "0 9 * * *",
          timezone: "Asia/Shanghai",
          nextRunAt: "2026-08-28T01:30:00.000Z",
          payload: {
            runOnce: true,
            description: "明早提醒",
            prompt: "发一条早安",
          },
        }}
        {...modalCallbacks}
      />
    );

    expect(screen.getByLabelText("任务描述")).toHaveValue("明早提醒");
    expect(screen.getByLabelText("执行指令 *")).toHaveValue("发一条早安");
    expect(screen.getByLabelText("执行时间 *")).toHaveValue("2026-08-28T01:30");
  });
});
