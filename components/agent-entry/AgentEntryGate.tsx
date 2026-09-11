"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import AgentEntryErrorBoundary from "@/components/agent-entry/AgentEntryErrorBoundary";
import type { AgentEntryProps } from "@/components/agent-entry/agent-entry.types";

const AgentEntry = dynamic(() => import("./AgentEntry"), { ssr: false, loading: () => null });

export default function AgentEntryGate({ config }: AgentEntryProps) {
  const pathname = usePathname();
  const excluded = pathname.startsWith("/chat");
  const [authenticated, setAuthenticated] = useState(false);
  const requestGeneration = useRef(0);

  useEffect(() => {
    if (excluded || authenticated) return;
    const controller = new AbortController();
    const generation = ++requestGeneration.current;

    void fetch("/api/auth/me", {
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal,
    }).then((response) => {
      if (!controller.signal.aborted && generation === requestGeneration.current && response.status === 200) {
        setAuthenticated(true);
      }
    }).catch(() => {
      // 入口显示条件失败无需打扰宿主页面；下一次离开 Chat 时允许重新探测。
    });

    return () => {
      requestGeneration.current += 1;
      controller.abort();
    };
  }, [excluded, authenticated]);

  if (excluded || !authenticated) return null;

  return (
    <AgentEntryErrorBoundary key={config.model}>
      <AgentEntry config={config} />
    </AgentEntryErrorBoundary>
  );
}
