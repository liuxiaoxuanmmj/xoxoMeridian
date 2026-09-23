import type { Prisma } from "@prisma/client";

// 查询从新到旧取页，Timeline 用同一组键反向展示；ID 唯一决定同毫秒记录的位置。
export const postTimelineOrderBy = [
  { publishedAt: "desc" },
  { id: "desc" },
] satisfies Prisma.PostOrderByWithRelationInput[];

type PostTimelineKey = { publishedAt: Date | string; id: string };

export function compareTimelinePosts(a: PostTimelineKey, b: PostTimelineKey) {
  const timeDifference = new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime();
  // Post 的 ID 由 cuid 生成；直接比较字符，避免浏览器 locale 改变同时间顺序。
  return timeDifference || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

// 首页与搜索只读取时间线展示字段；旧 Post 的位置由公开 profile 字段回退。
export const postTimelineSelect = {
  id: true,
  slug: true,
  title: true,
  content: true,
  type: true,
  authorId: true,
  roomId: true,
  agentTaskId: true,
  authorCity: true,
  authorCountry: true,
  authorTimezone: true,
  publishedAt: true,
  metadata: true,
  author: {
    select: {
      id: true,
      displayName: true,
      avatarLabel: true,
      profile: { select: { city: true, country: true, timezone: true } },
    },
  },
} satisfies Prisma.PostSelect;
