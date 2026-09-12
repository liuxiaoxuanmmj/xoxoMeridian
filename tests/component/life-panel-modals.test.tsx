import { HttpResponse, http } from "msw";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { MemoModal, ScheduledJobModal } from "@/components/chat/LifePanelModals";
import { mockServer } from "@/tests/mocks/server";

// The one-time field is a `datetime-local`: what it shows and what it submits
// must both be read in the *job's* zone, never the runner's. Pinning the runner
// to a zone that differs from the fixtures' makes that difference observable —
// with a UTC runner the old UTC-wall-clock round trip happened to cancel out,
// which is why this defect could survive a green suite.
process.env.TZ = "Asia/Shanghai";

const modalCallbacks = {
  onClose: vi.fn(),
  onSuccess: vi.fn(),
};

// Stored instant used by the one-time job fixtures: 09:30 in Asia/Shanghai,
// 01:30 UTC. Nothing may move it except an explicit edit.
const ONE_SHOT_NEXT_RUN_AT = "2026-08-28T01:30:00.000Z";

function oneShotJob(overrides: Record<string, unknown> = {}) {
  return {
    id: "job-1",
    cron: "0 9 * * *",
    timezone: "Asia/Shanghai",
    nextRunAt: ONE_SHOT_NEXT_RUN_AT,
    payload: {
      runOnce: true,
      description: "明早提醒",
      prompt: "发一条早安",
    },
    ...overrides,
  };
}

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

const twoParticipants = [
  ...participants,
  {
    id: "user-2",
    displayName: "Bob",
    avatarLabel: "B",
    profile: { city: "London", country: "GB", timezone: "Europe/London" },
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
        currentUserId="user-1"
        participants={participants}
        job={oneShotJob()}
        {...modalCallbacks}
      />
    );

    expect(screen.getByLabelText("任务描述")).toHaveValue("明早提醒");
    expect(screen.getByLabelText("执行指令 *")).toHaveValue("发一条早安");
    // 01:30Z renders as 09:30 on the job's own Asia/Shanghai wall clock, which is
    // the zone the sibling selector shows. The field used to show the UTC wall
    // clock here, contradicting the selector right below it.
    expect(screen.getByLabelText("执行时间 *")).toHaveValue("2026-08-28T09:30");
  });

  it("leaves the instant alone when a one-time job is saved unedited", async () => {
    const bodies: unknown[] = [];
    mockServer.use(
      http.patch(
        "http://localhost:3000/api/rooms/:roomId/scheduled-jobs/:jobId",
        async ({ request }) => {
          bodies.push(await request.json());
          return HttpResponse.json({ job: {} });
        }
      )
    );
    const user = userEvent.setup();

    render(
      <ScheduledJobModal
        isOpen
        roomId="room-1"
        currentUserId="user-1"
        participants={participants}
        job={oneShotJob()}
        {...modalCallbacks}
      />
    );

    // Touch nothing: the displayed time is already the job's time.
    await user.click(screen.getByRole("button", { name: "保存" }));

    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toMatchObject({
      fireAt: ONE_SHOT_NEXT_RUN_AT,
      runOnce: true,
      timezone: "Asia/Shanghai",
      prompt: "发一条早安",
    });
  });

  it("keeps the typed wall clock when the timezone changes", async () => {
    const bodies: unknown[] = [];
    mockServer.use(
      http.patch(
        "http://localhost:3000/api/rooms/:roomId/scheduled-jobs/:jobId",
        async ({ request }) => {
          bodies.push(await request.json());
          return HttpResponse.json({ job: {} });
        }
      )
    );
    const user = userEvent.setup();

    render(
      <ScheduledJobModal
        isOpen
        roomId="room-1"
        currentUserId="user-1"
        participants={twoParticipants}
        job={oneShotJob()}
        {...modalCallbacks}
      />
    );

    await user.selectOptions(screen.getByRole("combobox"), "Europe/London");

    // The wall clock the user sees is unchanged; only its meaning moves. August
    // is BST (UTC+1), so 09:30 in London is 08:30Z — one hour later than the
    // Shanghai reading, not the same instant and not an eight-hour jump.
    expect(screen.getByLabelText("执行时间 *")).toHaveValue("2026-08-28T09:30");

    await user.click(screen.getByRole("button", { name: "保存" }));

    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toMatchObject({
      fireAt: "2026-08-28T08:30:00.000Z",
      timezone: "Europe/London",
    });
  });

  it("defaults a new job to the current user's timezone when they are second", () => {
    render(
      <ScheduledJobModal
        isOpen
        roomId="room-1"
        currentUserId="user-2"
        participants={twoParticipants}
        {...modalCallbacks}
      />
    );

    expect(screen.getByRole("combobox")).toHaveValue("Europe/London");
  });
});
