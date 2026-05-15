"use client";

import { useState } from "react";

import { LoginForm } from "@/components/auth/LoginForm";
import { RegisterForm } from "@/components/auth/RegisterForm";

type Mode = "login" | "register";

export function AuthPanel() {
  const [mode, setMode] = useState<Mode>("login");

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-5xl items-center px-5 py-10">
      <main className="grid w-full gap-8 lg:grid-cols-[1fr_420px] lg:items-center">
        <section className="space-y-6">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sage-700">XOXO Meridian</p>
          <div className="space-y-4">
            <h1 className="max-w-2xl text-4xl font-semibold leading-tight text-ink md:text-6xl">
              一个只属于你们两个人的异地聊天室
            </h1>
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
          <div className="mb-4 flex gap-2 text-sm">
            <button
              type="button"
              onClick={() => setMode("login")}
              className={`flex-1 rounded-lg px-3 py-2 font-medium transition ${
                mode === "login" ? "bg-ink text-white" : "border border-warm-200 text-ink/70 hover:bg-warm-100"
              }`}
            >
              登录
            </button>
            <button
              type="button"
              onClick={() => setMode("register")}
              className={`flex-1 rounded-lg px-3 py-2 font-medium transition ${
                mode === "register" ? "bg-ink text-white" : "border border-warm-200 text-ink/70 hover:bg-warm-100"
              }`}
            >
              注册
            </button>
          </div>
          {mode === "login" ? <LoginForm /> : <RegisterForm />}
        </section>
      </main>
    </div>
  );
}
