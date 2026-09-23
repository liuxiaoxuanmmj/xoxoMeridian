export type EntryAction = "welcome" | "attention" | "click";

type EntryPose = { y: number; tilt: number; roll?: number; scale: number; active: boolean };
type DragState = {
  lastFrame: number | null;
  quietMs: number;
  pendingVelocity: { x: number; y: number } | null;
  targetRoll: number;
  targetTilt: number;
};
const durations: Record<EntryAction, number> = { welcome: 850, attention: 650, click: 950 };
const priorities: Record<EntryAction, number> = { welcome: 1, attention: 2, click: 3 };
const restingPose: EntryPose = { y: 0, tilt: 0, scale: 1, active: false };
const clamp = (value: number, limit: number) => Math.max(-limit, Math.min(limit, value));
const approach = (value: number, target: number, delta: number, duration: number) => target + (value - target) * Math.exp(-delta / duration);

/** DOM 与独立 R3F root 的稳定桥梁；不依赖 React 每帧更新或空闲后的 delta。 */
export function createEntryMotionController(enabled: boolean) {
  let ready = false;
  let reduced = false;
  let visible = true;
  let invalidate: (() => void) | undefined;
  let action: { kind: EntryAction; startedAt: number | null } | null = null;
  let drag: DragState | null = null;
  let release: { from: EntryPose; startedAt: number | null } | null = null;
  let pose = restingPose;
  const clear = () => { action = null; drag = null; release = null; pose = restingPose; };
  const canAnimate = () => enabled && ready && !reduced && visible;

  return {
    connect(requestFrame: () => void) {
      invalidate = requestFrame;
      return () => { invalidate = undefined; ready = false; clear(); };
    },
    setReady() { ready = true; },
    setPreferences(nextReduced: boolean, nextVisible: boolean) {
      reduced = nextReduced;
      visible = nextVisible;
      if (reduced || !visible) clear();
      if (visible) invalidate?.();
    },
    start(kind: EntryAction) {
      if (!canAnimate() || drag || (release && kind !== "click")) return false;
      if (action && priorities[action.kind] > priorities[kind]) return false;
      release = null;
      action = { kind, startedAt: null };
      invalidate?.();
      return true;
    },
    beginDrag() {
      if (!canAnimate() || drag) return false;
      action = null;
      release = null;
      drag = { lastFrame: null, quietMs: 0, pendingVelocity: null, targetRoll: 0, targetTilt: 0 };
      invalidate?.();
      return true;
    },
    updateDrag(vx: number, vy: number) {
      if (!drag || !canAnimate()) return;
      drag.pendingVelocity = { x: Number.isFinite(vx) ? vx : 0, y: Number.isFinite(vy) ? vy : 0 };
      invalidate?.();
    },
    endDrag() {
      if (!drag) return;
      drag = null;
      release = { from: pose, startedAt: null };
      invalidate?.();
    },
    cancelDrag() {
      if (!drag && !release) return;
      clear();
      if (visible) invalidate?.();
    },
    frame(now: number) {
      if (!visible || reduced) return restingPose;
      if (drag) {
        const elapsed = drag.lastFrame === null ? 0 : Math.max(0, now - drag.lastFrame);
        // demand 停绘后的新移动仍从当前姿态平滑起步，不把空闲时间算成运动时间。
        const delta = drag.pendingVelocity && !pose.active ? Math.min(elapsed, 32) : elapsed;
        drag.lastFrame = now;
        if (drag.pendingVelocity) {
          drag.targetRoll = clamp(drag.pendingVelocity.x * 0.12, 0.18);
          drag.targetTilt = clamp(drag.pendingVelocity.y * 0.09, 0.12);
          drag.pendingVelocity = null;
          drag.quietMs = 0;
        } else {
          drag.quietMs += delta;
          // 没有新的 pointermove 时自行回中，无需外部定时器持续写入零速度。
          if (drag.quietMs > 64) {
            drag.targetRoll *= Math.exp(-delta / 80);
            drag.targetTilt *= Math.exp(-delta / 80);
          }
        }
        pose = {
          y: approach(pose.y, 0.1, delta, 70),
          tilt: approach(pose.tilt, drag.targetTilt, delta, 85),
          roll: approach(pose.roll ?? 0, drag.targetRoll, delta, 85),
          scale: approach(pose.scale, 1.025, delta, 70),
          active: true,
        };
        const settled = Math.abs(pose.y - 0.1) < 0.0002 && Math.abs(pose.scale - 1.025) < 0.0002
          && Math.abs(pose.tilt) < 0.0002 && Math.abs(pose.roll ?? 0) < 0.0002
          && Math.abs(drag.targetTilt) < 0.0002 && Math.abs(drag.targetRoll) < 0.0002;
        if (settled) pose = { y: 0.1, tilt: 0, roll: 0, scale: 1.025, active: false };
        return pose;
      }
      if (release) {
        release.startedAt ??= now;
        const progress = Math.min(1, Math.max(0, (now - release.startedAt) / 450));
        if (progress === 1) { release = null; pose = restingPose; return pose; }
        const remaining = 1 - progress;
        const ease = remaining ** 3;
        pose = {
          y: release.from.y * ease,
          tilt: release.from.tilt * ease,
          roll: (release.from.roll ?? 0) * ease,
          scale: 1 + (release.from.scale - 1) * remaining - 0.045 * Math.sin(Math.PI * progress) * remaining,
          active: true,
        };
        return pose;
      }
      if (!action) { pose = restingPose; return pose; }
      // 第一帧建立动作自己的起点，30 秒静止后的 Fiber delta 不会跳过动作。
      action.startedAt ??= now;
      const progress = Math.min(1, Math.max(0, (now - action.startedAt) / durations[action.kind]));
      if (progress === 1) { action = null; pose = restingPose; return pose; }
      const arc = Math.sin(Math.PI * progress);
      pose = {
        y: action.kind === "attention" ? 0 : arc * (action.kind === "click" ? 0.16 : 0.085),
        tilt: -arc * (action.kind === "attention" ? 0.14 : 0.075),
        scale: action.kind === "attention" ? 1 : 1 - 0.045 * Math.sin(2 * Math.PI * progress),
        active: true,
      };
      return pose;
    },
  };
}

export type EntryMotionController = ReturnType<typeof createEntryMotionController>;
