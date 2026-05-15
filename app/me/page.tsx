import Link from "next/link";

import { MeForm } from "@/app/me/MeForm";
import { requirePageUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function MePage() {
  const user = await requirePageUser();
  const profile = await prisma.userProfile.findUnique({
    where: { userId: user.id },
    select: {
      city: true,
      country: true,
      profileNote: true,
    },
  });

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-6 py-10">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink">个人设置</h1>
          <p className="mt-1 text-sm text-ink/55">
            这里的内容会作为额外背景注入到房间助手的提示里。
          </p>
        </div>
        <Link
          href="/chat"
          className="rounded-md border border-warm-200 bg-white px-3 py-1.5 text-sm text-ink/70 hover:bg-warm-100"
        >
          返回聊天
        </Link>
      </header>

      <MeForm
        initial={{
          displayName: user.displayName,
          city: profile?.city ?? "",
          country: profile?.country ?? "",
          profileNote: profile?.profileNote ?? "",
        }}
      />
    </main>
  );
}
