"use client";

import { useMemo } from "react";
import { PostCard } from "@/components/blog/PostCard";
import { AgentLogCard } from "@/components/blog/AgentLogCard";
import { PostCardSpatialShell } from "@/components/home/PostCardSpatialShell";
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
  publishedAt: Date | string;
  metadata?: Record<string, unknown> | null;
  author: {
    id: string;
    displayName: string;
    avatarLabel: string;
    profile?: { timezone: string; city: string; country: string } | null;
  } | null;
};

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
  postElementByPostId = {},
  connectFromId = null,
  onSpatialElementClick,
  registerSpatialAnchor,
  emptyMessage,
}: {
  posts: TimelinePost[];
  currentUserId: string;
  emptyMessage?: string;
} & TimelineSpatialProps) {
  const sorted = useMemo(
    () =>
      [...posts].sort(
        (a, b) => new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime()
      ),
    [posts]
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
  const rightUserId = humanAuthors[1] ?? "";

  if (sorted.length === 0) {
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
        {sorted.map((post) => {
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
            <TimelineItem key={post.id} side={isLeft ? "left" : "right"}>
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
          );
        })}
      </div>
    </div>
  );
}
