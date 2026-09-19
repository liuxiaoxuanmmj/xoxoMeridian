import React from "react";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { HomeTimelineBoard } from "@/components/home/HomeTimelineBoard";
import type { TimelinePost } from "@/components/blog/Timeline";
import { prisma } from "@/lib/prisma";
import { createTestRoom, createTestUser, resetTestDatabase } from "@/tests/integration/support/database";

const auth = vi.hoisted(() => ({ userId: "" }));
vi.mock("@/lib/auth", () => ({
  requireCurrentUser: async () => ({ id: auth.userId }),
  requirePageUser: async () => ({ id: auth.userId, displayName: "读者", avatarLabel: "读", profile: null }),
}));

import HomePage from "@/app/home/page";
import { GET } from "@/app/api/posts/route";

const publishedAt = new Date("2026-09-13T01:02:03.123Z");
const sameTimeIds = Array.from({ length: 57 }, (_, index) => `cpagination${String(index).padStart(14, "0")}`);
const newerId = "cpaginationnewer";
const olderId = "cpaginationolder";
const expectedIds = [newerId, ...[...sameTimeIds].reverse(), olderId];

beforeEach(resetTestDatabase);
afterAll(async () => { await prisma.$disconnect(); });

async function seedPosts() {
  const [reader, outsider] = await Promise.all([createTestUser(), createTestUser()]);
  auth.userId = reader.id;
  const room = await createTestRoom();
  await prisma.roomParticipant.create({ data: { roomId: room.id, userId: outsider.id } });
  await prisma.post.createMany({ data: [
    ...sameTimeIds.map((id, index) => ({
      id, slug: id, title: index % 2 === 0 ? `Needle ${index}` : `文章 ${index}`,
      content: index % 2 === 0 ? "共同内容" : "内容中的 nEeDlE", authorId: reader.id, publishedAt,
    })),
    ...[
      { id: newerId, publishedAt: new Date(publishedAt.getTime() + 1) },
      { id: olderId, publishedAt: new Date(publishedAt.getTime() - 1) },
    ].map((post) => ({ ...post, slug: post.id, title: "Needle", content: "时间边界", authorId: reader.id })),
    ...[
      { id: "cpaginationprivate", roomId: room.id },
      { id: "cpaginationorphan", roomId: null },
    ].map((post) => ({
      ...post, slug: post.id, title: "Needle", content: "不应可见", publishedAt,
      type: "agent_log" as const, authorId: outsider.id,
    })),
  ] });
  return { reader, outsider, room };
}

async function readPage(params: URLSearchParams) {
  const response = await GET(new Request(`http://localhost/api/posts?${params}`));
  expect(response.status).toBe(200);
  return await response.json() as { posts: TimelinePost[]; nextCursor: string | null };
}

async function readAll(params: URLSearchParams) {
  const ids: string[] = [];
  const cursors = new Set<string>();
  for (let page = 0; page < 100; page += 1) {
    const body = await readPage(params);
    ids.push(...body.posts.map((post) => post.id));
    if (body.nextCursor === null) return ids;
    expect(cursors.has(body.nextCursor), "分页游标必须前进").toBe(false);
    cursors.add(body.nextCursor);
    params.set("cursor", body.nextCursor);
  }
  throw new Error("分页未在记录数量范围内结束");
}

function homePosts(node: React.ReactNode): TimelinePost[] | null {
  if (!React.isValidElement(node)) return null;
  if (node.type === HomeTimelineBoard) return (node.props as { posts: TimelinePost[] }).posts;
  for (const child of React.Children.toArray((node.props as { children?: React.ReactNode }).children)) {
    const posts = homePosts(child);
    if (posts) return posts;
  }
  return null;
}

describe("Post 复合游标与稳定排序", () => {
  it("同毫秒的 57 条记录跨页时列表和搜索每条恰好出现一次，重复读取及改变页大小顺序不变", async () => {
    await seedPosts();
    for (const limit of [50, 17, 1]) {
      for (const q of ["", "needle"]) {
        const params = new URLSearchParams({ limit: String(limit), q });
        const ids = await readAll(new URLSearchParams(params));
        expect(ids).toHaveLength(expectedIds.length);
        expect(new Set(ids).size).toBe(expectedIds.length);
        expect(ids).toEqual(expectedIds);
        expect(await readAll(new URLSearchParams(params))).toEqual(ids);
      }
    }
  });

  it("首页与搜索取相同的最新 50 条，同时间第二排序键不会随重复读取变化", async () => {
    await seedPosts();
    for (let read = 0; read < 2; read += 1) {
      const home = homePosts(await HomePage());
      expect(home?.map((post) => post.id)).toEqual(expectedIds.slice(0, 50));
      const searched = await readPage(new URLSearchParams({ q: "needle" }));
      expect(searched.posts).toEqual(home);
    }
  });

  it("搜索、作者、类型和成员可见性在 cursor 后仍共同收窄结果", async () => {
    const { reader, outsider } = await seedPosts();
    const memberRoom = await createTestRoom();
    await prisma.roomParticipant.create({ data: { roomId: memberRoom.id, userId: reader.id } });
    await prisma.post.createMany({ data: [
      { id: "cpaginationotherauthor", authorId: outsider.id, title: "Needle" },
      { id: "cpaginationnomatch", authorId: reader.id, title: "无关标题" },
      { id: "cpaginationmemberlog", authorId: reader.id, title: "Needle", type: "agent_log" as const, roomId: memberRoom.id },
    ].map((post) => ({ ...post, slug: post.id, content: "无关内容", publishedAt })) });
    expect(await readAll(new URLSearchParams({
      limit: "11", q: "needle", authorId: reader.id, type: "user_post",
    }))).toEqual(expectedIds);
    expect(await readAll(new URLSearchParams({ limit: "1", q: "needle", type: "agent_log" })))
      .toEqual(["cpaginationmemberlog"]);
  });

  it("游标所指记录已删除时仍按原位置继续，不依赖锚点存在", async () => {
    await seedPosts();
    const first = await readPage(new URLSearchParams({ limit: "10" }));
    expect(first.posts.map((post) => post.id)).toEqual(expectedIds.slice(0, 10));
    expect(first.nextCursor).toEqual(expect.any(String));
    await prisma.post.delete({ where: { id: first.posts.at(-1)!.id } });
    expect(await readAll(new URLSearchParams({ limit: "10", cursor: first.nextCursor! })))
      .toEqual(expectedIds.slice(10));
  });
});
