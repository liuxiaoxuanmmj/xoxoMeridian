import type { AtlasBoardSnapshot, AtlasElementData, OptimisticOp } from "@/components/atlas/types";

const TTL_MS = {
  update: 2000,
  delete: 5000,
  drag: 3000,
  deleteConn: 5000,
} as const;

export function reconcileOps(
  ops: OptimisticOp[],
  snapshot: AtlasBoardSnapshot
): OptimisticOp[] {
  if (ops.length === 0) return ops;

  const serverElementIds = new Set(snapshot.elements.map((e) => e.id));
  const serverElementMap = new Map<string, AtlasElementData>(
    snapshot.elements.map((e) => [e.id, e])
  );
  const serverConnIds = new Set(snapshot.connections.map((c) => c.id));
  const now = Date.now();

  const remaining = ops.filter((op): boolean => {
    switch (op.type) {
      case "add":
        return !serverElementIds.has(op.id);

      case "update":
        if (!serverElementIds.has(op.id)) return false;
        return now - op.ts < TTL_MS.update;

      case "delete":
        if (!serverElementIds.has(op.id)) return false;
        return now - op.ts < TTL_MS.delete;

      case "drag": {
        if (!serverElementIds.has(op.id)) return false;
        const serverEl = serverElementMap.get(op.id);
        if (
          serverEl &&
          Math.abs(serverEl.x - op.x) < 1 &&
          Math.abs(serverEl.y - op.y) < 1
        ) {
          return false;
        }
        return now - op.ts < TTL_MS.drag;
      }

      case "addConn":
        return !serverConnIds.has(op.id);

      case "deleteConn":
        if (!serverConnIds.has(op.id)) return false;
        return now - op.ts < TTL_MS.deleteConn;
    }
  });

  return remaining.length === ops.length ? ops : remaining;
}

export function pushOp(ops: OptimisticOp[], newOp: OptimisticOp): OptimisticOp[] {
  if (newOp.type === "drag" || newOp.type === "update") {
    for (let i = ops.length - 1; i >= 0; i--) {
      if (ops[i].type === newOp.type && ops[i].id === newOp.id) {
        const copy = [...ops];
        copy[i] = newOp;
        return copy;
      }
    }
  }
  return [...ops, newOp];
}
