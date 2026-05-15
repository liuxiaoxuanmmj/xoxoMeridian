"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";

export function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  if (!token) {
    return (
      <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
        <p className="font-medium">无效的重置链接</p>
        <p className="mt-1">请检查您的邮箱，使用最新的重置链接。</p>
      </div>
    );
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    if (password !== confirmPassword) {
      setError("两次输入的密码不一致");
      return;
    }

    if (password.length < 8) {
      setError("密码长度至少为 8 个字符");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        setError(payload.error ?? "重置失败");
        setSubmitting(false);
        return;
      }

      setSuccess(true);
    } catch {
      setError("请求失败，请稍后重试。");
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <div className="space-y-4">
        <div className="rounded-md bg-green-50 px-4 py-3 text-sm text-green-700">
          <p className="font-medium">密码重置成功</p>
          <p className="mt-1">您现在可以使用新密码登录了。</p>
        </div>
        <a
          href="/"
          className="block w-full rounded-lg bg-ink px-4 py-3 text-center font-medium text-white transition hover:bg-ink/90"
        >
          前往登录
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <input
        type="password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        placeholder="新密码（至少 8 个字符）"
        autoComplete="new-password"
        required
        minLength={8}
        className="w-full rounded-lg border border-warm-200 bg-white px-4 py-3 text-sm text-ink placeholder-ink/40 focus:border-sage-400 focus:outline-none"
        disabled={submitting}
      />
      <input
        type="password"
        value={confirmPassword}
        onChange={(event) => setConfirmPassword(event.target.value)}
        placeholder="确认新密码"
        autoComplete="new-password"
        required
        minLength={8}
        className="w-full rounded-lg border border-warm-200 bg-white px-4 py-3 text-sm text-ink placeholder-ink/40 focus:border-sage-400 focus:outline-none"
        disabled={submitting}
      />
      <button
        type="submit"
        className="w-full rounded-lg bg-ink px-4 py-3 font-medium text-white transition hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={submitting}
      >
        {submitting ? "重置中…" : "重置密码"}
      </button>
      {error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
    </form>
  );
}
