"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from "react";

import AgentConversationDialog from "@/components/agent-entry/AgentConversationDialog";
import AgentEntryErrorBoundary from "@/components/agent-entry/AgentEntryErrorBoundary";
import type { AgentEntryProps } from "@/components/agent-entry/agent-entry.types";
import { useAgentConversation } from "@/components/agent-entry/use-agent-conversation";
import { useAgentDialogModal } from "@/components/agent-entry/use-agent-dialog-modal";
import { useEntryFeedback } from "@/components/agent-entry/use-entry-feedback";
import { useEntryReducedMotion } from "@/components/agent-entry/use-entry-reduced-motion";
import { useEntryDrag } from "@/components/agent-entry/use-entry-drag";
import styles from "@/components/agent-entry/agent-entry.module.css";

// 私聊 DOM 不依赖 Three 下载或 WebGL 成功，错误边界仅包住这个视觉子树。
const AgentEntryScene = dynamic(() => import("./AgentEntryScene"), { ssr: false, loading: () => null });

export default function AgentEntry({ config, principalId, onIdentityInvalid }: AgentEntryProps & {
  principalId: string;
  onIdentityInvalid: () => void;
}) {
  const pathname = usePathname();
  const reducedMotion = useEntryReducedMotion();
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const [portal] = useState(() => {
    const host = document.createElement("div");
    host.dataset.agentEntryPortal = "";
    return host;
  });
  const root = useRef<HTMLDivElement>(null);
  const entry = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const tooltipId = useId();
  const movementHintId = useId();
  const movable = config.feedback === "light";
  const { motion, feedback, show, onReady, beginDrag, endDrag, cancelDrag } = useEntryFeedback(movable, reducedMotion);
  const close = useCallback(() => setOpen(false), []);
  const conversation = useAgentConversation({ principalId, open, onIdentityInvalid, onFeedback: show });
  const viewport = useAgentDialogModal({ open, portal, root, trigger, onClose: close });

  useLayoutEffect(() => {
    document.body.appendChild(portal);
    return () => portal.remove();
  }, [portal]);
  const resetPosition = useEntryDrag({ enabled: movable, open, config, root, entry, trigger, motion, beginDrag, endDrag, cancelDrag });
  useEffect(() => {
    // 路由是宿主系统的外部状态；程序性导航也必须撤销模态锁。
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen(false);
  }, [pathname]);

  const handleReady = useCallback((model: string) => {
    if (model !== config.model) return;
    setReady(true);
    onReady();
  }, [config.model, onReady]);
  const handleError = useCallback(() => setFailed(true), []);

  const variables = {
    "--entry-mobile-size": `${config.layout.mobileSize}px`,
    "--entry-desktop-size": `${config.layout.desktopSize}px`,
    "--entry-mobile-bottom": `${config.layout.mobileBottom}px`,
    "--entry-desktop-bottom": `${config.layout.desktopBottom}px`,
    "--entry-mobile-right": `${config.layout.mobileRight}px`,
    "--entry-desktop-right": `${config.layout.desktopRight}px`,
    "--entry-accent": config.ui.accent,
    ...viewport,
  } as CSSProperties;
  const thinking = conversation.tasks.some((task) => task.status === "pending" || task.status === "running");
  const text = thinking ? "小助手正在思考…" : feedback?.text;

  return (
    <>
      <div aria-hidden="true" className={styles.clearance} style={variables} />
      {createPortal(
        <div ref={root} className={styles.portal} data-open={open} style={variables}
          role={open ? "dialog" : undefined} aria-modal={open ? true : undefined}
          aria-labelledby={open ? titleId : undefined} tabIndex={-1}>
          {open && <button type="button" className={styles.backdrop} onClick={close} tabIndex={-1} aria-label="关闭对话遮罩" />}
          <div ref={entry} className={styles.entry} data-agent-entry="" data-ready={ready && !failed}
            onMouseEnter={() => show("attention")}>
            <button ref={trigger} type="button" aria-label={config.ui.ariaLabel} aria-haspopup="dialog" aria-expanded={open}
              aria-describedby={[text ? tooltipId : "", movable ? movementHintId : ""].filter(Boolean).join(" ") || undefined} className={styles.button}
              aria-keyshortcuts={movable ? "ArrowUp ArrowDown ArrowLeft ArrowRight Shift+ArrowUp Shift+ArrowDown Shift+ArrowLeft Shift+ArrowRight" : undefined}
              onFocus={() => show("attention")}
              onClick={() => { show("click"); setOpen(true); }}>
              {(!ready || failed) && <span className={styles.fallback} aria-hidden="true">
                <Image src="/brand/logo_transparent.svg" alt="" width={24} height={24} loading="eager" unoptimized />
              </span>}
              {!failed && <AgentEntryErrorBoundary onError={handleError}>
                <AgentEntryScene config={config} motion={motion} onReady={handleReady} onError={handleError} />
              </AgentEntryErrorBoundary>}
            </button>
            {movable && <span id={movementHintId} className="sr-only">可拖动小助手；聚焦后用方向键移动，按住 Shift 加快，松键放下，Escape 取消本次移动。Enter 或空格打开聊天。手机聊天时请先关闭对话再移动。</span>}
            {text && <span id={tooltipId} role="tooltip" className={styles.tooltip}>
              <span className={styles.emotion} aria-hidden="true">{thinking ? "…" : feedback?.symbol}</span>{text}
            </span>}
          </div>
          {open && <AgentConversationDialog conversation={conversation} principalId={principalId} titleId={titleId}
            reducedMotion={reducedMotion} onClose={close} onIdentityInvalid={onIdentityInvalid}
            onResetPosition={movable ? resetPosition : undefined} />}
        </div>, portal,
      )}
    </>
  );
}
