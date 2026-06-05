"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { AtlasBoardSnapshot, AtlasElementData, AtlasConnectionData, OptimisticOp } from "@/components/atlas/types";
import { CameraIcon, EditIcon } from "@/components/icons";
import type { ChatUser } from "@/components/chat/types";
import { AtlasCanvas } from "@/components/atlas/AtlasCanvas";
import { AtlasToolbar } from "@/components/atlas/AtlasToolbar";
import { AtlasUploadModal } from "@/components/atlas/AtlasUploadModal";
import { stableMergeBy } from "@/lib/stable-merge";
import { reconcileOps, pushOp } from "@/lib/atlas-reconcile";

export function AtlasApp({
  roomId,
  currentUser,
  initialSnapshot,
}: {
  roomId: string;
  currentUser: ChatUser;
  initialSnapshot: AtlasBoardSnapshot;
}) {
  // === Server Layer ===
  const [serverElements, setServerElements] = useState<AtlasElementData[]>(initialSnapshot.elements);
  const [serverConnections, setServerConnections] = useState<AtlasConnectionData[]>(initialSnapshot.connections);

  // === Optimistic Layer ===
  const [optimisticOps, setOptimisticOps] = useState<OptimisticOp[]>([]);

  // === UI State ===
  const [viewport, setViewport] = useState({ x: 0, y: 0, zoom: 1 });
  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;
  const [connectMode, setConnectMode] = useState(false);
  const [connectFrom, setConnectFrom] = useState<string | null>(null);
  const connectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [contextMenu, setContextMenu] = useState<{ screenX: number; screenY: number; canvasX: number; canvasY: number } | null>(null);
  const [uploadPosition, setUploadPosition] = useState<{ x: number; y: number } | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const maxZRef = useRef(
    initialSnapshot.elements.reduce((max, el) => Math.max(max, el.zIndex), 0)
  );

  // === Drag refs (performance path, no React state) ===
  const activeDrags = useRef(new Map<string, { x: number; y: number }>());
  const dragSyncTimestamps = useRef(new Map<string, number>());

  // === SSE connection ===
  const reconnectRef = useRef<{ attempt: number; timer: number | null }>({
    attempt: 0,
    timer: null,
  });

  // === Derived render state ===
  const elements = useMemo(() => {
    if (optimisticOps.length === 0) return serverElements;

    const result = [...serverElements];
    const indexById = new Map(result.map((el, i) => [el.id, i]));
    const deletedIds = new Set<string>();

    for (const op of optimisticOps) {
      if (op.type === "add") {
        if (!indexById.has(op.id)) {
          indexById.set(op.id, result.length);
          result.push(op.element);
        }
      } else if (op.type === "update") {
        const i = indexById.get(op.id);
        if (i !== undefined) result[i] = { ...result[i], ...op.patch };
      } else if (op.type === "delete") {
        deletedIds.add(op.id);
      } else if (op.type === "drag") {
        const i = indexById.get(op.id);
        if (i !== undefined) result[i] = { ...result[i], x: op.x, y: op.y };
      }
    }

    return deletedIds.size > 0
      ? result.filter((el) => !deletedIds.has(el.id))
      : result;
  }, [serverElements, optimisticOps]);

  const connections = useMemo(() => {
    if (optimisticOps.length === 0) return serverConnections;

    const deletedElIds = new Set<string>();
    const deletedConnIds = new Set<string>();
    const addedConns: AtlasConnectionData[] = [];
    const existingConnIds = new Set(serverConnections.map((c) => c.id));

    for (const op of optimisticOps) {
      if (op.type === "delete") {
        deletedElIds.add(op.id);
      } else if (op.type === "addConn") {
        if (!existingConnIds.has(op.id)) {
          existingConnIds.add(op.id);
          addedConns.push(op.connection);
        }
      } else if (op.type === "deleteConn") {
        deletedConnIds.add(op.id);
      }
    }

    let result = serverConnections;
    if (deletedConnIds.size > 0 || deletedElIds.size > 0) {
      result = result.filter(
        (c) => !deletedConnIds.has(c.id) && !deletedElIds.has(c.fromId) && !deletedElIds.has(c.toId)
      );
    }
    if (addedConns.length > 0) {
      result = [...result, ...addedConns];
    }

    return result;
  }, [serverConnections, optimisticOps]);

  // === SSE effect ===
  useEffect(() => {
    let cancelled = false;
    let source: EventSource | null = null;

    const connect = () => {
      if (cancelled) return;
      source = new EventSource(`/api/atlas/stream`);

      source.addEventListener("open", () => {
        reconnectRef.current.attempt = 0;
      });

      source.addEventListener("snapshot", (event) => {
        const next = JSON.parse((event as MessageEvent).data) as AtlasBoardSnapshot;
        setServerElements((prev) => stableMergeBy(prev, next.elements, (e) => e.id));
        setServerConnections((prev) => stableMergeBy(prev, next.connections, (c) => c.id));
        setOptimisticOps((ops) => reconcileOps(ops, next));
      });

      source.addEventListener("error", () => {
        if (cancelled) return;
        source?.close();
        source = null;
        const attempt = Math.min(reconnectRef.current.attempt + 1, 6);
        reconnectRef.current.attempt = attempt;
        const delay = Math.min(1000 * 2 ** (attempt - 1), 30_000);
        reconnectRef.current.timer = window.setTimeout(connect, delay);
      });
    };

    connect();

    return () => {
      cancelled = true;
      if (reconnectRef.current.timer !== null) {
        window.clearTimeout(reconnectRef.current.timer);
        reconnectRef.current.timer = null;
      }
      reconnectRef.current.attempt = 0;
      source?.close();
    };
  }, []);

  // === Callbacks ===
  const onElementDragStart = useCallback((id: string) => {
    activeDrags.current.set(id, { x: 0, y: 0 });
  }, []);

  const onElementDrag = useCallback(
    (id: string, x: number, y: number) => {
      const pos = activeDrags.current.get(id);
      if (pos) { pos.x = x; pos.y = y; }
      else { activeDrags.current.set(id, { x, y }); }
      setOptimisticOps((ops) => pushOp(ops, { type: "drag", id, x, y, ts: Date.now() }));
      const now = Date.now();
      const last = dragSyncTimestamps.current.get(id) ?? 0;
      if (now - last >= 100) {
        dragSyncTimestamps.current.set(id, now);
        fetch(`/api/atlas/drag`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ elementId: id, x, y }),
        }).catch(() => {});
      }
    },
    []
  );

  const onElementDragEnd = useCallback(
    async (id: string, x: number, y: number) => {
      activeDrags.current.delete(id);
      setOptimisticOps((ops) => pushOp(ops, { type: "drag", id, x, y, ts: Date.now() }));
      fetch(`/api/atlas/drag`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ elementId: id, x, y }),
      }).catch(() => {});
      await fetch(`/api/atlas/elements/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ x, y }),
      }).catch(() => {});
    },
    []
  );

  const onElementUpdate = useCallback(
    async (id: string, patch: Partial<AtlasElementData>) => {
      setOptimisticOps((ops) => pushOp(ops, { type: "update", id, patch, ts: Date.now() }));
      await fetch(`/api/atlas/elements/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      }).catch(() => {});
    },
    []
  );

  const onElementDelete = useCallback(
    async (id: string) => {
      setOptimisticOps((ops) => [...ops, { type: "delete", id, ts: Date.now() }]);
      await fetch(`/api/atlas/elements/${id}`, { method: "DELETE" }).catch(() => {});
    },
    []
  );

  const onAddNote = useCallback(
    async (x?: number, y?: number) => {
      const vp = viewportRef.current;
      const cx = x ?? -vp.x / vp.zoom + window.innerWidth / 2 / vp.zoom;
      const cy = y ?? -vp.y / vp.zoom + window.innerHeight / 2 / vp.zoom;
      const resp = await fetch(`/api/atlas/elements`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "note", x: cx, y: cy, content: "" }),
      });
      if (resp.ok) {
        const { element } = await resp.json();
        setOptimisticOps((ops) => [...ops, { type: "add", id: element.id, element, ts: Date.now() }]);
      }
    },
    []
  );

  const onElementClick = useCallback(
    async (id: string) => {
      if (!connectFrom) {
        setConnectFrom(id);
        if (connectTimeoutRef.current) clearTimeout(connectTimeoutRef.current);
        if (!connectMode) {
          connectTimeoutRef.current = setTimeout(() => {
            setConnectFrom(null);
            connectTimeoutRef.current = null;
          }, 1500);
        }
        return;
      }
      if (connectFrom === id) {
        if (connectTimeoutRef.current) { clearTimeout(connectTimeoutRef.current); connectTimeoutRef.current = null; }
        setConnectFrom(null);
        return;
      }
      if (connectTimeoutRef.current) { clearTimeout(connectTimeoutRef.current); connectTimeoutRef.current = null; }
      const resp = await fetch(`/api/atlas/connections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromId: connectFrom, toId: id }),
      });
      if (resp.ok) {
        const { connection } = await resp.json();
        setOptimisticOps((ops) => [...ops, { type: "addConn", id: connection.id, connection, ts: Date.now() }]);
      }
      setConnectFrom(null);
    },
    [connectMode, connectFrom]
  );

  const onConnectionDelete = useCallback(
    async (id: string) => {
      setOptimisticOps((ops) => [...ops, { type: "deleteConn", id, ts: Date.now() }]);
      await fetch(`/api/atlas/connections?id=${id}`, { method: "DELETE" }).catch(() => {});
    },
    []
  );

  const onClearBoard = useCallback(async () => {
    const resp = await fetch("/api/atlas", { method: "DELETE" });
    if (resp.ok) {
      setServerElements([]);
      setServerConnections([]);
      setOptimisticOps([]);
    }
  }, []);

  const getNextZIndex = useCallback(() => {
    maxZRef.current += 1;
    return maxZRef.current;
  }, []);

  const onCanvasContextMenu = useCallback(
    (screenX: number, screenY: number, canvasX: number, canvasY: number) => {
      setContextMenu({ screenX, screenY, canvasX, canvasY });
    },
    []
  );

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("pointerdown", close);
    window.addEventListener("wheel", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("wheel", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [contextMenu]);

  return (
    <div className="flex h-screen flex-col bg-[#fafbfc] text-ink">
      <AtlasToolbar
        roomId={roomId}
        zoom={viewport.zoom}
        onZoomChange={(z) => setViewport((v) => ({ ...v, zoom: z }))}
        onAddNote={onAddNote}
        onAddPhoto={() => setUploadOpen(true)}
        connectMode={connectMode}
        onToggleConnectMode={() => {
          setConnectMode((v) => !v);
          setConnectFrom(null);
          if (connectTimeoutRef.current) { clearTimeout(connectTimeoutRef.current); connectTimeoutRef.current = null; }
        }}
        connectFrom={connectFrom}
        onClearBoard={onClearBoard}
      />
      <AtlasCanvas
        elements={elements}
        connections={connections}
        viewport={viewport}
        onViewportChange={setViewport}
        onElementDragStart={onElementDragStart}
        onElementDrag={onElementDrag}
        onElementDragEnd={onElementDragEnd}
        onElementUpdate={onElementUpdate}
        onElementDelete={onElementDelete}
        onElementClick={onElementClick}
        onConnectionDelete={onConnectionDelete}
        getNextZIndex={getNextZIndex}
        connectMode={connectMode}
        connectFrom={connectFrom}
        onContextMenu={onCanvasContextMenu}
      />
      <AtlasUploadModal
        isOpen={uploadOpen}
        onClose={() => { setUploadOpen(false); setUploadPosition(null); }}
        onUploaded={async (element) => {
          let finalX: number, finalY: number;
          if (uploadPosition) {
            finalX = uploadPosition.x;
            finalY = uploadPosition.y;
          } else {
            const vp = viewportRef.current;
            finalX = -vp.x / vp.zoom + window.innerWidth / 2 / vp.zoom;
            finalY = -vp.y / vp.zoom + window.innerHeight / 2 / vp.zoom;
          }
          await fetch(`/api/atlas/elements/${element.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ x: finalX, y: finalY }),
          }).catch(() => {});
          const positioned = { ...element, x: finalX, y: finalY };
          setOptimisticOps((ops) => [...ops, { type: "add", id: element.id, element: positioned, ts: Date.now() }]);
          setUploadPosition(null);
        }}
      />
      {contextMenu && (
        <div
          className="fixed z-50 min-w-[150px] overflow-hidden rounded-[10px] border border-[#e8e8e8] bg-white shadow-lg"
          style={{ left: contextMenu.screenX, top: contextMenu.screenY }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-black/70 transition-colors duration-200 hover:bg-[#fafbfc] cursor-pointer"
            onClick={() => {
              setUploadPosition({ x: contextMenu.canvasX, y: contextMenu.canvasY });
              setUploadOpen(true);
              setContextMenu(null);
            }}
          >
            <CameraIcon size={16} />
            + 照片
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-black/70 transition-colors duration-200 hover:bg-[#fafbfc] cursor-pointer"
            onClick={() => {
              onAddNote(contextMenu.canvasX, contextMenu.canvasY);
              setContextMenu(null);
            }}
          >
            <EditIcon size={16} />
            + 便签
          </button>
        </div>
      )}
    </div>
  );
}
