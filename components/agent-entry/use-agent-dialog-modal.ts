"use client";

import { useEffect, useRef, useState, type CSSProperties, type RefObject } from "react";

export function useAgentDialogModal({ open, portal, root, trigger, onClose }: {
  open: boolean;
  portal: HTMLElement;
  root: RefObject<HTMLDivElement | null>;
  trigger: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
}) {
  const [viewport, setViewport] = useState<CSSProperties>({});
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; }, [onClose]);

  useEffect(() => {
    const update = () => {
      const view = window.visualViewport;
      setViewport(view ? {
        "--entry-view-height": `${view.height}px`, "--entry-view-top": `${view.offsetTop}px`,
        "--entry-view-width": `${view.width}px`, "--entry-view-left": `${view.offsetLeft}px`,
      } as CSSProperties : {});
    };
    update();
    window.visualViewport?.addEventListener("resize", update);
    window.visualViewport?.addEventListener("scroll", update);
    return () => {
      window.visualViewport?.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("scroll", update);
    };
  }, []);

  useEffect(() => {
    const shell = root.current;
    if (!open || !shell) return;
    const original = new Map<HTMLElement, boolean>();
    const makeBackgroundInert = () => {
      for (const child of document.body.children) {
        if (!(child instanceof HTMLElement) || child === portal || original.has(child)) continue;
        original.set(child, child.hasAttribute("inert"));
        child.setAttribute("inert", "");
      }
    };
    makeBackgroundInert();
    const observer = new MutationObserver(makeBackgroundInert);
    observer.observe(document.body, { childList: true });
    const bodyOverflow = document.body.style.overflow;
    const htmlOverflow = document.documentElement.style.overflow;
    const { scrollX, scrollY } = window;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    const focusable = () => Array.from(shell.querySelectorAll<HTMLElement>(
      'button:not([disabled]), a[href], textarea:not([disabled]), input:not([disabled]), [tabindex="0"]',
    )).filter((node) => node.tabIndex >= 0 && !node.closest("[hidden], [inert]"));
    const focusInput = () => (shell.querySelector<HTMLTextAreaElement>("textarea") ?? focusable()[0] ?? shell).focus({ preventScroll: true });
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.isComposing) { event.preventDefault(); close.current(); }
      if (event.key !== "Tab") return;
      const controls = focusable();
      const first = controls[0];
      const last = controls.at(-1);
      if (!first || !last) { event.preventDefault(); shell.focus({ preventScroll: true }); return; }
      if (event.shiftKey && (document.activeElement === first || !shell.contains(document.activeElement))) {
        event.preventDefault(); last.focus({ preventScroll: true });
      } else if (!event.shiftKey && (document.activeElement === last || !shell.contains(document.activeElement))) {
        event.preventDefault(); first.focus({ preventScroll: true });
      }
    };
    const focusin = (event: FocusEvent) => { if (!shell.contains(event.target as Node)) focusInput(); };
    document.addEventListener("keydown", keydown, true);
    document.addEventListener("focusin", focusin);
    focusInput();
    const entryButton = trigger.current;
    return () => {
      observer.disconnect();
      document.removeEventListener("keydown", keydown, true);
      document.removeEventListener("focusin", focusin);
      for (const [element, wasInert] of original) {
        if (!wasInert) element.removeAttribute("inert");
      }
      document.body.style.overflow = bodyOverflow;
      document.documentElement.style.overflow = htmlOverflow;
      if (window.scrollX !== scrollX || window.scrollY !== scrollY) window.scrollTo(scrollX, scrollY);
      // 被身份 Gate 卸载时不把焦点移到即将消失的节点。
      // 此处有意读取清理时的 ref：React 卸载已将它置空，旧 shell 快照无法区分关窗与卸载。
      // eslint-disable-next-line react-hooks/exhaustive-deps
      if (root.current === shell && entryButton?.isConnected && portal.isConnected) entryButton.focus({ preventScroll: true });
    };
  }, [open, portal, root, trigger]);

  return viewport;
}
