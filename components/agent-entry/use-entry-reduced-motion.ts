"use client";

import { useSyncExternalStore } from "react";

const reducedMotionQuery = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void) {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const media = window.matchMedia(reducedMotionQuery);
  if (media.addEventListener) {
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }
  media.addListener(onChange);
  return () => media.removeListener(onChange);
}

function snapshot() {
  return typeof window !== "undefined" && !!window.matchMedia && window.matchMedia(reducedMotionQuery).matches;
}

// 订阅运行中的偏好变化；当前 Motion useReducedMotion 只保存初始匹配值。
export function useEntryReducedMotion() {
  return useSyncExternalStore(subscribe, snapshot, () => false);
}
