type DragEntry = { x: number; y: number; ts: number; userId: string };

const cache = new Map<string, DragEntry>();
const STALE_MS = 5_000;

export function setDragPosition(elementId: string, x: number, y: number, userId: string) {
  sweep();
  cache.set(elementId, { x, y, ts: Date.now(), userId });
}

export function getDragPositions(): ReadonlyMap<string, DragEntry> {
  sweep();
  return cache;
}

export function clearDragPosition(elementId: string) {
  cache.delete(elementId);
}

function sweep() {
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (now - entry.ts > STALE_MS) cache.delete(key);
  }
}
