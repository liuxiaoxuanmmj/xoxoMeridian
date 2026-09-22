"use client";

import { useLayoutEffect, useRef, type RefObject } from "react";
import type { EntryMotionController } from "@/components/agent-entry/agent-entry-behavior";
import type { AgentEntryThemeConfig } from "@/components/agent-entry/agent-entry.types";
import {
  clampEntryPoint, placementToPoint, pointToPlacement, readEntryPlacement, saveEntryPlacement,
  type EntryBounds, type EntryPlacement, type EntryPoint,
} from "@/components/agent-entry/agent-entry-placement";

type Gesture = {
  pointerId: number | null;
  start: EntryPoint;
  pointerStart: EntryPoint;
  lastPointer: EntryPoint;
  time: number;
  point: EntryPoint;
  dragging: boolean;
};
type DragOptions = {
  enabled: boolean;
  open: boolean;
  config: AgentEntryThemeConfig;
  root: RefObject<HTMLDivElement | null>;
  entry: RefObject<HTMLDivElement | null>;
  trigger: RefObject<HTMLButtonElement | null>;
  motion: EntryMotionController;
  beginDrag: () => void;
  endDrag: () => void;
  cancelDrag: () => void;
};

/** 位置变化留在 DOM/rAF；反馈或聊天更新不会重建监听、Canvas 或手势。 */
export function useEntryDrag({ enabled, open, config, root, entry, trigger, motion, beginDrag, endDrag, cancelDrag }: DragOptions) {
  const currentOpen = useRef(open);
  const refresh = useRef<(() => void) | null>(null);
  const placement = useRef<EntryPlacement | null>(null);

  useLayoutEffect(() => {
    const shell = root.current;
    const host = entry.current;
    const button = trigger.current;
    if (!enabled || !shell || !host || !button) return;
    placement.current = readEntryPlacement();
    let gesture: Gesture | null = null;
    let frame: number | null = null;
    let suppressClick = false;
    let bounds: EntryBounds = { width: 0, height: 0, size: 0 };
    let displayed: EntryPoint = { x: 0, y: 0 };
    let compact = false;

    const canMove = () => !(currentOpen.current && compact);
    const defaultPoint = () => clampEntryPoint({
      x: bounds.width - bounds.size - (compact ? config.layout.mobileRight : config.layout.desktopRight),
      y: bounds.height - bounds.size - (compact ? config.layout.mobileBottom : config.layout.desktopBottom),
    }, bounds);
    const savedPoint = () => placement.current ? placementToPoint(placement.current, bounds) : defaultPoint();

    const layoutCompanions = () => {
      const tooltip = host.querySelector<HTMLElement>('[role="tooltip"]');
      if (tooltip) {
        const beside = compact && currentOpen.current;
        tooltip.style.maxWidth = `${Math.max(1, Math.min(240, beside ? displayed.x - 20 : bounds.width - 24))}px`;
        const rect = tooltip.getBoundingClientRect();
        const x = beside ? displayed.x - rect.width - 8 : Math.min(Math.max(12, displayed.x + (bounds.size - rect.width) / 2), bounds.width - rect.width - 12);
        const proposedY = beside ? displayed.y + (bounds.size - rect.height) / 2
          : displayed.y >= rect.height + 20 ? displayed.y - rect.height - 8 : displayed.y + bounds.size + 8;
        const y = Math.max(6, Math.min(bounds.height - rect.height - 6, proposedY));
        tooltip.style.left = `${x - displayed.x}px`;
        tooltip.style.top = `${y - displayed.y}px`;
        tooltip.style.right = "auto";
        tooltip.style.bottom = "auto";
      }
      if (compact || !currentOpen.current) return;
      const leftSpace = displayed.x - 24;
      const rightSpace = bounds.width - displayed.x - bounds.size - 24;
      const onLeft = leftSpace >= rightSpace;
      const width = Math.min(420, Math.max(1, onLeft ? leftSpace : rightSpace));
      const height = Math.min(600, Math.max(1, bounds.height - 24));
      const x = onLeft ? displayed.x - width - 12 : displayed.x + bounds.size + 12;
      const y = Math.max(12, Math.min(bounds.height - height - 12, displayed.y + (bounds.size - height) / 2));
      shell.style.setProperty("--entry-panel-left", `${x}px`);
      shell.style.setProperty("--entry-panel-top", `${y}px`);
      shell.style.setProperty("--entry-panel-width", `${width}px`);
      shell.style.setProperty("--entry-panel-height", `${height}px`);
    };
    const paint = (point: EntryPoint) => {
      displayed = point;
      host.style.left = `${point.x}px`;
      host.style.top = `${point.y}px`;
      host.style.right = "auto";
      host.style.bottom = "auto";
      layoutCompanions();
    };
    const finish = (commit: boolean) => {
      const previous = gesture;
      if (!previous) return;
      gesture = null;
      if (frame !== null) { cancelAnimationFrame(frame); frame = null; }
      host.removeAttribute("data-dragging");
      if (previous.dragging) {
        suppressClick = previous.pointerId !== null;
        if (commit) {
          placement.current = pointToPlacement(previous.point, bounds);
          saveEntryPlacement(placement.current);
          paint(previous.point);
          endDrag();
        } else { paint(savedPoint()); cancelDrag(); }
      }
      if (previous.pointerId !== null && button.hasPointerCapture?.(previous.pointerId)) {
        button.releasePointerCapture(previous.pointerId);
      }
    };
    const measure = () => {
      const view = window.visualViewport;
      const width = view?.width ?? window.innerWidth;
      const height = view?.height ?? window.innerHeight;
      const nextCompact = width < 768;
      shell.setAttribute("data-entry-compact", String(nextCompact));
      // CSS 根据 compact/open 选出实际尺寸；不把缩小后的临时尺寸写入位置。
      const size = host.getBoundingClientRect().width || (nextCompact
        ? currentOpen.current ? height <= 420 ? 56 : 96 : config.layout.mobileSize
        : config.layout.desktopSize);
      if (width !== bounds.width || height !== bounds.height || size !== bounds.size || !canMove()) finish(false);
      bounds = { width, height, size };
      compact = nextCompact;
      host.setAttribute("data-draggable", String(canMove()));
      paint(!canMove() ? { x: Math.max(0, width - size - 12), y: 6 }
        : gesture?.dragging ? clampEntryPoint(gesture.point, bounds) : savedPoint());
    };
    const begin = (active: Gesture) => {
      active.dragging = true;
      host.setAttribute("data-dragging", "true");
      beginDrag();
    };
    const queuePaint = () => {
      if (frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        if (gesture?.dragging) paint(gesture.point);
      });
    };
    const pointerdown = (event: PointerEvent) => {
      if (!canMove() || event.button !== 0 || event.isPrimary === false || gesture) return;
      suppressClick = false;
      const point = { x: event.clientX, y: event.clientY };
      gesture = { pointerId: event.pointerId, start: displayed, pointerStart: point, lastPointer: point, time: event.timeStamp, point: displayed, dragging: false };
      // Capture 保留抓取点并把离开小人后的 move/up 送回同一按钮。
      button.setPointerCapture?.(event.pointerId);
    };
    const pointermove = (event: PointerEvent) => {
      const active = gesture;
      if (!active || active.pointerId !== event.pointerId) return;
      if (event.buttons === 0) { finish(false); return; }
      const dx = event.clientX - active.pointerStart.x;
      const dy = event.clientY - active.pointerStart.y;
      if (!active.dragging && Math.hypot(dx, dy) <= 6) return;
      if (!active.dragging) begin(active);
      event.preventDefault();
      active.point = clampEntryPoint({ x: active.start.x + dx, y: active.start.y + dy }, bounds);
      const dt = Math.max(8, event.timeStamp - active.time);
      motion.updateDrag((event.clientX - active.lastPointer.x) / dt, (event.clientY - active.lastPointer.y) / dt);
      active.lastPointer = { x: event.clientX, y: event.clientY };
      active.time = event.timeStamp;
      queuePaint();
    };
    const pointerup = (event: PointerEvent) => {
      if (gesture?.pointerId !== event.pointerId) return;
      if (gesture.dragging) gesture.point = clampEntryPoint({
        x: gesture.start.x + event.clientX - gesture.pointerStart.x,
        y: gesture.start.y + event.clientY - gesture.pointerStart.y,
      }, bounds);
      finish(true);
    };
    const pointercancel = (event: PointerEvent) => { if (gesture?.pointerId === event.pointerId) finish(false); };
    const click = (event: MouseEvent) => {
      if (suppressClick && event.detail > 0) { event.preventDefault(); event.stopImmediatePropagation(); }
      suppressClick = false;
    };
    const arrows: Record<string, EntryPoint> = { ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 }, ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 } };
    const keydown = (event: KeyboardEvent) => {
      if (!canMove() || event.isComposing || event.altKey || event.ctrlKey || event.metaKey) return;
      const direction = arrows[event.key];
      if (!direction) {
        if (gesture?.pointerId === null && (event.key === "Enter" || event.key === " ")) finish(true);
        return;
      }
      if (gesture?.pointerId != null) return;
      event.preventDefault();
      if (!gesture) {
        gesture = { pointerId: null, start: displayed, pointerStart: displayed, lastPointer: displayed, time: event.timeStamp, point: displayed, dragging: false };
        begin(gesture);
      }
      const step = event.shiftKey ? 40 : 10;
      gesture.point = clampEntryPoint({ x: gesture.point.x + direction.x * step, y: gesture.point.y + direction.y * step }, bounds);
      motion.updateDrag(direction.x * step / 40, direction.y * step / 40);
      paint(gesture.point);
    };
    const keyup = (event: KeyboardEvent) => { if (arrows[event.key] && gesture?.pointerId === null) { event.preventDefault(); finish(true); } };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.isComposing || !gesture) return;
      event.preventDefault(); event.stopPropagation(); finish(false);
    };
    const cancel = () => finish(false);
    const buttonBlur = () => { if (gesture?.pointerId === null) finish(false); };
    const visibility = () => { if (document.visibilityState === "hidden") finish(false); };
    const viewportChange = () => { finish(false); measure(); };
    button.addEventListener("pointerdown", pointerdown);
    button.addEventListener("pointermove", pointermove);
    button.addEventListener("pointerup", pointerup);
    button.addEventListener("pointercancel", pointercancel);
    button.addEventListener("lostpointercapture", pointercancel);
    button.addEventListener("click", click, true);
    button.addEventListener("keydown", keydown);
    button.addEventListener("keyup", keyup);
    button.addEventListener("blur", buttonBlur);
    window.addEventListener("keydown", escape, true);
    window.addEventListener("blur", cancel);
    window.addEventListener("resize", viewportChange);
    document.addEventListener("visibilitychange", visibility);
    window.visualViewport?.addEventListener("resize", viewportChange);
    window.visualViewport?.addEventListener("scroll", viewportChange);
    refresh.current = measure;
    measure();
    return () => {
      refresh.current = null;
      finish(false);
      button.removeEventListener("pointerdown", pointerdown);
      button.removeEventListener("pointermove", pointermove);
      button.removeEventListener("pointerup", pointerup);
      button.removeEventListener("pointercancel", pointercancel);
      button.removeEventListener("lostpointercapture", pointercancel);
      button.removeEventListener("click", click, true);
      button.removeEventListener("keydown", keydown);
      button.removeEventListener("keyup", keyup);
      button.removeEventListener("blur", buttonBlur);
      window.removeEventListener("keydown", escape, true);
      window.removeEventListener("blur", cancel);
      window.removeEventListener("resize", viewportChange);
      document.removeEventListener("visibilitychange", visibility);
      window.visualViewport?.removeEventListener("resize", viewportChange);
      window.visualViewport?.removeEventListener("scroll", viewportChange);
      host.removeAttribute("data-draggable");
      shell.removeAttribute("data-entry-compact");
    };
  }, [enabled, config, root, entry, trigger, motion, beginDrag, endDrag, cancelDrag]);

  // 每次 React 提交只重新摆放新出现的气泡/弹窗，不重启手势或持久化。
  useLayoutEffect(() => {
    currentOpen.current = open;
    refresh.current?.();
  });
}
