import { describe, expect, it, vi } from "vitest";
import { createEntryMotionController } from "@/components/agent-entry/agent-entry-behavior";

describe("小人短动作生命周期", () => {
  it("空闲很久后的第一帧从原位开始，点击产生真实位移并归位停止", () => {
    const motion = createEntryMotionController(true);
    const invalidate = vi.fn(); motion.connect(invalidate); motion.setReady();
    expect(motion.start("click")).toBe(true); expect(invalidate).toHaveBeenCalledOnce();
    expect(motion.frame(30000).y).toBe(0);
    const middle = motion.frame(30475);
    expect(middle.y).toBeGreaterThan(0.1); expect(middle.tilt).toBeLessThan(0); expect(middle.active).toBe(true);
    expect(motion.frame(30950)).toEqual({ y: 0, tilt: 0, scale: 1, active: false });
    expect(motion.frame(90000).active).toBe(false);
  });

  it("点击抢占欢迎且不被关注事件提前中断", () => {
    const motion = createEntryMotionController(true); motion.setReady();
    motion.start("welcome"); motion.frame(0);
    motion.start("click"); motion.frame(500);
    expect(motion.start("attention")).toBe(false);
    expect(motion.start("welcome")).toBe(false);
    expect(motion.frame(975).y).toBeGreaterThan(0.1);
  });

  it("加载时不积压动作，生日静态，减少动态与隐藏立即取消且不补播", () => {
    const motion = createEntryMotionController(true);
    expect(motion.start("click")).toBe(false); motion.setReady();
    expect(motion.frame(100).active).toBe(false);
    motion.start("click"); motion.frame(100); motion.setPreferences(false, false);
    expect(motion.frame(400).active).toBe(false);
    motion.setPreferences(false, true); expect(motion.frame(500).y).toBe(0);
    motion.setPreferences(true, true); expect(motion.start("click")).toBe(false);
    const birthday = createEntryMotionController(false); birthday.setReady();
    expect(birthday.start("welcome")).toBe(false); expect(birthday.start("click")).toBe(false);
  });

  it("断开 root 后不保留帧调度或继续播放", () => {
    const motion = createEntryMotionController(true); const invalidate = vi.fn();
    const disconnect = motion.connect(invalidate); motion.setReady(); motion.start("click");
    disconnect(); invalidate.mockClear();
    expect(motion.start("click")).toBe(false); expect(motion.frame(50).active).toBe(false);
    motion.setPreferences(false, true); expect(invalidate).not.toHaveBeenCalled();
  });
});

describe("小人持续拖拽动作", () => {
  const createReadyMotion = () => {
    const motion = createEntryMotionController(true);
    const invalidate = vi.fn();
    motion.connect(invalidate);
    motion.setReady();
    return { motion, invalidate };
  };

  it("拎起逐帧过渡，水平与纵向速度分别产生有界倾摆，反向不突然跳转", () => {
    const { motion, invalidate } = createReadyMotion();
    expect(motion.beginDrag()).toBe(true);
    expect(invalidate).toHaveBeenCalledOnce();
    expect(motion.frame(30000).y).toBe(0);
    for (let now = 30016; now <= 30160; now += 16) {
      motion.updateDrag(1, 1);
      motion.frame(now);
    }
    const forward = motion.frame(30176);
    expect(forward.y).toBeGreaterThan(0.08);
    expect(forward.y).toBeLessThanOrEqual(0.1);
    expect(forward.roll).toBeGreaterThan(0.09);
    expect(forward.roll).toBeLessThanOrEqual(0.18);
    expect(forward.tilt).toBeGreaterThan(0.07);
    expect(forward.tilt).toBeLessThanOrEqual(0.12);
    motion.updateDrag(-20, -20);
    const turning = motion.frame(30192);
    expect(Math.abs(turning.roll! - forward.roll!)).toBeLessThan(0.07);
    for (let now = 30208; now <= 30400; now += 16) {
      motion.updateDrag(-20, -20);
      motion.frame(now);
    }
    const backward = motion.frame(30416);
    expect(backward.roll).toBeLessThan(-0.15);
    expect(backward.roll).toBeGreaterThanOrEqual(-0.18);
    expect(backward.tilt).toBeLessThan(-0.1);
    expect(backward.tilt).toBeGreaterThanOrEqual(-0.12);
  });

  it("抓住不动时保留拎起姿态并停止续帧，再移动能够唤醒同一个控制器", () => {
    const { motion, invalidate } = createReadyMotion();
    motion.beginDrag(); motion.frame(0); motion.updateDrag(2, 1);
    let pose = motion.frame(16);
    let now = 16;
    while (pose.active && now < 3000) { now += 16; pose = motion.frame(now); }
    expect(pose).toMatchObject({ y: 0.1, tilt: 0, roll: 0, active: false });
    expect(pose.scale).toBeGreaterThan(1);
    expect(motion.frame(30000).active).toBe(false);
    invalidate.mockClear();
    motion.updateDrag(-1, 0);
    expect(invalidate).toHaveBeenCalledOnce();
    const moving = motion.frame(60000);
    expect(moving.active).toBe(true);
    expect(moving.roll).toBeLessThan(0);
    expect(moving.roll).toBeGreaterThan(-0.04);
    expect(moving.y).toBe(0.1);
  });

  it("松手仅将局部姿态在450ms内回稳，结束后不继续绘制", () => {
    const { motion, invalidate } = createReadyMotion();
    motion.beginDrag(); motion.frame(0);
    const held = motion.frame(1000);
    expect(held.active).toBe(false);
    invalidate.mockClear(); motion.endDrag();
    expect(invalidate).toHaveBeenCalledOnce();
    expect(motion.frame(30000).y).toBe(held.y);
    const middle = motion.frame(30225);
    expect(middle.y).toBeGreaterThanOrEqual(0);
    expect(middle.y).toBeLessThan(held.y);
    expect(middle.scale).toBeLessThan(1);
    expect(middle.active).toBe(true);
    expect(motion.frame(30450)).toEqual({ y: 0, tilt: 0, scale: 1, active: false });
    expect(motion.frame(90000).active).toBe(false);
  });

  it("拖拽抢占普通动作且不会被点击打断，放下时关注不抢占而新点击可立即响应", () => {
    const { motion } = createReadyMotion();
    motion.start("click"); motion.frame(0); motion.frame(300);
    expect(motion.beginDrag()).toBe(true);
    expect(motion.start("attention")).toBe(false);
    expect(motion.start("welcome")).toBe(false);
    expect(motion.start("click")).toBe(false);
    motion.endDrag();
    expect(motion.start("attention")).toBe(false);
    expect(motion.start("click")).toBe(true);
    motion.frame(1000);
    expect(motion.frame(1475).y).toBeGreaterThan(0.1);
  });

  it.each(["减少动态", "隐藏", "取消"])("%s 立即清除拖拽和释放，恢复不会补播", (reason) => {
    const { motion } = createReadyMotion();
    for (const phase of ["拖动", "放下"]) {
      motion.beginDrag(); motion.frame(0); motion.frame(100);
      if (phase === "放下") { motion.endDrag(); motion.frame(100); }
      if (reason === "取消") motion.cancelDrag();
      else motion.setPreferences(reason === "减少动态", reason !== "隐藏");
      expect(motion.frame(150)).toEqual({ y: 0, tilt: 0, scale: 1, active: false });
      if (reason !== "取消") expect(motion.beginDrag()).toBe(false);
      motion.setPreferences(false, true);
      motion.updateDrag(10, 10); motion.endDrag();
      expect(motion.frame(200).active).toBe(false);
    }
  });

  it("加载中与生日不积压拖拽，断开root后后续速度和松手不会请求帧", () => {
    for (const enabled of [true, false]) {
      const motion = createEntryMotionController(enabled);
      const invalidate = vi.fn();
      const disconnect = motion.connect(invalidate);
      expect(motion.beginDrag()).toBe(false);
      motion.updateDrag(10, 10); motion.setReady();
      expect(motion.frame(100).active).toBe(false);
      expect(motion.beginDrag()).toBe(enabled);
      disconnect(); invalidate.mockClear();
      motion.updateDrag(10, 10); motion.endDrag(); motion.cancelDrag();
      expect(motion.beginDrag()).toBe(false);
      expect(motion.frame(200)).toEqual({ y: 0, tilt: 0, scale: 1, active: false });
      expect(invalidate).not.toHaveBeenCalled();
    }
  });

  it("无效速度不污染模型变换", () => {
    const { motion } = createReadyMotion();
    motion.beginDrag(); motion.frame(0);
    motion.updateDrag(Number.NaN, Infinity);
    const pose = motion.frame(100);
    expect(pose.tilt).toBe(0); expect(pose.roll).toBe(0);
    expect(Number.isFinite(pose.y)).toBe(true);
  });
});
