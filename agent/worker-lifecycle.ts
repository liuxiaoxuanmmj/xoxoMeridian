/**
 * Worker 生命周期原语：一个可等待的停止信号，以及可被它唤醒的 sleep。
 * 二者都不接触进程、Prisma 或环境变量，因此可以直接在 Node 层验证行为。
 */

export type StopController = {
  readonly signal: AbortSignal;
  readonly stopped: boolean;
  stop(): void;
};

export function createStopController(): StopController {
  const controller = new AbortController();
  return {
    signal: controller.signal,
    get stopped() {
      return controller.signal.aborted;
    },
    stop() {
      controller.abort();
    },
  };
}

/**
 * 等待 `ms` 毫秒，或在停止信号到达时立即返回。停止分支会清除挂起的定时器，
 * 否则已停止的进程会被 sleep 继续钉住，直到睡眠结束都无法退出。
 */
export function interruptibleSleep(ms: number, stop?: StopController): Promise<void> {
  if (stop?.stopped) return Promise.resolve();

  return new Promise<void>((resolve) => {
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      stop?.signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    stop?.signal.addEventListener("abort", onAbort, { once: true });
  });
}
