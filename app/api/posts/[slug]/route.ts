import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

import { assertPostOwnership } from "@/lib/api-posts";
import { applyNoStoreHeaders, errorToResponse, jsonOk } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensureUniqueSlug, generateSlug } from "@/lib/posts";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    await requireCurrentUser();
    const { slug } = await params;

    const post = await prisma.post.findUnique({
      where: { slug },
      include: {
        author: {
          select: {
            id: true,
            displayName: true,
            avatarLabel: true,
            profile: { select: { timezone: true, city: true, country: true } },
          },
        },
      },
    });
    if (!post) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const response = jsonOk({ post });
    applyNoStoreHeaders(response.headers);
    return response;
  } catch (error) {
    return errorToResponse(error);
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const { post } = await assertPostOwnership(slug);
    const body = await request.json();
    const { title, content } = body;

    const updateData: Record<string, unknown> = {};
    if (title?.trim()) {
      updateData.title = title.trim();
      updateData.slug = await ensureUniqueSlug(generateSlug(title), post.id);
    }
    if (content?.trim()) {
      updateData.content = content.trim();
    }

    const updated = await prisma.post.update({
      where: { id: post.id },
      data: updateData,
    });

    revalidatePath("/home");

    const response = jsonOk({ post: updated });
    applyNoStoreHeaders(response.headers);
    return response;
  } catch (error) {
    return errorToResponse(error);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const { post } = await assertPostOwnership(slug);

    await prisma.post.delete({ where: { id: post.id } });

    revalidatePath("/home");

    const response = jsonOk({ deleted: true });
    applyNoStoreHeaders(response.headers);
    return response;
  } catch (error) {
    return errorToResponse(error);
  }
}
