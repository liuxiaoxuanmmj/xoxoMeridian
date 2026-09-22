"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import AgentEntry from "@/components/agent-entry/AgentEntry";
import type { AgentEntryProps } from "@/components/agent-entry/agent-entry.types";
import { subscribeToSessionLogout } from "@/lib/session-logout";

export default function AgentEntryGate({ config }: AgentEntryProps) {
  const pathname = usePathname();
  // Chat 卸载整个认证显示状态；返回时重验，模型仍由 useGLTF 的独立缓存持有。
  if (pathname.startsWith("/chat")) return null;
  return <AuthenticatedEntry config={config} />;
}

function AuthenticatedEntry({ config }: AgentEntryProps) {
  const [principalId, setPrincipalId] = useState<string | null>(null);
  const requestGeneration = useRef(0);
  const recheck = useRef<() => void>(() => {});
  const onIdentityInvalid = useCallback(() => {
    setPrincipalId(null);
    recheck.current();
  }, []);

  useEffect(() => {
    let controller: AbortController | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const invalidate = () => {
      requestGeneration.current += 1;
      controller?.abort();
      controller = undefined;
    };
    const probe = async () => {
      const current = new AbortController();
      controller = current;
      const generation = ++requestGeneration.current;
      const isCurrent = () => !current.signal.aborted && generation === requestGeneration.current;
      try {
        const response = await fetch("/api/auth/me", {
          cache: "no-store",
          credentials: "same-origin",
          signal: current.signal,
        });
        const user: unknown = response.status === 200 ? await response.json() : null;
        const id = user && typeof user === "object" && "id" in user && typeof user.id === "string" && user.id.length > 0
          ? user.id : null;
        if (isCurrent()) setPrincipalId(id);
      } catch {
        // 不打扰宿主页面；后续可见/聚焦事件或离开 Chat 时可重试。
        if (isCurrent()) setPrincipalId(null);
      } finally {
        if (isCurrent()) controller = undefined;
      }
    };
    const scheduleProbe = () => {
      invalidate();
      // 一次标签切换常同时产生 visibilitychange 和 focus，合并这批通知，无周期轮询。
      if (timer !== undefined) return;
      timer = setTimeout(() => { timer = undefined; void probe(); }, 100);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") scheduleProbe();
    };
    recheck.current = scheduleProbe;
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) onVisible();
    };
    const unsubscribe = subscribeToSessionLogout(() => {
      setPrincipalId(null);
      scheduleProbe();
    });
    window.addEventListener("focus", onVisible);
    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVisible);
    void probe();

    return () => {
      invalidate();
      recheck.current = () => {};
      clearTimeout(timer);
      unsubscribe();
      window.removeEventListener("focus", onVisible);
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  if (!principalId) return null;

  return <AgentEntry key={`${principalId}:${config.model}`} config={config} principalId={principalId} onIdentityInvalid={onIdentityInvalid} />;
}
