import { afterEach, describe, expect, it, vi } from "vitest";

import { createStopController, interruptibleSleep } from "@/agent/worker-lifecycle";

afterEach(() => {
  vi.useRealTimers();
});

describe("worker 生命周期 - 停止信号", () => {
  it("stop 幂等，且停止后 stopped 与 signal.aborted 同步为真", () => {
    const stop = createStopController();
    expect(stop.stopped).toBe(false);
    expect(stop.signal.aborted).toBe(false);

    stop.stop();
    stop.stop();

    expect(stop.stopped).toBe(true);
    expect(stop.signal.aborted).toBe(true);
  });
});

describe("worker 生命周期 - 可唤醒 sleep", () => {
  it("未停止时睡满给定时长", async () => {
    vi.useFakeTimers();
    const stop = createStopController();
    let done = false;
    const sleep = interruptibleSleep(30_000, stop).then(() => {
      done = true;
    });

    await vi.advanceTimersByTimeAsync(29_000);
    expect(done).toBe(false);

    await vi.advanceTimersByTimeAsync(1_500);
    await sleep;
    expect(done).toBe(true);
  });

  it("停止时立即返回并清除挂起的定时器", async () => {
    vi.useFakeTimers();
    const stop = createStopController();
    let done = false;
    const sleep = interruptibleSleep(60_000, stop).then(() => {
      done = true;
    });
    expect(vi.getTimerCount()).toBe(1);

    stop.stop();

    // 未清除的定时器会把已停止的进程继续钉住，直到睡眠自然结束。
    expect(vi.getTimerCount()).toBe(0);
    await sleep;
    expect(done).toBe(true);
  });

  it("已停止的信号上 sleep 立即返回且不注册定时器", async () => {
    vi.useFakeTimers();
    const stop = createStopController();
    stop.stop();

    await expect(interruptibleSleep(60_000, stop)).resolves.toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
  });
});
