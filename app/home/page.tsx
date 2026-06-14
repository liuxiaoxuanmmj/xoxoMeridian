import { requirePageUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Timeline } from "@/components/blog/Timeline";
import { SiteNav } from "@/components/blog/SiteNav";
import { PageTransition } from "@/components/layout/PageTransition";
import { ScrollRestore } from "@/components/layout/ScrollRestore";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await requirePageUser();

  const posts = await prisma.post.findMany({
    orderBy: { publishedAt: "desc" },
    take: 50,
    include: {
      author: { select: { id: true, displayName: true, avatarLabel: true, profile: { select: { timezone: true, city: true, country: true } } } },
    },
  });

  return (
    <div className="min-h-screen bg-sage-50 relative overflow-hidden">
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
        <main className="relative mx-auto max-w-3xl px-6 py-12">
          <Timeline
            posts={JSON.parse(JSON.stringify(posts))}
            currentUserId={user.id}
          />
        </main>
      </PageTransition>
    </div>
  );
}
