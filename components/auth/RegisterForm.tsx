"use client";

import { useState } from "react";

import { PasswordInput } from "@/components/auth/PasswordInput";

export function RegisterForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError("");

    try {
      // Best-effort timezone capture so the agent's time-aware tools have a
      // reasonable default. Falls back to UTC server-side if the browser
      // refuses to expose this.
      const timezone =
        typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : undefined;

      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, displayName, inviteCode, timezone }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        setError(payload.error ?? "注册失败");
        setSubmitting(false);
        return;
      }

      const probe = await fetch("/api/auth/me", { cache: "no-store", credentials: "same-origin" });
      if (!probe.ok) {
        setError(
          "注册成功，但浏览器没有保存登录态。请确认访问地址的协议（http/https）与服务器配置的 APP_BASE_URL 一致。"
        );
        setSubmitting(false);
        return;
      }

      window.location.href = "/chat";
    } catch {
      setError("注册请求失败，请稍后重试。");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <input
        type="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder="邮箱"
        autoComplete="email"
        required
        className="w-full rounded-lg border border-warm-200 bg-white px-4 py-3 text-sm text-ink placeholder-ink/40 focus:border-sage-400 focus:outline-none"
        disabled={submitting}
      />
      <input
        type="text"
        value={displayName}
        onChange={(event) => setDisplayName(event.target.value)}
        placeholder="昵称（聊天里看到的名字）"
        maxLength={40}
        required
        className="w-full rounded-lg border border-warm-200 bg-white px-4 py-3 text-sm text-ink placeholder-ink/40 focus:border-sage-400 focus:outline-none"
        disabled={submitting}
      />
      <PasswordInput
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        placeholder="密码（至少 8 位）"
        autoComplete="new-password"
        minLength={8}
        required
        disabled={submitting}
      />
      <input
        type="text"
        value={inviteCode}
        onChange={(event) => setInviteCode(event.target.value)}
        placeholder="邀请码"
        autoComplete="one-time-code"
        required
        className="w-full rounded-lg border border-warm-200 bg-white px-4 py-3 text-sm text-ink placeholder-ink/40 focus:border-sage-400 focus:outline-none"
        disabled={submitting}
      />
      <button
        type="submit"
        className="w-full rounded-lg bg-ink px-4 py-3 font-medium text-white transition hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={submitting}
      >
        {submitting ? "注册中…" : "注册并进入房间"}
      </button>
      {error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
    </form>
  );
}
