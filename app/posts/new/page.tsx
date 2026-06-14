import { requirePageUser } from "@/lib/auth";
import { PostEditor } from "@/components/blog/PostEditor";
import { BackToBlog } from "@/components/blog/BackToBlog";
import { SiteNav } from "@/components/blog/SiteNav";
import { PageTransition } from "@/components/layout/PageTransition";

export const dynamic = "force-dynamic";

export default async function NewPostPage() {
  const user = await requirePageUser();

  return (
    <div className="min-h-screen bg-sage-50">
      <SiteNav currentUser={user} />
      <PageTransition>
        <main className="mx-auto max-w-3xl px-6 py-12">
          <h1 className="text-2xl font-bold text-black mb-8">New Post</h1>
          <PostEditor currentUser={user} />
        </main>
        <BackToBlog />
      </PageTransition>
    </div>
  );
}
