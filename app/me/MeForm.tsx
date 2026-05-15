"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

type Initial = {
  displayName: string;
  city: string;
  country: string;
  profileNote: string;
};

const NOTE_LIMIT = 2000;

export function MeForm({ initial }: { initial: Initial }) {
  const router = useRouter();
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [refining, setRefining] = useState(false);
  const [refineMsg, setRefineMsg] = useState("");
  const previousNoteRef = useRef<string | null>(null);
  const [hasUndo, setHasUndo] = useState(false);

  const update = <K extends keyof Initial>(key: K, value: Initial[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setStatus("idle");
  };

  const onRefineNote = async () => {
    const text = form.profileNote.trim();
    if (!text || refining) return;
    setRefining(true);
    setRefineMsg("");
    try {
      const resp = await fetch("/api/profile/refine-note", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: form.profileNote }),
      });
      if (resp.status === 429) {
        setRefineMsg("优化太频繁了，稍后再试。");
        return;
      }
      if (!resp.ok) {
        setRefineMsg("优化失败，稍后再试。");
        return;
      }
      const data = (await resp.json()) as { refined: string; reason?: string };
      if (data.reason === "llm_disabled") {
        setRefineMsg("未配置 LLM，无法优化。");
        return;
      }
      previousNoteRef.current = form.profileNote;
      setHasUndo(true);
      update("profileNote", data.refined);
      setRefineMsg("已优化，可点撤销恢复。");
    } catch {
      setRefineMsg("优化失败，稍后再试。");
    } finally {
      setRefining(false);
    }
  };

  const onUndoRefine = () => {
    if (previousNoteRef.current === null) return;
    update("profileNote", previousNoteRef.current);
    previousNoteRef.current = null;
    setHasUndo(false);
    setRefineMsg("已恢复。");
  };

  const [loggingOut, setLoggingOut] = useState(false);
  const onLogout = async () => {
    if (loggingOut) return;
    if (!confirm("确认退出登录？")) return;
    console.log("[Logout] starting logout process...");
    setLoggingOut(true);
    try {
      console.log("[Logout] calling /api/auth/logout...");
      const response = await fetch("/api/auth/logout", { method: "POST" });
      console.log("[Logout] logout response:", response.status);
    } catch (error) {
      console.error("[Logout] logout failed:", error);
    } finally {
      // 清理客户端状态
      try {
        console.log("[Logout] clearing sessionStorage...");
        sessionStorage.removeItem("xoxo_last_redirect");
      } catch {
        // sessionStorage 不可用时忽略
      }
      // 使用硬刷新确保所有组件和连接被完全清理
      console.log("[Logout] redirecting to / with hard refresh...");
      window.location.href = "/";
    }
  };

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setErrorMsg("");

    try {
      const response = await fetch("/api/auth/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: form.displayName.trim() || undefined,
          city: form.city.trim() || undefined,
          country: form.country.trim() || undefined,
          profileNote: form.profileNote,
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error ?? `保存失败：${response.status}`);
      }
      setStatus("saved");
      router.refresh();
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const noteLength = form.profileNote.length;

  return (
    <form className="space-y-5 rounded-lg border border-warm-200 bg-white/85 p-6" onSubmit={onSubmit}>
      <Field label="昵称">
        <input
          className="w-full rounded-md border border-warm-200 bg-white px-3 py-2 text-sm outline-none focus:border-warm-500"
          maxLength={40}
          onChange={(event) => update("displayName", event.target.value)}
          type="text"
          value={form.displayName}
        />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="城市">
          <input
            className="w-full rounded-md border border-warm-200 bg-white px-3 py-2 text-sm outline-none focus:border-warm-500"
            onChange={(event) => update("city", event.target.value)}
            type="text"
            value={form.city}
          />
        </Field>
        <Field label="国家">
          <input
            className="w-full rounded-md border border-warm-200 bg-white px-3 py-2 text-sm outline-none focus:border-warm-500"
            onChange={(event) => update("country", event.target.value)}
            type="text"
            value={form.country}
          />
        </Field>
      </div>

      <Field label={`自我介绍 / 给助手的背景说明（${noteLength}/${NOTE_LIMIT}）`}>
        <textarea
          className="min-h-[160px] w-full resize-y rounded-md border border-warm-200 bg-white px-3 py-2 text-sm leading-6 outline-none focus:border-warm-500"
          maxLength={NOTE_LIMIT}
          onChange={(event) => update("profileNote", event.target.value)}
          placeholder="例如：我对花生过敏；我喜欢早睡；遇到我说焦虑时请先共情再给建议。"
          value={form.profileNote}
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onRefineNote}
            disabled={refining || !form.profileNote.trim()}
            className="rounded-md border border-sage-300 bg-sage-50 px-3 py-1.5 text-xs font-medium text-sage-700 hover:bg-sage-100 disabled:opacity-50"
          >
            {refining ? "优化中…" : "小助手优化"}
          </button>
          {hasUndo ? (
            <button
              type="button"
              onClick={onUndoRefine}
              className="rounded-md border border-warm-300 bg-white px-3 py-1.5 text-xs text-ink/70 hover:bg-warm-100"
            >
              撤销
            </button>
          ) : null}
          {refineMsg ? <span className="text-xs text-ink/55">{refineMsg}</span> : null}
        </div>
      </Field>

      <div className="flex items-center justify-end gap-3">
        {status === "saved" ? <span className="text-xs text-sage-700">已保存</span> : null}
        {status === "error" ? <span className="text-xs text-red-700">{errorMsg}</span> : null}
        <button
          type="button"
          onClick={onLogout}
          disabled={loggingOut}
          className="rounded-md border border-red-200 bg-white px-4 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-60"
        >
          {loggingOut ? "退出中…" : "退出登录"}
        </button>
        <button
          className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-white transition hover:bg-ink/90 disabled:opacity-60"
          disabled={saving}
          type="submit"
        >
          {saving ? "保存中…" : "保存"}
        </button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-ink/65">{label}</span>
      {children}
    </label>
  );
}
