"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";

import { getCurrentUser } from "@/lib/auth";
import { INTERNAL_ERROR_MESSAGE, logInternalError } from "@/lib/internal-error";
import { prisma } from "@/lib/prisma";
import { generateSlug, snapshotProfileLocation, writePostWithUniqueSlug } from "@/lib/posts";
import {
  ValidationError,
  parseBody,
  postCreateSchema,
  postSlugSchema,
  postUpdateSchema,
} from "@/lib/validation";

type PostResult = { id: string; slug: string; title: string };
type ActionResult<T> = { error: string } | T;

// 非预期异常对编辑器只呈现稳定文案：Error.message 是服务端实现细节，
// 既不随开发/生产变化，也不把 Prisma、provider 或 stack 文本交给客户端。
function serverError(err: unknown, ctx: string): { error: string } {
  logInternalError(ctx, err);
  return { error: INTERNAL_ERROR_MESSAGE };
}

// 验证失败是稳定的用户可见文案；其余内部异常仍交给 serverError 处理。
function invalidInput(err: ValidationError): { error: string } {
  return { error: err.issues[0]?.message ?? "Invalid request" };
}

export async function createPost(
  title: string,
  content: string
): Promise<ActionResult<{ post: PostResult }>> {
  try {
    const user = await getCurrentUser();
    if (!user) return { error: "Unauthorized" };

    const input = parseBody(postCreateSchema, { title, content });

    const post = await writePostWithUniqueSlug(generateSlug(input.title), (slug) =>
      prisma.post.create({
        data: {
          slug,
          title: input.title,
          content: input.content,
          type: "user_post",
          authorId: user.id,
          ...snapshotProfileLocation(user.profile),
          publishedAt: new Date(),
        },
      })
    );

    revalidatePath("/home");
    return { post: { id: post.id, slug: post.slug, title: post.title } };
  } catch (err) {
    if (err instanceof ValidationError) return invalidInput(err);
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

    const postSlug = parseBody(postSlugSchema, slug);
    const { title: nextTitle, content: nextContent } = parseBody(postUpdateSchema, { title, content });

    const existing = await prisma.post.findUnique({ where: { slug: postSlug } });
    if (!existing) return { error: "Not found" };
    if (existing.authorId !== user.id) return { error: "Forbidden" };

    const updateData: Prisma.PostUpdateInput = {
      ...(nextTitle !== undefined ? { title: nextTitle } : {}),
      ...(nextContent !== undefined ? { content: nextContent } : {}),
    };

    // 未提供标题即不重新分配 slug，与 HTTP 更新契约的字段语义保持一致。
    const updated = await (nextTitle !== undefined
      ? writePostWithUniqueSlug(generateSlug(nextTitle), (nextSlug) =>
          prisma.post.update({
            where: { id: existing.id },
            data: { ...updateData, slug: nextSlug },
          })
        )
      : prisma.post.update({
          where: { id: existing.id },
          data: updateData,
        }));

    revalidatePath("/home");
    return { post: { id: updated.id, slug: updated.slug, title: updated.title } };
  } catch (err) {
    if (err instanceof ValidationError) return invalidInput(err);
    return serverError(err, "updatePost");
  }
}

export async function deletePost(
  slug: string
): Promise<ActionResult<{ deleted: true }>> {
  try {
    const user = await getCurrentUser();
    if (!user) return { error: "Unauthorized" };

    const postSlug = parseBody(postSlugSchema, slug);

    const existing = await prisma.post.findUnique({ where: { slug: postSlug } });
    if (!existing) return { error: "Not found" };
    if (existing.authorId !== user.id) return { error: "Forbidden" };

    await prisma.post.delete({ where: { id: existing.id } });

    revalidatePath("/home");
    return { deleted: true };
  } catch (err) {
    if (err instanceof ValidationError) return invalidInput(err);
    return serverError(err, "deletePost");
  }
}
