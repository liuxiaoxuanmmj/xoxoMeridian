"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensureUniqueSlug, generateSlug } from "@/lib/posts";

type PostResult = { id: string; slug: string; title: string };
type ActionResult<T> = { error: string } | T;

function serverError(err: unknown, ctx: string): { error: string } {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[${ctx}]`, message, err instanceof Error ? err.stack : "");
  return { error: `Server error: ${message}` };
}

export async function createPost(
  title: string,
  content: string
): Promise<ActionResult<{ post: PostResult }>> {
  try {
    const user = await getCurrentUser();
    if (!user) return { error: "Unauthorized" };

    if (!title?.trim() || !content?.trim()) {
      return { error: "title and content are required" };
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
        publishedAt: new Date(),
      },
    });

    revalidatePath("/home");
    return { post: { id: post.id, slug: post.slug, title: post.title } };
  } catch (err) {
    return serverError(err, "createPost");
  }
}

export async function updatePost(
  slug: string,
  title: string,
  content: string
): Promise<ActionResult<{ post: PostResult }>> {
  try {
    const user = await getCurrentUser();
    if (!user) return { error: "Unauthorized" };

    const existing = await prisma.post.findUnique({ where: { slug } });
    if (!existing) return { error: "Not found" };
    if (existing.authorId !== user.id) return { error: "Forbidden" };

    const updateData: Record<string, unknown> = {};
    if (title?.trim()) {
      updateData.title = title.trim();
      updateData.slug = await ensureUniqueSlug(generateSlug(title), existing.id);
    }
    if (content?.trim()) {
      updateData.content = content.trim();
    }

    const updated = await prisma.post.update({
      where: { id: existing.id },
      data: updateData,
    });

    revalidatePath("/home");
    return { post: { id: updated.id, slug: updated.slug, title: updated.title } };
  } catch (err) {
    return serverError(err, "updatePost");
  }
}

export async function deletePost(
  slug: string
): Promise<ActionResult<{ deleted: true }>> {
  try {
    const user = await getCurrentUser();
    if (!user) return { error: "Unauthorized" };

    const existing = await prisma.post.findUnique({ where: { slug } });
    if (!existing) return { error: "Not found" };
    if (existing.authorId !== user.id) return { error: "Forbidden" };

    await prisma.post.delete({ where: { id: existing.id } });

    revalidatePath("/home");
    return { deleted: true };
  } catch (err) {
    return serverError(err, "deletePost");
  }
}
