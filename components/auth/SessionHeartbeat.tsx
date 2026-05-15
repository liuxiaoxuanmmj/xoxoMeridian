"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { dedupedReplace } from "@/lib/router-dedup";

// Background SSE that watches sessionVersion across the whole authenticated
// surface. Per-room streams cover the chat view, but settings/idle tabs need
// their own kick channel — that's what /api/auth/heartbeat/stream is for.
//
// `expectedUserId` is the userId the RSC server-rendered for this tab. The
// stream URL carries it as `?u=`; the server kicks the tab if the cookie's
// userId no longer matches (defends against same-device cookie clobber when
// another tab logs in as a different account).
export function SessionHeartbeat({ expectedUserId }: { expectedUserId: string }) {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    let terminated = false;
    let source: EventSource | null = null;
    let retryTimer: number | null = null;
    let probeTimer: number | null = null;
    let attempt = 0;

    const kick = () => {
      if (terminated || cancelled) return;
      console.log("[SessionHeartbeat] kick() called, cleaning up...");
      terminated = true;
      source?.close();
      source = null;

      // 清除所有定时器，防止退出后继续发起请求
      if (probeTimer !== null) {
        console.log("[SessionHeartbeat] clearing probeTimer");
        window.clearTimeout(probeTimer);
        probeTimer = null;
      }
      if (retryTimer !== null) {
        console.log("[SessionHeartbeat] clearing retryTimer");
        window.clearTimeout(retryTimer);
        retryTimer = null;
      }

      // The "kicked" event means the session is already invalid on the server
      // (sessionVersion mismatch). Calling /api/auth/logout here is redundant
      // and can cause a race condition where a newly logged-in session gets
      // invalidated by a stale tab's logout call.
      console.log("[SessionHeartbeat] redirecting to /");
      dedupedReplace(router, "/");
    };

    const probe = async () => {
      if (cancelled || terminated) return;
      console.log("[SessionHeartbeat] probe() executing...");
      try {
        const response = await fetch(`/api/auth/me?expect=${encodeURIComponent(expectedUserId)}`, {
          cache: "no-store",
          credentials: "same-origin",
        });
        console.log("[SessionHeartbeat] probe response:", response.status);
        if (!response.ok) {
          console.log("[SessionHeartbeat] probe failed, calling kick()");
          kick();
          return;
        }
      } catch (error) {
        console.log("[SessionHeartbeat] probe network error:", error);
        // Network blip — re-check next tick.
      }
      if (!cancelled && !terminated) {
        console.log("[SessionHeartbeat] scheduling next probe in 15s");
        probeTimer = window.setTimeout(probe, 15_000);
      }
    };

    const connect = () => {
      if (cancelled || terminated) return;
      console.log("[SessionHeartbeat] connecting to heartbeat stream...");
      source = new EventSource(`/api/auth/heartbeat/stream?u=${encodeURIComponent(expectedUserId)}`);

      source.addEventListener("open", () => {
        console.log("[SessionHeartbeat] connection opened");
        attempt = 0;
      });

      source.addEventListener("kicked", () => {
        console.log("[SessionHeartbeat] received 'kicked' event");
        kick();
      });

      source.addEventListener("error", async () => {
        if (cancelled || terminated) return;
        console.log("[SessionHeartbeat] EventSource error occurred");
        source?.close();
        source = null;

        // 检查是否是认证错误（401），如果是则立即停止，不重连
        try {
          console.log("[SessionHeartbeat] probing for auth error...");
          const probeResponse = await fetch(`/api/auth/me?expect=${encodeURIComponent(expectedUserId)}`, {
            cache: "no-store",
            credentials: "same-origin",
          });
          console.log("[SessionHeartbeat] error probe response:", probeResponse.status);
          if (probeResponse.status === 401) {
            console.log("[SessionHeartbeat] 401 detected, calling kick()");
            kick(); // 认证失败，立即停止所有活动
            return;
          }
        } catch (error) {
          console.log("[SessionHeartbeat] error probe failed:", error);
          // 网络问题，继续重连逻辑
        }

        // 网络错误，使用指数退避重连
        attempt = Math.min(attempt + 1, 6);
        const delay = Math.min(1000 * 2 ** (attempt - 1), 30_000);
        console.log(`[SessionHeartbeat] scheduling reconnect in ${delay}ms (attempt ${attempt})`);
        retryTimer = window.setTimeout(connect, delay);
      });
    };

    connect();
    probeTimer = window.setTimeout(probe, 15_000);

    return () => {
      cancelled = true;
      if (retryTimer !== null) {
        window.clearTimeout(retryTimer);
        retryTimer = null;
      }
      if (probeTimer !== null) {
        window.clearTimeout(probeTimer);
        probeTimer = null;
      }
      source?.close();
    };
  }, [expectedUserId, router]);

  return null;
}
