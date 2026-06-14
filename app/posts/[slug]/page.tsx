import { notFound } from "next/navigation";
import { requirePageUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PostDetail } from "@/components/blog/PostDetail";
import { BackToBlog } from "@/components/blog/BackToBlog";
import { SiteNav } from "@/components/blog/SiteNav";
import { PageTransition } from "@/components/layout/PageTransition";

export const dynamic = "force-dynamic";

export default async function PostDetailPage({
  params,
}: {
  params: { slug: string };
}) {
  const user = await requirePageUser();

  const post = await prisma.post.findUnique({
    where: { slug: params.slug },
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

  if (!post) notFound();

  return (
    <div className="min-h-screen bg-sage-50">
      <SiteNav currentUser={user} />
      <PageTransition>
        <main className="mx-auto max-w-3xl px-6 py-12">
          <PostDetail
            post={JSON.parse(JSON.stringify(post))}
            isOwner={post.authorId === user.id}
          />
        </main>
        <BackToBlog />
      </PageTransition>
    </div>
  );
}
