import React from "react";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HomeTimelineBoard } from "@/components/home/HomeTimelineBoard";
import { prisma } from "@/lib/prisma";
import {
  createTestRoom,
  createTestUser,
  resetTestDatabase,
} from "@/tests/integration/support/database";

const authState = vi.hoisted(() => ({ currentUserId: "" }));

vi.mock("@/lib/auth", () => ({
  requireCurrentUser: vi.fn(async () => ({ id: authState.currentUserId })),
  requirePageUser: vi.fn(async () => ({
    id: authState.currentUserId,
    displayName: "Home reader",
    avatarLabel: "H",
    profile: null,
  })),
}));

import HomePage from "@/app/home/page";

type HomeTimelineBoardProps = {
  posts: Array<{ id: string }>;
  initialSnapshot: {
    elements: Array<{ id: string; postId: string | null }>;
    connections: Array<{ id: string }>;
  };
};

function findElementByType(
  node: React.ReactNode,
  type: React.ElementType,
): React.ReactElement<HomeTimelineBoardProps> | null {
  if (!React.isValidElement(node)) return null;
  if (node.type === type) {
    return node as React.ReactElement<HomeTimelineBoardProps>;
  }

  const element = node as React.ReactElement<{ children?: React.ReactNode }>;
  for (const child of React.Children.toArray(element.props.children)) {
    const match = findElementByType(child, type);
    if (match) return match;
  }

  return null;
}

/**
 * 确定性地把删除放在首页两次写读之间：首页第一个读到的 Post 列表返回后立刻删除其中一条，
 * 之后 anchor 补齐才会执行，复现「读取与补齐之间 Post 被删除」的交错。
 */
function deletePostAfterHomeRead(postId: string) {
  const originalFindMany = prisma.post.findMany.bind(prisma.post);
  const spy = vi.spyOn(prisma.post, "findMany");
  spy.mockImplementationOnce((async (args: never) => {
    const posts = await originalFindMany(args);
    await prisma.post.deleteMany({ where: { id: postId } });
    return posts;
  }) as never);
  return spy;
}

async function seedHomePosts() {
  const [user] = await Promise.all([createTestUser({ id: "home-anchor-user" })]);
  const room = await createTestRoom({ id: "home-anchor-room" });
  await prisma.roomParticipant.create({ data: { roomId: room.id, userId: user.id } });
  await prisma.atlasBoard.create({ data: { id: "home-board" } });

  await prisma.post.createMany({
    data: [
      {
        id: "home-anchor-oldest",
        slug: "home-anchor-oldest",
        title: "Oldest post",
        content: "Survives the interleaved deletion.",
        type: "user_post",
        authorId: user.id,
        publishedAt: new Date("2026-09-19T01:00:00.000Z"),
      },
      {
        id: "home-anchor-deleted",
        slug: "home-anchor-deleted",
        title: "Deleted while home reads",
        content: "Removed between the home read and the anchor backfill.",
        type: "user_post",
        authorId: user.id,
        publishedAt: new Date("2026-09-19T01:01:00.000Z"),
      },
      {
        id: "home-anchor-newest",
        slug: "home-anchor-newest",
        title: "Newest post",
        content: "Survives the interleaved deletion.",
        type: "user_post",
        authorId: user.id,
        publishedAt: new Date("2026-09-19T01:02:00.000Z"),
      },
    ],
  });

  authState.currentUserId = user.id;
  return user;
}

async function anchorPostIds() {
  const anchors = await prisma.atlasElement.findMany({
    where: { boardId: "home-board", postId: { not: null } },
    select: { postId: true },
    orderBy: { postId: "asc" },
  });
  return anchors.map((anchor) => anchor.postId);
}

beforeEach(async () => {
  await resetTestDatabase();
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("Home post anchor backfill during an interleaved post deletion", () => {
  it("renders the surviving posts and anchors them without failing the home request", async () => {
    await seedHomePosts();
    deletePostAfterHomeRead("home-anchor-deleted");

    const home = findElementByType(await HomePage(), HomeTimelineBoard);
    const renderedPostIds = home?.props.posts.map((post) => post.id) ?? [];

    expect(home).not.toBeNull();
    expect(renderedPostIds).toContain("home-anchor-newest");
    expect(renderedPostIds).toContain("home-anchor-oldest");
    expect(await anchorPostIds()).toEqual(["home-anchor-newest", "home-anchor-oldest"]);
  });

  it("keeps the backfill idempotent and leaves no anchor behind for the deleted post", async () => {
    await seedHomePosts();
    deletePostAfterHomeRead("home-anchor-deleted");
    await HomePage();

    deletePostAfterHomeRead("home-anchor-deleted");
    const second = findElementByType(await HomePage(), HomeTimelineBoard);

    expect(second?.props.posts.map((post) => post.id)).toEqual([
      "home-anchor-newest",
      "home-anchor-oldest",
    ]);
    expect(await prisma.post.count({ where: { id: "home-anchor-deleted" } })).toBe(0);
    expect(await prisma.atlasElement.count({ where: { postId: "home-anchor-deleted" } })).toBe(0);
    expect(await anchorPostIds()).toEqual(["home-anchor-newest", "home-anchor-oldest"]);
  });

  it("drops the anchor of a post deleted after an earlier home render", async () => {
    await seedHomePosts();
    const first = findElementByType(await HomePage(), HomeTimelineBoard);
    expect(first?.props.posts).toHaveLength(3);

    await prisma.post.delete({ where: { id: "home-anchor-oldest" } });

    expect(await prisma.atlasElement.count({ where: { postId: "home-anchor-oldest" } })).toBe(0);
    const second = findElementByType(await HomePage(), HomeTimelineBoard);
    expect(second?.props.posts.map((post) => post.id)).toEqual([
      "home-anchor-newest",
      "home-anchor-deleted",
    ]);
    expect(await anchorPostIds()).toEqual(["home-anchor-deleted", "home-anchor-newest"]);
  });
});
