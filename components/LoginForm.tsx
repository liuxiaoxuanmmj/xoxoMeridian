"use client";

import { useState } from "react";

type Role = "me" | "her";

export function LoginForm() {
  const [loadingRole, setLoadingRole] = useState<Role | null>(null);
  const [error, setError] = useState("");

  async function login(role: Role) {
    setLoadingRole(role);
    setError("");

    const response = await fetch("/api/auth/demo-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role })
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      setError(payload.error ?? "登录失败，请确认已经运行 seed。");
      setLoadingRole(null);
      return;
    }

    window.location.href = "/chat";
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-5xl items-center px-5 py-10">
      <main className="grid w-full gap-8 lg:grid-cols-[1fr_380px] lg:items-center">
        <section className="space-y-6">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sage-700">XOXO Meridian</p>
          <div className="space-y-4">
            <h1 className="max-w-2xl text-4xl font-semibold leading-tight text-ink md:text-6xl">一个只属于你们两个人的异地聊天室</h1>
            <p className="max-w-xl text-base leading-7 text-ink/70">
              消息、便签、备忘录、提醒事项和本地 Agent 执行链路都会落库。小助手部署在同一台服务器上，通过白名单工具处理生活任务。
            </p>
          </div>
          <div className="grid max-w-2xl gap-3 text-sm text-ink/70 sm:grid-cols-3">
            <div className="rounded-lg border border-warm-200 bg-white/70 p-4">双人房间上限</div>
            <div className="rounded-lg border border-sage-100 bg-white/70 p-4">本地 Agent Runtime</div>
            <div className="rounded-lg border border-skysoft-100 bg-white/70 p-4">全链路可追踪</div>
          </div>
        </section>

        <section className="rounded-lg border border-warm-200 bg-white/88 p-5 shadow-soft">
          <div className="mb-5">
            <h2 className="text-xl font-semibold text-ink">Demo 登录</h2>
            <p className="mt-2 text-sm leading-6 text-ink/65">MVP 使用固定的两位用户，之后可以替换为正式邮箱密码或邀请码。</p>
          </div>

          <div className="space-y-3">
            <button
              className="w-full rounded-lg bg-ink px-4 py-3 text-left font-medium text-white transition hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={loadingRole !== null}
              onClick={() => login("me")}
            >
              {loadingRole === "me" ? "正在进入..." : "以“我”进入"}
            </button>
            <button
              className="w-full rounded-lg border border-sage-100 bg-sage-50 px-4 py-3 text-left font-medium text-sage-700 transition hover:bg-sage-100 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={loadingRole !== null}
              onClick={() => login("her")}
            >
              {loadingRole === "her" ? "正在进入..." : "以“她”进入"}
            </button>
          </div>

          {error ? <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
        </section>
      </main>
    </div>
  );
}
