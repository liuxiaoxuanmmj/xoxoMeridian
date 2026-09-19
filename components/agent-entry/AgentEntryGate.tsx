"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import AgentEntryErrorBoundary from "@/components/agent-entry/AgentEntryErrorBoundary";
import type { AgentEntryProps } from "@/components/agent-entry/agent-entry.types";
import { subscribeToSessionLogout } from "@/lib/session-logout";

const AgentEntry = dynamic(() => import("./AgentEntry"), { ssr: false, loading: () => null });

export default function AgentEntryGate({ config }: AgentEntryProps) {
  const pathname = usePathname();
  // Chat 卸载整个认证显示状态；返回时重验，模型仍由 useGLTF 的独立缓存持有。
  if (pathname.startsWith("/chat")) return null;
  return <AuthenticatedEntry config={config} />;
}

function AuthenticatedEntry({ config }: AgentEntryProps) {
  const [authenticated, setAuthenticated] = useState(false);
  const requestGeneration = useRef(0);

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
        if (isCurrent()) setAuthenticated(response.status === 200);
      } catch {
        // 不打扰宿主页面；后续可见/聚焦事件或离开 Chat 时可重试。
        if (isCurrent()) setAuthenticated(false);
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
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) onVisible();
    };
    const unsubscribe = subscribeToSessionLogout(() => {
      setAuthenticated(false);
      scheduleProbe();
    });
    window.addEventListener("focus", onVisible);
    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVisible);
    void probe();

    return () => {
      invalidate();
      clearTimeout(timer);
      unsubscribe();
      window.removeEventListener("focus", onVisible);
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  if (!authenticated) return null;

  return (
    <AgentEntryErrorBoundary key={config.model}>
      <AgentEntry config={config} />
    </AgentEntryErrorBoundary>
  );
}
