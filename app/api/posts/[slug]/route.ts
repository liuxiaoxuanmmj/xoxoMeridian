import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";

import { assertPostOwnership } from "@/lib/api-posts";
import { applyNoStoreHeaders, errorToResponse, jsonOk } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth";
import { getPostVisibilityWhere } from "@/lib/post-visibility";
import { prisma } from "@/lib/prisma";
import { generateSlug, writePostWithUniqueSlug } from "@/lib/posts";
import { postUpdateSchema, readJsonBody } from "@/lib/validation";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const user = await requireCurrentUser();
    const { slug } = await params;

    const post = await prisma.post.findFirst({
      where: {
        slug,
        AND: [getPostVisibilityWhere(user.id)],
      },
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
    const { title, content } = await readJsonBody(request, postUpdateSchema);

    const updateData: Prisma.PostUpdateInput = {
      ...(title !== undefined ? { title } : {}),
      ...(content !== undefined ? { content } : {}),
    };

    // 未提供标题即不重新分配 slug，与发布契约的字段语义保持一致。
    const updated = await (title !== undefined
      ? writePostWithUniqueSlug(generateSlug(title), (nextSlug) =>
          prisma.post.update({
            where: { id: post.id },
            data: { ...updateData, slug: nextSlug },
          })
        )
      : prisma.post.update({
          where: { id: post.id },
          data: updateData,
        }));

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
