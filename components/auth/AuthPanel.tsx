"use client";

import { useState } from "react";

import { LoginForm } from "@/components/auth/LoginForm";
import { RegisterForm } from "@/components/auth/RegisterForm";

type Mode = "login" | "register";

export function AuthPanel() {
  const [mode, setMode] = useState<Mode>("login");

  return (
    <div className="relative flex min-h-screen w-full">
      {/* Small brand badge — top-left corner */}
      <div className="absolute top-6 left-6 z-10 flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-[8px] bg-[#3a5b22] text-sm font-bold text-white">
          X
        </div>
        <div>
          <p className="text-xs font-semibold leading-tight text-black">XOXO</p>
          <p className="text-[10px] font-medium leading-tight text-black/40">Meridian</p>
        </div>
      </div>

      {/* Form */}
      <div className="flex flex-1 items-center justify-center px-6 lg:px-10">
        <div className="w-full max-w-[404px]">
          {/* Tab switcher */}
          <div className="mb-8 flex gap-2">
            <button
              type="button"
              onClick={() => setMode("login")}
              className={`flex-1 rounded-[10px] py-3 text-sm font-medium transition-colors duration-200 cursor-pointer ${
                mode === "login"
                  ? "bg-[#3a5b22] text-white"
                  : "border border-[#d9d9d9] text-black/70 hover:bg-neutral-50 focus:ring-2 focus:ring-[#3a5b22]/30"
              }`}
            >
              登录
            </button>
            <button
              type="button"
              onClick={() => setMode("register")}
              className={`flex-1 rounded-[10px] py-3 text-sm font-medium transition-colors duration-200 cursor-pointer ${
                mode === "register"
                  ? "bg-[#3a5b22] text-white"
                  : "border border-[#d9d9d9] text-black/70 hover:bg-neutral-50 focus:ring-2 focus:ring-[#3a5b22]/30"
              }`}
            >
              注册
            </button>
          </div>

          {/* Title */}
          <h1 className="text-[28px] font-semibold leading-tight text-black">
            {mode === "login" ? "欢迎回来！" : "创建账号"}
          </h1>
          <p className="mt-1 text-[15px] leading-relaxed text-black/60">
            {mode === "login"
              ? "输入账号信息以继续使用"
              : "填写以下信息创建你的账号"}
          </p>

          <div className="mt-6">
            {mode === "login" ? (
              <LoginForm onSwitchToRegister={() => setMode("register")} />
            ) : (
              <RegisterForm onSwitchToLogin={() => setMode("login")} />
            )}
          </div>
        </div>
      </div>

      {/* Background image */}
      <div className="hidden lg:block lg:w-[42%] relative">
        <div
          className="absolute inset-0 rounded-bl-[45px] rounded-tl-[45px] bg-cover bg-center"
          style={{ backgroundImage: "url('/images/login-bg.jpg')" }}
        />
      </div>
    </div>
  );
}
