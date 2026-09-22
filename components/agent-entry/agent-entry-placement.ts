import { z } from "zod";

// 严格 CSP 下连 Zod 的 eval 能力探测也会触发 violation；浏览器统一使用解释执行。
// 必须在构造 object schema 前配置，safeParse 的 jitless 参数无法阻止构造时的探测。
if (typeof window !== "undefined") z.config({ jitless: true });

export const entryPositionKey = "xoxo:agent-entry:position:default:v1";
const placementSchema = z.object({
  version: z.literal(1),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
}).strict();
export type EntryPlacement = z.infer<typeof placementSchema>;
export type EntryPoint = { x: number; y: number };
export type EntryBounds = { width: number; height: number; size: number };

export function readEntryPlacement(): EntryPlacement | null {
  try {
    const raw = localStorage.getItem(entryPositionKey);
    if (!raw || raw.length > 256) return null;
    const result = placementSchema.safeParse(JSON.parse(raw));
    return result.success ? result.data : null;
  } catch { return null; }
}

export function saveEntryPlacement(placement: EntryPlacement) {
  try { localStorage.setItem(entryPositionKey, JSON.stringify(placement)); } catch { /* 存储被禁用时仍保留本次挂载中的位置。 */ }
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
function axisBounds(length: number, size: number) {
  const margin = Math.min(12, Math.max(0, (length - size) / 2));
  return { min: margin, span: Math.max(0, length - size - margin * 2) };
}
export function clampEntryPoint(point: EntryPoint, bounds: EntryBounds): EntryPoint {
  const x = axisBounds(bounds.width, bounds.size);
  const y = axisBounds(bounds.height, bounds.size);
  return { x: clamp(point.x, x.min, x.min + x.span), y: clamp(point.y, y.min, y.min + y.span) };
}
export function placementToPoint(placement: EntryPlacement, bounds: EntryBounds): EntryPoint {
  const x = axisBounds(bounds.width, bounds.size);
  const y = axisBounds(bounds.height, bounds.size);
  return { x: x.min + placement.x * x.span, y: y.min + placement.y * y.span };
}
export function pointToPlacement(point: EntryPoint, bounds: EntryBounds): EntryPlacement {
  const x = axisBounds(bounds.width, bounds.size);
  const y = axisBounds(bounds.height, bounds.size);
  return { version: 1, x: x.span ? clamp((point.x - x.min) / x.span, 0, 1) : 0.5, y: y.span ? clamp((point.y - y.min) / y.span, 0, 1) : 0.5 };
}
