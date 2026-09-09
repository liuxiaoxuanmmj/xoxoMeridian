import { Suspense } from "react";
import { requirePageUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SiteNav } from "@/components/blog/SiteNav";
import { PageTransition } from "@/components/layout/PageTransition";
import { ScrollRestore } from "@/components/layout/ScrollRestore";
import { HomeTimelineBoard } from "@/components/home/HomeTimelineBoard";
import { ensureHomePostElements, getHomeBoardSnapshot, getOrCreateHomeBoard } from "@/lib/home-board";
import { getPostVisibilityWhere } from "@/lib/post-visibility";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await requirePageUser();

  const posts = await prisma.post.findMany({
    where: getPostVisibilityWhere(user.id),
    orderBy: { publishedAt: "desc" },
    take: 50,
    include: {
      author: { select: { id: true, displayName: true, avatarLabel: true, profile: { select: { timezone: true, city: true, country: true } } } },
    },
  });

  const board = await getOrCreateHomeBoard();
  await ensureHomePostElements({
    boardId: board.id,
    posts: posts.map((post) => ({ id: post.id, authorId: post.authorId })),
  });
  const initialSnapshot = await getHomeBoardSnapshot(board.id);

  return (
    <div className="home-linen-page min-h-screen relative overflow-hidden">
      <div
        className="fixed top-[-20%] left-[-10%] w-[40vw] h-[40vw] rounded-full bg-sage-100/40 blur-3xl pointer-events-none"
        aria-hidden="true"
      />
      <div
        className="fixed bottom-[-15%] right-[-8%] w-[35vw] h-[35vw] rounded-full bg-sage-200/30 blur-3xl pointer-events-none"
        aria-hidden="true"
      />
      <div
        className="fixed top-[40%] left-[60%] w-[25vw] h-[25vw] rounded-full bg-skysoft-100/20 blur-3xl pointer-events-none"
        aria-hidden="true"
      />

      <ScrollRestore storageKey="home-timeline" />
      <SiteNav currentUser={user} />
      <PageTransition>
        <Suspense fallback={null}>
          <HomeTimelineBoard
            posts={JSON.parse(JSON.stringify(posts))}
            currentUserId={user.id}
            initialSnapshot={JSON.parse(JSON.stringify(initialSnapshot))}
          />
        </Suspense>
      </PageTransition>
    </div>
  );
}
