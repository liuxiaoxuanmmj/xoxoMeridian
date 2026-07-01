"use client";

import { useMemo } from "react";
import { PostCard } from "@/components/blog/PostCard";
import { AgentLogCard } from "@/components/blog/AgentLogCard";
import { PostCardSpatialShell } from "@/components/home/PostCardSpatialShell";
import type { TimelineFocusInterval } from "@/lib/study";
import { useScrollReveal } from "@/lib/useScrollReveal";
import { cn } from "@/lib/utils";

type Direction = "left" | "right" | "center";

const DIRECTION_CLASS: Record<Direction, string> = {
  left: "revealed-left",
  right: "revealed-right",
  center: "revealed-center",
};

const ALIGN_CLASS: Record<Direction, string> = {
  left: "md:justify-start md:pr-[calc(50%+2rem)] justify-start",
  right: "md:justify-end md:pl-[calc(50%+2rem)] justify-start",
  center: "justify-center",
};

export type TimelinePost = {
  id: string;
  slug: string;
  title: string;
  content: string;
  type: string;
  authorId: string | null;
  authorCity?: string | null;
  authorCountry?: string | null;
  authorTimezone?: string | null;
  publishedAt: Date | string;
  metadata?: Record<string, unknown> | null;
  author: {
    id: string;
    displayName: string;
    avatarLabel: string;
    profile?: { timezone: string; city: string; country: string } | null;
  } | null;
};

type TimelineEntry =
  | { kind: "post"; id: string; sortAt: number; post: TimelinePost }
  | { kind: "focus"; id: string; sortAt: number; interval: TimelineFocusInterval };

function formatFocusTime(value: string) {
  return new Date(value).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function TimelineFocusMarker({ interval }: { interval: TimelineFocusInterval }) {
  const timeRange = `${formatFocusTime(interval.startedAt)} - ${formatFocusTime(interval.endedAt)}`;
  const detail = `${timeRange} · ${interval.userDisplayName} 在认真自习`;

  return (
    <div className="relative min-h-8">
      <button
        type="button"
        data-testid="timeline-focus-marker"
        data-focus-user={interval.userId}
        aria-label={detail}
        className="group absolute left-1/2 top-1/2 z-30 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-[#3a8067] shadow-[0_0_0_3px_rgba(167,196,155,0.35)] outline-none transition focus-visible:ring-2 focus-visible:ring-[#3a8067]/30"
      >
        <span className="pointer-events-none absolute left-1/2 top-6 z-40 -translate-x-1/2 whitespace-nowrap rounded-md border border-sage-100 bg-white px-3 py-2 text-xs font-medium text-black/70 opacity-0 shadow-sm transition group-hover:opacity-100 group-focus:opacity-100 group-focus-visible:opacity-100">
          {detail}
        </span>
      </button>
    </div>
  );
}

function TimelineItem({
  children,
  side,
}: {
  children: React.ReactNode;
  side: Direction;
}) {
  const { ref, visible } = useScrollReveal();

  return (
    <div className="relative">
      <div
        className={cn("timeline-dot", visible && "revealed")}
        style={{ top: "28px" }}
        aria-hidden="true"
      />

      <div
        ref={ref}
        className={cn(
          "scroll-reveal flex",
          ALIGN_CLASS[side],
          visible && DIRECTION_CLASS[side]
        )}
      >
        {children}
      </div>
    </div>
  );
}

type TimelineSpatialProps = {
  postElementByPostId?: Record<string, string>;
  connectFromId?: string | null;
  onSpatialElementClick?: (elementId: string) => void;
  registerSpatialAnchor?: (elementId: string, getRect: () => DOMRect | null) => () => void;
};

export function Timeline({
  posts,
  currentUserId,
  focusIntervals = [],
  postElementByPostId = {},
  connectFromId = null,
  onSpatialElementClick,
  registerSpatialAnchor,
  emptyMessage,
}: {
  posts: TimelinePost[];
  currentUserId: string;
  focusIntervals?: TimelineFocusInterval[];
  emptyMessage?: string;
} & TimelineSpatialProps) {
  const sorted = useMemo(
    () =>
      [...posts].sort(
        (a, b) => new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime()
      ),
    [posts]
  );
  const entries = useMemo<TimelineEntry[]>(
    () =>
      [
        ...sorted.map((post) => ({
          kind: "post" as const,
          id: post.id,
          sortAt: new Date(post.publishedAt).getTime(),
          post,
        })),
        ...focusIntervals.map((interval) => ({
          kind: "focus" as const,
          id: interval.id,
          sortAt: new Date(interval.startedAt).getTime(),
          interval,
        })),
      ].sort((a, b) => a.sortAt - b.sortAt),
    [focusIntervals, sorted]
  );

  const humanAuthors = useMemo(() => {
    const ids: string[] = [];
    const seen = new Set<string>();
    for (const p of sorted) {
      if (p.type === "user_post" && p.authorId && !seen.has(p.authorId)) {
        ids.push(p.authorId);
        seen.add(p.authorId);
      }
    }
    return ids;
  }, [sorted]);

  const leftUserId = humanAuthors[0] ?? currentUserId;

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <p className="text-black/40 text-sm">{emptyMessage ?? "No moments yet."}</p>
        {!emptyMessage && (
          <p className="text-black/30 text-xs mt-1">
            Write your first post or wait for the agent to log its activities.
          </p>
        )}
      </div>
    );
  }

  let agentSide: "left" | "right" = "left";

  return (
    <div className="relative">
      <div className="timeline-line" aria-hidden="true" />

      <div className="flex flex-col gap-10">
        {entries.map((entry) => {
          if (entry.kind === "focus") {
            return <TimelineFocusMarker key={entry.id} interval={entry.interval} />;
          }

          const post = entry.post;

          if (post.type === "agent_log") {
            const side = agentSide;
            agentSide = agentSide === "left" ? "right" : "left";

            return (
              <TimelineItem key={post.id} side={side}>
                <AgentLogCard post={post as any} />
              </TimelineItem>
            );
          }

          const isLeft = post.authorId === leftUserId;
          const elementId = postElementByPostId[post.id];

          return (
            <div key={post.id}>
              <TimelineItem side={isLeft ? "left" : "right"}>
                <PostCardSpatialShell
                  elementId={elementId}
                  isConnectFrom={connectFromId === elementId}
                  onSpatialClick={onSpatialElementClick}
                  registerSpatialAnchor={registerSpatialAnchor}
                >
                  <PostCard
                    post={post}
                    isOwner={post.authorId === currentUserId}
                  />
                </PostCardSpatialShell>
              </TimelineItem>
            </div>
          );
        })}
      </div>
    </div>
  );
}
