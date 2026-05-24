"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";

import type { AtlasElementData, AtlasConnectionData } from "@/components/atlas/types";
import { AtlasElement } from "@/components/atlas/AtlasElement";
import { AtlasConnection } from "@/components/atlas/AtlasConnection";

type Viewport = { x: number; y: number; zoom: number };

export function AtlasCanvas({
  elements,
  connections,
  viewport,
  onViewportChange,
  onElementDragStart,
  onElementDrag,
  onElementDragEnd,
  onElementUpdate,
  onElementDelete,
  onElementClick,
  onConnectionDelete,
  getNextZIndex,
  connectMode,
  connectFrom,
  onContextMenu: onContextMenuProp,
}: {
  elements: AtlasElementData[];
  connections: AtlasConnectionData[];
  viewport: Viewport;
  onViewportChange: (v: Viewport) => void;
  onElementDragStart: (id: string) => void;
  onElementDrag: (id: string, x: number, y: number) => void;
  onElementDragEnd: (id: string, x: number, y: number) => void;
  onElementUpdate: (id: string, patch: Partial<AtlasElementData>) => void;
  onElementDelete: (id: string) => void;
  onElementClick: (id: string) => void;
  onConnectionDelete: (id: string) => void;
  getNextZIndex: () => number;
  connectMode: boolean;
  connectFrom: string | null;
  onContextMenu?: (screenX: number, screenY: number, canvasX: number, canvasY: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const vpRef = useRef(viewport);
  vpRef.current = viewport;
  const onViewportChangeRef = useRef(onViewportChange);
  onViewportChangeRef.current = onViewportChange;
  const panRef = useRef<{ active: boolean; startX: number; startY: number; vpX: number; vpY: number }>({
    active: false,
    startX: 0,
    startY: 0,
    vpX: 0,
    vpY: 0,
  });

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.target !== e.currentTarget && !(e.target as HTMLElement).dataset.canvasBg) return;
      panRef.current = {
        active: true,
        startX: e.clientX,
        startY: e.clientY,
        vpX: vpRef.current.x,
        vpY: vpRef.current.y,
      };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    []
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!panRef.current.active) return;
      const dx = e.clientX - panRef.current.startX;
      const dy = e.clientY - panRef.current.startY;
      onViewportChangeRef.current({
        ...vpRef.current,
        x: panRef.current.vpX + dx,
        y: panRef.current.vpY + dy,
      });
    },
    []
  );

  const onPointerUp = useCallback(() => {
    panRef.current.active = false;
  }, []);

  // Use native wheel listener to prevent browser zoom
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const vp = vpRef.current;
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      const newZoom = Math.max(0.25, Math.min(3, vp.zoom + delta));
      if (newZoom === vp.zoom) return;

      const rect = container.getBoundingClientRect();
      const cursorX = e.clientX - rect.left;
      const cursorY = e.clientY - rect.top;

      const scale = newZoom / vp.zoom;
      const newX = cursorX - scale * (cursorX - vp.x);
      const newY = cursorY - scale * (cursorY - vp.y);

      onViewportChangeRef.current({ x: newX, y: newY, zoom: newZoom });
    };

    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      container.removeEventListener("wheel", handleWheel);
    };
  }, []);

  const margin = 200;
  const screenW = typeof window !== "undefined" ? window.innerWidth : 1920;
  const screenH = typeof window !== "undefined" ? window.innerHeight : 1080;

  const visibleElements = useMemo(() => {
    const vpLeft = -viewport.x / viewport.zoom - margin;
    const vpTop = -viewport.y / viewport.zoom - margin;
    const vpRight = vpLeft + screenW / viewport.zoom + margin * 2;
    const vpBottom = vpTop + screenH / viewport.zoom + margin * 2;
    return elements.filter(
      (el) => el.x + el.width > vpLeft && el.x < vpRight && el.y + el.height > vpTop && el.y < vpBottom
    );
  }, [elements, viewport.x, viewport.y, viewport.zoom, screenW, screenH]);

  const elementsById = useMemo(() => new Map(elements.map((el) => [el.id, el])), [elements]);

  const visibleIds = useMemo(() => new Set(visibleElements.map((el) => el.id)), [visibleElements]);
  const visibleConnections = useMemo(
    () => connections.filter((c) => visibleIds.has(c.fromId) || visibleIds.has(c.toId)),
    [connections, visibleIds]
  );

  return (
    <div
      ref={containerRef}
      className="relative flex-1 cursor-grab overflow-hidden active:cursor-grabbing"
      style={{
        touchAction: "none",
        backgroundImage: `
          repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(139,115,85,0.03) 3px, rgba(139,115,85,0.03) 4px),
          repeating-linear-gradient(90deg, transparent, transparent 3px, rgba(139,115,85,0.03) 3px, rgba(139,115,85,0.03) 4px),
          repeating-linear-gradient(45deg, transparent, transparent 6px, rgba(139,115,85,0.015) 6px, rgba(139,115,85,0.015) 7px)
        `,
        backgroundColor: "#f5f0e8",
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onContextMenu={(e) => {
        if (!onContextMenuProp) return;
        if (e.target !== e.currentTarget && !(e.target as HTMLElement).dataset.canvasBg) return;
        e.preventDefault();
        const rect = containerRef.current!.getBoundingClientRect();
        const canvasX = (e.clientX - rect.left - vpRef.current.x) / vpRef.current.zoom;
        const canvasY = (e.clientY - rect.top - vpRef.current.y) / vpRef.current.zoom;
        onContextMenuProp(e.clientX, e.clientY, canvasX, canvasY);
      }}
    >
      {/* Pan/zoom transform layer */}
      <div
        data-canvas-bg="true"
        style={{
          transform: `translate3d(${viewport.x}px, ${viewport.y}px, 0) scale(${viewport.zoom})`,
          transformOrigin: "0 0",
          willChange: "transform",
          position: "absolute",
          top: 0,
          left: 0,
        }}
      >
        {/* SVG connection layer */}
        <svg
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "1px",
            height: "1px",
            overflow: "visible",
            pointerEvents: "none",
          }}
        >
          {visibleConnections.map((conn) => {
            const fromEl = elementsById.get(conn.fromId);
            const toEl = elementsById.get(conn.toId);
            if (!fromEl || !toEl) return null;
            return (
              <AtlasConnection
                key={conn.id}
                connection={conn}
                fromEl={fromEl}
                toEl={toEl}
                onDelete={onConnectionDelete}
              />
            );
          })}
        </svg>

        {/* Element layer */}
        {visibleElements.map((el) => (
          <AtlasElement
            key={el.id}
            element={el}
            onDragStart={onElementDragStart}
            onDrag={onElementDrag}
            onDragEnd={onElementDragEnd}
            onUpdate={onElementUpdate}
            onDelete={onElementDelete}
            onClick={onElementClick}
            getNextZIndex={getNextZIndex}
            connectMode={connectMode}
            isConnectFrom={connectFrom === el.id}
          />
        ))}
      </div>
    </div>
  );
}
