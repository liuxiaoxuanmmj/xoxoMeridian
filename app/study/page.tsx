import { SiteNav } from "@/components/blog/SiteNav";
import { StudyDashboard } from "@/components/study/StudyDashboard";
import { requirePageUser } from "@/lib/auth";
import { getStudyPageData } from "@/lib/study";

export const dynamic = "force-dynamic";

export default async function StudyPage() {
  const user = await requirePageUser();
  const timeZone = user.profile?.timezone ?? "UTC";
  const initialData = await getStudyPageData(user.id, timeZone);

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      <SiteNav currentUser={user} />
      <main className="mx-auto max-w-5xl px-6 py-10">
        <StudyDashboard initialData={initialData} />
      </main>
    </div>
  );
}
