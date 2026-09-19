import React from "react";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { HomeTimelineBoard } from "@/components/home/HomeTimelineBoard";
import type { TimelinePost } from "@/components/blog/Timeline";
import { resolveAuthorLocation } from "@/lib/post-time";
import { prisma } from "@/lib/prisma";
import { createTestRoom, createTestUser, resetTestDatabase } from "@/tests/integration/support/database";

const auth = vi.hoisted(() => ({ userId: "" }));
vi.mock("@/lib/auth", () => ({
  requireCurrentUser: async () => ({ id: auth.userId }),
  requirePageUser: async () => ({ id: auth.userId, displayName: "读者", avatarLabel: "读", profile: null }),
}));

import HomePage from "@/app/home/page";
import { GET } from "@/app/api/posts/route";

function timelinePosts(node: React.ReactNode): TimelinePost[] | null {
  if (!React.isValidElement(node)) return null;
  if (node.type === HomeTimelineBoard) return (node.props as { posts: TimelinePost[] }).posts;
  for (const child of React.Children.toArray((node.props as { children?: React.ReactNode }).children)) {
    const posts = timelinePosts(child);
    if (posts) return posts;
  }
  return null;
}

beforeEach(resetTestDatabase);
afterAll(async () => { await prisma.$disconnect(); });

describe("首页与搜索的 Post 展示投影", () => {
  it("真实查询返回相同最小字段、位置快照/fallback 和成员可见集合，排除私有档案", async () => {
    const [author, noProfile, outsider] = await Promise.all([
      createTestUser(), createTestUser(), createTestUser(),
    ]);
    const profile = { city: "Tokyo", country: "Japan", timezone: "Asia/Tokyo" };
    const snapshot = { city: "London", country: "United Kingdom", timezone: "Europe/London" };
    await prisma.userProfile.create({ data: {
      userId: author.id, ...profile, lastGeoIp: "192.0.2.10", profileNote: "仅供本人查看的档案",
      preferences: { privateSentinel: "private-preferences" },
    } });
    const room = await createTestRoom();
    await prisma.roomParticipant.create({ data: { roomId: room.id, userId: author.id } });
    const records = [
      { id: "legacy", type: "user_post" as const, authorId: author.id },
      {
        id: "snapshot", type: "user_post" as const, authorId: author.id,
        authorCity: snapshot.city, authorCountry: snapshot.country, authorTimezone: snapshot.timezone,
      },
      { id: "no-profile", type: "user_post" as const, authorId: noProfile.id },
      { id: "no-author", type: "user_post" as const },
      { id: "member-log", type: "agent_log" as const, roomId: room.id, metadata: { thought: "成员可见内容" } },
      { id: "orphan-log", type: "agent_log" as const },
    ];
    await prisma.post.createMany({ data: records.map((post, index) => ({
      ...post, slug: post.id, title: `投影 ${post.id}`, content: `内容 ${post.id}`,
      publishedAt: new Date(Date.UTC(2026, 8, 13, index)),
    })) });

    for (const viewer of [author, outsider]) {
      auth.userId = viewer.id;
      const response = await GET(new Request("http://localhost/api/posts?q=%E6%8A%95%E5%BD%B1"));
      expect(response.status).toBe(200);
      const { posts: searched } = await response.json() as { posts: TimelinePost[] };
      const home = timelinePosts(await HomePage());
      expect(home).not.toBeNull();
      expect(searched).toEqual(home);
      expect(searched.map((post) => post.id).sort()).toEqual([
        "legacy", "no-author", "no-profile", "snapshot", ...(viewer.id === author.id ? ["member-log"] : []),
      ].sort());

      for (const post of searched) {
        expect(Object.keys(post).sort()).toEqual([
          "id", "slug", "title", "content", "type", "authorId", "authorCity", "authorCountry",
          "authorTimezone", "publishedAt", "metadata", "author",
        ].sort());
        if (post.author) {
          expect(Object.keys(post.author).sort()).toEqual(["id", "displayName", "avatarLabel", "profile"].sort());
          if (post.author.profile) expect(post.author.profile).toEqual(profile);
        }
      }
      const byId = new Map(searched.map((post) => [post.id, post]));
      expect(resolveAuthorLocation(byId.get("legacy")!)).toEqual(profile);
      expect(resolveAuthorLocation(byId.get("snapshot")!)).toEqual(snapshot);
      expect(byId.get("no-profile")?.author?.profile).toBeNull();
      expect(byId.get("no-author")?.author).toBeNull();
      expect(JSON.stringify(searched)).not.toMatch(/privateSentinel|private-preferences|192\.0\.2\.10|仅供本人查看的档案|passwordHash|sessionVersion/);
    }
  });
});
