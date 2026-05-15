import { redirect } from "next/navigation";

import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";
import { getCurrentUser } from "@/lib/auth";

export default async function ForgotPasswordPage() {
  const user = await getCurrentUser();
  if (user) {
    redirect("/chat");
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md items-center px-5 py-10">
      <main className="w-full space-y-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-ink">重置密码</h1>
          <p className="text-sm text-ink/70">
            输入您的邮箱地址，我们将发送密码重置链接给您。
          </p>
        </div>
        <div className="rounded-lg border border-warm-200 bg-white/88 p-5 shadow-soft">
          <ForgotPasswordForm />
        </div>
        <div className="text-center">
          <a href="/" className="text-sm text-ink/60 hover:text-ink transition">
            返回登录
          </a>
        </div>
      </main>
    </div>
  );
}
