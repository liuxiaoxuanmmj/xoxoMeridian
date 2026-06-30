"use client";

import { useEffect, useRef, useState } from "react";

import type { ChatUser } from "@/components/chat/types";
import { MENTION_AGENT } from "@/lib/identity";

export function MessageComposer({
  currentUser: _currentUser,
  externalDraft,
  onSubmitMessage,
}: {
  currentUser: ChatUser;
  externalDraft?: string;
  onSubmitMessage: (text: string) => Promise<{ ok: true } | { ok: false; error: string }>;
}) {
  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (externalDraft) {
      setContent(externalDraft);
      requestAnimationFrame(() => {
        const ta = textareaRef.current;
        if (!ta) return;
        ta.focus();
        const end = ta.value.length;
        ta.setSelectionRange(end, end);
      });
    }
  }, [externalDraft]);

  async function send() {
    const text = content.trim();
    if (!text || sending) {
      return;
    }

    setSending(true);
    setError("");

    const result = await onSubmitMessage(text);

    if (result.ok) {
      setContent("");
      setSending(false);
      textareaRef.current?.focus();
    } else {
      setContent(text);
      setError(result.error);
      setSending(false);
    }
  }

  function insertAssistantMention() {
    setContent((value) => {
      const prefix =
        value.trim().length > 0 ? `${value} ${MENTION_AGENT} ` : `${MENTION_AGENT} `;
      return prefix;
    });
    requestAnimationFrame(() => {
      const ta = textareaRef.current;
      if (!ta) return;
      ta.focus();
      const end = ta.value.length;
      ta.setSelectionRange(end, end);
    });
  }

  return (
    <div className="border-t border-[#e8e8e8] bg-white px-4 py-3">
      <div className="mx-auto max-w-3xl">
        <div className="flex gap-2">
          <textarea
            ref={textareaRef}
            className="min-h-[52px] flex-1 resize-none rounded-[10px] border border-[#d9d9d9] bg-white px-4 py-3 text-[15px] leading-normal outline-none transition-colors duration-200 placeholder:text-[#b0b0b0] focus:border-[#3a5b22] focus:ring-2 focus:ring-[#3a5b22]/15"
            placeholder={`写点什么，或者 ${MENTION_AGENT} 明天提醒我给对方发早安`}
            value={content}
            onChange={(event) => setContent(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void send();
              }
            }}
          />
          <div className="flex w-32 flex-col gap-2">
            <button
              className="rounded-[10px] border border-[#d9d9d9] bg-white px-3 py-2 text-sm font-medium text-[#3a5b22] transition-colors duration-200 hover:bg-[#3a5b22] hover:text-white focus:ring-2 focus:ring-[#3a5b22]/15 focus:outline-none cursor-pointer"
              onClick={insertAssistantMention}
              type="button"
            >
              {MENTION_AGENT}
            </button>
            <button
              className="rounded-[10px] bg-[#3a5b22] px-3 py-2 text-sm font-semibold text-white transition-colors duration-200 hover:bg-[#2e4a1a] focus:ring-2 focus:ring-[#3a5b22]/30 focus:outline-none disabled:opacity-50 cursor-pointer"
              disabled={sending}
              onClick={() => send()}
              type="button"
            >
              {sending ? "发送中" : "发送"}
            </button>
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
          {error ? (
            <p className="text-xs text-red-700">{error}</p>
          ) : (
            <p className="text-xs text-black/40">
              Enter 发送，Shift + Enter 换行
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
