import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";

/**
 * 防止短时间内多次重定向到同一目标
 *
 * 使用场景：当多个独立的SSE连接同时检测到session失效时，它们各自会触发
 * router.replace("/")，导致重复重定向和页面反复初始化。此工具使用
 * sessionStorage 在短时间窗口内对相同目标的重定向进行去重。
 *
 * @param router - Next.js useRouter() 返回的路由实例
 * @param path - 目标路径
 * @returns true 表示执行了重定向，false 表示被去重跳过
 */

const DEDUP_WINDOW_MS = 2000;
const STORAGE_KEY = "xoxo_last_redirect";

interface RedirectRecord {
  path: string;
  timestamp: number;
}

export function dedupedReplace(router: AppRouterInstance, path: string): boolean {
  try {
    const now = Date.now();
    const stored = sessionStorage.getItem(STORAGE_KEY);

    if (stored) {
      const record: RedirectRecord = JSON.parse(stored);
      // 500ms内相同目标 - 跳过
      if (record.path === path && now - record.timestamp < DEDUP_WINDOW_MS) {
        return false; // 已被去重
      }
    }

    // 记录本次重定向
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ path, timestamp: now }));
    router.replace(path);
    return true; // 执行了重定向
  } catch {
    // sessionStorage不可用（隐私模式等）- 降级为直接执行
    router.replace(path);
    return true;
  }
}
