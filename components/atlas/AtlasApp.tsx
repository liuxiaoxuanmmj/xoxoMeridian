"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { AtlasBoardSnapshot, AtlasElementData, AtlasConnectionData } from "@/components/atlas/types";
import type { ChatUser } from "@/components/chat/types";
import { AtlasCanvas } from "@/components/atlas/AtlasCanvas";
import { AtlasToolbar } from "@/components/atlas/AtlasToolbar";
import { AtlasUploadModal } from "@/components/atlas/AtlasUploadModal";
import { stableMergeBy } from "@/lib/stable-merge";

export function AtlasApp({
  roomId,
  currentUser,
  initialSnapshot,
}: {
  roomId: string;
  currentUser: ChatUser;
  initialSnapshot: AtlasBoardSnapshot;
}) {
  const [elements, setElements] = useState<AtlasElementData[]>(initialSnapshot.elements);
  const [connections, setConnections] = useState<AtlasConnectionData[]>(initialSnapshot.connections);
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

  // Track which elements the current user is dragging locally
  const localDragIds = useRef(new Set<string>());
  const localDragTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  // SSE connection
  const reconnectRef = useRef<{ attempt: number; timer: number | null }>({
    attempt: 0,
    timer: null,
  });

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
        setElements((prev) => {
          const merged = stableMergeBy(prev, next.elements, (e) => e.id);
          // Don't overwrite elements the current user is actively dragging
          if (localDragIds.current.size === 0) return merged;
          return merged.map((el) => {
            if (localDragIds.current.has(el.id)) {
              const local = prev.find((p) => p.id === el.id);
              return local ?? el;
            }
            return el;
          });
        });
        setConnections((prev) => stableMergeBy(prev, next.connections, (c) => c.id));
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

  const onElementDragStart = useCallback((id: string) => {
    const prev = localDragTimers.current.get(id);
    if (prev) { clearTimeout(prev); localDragTimers.current.delete(id); }
    localDragIds.current.add(id);
  }, []);

  const onElementDrag = useCallback(
    (id: string, x: number, y: number) => {
      setElements((prev) => prev.map((el) => (el.id === id ? { ...el, x, y } : el)));
      fetch(`/api/atlas/drag`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ elementId: id, x, y }),
      }).catch(() => {});
    },
    []
  );

  const onElementDragEnd = useCallback(
    async (id: string, x: number, y: number) => {
      setElements((prev) => prev.map((el) => (el.id === id ? { ...el, x, y } : el)));
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
      const timer = setTimeout(() => {
        localDragIds.current.delete(id);
        localDragTimers.current.delete(id);
      }, 1000);
      localDragTimers.current.set(id, timer);
    },
    []
  );

  const onElementUpdate = useCallback(
    async (id: string, patch: Partial<AtlasElementData>) => {
      setElements((prev) => prev.map((el) => (el.id === id ? { ...el, ...patch } : el)));
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
      setElements((prev) => prev.filter((el) => el.id !== id));
      setConnections((prev) => prev.filter((c) => c.fromId !== id && c.toId !== id));
      await fetch(`/api/atlas/elements/${id}`, { method: "DELETE" }).catch(
        () => {}
      );
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
        setElements((prev) => [...prev, element]);
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
        setConnections((prev) => [...prev, connection]);
      }
      setConnectFrom(null);
    },
    [connectMode, connectFrom]
  );

  const onConnectionDelete = useCallback(
    async (id: string) => {
      setConnections((prev) => prev.filter((c) => c.id !== id));
      await fetch(`/api/atlas/connections?id=${id}`, {
        method: "DELETE",
      }).catch(() => {});
    },
    []
  );

  const onClearBoard = useCallback(async () => {
    const resp = await fetch("/api/atlas", { method: "DELETE" });
    if (resp.ok) {
      setElements([]);
      setConnections([]);
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
    <div className="flex h-screen flex-col bg-warm-50 text-ink">
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
        onUploaded={(element) => {
          if (uploadPosition) {
            setElements((prev) => [...prev, { ...element, x: uploadPosition.x, y: uploadPosition.y }]);
          } else {
            const vp = viewportRef.current;
            const cx = -vp.x / vp.zoom + window.innerWidth / 2 / vp.zoom;
            const cy = -vp.y / vp.zoom + window.innerHeight / 2 / vp.zoom;
            setElements((prev) => [...prev, { ...element, x: cx, y: cy }]);
          }
          setUploadPosition(null);
        }}
      />
      {contextMenu && (
        <div
          className="fixed z-50 min-w-[140px] overflow-hidden rounded-lg border border-warm-200 bg-white shadow-lg"
          style={{ left: contextMenu.screenX, top: contextMenu.screenY }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-ink/80 hover:bg-warm-50"
            onClick={() => {
              setUploadPosition({ x: contextMenu.canvasX, y: contextMenu.canvasY });
              setUploadOpen(true);
              setContextMenu(null);
            }}
          >
            <span className="text-base">&#128247;</span> + 照片
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-ink/80 hover:bg-warm-50"
            onClick={() => {
              onAddNote(contextMenu.canvasX, contextMenu.canvasY);
              setContextMenu(null);
            }}
          >
            <span className="text-base">&#128221;</span> + 便签
          </button>
        </div>
      )}
    </div>
  );
}
