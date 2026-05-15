"use client";

import { useState } from "react";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError("");

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        setError(payload.error ?? "登录失败");
        setSubmitting(false);
        return;
      }

      // Verify the session cookie actually persisted before navigating. If
      // APP_BASE_URL is https but the client accessed via http, browsers drop
      // the Secure cookie silently — without this probe the user would just
      // see /chat bounce them back to /, looking like a no-op login.
      const probe = await fetch("/api/auth/me", { cache: "no-store", credentials: "same-origin" });
      if (!probe.ok) {
        setError(
          "登录已通过验证，但浏览器没有保存登录态。请确认访问地址的协议（http/https）与服务器配置的 APP_BASE_URL 一致。"
        );
        setSubmitting(false);
        return;
      }

      window.location.href = "/chat";
    } catch {
      setError("登录请求失败，请稍后重试。");
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
        type="password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        placeholder="密码"
        autoComplete="current-password"
        required
        className="w-full rounded-lg border border-warm-200 bg-white px-4 py-3 text-sm text-ink placeholder-ink/40 focus:border-sage-400 focus:outline-none"
        disabled={submitting}
      />
      <button
        type="submit"
        className="w-full rounded-lg bg-ink px-4 py-3 font-medium text-white transition hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={submitting}
      >
        {submitting ? "登录中…" : "登录"}
      </button>
      {error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      <div className="text-center">
        <a
          href="/forgot-password"
          className="text-sm text-ink/60 hover:text-ink transition"
        >
          忘记密码？
        </a>
      </div>
    </form>
  );
}
