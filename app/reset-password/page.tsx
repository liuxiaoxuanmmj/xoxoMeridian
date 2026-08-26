import Link from "next/link";
import { redirect } from "next/navigation";

import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function ResetPasswordPage() {
  const user = await getCurrentUser();
  if (user) {
    redirect("/home");
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md items-center px-5 py-10">
      <main className="w-full space-y-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-ink">设置新密码</h1>
          <p className="text-sm text-ink/70">
            请输入您的新密码。
          </p>
        </div>
        <div className="rounded-lg border border-warm-200 bg-white/88 p-5 shadow-soft">
          <ResetPasswordForm />
        </div>
        <div className="text-center">
          <Link href="/" className="text-sm text-ink/60 hover:text-ink transition">
            返回登录
          </Link>
        </div>
      </main>
    </div>
  );
}
