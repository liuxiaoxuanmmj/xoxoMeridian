import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";

import { requireCurrentUser } from "@/lib/auth";
import { applyNoStoreHeaders, errorToResponse, jsonOk } from "@/lib/api";
import { getPostVisibilityWhere } from "@/lib/post-visibility";
import { postTimelineOrderBy, postTimelineSelect } from "@/lib/post-timeline";
import { encodePostCursor, getPostCursorWhere, postPaginationSchema } from "@/lib/post-pagination";
import { prisma } from "@/lib/prisma";
import { generateSlug, snapshotProfileLocation, writePostWithUniqueSlug } from "@/lib/posts";
import { parseBody, postCreateSchema, readJsonBody } from "@/lib/validation";

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser();
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") as "user_post" | "agent_log" | null;
    const authorId = searchParams.get("authorId");
    const { limit, cursor } = parseBody(postPaginationSchema, {
      limit: searchParams.get("limit") || undefined,
      cursor: searchParams.get("cursor") ?? undefined,
    });
    const q = searchParams.get("q")?.trim();

    const where: Prisma.PostWhereInput = {
      AND: [getPostVisibilityWhere(user.id), ...(cursor ? [getPostCursorWhere(cursor)] : [])],
    };
    if (type) where.type = type;
    if (authorId) where.authorId = authorId;
    if (q) {
      where.OR = [
        { title: { contains: q, mode: "insensitive" } },
        { content: { contains: q, mode: "insensitive" } },
      ];
    }

    const posts = await prisma.post.findMany({
      where,
      orderBy: postTimelineOrderBy,
      take: limit,
      select: postTimelineSelect,
    });

    const response = jsonOk({
      posts,
      nextCursor: posts.length === limit ? encodePostCursor(posts[posts.length - 1]) : null,
    });
    applyNoStoreHeaders(response.headers);
    return response;
  } catch (error) {
    return errorToResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    const { title, content } = await readJsonBody(request, postCreateSchema);

    const post = await writePostWithUniqueSlug(generateSlug(title), (slug) =>
      prisma.post.create({
        data: {
          slug,
          title,
          content,
          type: "user_post",
          authorId: user.id,
          ...snapshotProfileLocation(user.profile),
          publishedAt: new Date(),
        },
      })
    );

    revalidatePath("/home");

    const response = jsonOk({ post });
    applyNoStoreHeaders(response.headers);
    return response;
  } catch (error) {
    return errorToResponse(error);
  }
}
