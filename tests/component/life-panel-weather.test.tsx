import { act, render, screen, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";

import { LifePanel } from "@/components/chat/LifePanel";
import { mockServer } from "@/tests/mocks/server";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

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
  {
    id: "user-2",
    displayName: "Bob",
    avatarLabel: "B",
    profile: {
      city: "Guangzhou",
      country: "CN",
      timezone: "Asia/Shanghai",
    },
  },
];

function weatherResult(city: string, condition: string) {
  return {
    results: [{
      subject: "partner",
      displayName: "Bob",
      city,
      snapshot: {
        provider: "qweather",
        city,
        condition,
        temperatureC: 26,
      },
      error: null,
    }],
  };
}

describe("LifePanel weather", () => {
  it("hides the previous room weather while the next room loads", async () => {
    let releaseRoomTwo: (() => void) | undefined;
    const roomTwoGate = new Promise<void>((resolve) => {
      releaseRoomTwo = resolve;
    });

    mockServer.use(
      http.get("/api/rooms/:roomId/weather", async ({ params }) => {
        if (params.roomId === "room-2") {
          await roomTwoGate;
          return HttpResponse.json(weatherResult("广州", "多云"));
        }
        return HttpResponse.json(weatherResult("上海", "晴"));
      })
    );

    const { rerender } = render(
      <LifePanel
        currentUserId="user-1"
        roomId="room-1"
        participants={participants}
        memos={[]}
        scheduledJobs={[]}
      />
    );

    expect(await screen.findByText(/上海，晴/)).toBeInTheDocument();

    rerender(
      <LifePanel
        currentUserId="user-1"
        roomId="room-2"
        participants={participants}
        memos={[]}
        scheduledJobs={[]}
      />
    );

    expect(screen.getByText("读取天气中…")).toBeInTheDocument();
    expect(screen.queryByText(/上海，晴/)).not.toBeInTheDocument();

    await act(async () => {
      releaseRoomTwo?.();
      await roomTwoGate;
    });
    expect(await screen.findByText(/广州，多云/)).toBeInTheDocument();
  });

  it("identifies the current user when they are the second participant", async () => {
    let requestedWho: string | null = null;
    mockServer.use(
      http.get("/api/rooms/:roomId/weather", ({ request }) => {
        requestedWho = new URL(request.url).searchParams.get("who");
        return HttpResponse.json(weatherResult("上海", "晴"));
      })
    );

    render(
      <LifePanel
        currentUserId="user-2"
        roomId="room-1"
        participants={participants}
        memos={[]}
        scheduledJobs={[]}
      />
    );

    await screen.findByText(/上海，晴/);
    const timeSection = screen.getByRole("heading", { name: "两地时间" }).closest("section");
    expect(timeSection).not.toBeNull();
    expect(within(timeSection!).getAllByText(/Alice|Bob/).map((node) => node.textContent)).toEqual([
      "Bob",
      "Alice",
    ]);
    expect(requestedWho).toBe("partner");
  });
});
