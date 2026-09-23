"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { createEntryMotionController, type EntryAction } from "@/components/agent-entry/agent-entry-behavior";

type OrdinaryFeedback = EntryAction | "reply" | "failure";
type Feedback = OrdinaryFeedback | "drag" | "release";
const copy: Record<Feedback, { symbol: string; text: string }> = {
  welcome: { symbol: "✦", text: "我在这里，有事叫我。" },
  attention: { symbol: "!", text: "有什么想聊的吗？" },
  click: { symbol: "♡", text: "在呢，我们聊聊。" },
  reply: { symbol: "✦", text: "回复准备好啦。" },
  failure: { symbol: "…", text: "这次没有完成，看看对话里的提示。" },
  drag: { symbol: "↗", text: "诶，要带我去哪？" },
  release: { symbol: "✦", text: "好，就待在这里。" },
};

export function useEntryFeedback(enabled: boolean, reduced: boolean) {
  const [motion] = useState(() => createEntryMotionController(enabled));
  const [feedback, dispatch] = useReducer((_current: Feedback | null, next: Feedback | null) => next, null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const clickUntil = useRef(0);
  const releaseUntil = useRef(0);
  const dragging = useRef(false);
  const lastAttention = useRef(-Infinity);
  const interacted = useRef(false);
  const ready = useRef(false);

  const publish = useCallback((kind: Feedback, duration: number) => {
    clearTimeout(timer.current);
    dispatch(kind);
    timer.current = setTimeout(() => dispatch(null), duration);
  }, []);

  const show = useCallback((kind: OrdinaryFeedback) => {
    if (!enabled || dragging.current || document.visibilityState === "hidden") return;
    const now = performance.now();
    if (kind !== "click" && kind !== "reply" && kind !== "failure" && now < Math.max(clickUntil.current, releaseUntil.current)) return;
    if (kind === "attention" && now - lastAttention.current < 5000) return;
    if (kind === "attention") lastAttention.current = now;
    if (kind === "click") { clickUntil.current = now + 2200; interacted.current = true; }
    releaseUntil.current = 0;
    if (kind === "click" || kind === "attention" || kind === "welcome") motion.start(kind);
    publish(kind, kind === "click" ? 2400 : 2000);
  }, [enabled, motion, publish]);

  const beginDrag = useCallback(() => {
    if (!enabled || dragging.current || document.visibilityState === "hidden") return;
    dragging.current = true;
    interacted.current = true;
    clickUntil.current = 0;
    releaseUntil.current = 0;
    motion.beginDrag();
    publish("drag", 2200);
  }, [enabled, motion, publish]);

  const endDrag = useCallback(() => {
    if (!dragging.current) return;
    dragging.current = false;
    releaseUntil.current = performance.now() + 1800;
    motion.endDrag();
    publish("release", 2000);
  }, [motion, publish]);

  const cancelDrag = useCallback(() => {
    if (!dragging.current && !releaseUntil.current) return;
    dragging.current = false;
    releaseUntil.current = 0;
    motion.cancelDrag();
    clearTimeout(timer.current);
    dispatch(null);
  }, [motion]);

  const onReady = useCallback(() => {
    if (ready.current) return;
    ready.current = true;
    motion.setReady();
    // 加载完成时只继承仍在持续的抓取，不补播已经结束的交互或重发台词。
    if (dragging.current) motion.beginDrag();
    else if (!interacted.current) show("welcome");
  }, [motion, show]);

  useEffect(() => {
    const sync = () => {
      const visible = document.visibilityState !== "hidden";
      motion.setPreferences(reduced, visible);
      if (!visible) {
        dragging.current = false;
        releaseUntil.current = 0;
        clearTimeout(timer.current);
        dispatch(null);
      }
    };
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, [motion, reduced]);
  useEffect(() => () => clearTimeout(timer.current), []);
  return { motion, feedback: feedback ? copy[feedback] : null, show, onReady, beginDrag, endDrag, cancelDrag };
}
