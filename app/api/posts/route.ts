import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

import { requireCurrentUser } from "@/lib/auth";
import { applyNoStoreHeaders, errorToResponse, jsonOk } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { ensureUniqueSlug, generateSlug, snapshotProfileLocation } from "@/lib/posts";

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser();
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") as "user_post" | "agent_log" | null;
    const authorId = searchParams.get("authorId");
    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 100);
    const cursor = searchParams.get("cursor");
    const q = searchParams.get("q")?.trim();

    const where: Record<string, unknown> = {};
    if (type) where.type = type;
    if (authorId) where.authorId = authorId;
    if (cursor) {
      where.publishedAt = { lt: new Date(cursor) };
    }
    if (q) {
      where.OR = [
        { title: { contains: q, mode: "insensitive" } },
        { content: { contains: q, mode: "insensitive" } },
      ];
    }

    const posts = await prisma.post.findMany({
      where,
      orderBy: { publishedAt: "desc" },
      take: limit,
      include: {
        author: { select: { id: true, displayName: true, avatarLabel: true } },
      },
    });

    const response = jsonOk({
      posts,
      nextCursor: posts.length === limit ? posts[posts.length - 1].publishedAt.toISOString() : null,
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
    const body = await request.json();
    const { title, content } = body;

    if (!title?.trim() || !content?.trim()) {
      return NextResponse.json(
        { error: "title and content are required" },
        { status: 400 }
      );
    }

    const baseSlug = generateSlug(title);
    const slug = await ensureUniqueSlug(baseSlug);

    const post = await prisma.post.create({
      data: {
        slug,
        title: title.trim(),
        content: content.trim(),
        type: "user_post",
        authorId: user.id,
        ...snapshotProfileLocation(user.profile),
        publishedAt: new Date(),
      },
    });

    revalidatePath("/home");

    const response = jsonOk({ post });
    applyNoStoreHeaders(response.headers);
    return response;
  } catch (error) {
    return errorToResponse(error);
  }
}
