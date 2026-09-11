"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState, useTransition, type CSSProperties } from "react";

import AgentEntryScene from "@/components/agent-entry/AgentEntryScene";
import type { AgentEntryProps } from "@/components/agent-entry/agent-entry.types";
import styles from "@/components/agent-entry/agent-entry.module.css";

export default function AgentEntry({ config }: AgentEntryProps) {
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [tooltipOpen, setTooltipOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const navigationLock = useRef(false);
  const tooltipClose = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const tooltipId = useId();

  useEffect(() => () => clearTimeout(tooltipClose.current), []);

  useEffect(() => {
    if (!pending) navigationLock.current = false;
  }, [pending]);

  const handleReady = useCallback((model: string) => {
    if (model === config.model) setReady(true);
  }, [config.model]);
  const handleError = useCallback(() => setFailed(true), []);

  function navigate() {
    if (!ready || failed || navigationLock.current) return;
    navigationLock.current = true;
    setTooltipOpen(false);
    startTransition(() => {
      try {
        router.push("/chat");
      } catch {
        navigationLock.current = false;
      }
    });
  }

  if (failed) return null;

  const variables = {
    "--entry-mobile-size": `${config.layout.mobileSize}px`,
    "--entry-desktop-size": `${config.layout.desktopSize}px`,
    "--entry-mobile-bottom": `${config.layout.mobileBottom}px`,
    "--entry-desktop-bottom": `${config.layout.desktopBottom}px`,
    "--entry-mobile-right": `${config.layout.mobileRight}px`,
    "--entry-desktop-right": `${config.layout.desktopRight}px`,
    "--entry-accent": config.ui.accent,
    opacity: ready ? 1 : 0,
    pointerEvents: ready ? "auto" : "none",
  } as CSSProperties;

  return (
    <>
      {/* 为文档末尾的表单控件保留可滚动空间，避免固定入口令其永远不可点击。 */}
      {ready && <div aria-hidden="true" className={styles.clearance} style={{ ...variables, pointerEvents: "none" }} />}
      <div
        className={`${styles.entry} fixed z-30`}
        style={variables}
        data-agent-entry=""
        data-ready={ready}
        aria-hidden={!ready}
        onMouseEnter={() => { clearTimeout(tooltipClose.current); if (ready) setTooltipOpen(true); }}
        onMouseLeave={() => { tooltipClose.current = setTimeout(() => setTooltipOpen(false), 80); }}
      >
        <motion.button
          type="button"
          aria-label={config.ui.ariaLabel}
          aria-describedby={tooltipOpen ? tooltipId : undefined}
          disabled={!ready || pending}
          tabIndex={ready ? 0 : -1}
          className={`${styles.button} relative block h-full w-full rounded-3xl border-0 bg-transparent p-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2`}
          initial={false}
          style={reducedMotion ? { opacity: ready ? 1 : 0 } : undefined}
          animate={reducedMotion ? undefined : { opacity: ready ? 1 : 0 }}
          transition={{ duration: reducedMotion ? 0 : 0.25 }}
          whileHover={reducedMotion ? undefined : { scale: 1.025 }}
          whileTap={reducedMotion ? undefined : { scale: 0.975 }}
          onFocus={() => setTooltipOpen(true)}
          onBlur={() => setTooltipOpen(false)}
          onKeyDown={(event) => { if (event.key === "Escape") setTooltipOpen(false); }}
          onClick={navigate}
        >
          <AgentEntryScene config={config} onReady={handleReady} onError={handleError} />
        </motion.button>
        {ready && tooltipOpen && (
          <span id={tooltipId} role="tooltip" className={styles.tooltip} onMouseEnter={() => clearTimeout(tooltipClose.current)}>
            {config.ui.tooltip}
          </span>
        )}
      </div>
    </>
  );
}
