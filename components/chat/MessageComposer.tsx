"use client";

import { useEffect, useRef, useState } from "react";

export function MessageComposer({
  roomId,
  onSent,
  externalDraft
}: {
  roomId: string;
  onSent: () => Promise<void> | void;
  externalDraft?: string;
}) {
  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (externalDraft) {
      setContent(externalDraft);
      requestAnimationFrame(() => textareaRef.current?.focus());
    }
  }, [externalDraft]);

  async function send(forceAgent = false) {
    const text = content.trim();
    if (!text || sending) {
      return;
    }

    setSending(true);
    setError("");
    const response = await fetch(`/api/rooms/${roomId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: text, forceAgent })
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      setError(payload.error ?? "发送失败");
      setSending(false);
      return;
    }

    setContent("");
    setSending(false);
    await onSent();
    textareaRef.current?.focus();
  }

  function insertAssistantMention() {
    setContent((value) => {
      const prefix = value.trim().length > 0 ? `${value} @小助手 ` : "@小助手 ";
      return prefix;
    });
    requestAnimationFrame(() => textareaRef.current?.focus());
  }

  return (
    <div className="border-t border-warm-200 bg-white/85 px-4 py-3">
      <div className="mx-auto max-w-3xl">
        <div className="flex gap-2">
          <textarea
            ref={textareaRef}
            className="min-h-[52px] flex-1 resize-none rounded-lg border border-warm-200 bg-white px-3 py-3 text-sm leading-6 outline-none transition placeholder:text-ink/35 focus:border-warm-500"
            placeholder="写点什么，或者 @小助手 明天提醒我给她发早安"
            value={content}
            onChange={(event) => setContent(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void send(false);
              }
            }}
          />
          <div className="flex w-32 flex-col gap-2">
            <button
              className="rounded-lg border border-sage-100 bg-sage-50 px-3 py-2 text-sm font-medium text-sage-700 transition hover:bg-sage-100"
              onClick={insertAssistantMention}
              type="button"
            >
              @小助手
            </button>
            <button
              className="rounded-lg bg-ink px-3 py-2 text-sm font-medium text-white transition hover:bg-ink/90 disabled:opacity-60"
              disabled={sending}
              onClick={() => send(false)}
              type="button"
            >
              {sending ? "发送中" : "发送"}
            </button>
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <button
            className="rounded-md border border-warm-200 bg-warm-50 px-3 py-1.5 text-xs font-medium text-warm-700 transition hover:bg-warm-100"
            disabled={sending}
            onClick={() => send(true)}
            type="button"
          >
            交给小助手处理
          </button>
          {error ? <p className="text-xs text-red-700">{error}</p> : <p className="text-xs text-ink/45">Enter 发送，Shift + Enter 换行</p>}
        </div>
      </div>
    </div>
  );
}
