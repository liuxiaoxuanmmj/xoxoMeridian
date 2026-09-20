"use client";

import { useSyncExternalStore } from "react";

const TICK_MS = 30000;

// 挂钟是组件之外的可变数据源：渲染期不读 Date，只订阅这里缓存的读数。
// 单例 store 让多个 LifePanel 共享同一个定时器，并在最后一个订阅者离开时停表。
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;
let nowMs = 0;

function readNow() {
  nowMs = Date.now();
  return nowMs;
}

function subscribeToWorldClock(listener: () => void) {
  listeners.add(listener);
  if (timer === null) {
    readNow();
    timer = setInterval(() => {
      readNow();
      for (const notify of listeners) notify();
    }, TICK_MS);
  }

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== null) {
      clearInterval(timer);
      timer = null;
      // 停表后不能留下旧读数：客户端导航重新挂载时渲染期就会读到它，画面会
      // 先显示上一次订阅时的时刻。归零让下一次读取重新取当前时间。
      nowMs = 0;
    }
  };
}

function getWorldClockSnapshot() {
  // 客户端导航时组件是首次挂载而非 hydration，此时 store 尚未被订阅过。
  return nowMs === 0 ? readNow() : nowMs;
}

// 服务端快照必须是常量：SSR 与 hydration 都取它，两端文字才必然一致。返回 0 表示
// "尚未知道本地时刻"，由调用方渲染既有占位符，挂载后再补上真实读数。
function getServerWorldClockSnapshot() {
  return 0;
}

/**
 * 浏览器本地时刻（毫秒），每 30 秒推进一次。
 * 首帧在服务端与 hydration 阶段固定为 0，避免两端各自读取挂钟导致文字不一致。
 */
export function useWorldClock(): number {
  return useSyncExternalStore(
    subscribeToWorldClock,
    getWorldClockSnapshot,
    getServerWorldClockSnapshot
  );
}
