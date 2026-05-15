"use client";

import { useEffect, useRef, useState } from "react";

import type { ChatMessage, ChatUser } from "@/components/chat/types";
import { MENTION_AGENT } from "@/lib/identity";

export function MessageComposer({
  currentUser,
  externalDraft,
  onSendComplete,
  onSendFailed,
  onSent,
  roomId
}: {
  currentUser: ChatUser;
  externalDraft?: string;
  onSendComplete: (tempId: string, real: ChatMessage) => void;
  onSendFailed: (tempId: string) => void;
  onSent: (message: ChatMessage) => void;
  roomId: string;
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

    const tempId = `temp-${
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`
    }`;
    const tempMessage: ChatMessage = {
      id: tempId,
      roomId,
      senderId: currentUser.id,
      senderAgentId: null,
      senderType: "human",
      content: text,
      targetType: "all",
      status: "processing",
      metadata: null,
      createdAt: new Date().toISOString()
    };

    setSending(true);
    setError("");
    setContent("");
    onSent(tempMessage);

    const fail = (msg: string) => {
      onSendFailed(tempId);
      setContent(text);
      setError(msg);
      setSending(false);
    };

    let response: Response;
    try {
      response = await fetch(`/api/rooms/${roomId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text })
      });
    } catch {
      fail("发送失败");
      return;
    }

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      fail(payload.error ?? "发送失败");
      return;
    }

    const payload = (await response.json().catch(() => null)) as { message?: ChatMessage } | null;
    setSending(false);
    if (payload?.message) {
      onSendComplete(tempId, payload.message);
    } else {
      onSendFailed(tempId);
    }
    textareaRef.current?.focus();
  }

  function insertAssistantMention() {
    setContent((value) => {
      const prefix = value.trim().length > 0 ? `${value} ${MENTION_AGENT} ` : `${MENTION_AGENT} `;
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
    <div className="border-t border-warm-200 bg-white/85 px-4 py-3">
      <div className="mx-auto max-w-3xl">
        <div className="flex gap-2">
          <textarea
            ref={textareaRef}
            className="min-h-[52px] flex-1 resize-none rounded-lg border border-warm-200 bg-white px-3 py-3 text-sm leading-6 outline-none transition placeholder:text-ink/35 focus:border-warm-500"
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
              className="rounded-lg border border-sage-100 bg-sage-50 px-3 py-2 text-sm font-medium text-sage-700 transition hover:bg-sage-100"
              onClick={insertAssistantMention}
              type="button"
            >
              {MENTION_AGENT}
            </button>
            <button
              className="rounded-lg bg-ink px-3 py-2 text-sm font-medium text-white transition hover:bg-ink/90 disabled:opacity-60"
              disabled={sending}
              onClick={() => send()}
              type="button"
            >
              {sending ? "发送中" : "发送"}
            </button>
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
          {error ? <p className="text-xs text-red-700">{error}</p> : <p className="text-xs text-ink/45">Enter 发送，Shift + Enter 换行</p>}
        </div>
      </div>
    </div>
  );
}
