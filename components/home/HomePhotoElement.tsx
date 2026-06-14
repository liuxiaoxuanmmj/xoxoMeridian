"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { HomePhotoElementData } from "@/components/home/types";
import { clampPhotoSize } from "@/lib/home-spatial";

export function HomePhotoElement({
  element,
  selected,
  onSelect,
  onMove,
  onMoveEnd,
  onResizeEnd,
  onCaption,
  onDelete,
  registerAnchor,
}: {
  element: HomePhotoElementData;
  selected: boolean;
  onSelect: (id: string) => void;
  onMove: (id: string, x: number, y: number) => void;
  onMoveEnd: (id: string, x: number, y: number) => void;
  onResizeEnd: (id: string, width: number, height: number) => void;
  onCaption: (id: string, caption: string) => void;
  onDelete: (id: string) => void;
  registerAnchor: (id: string, getRect: () => DOMRect | null) => () => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [caption, setCaption] = useState(element.caption ?? "");
  const [editingCaption, setEditingCaption] = useState(false);
  const dragRef = useRef({
    active: false,
    resizing: false,
    startClientX: 0,
    startClientY: 0,
    startX: element.x,
    startY: element.y,
    startWidth: element.width,
    aspectRatio: element.width / Math.max(element.height, 1),
    downTime: 0,
  });

  useEffect(() => {
    return registerAnchor(element.id, () => rootRef.current?.getBoundingClientRect() ?? null);
  }, [element.id, registerAnchor]);

  const commitCaption = () => {
    setEditingCaption(false);
    if (caption !== (element.caption ?? "")) {
      onCaption(element.id, caption);
    }
  };

  const onPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest("[data-caption-area]") || target.closest("button")) return;

    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      ...dragRef.current,
      active: true,
      resizing: false,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: element.x,
      startY: element.y,
      downTime: Date.now(),
    };
  }, [element.x, element.y]);

  const onResizePointerDown = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      ...dragRef.current,
      active: true,
      resizing: true,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startWidth: element.width,
      aspectRatio: element.width / Math.max(element.height, 1),
    };
  }, [element.width, element.height]);

  const onPointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.active || dragRef.current.resizing) return;
    const dx = event.clientX - dragRef.current.startClientX;
    const dy = event.clientY - dragRef.current.startClientY;
    onMove(element.id, dragRef.current.startX + dx, dragRef.current.startY + dy);
  }, [element.id, onMove]);

  const onPointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.active || dragRef.current.resizing) return;
    dragRef.current.active = false;
    const dx = event.clientX - dragRef.current.startClientX;
    const dy = event.clientY - dragRef.current.startClientY;
    const dist = Math.hypot(dx, dy);
    const duration = Date.now() - dragRef.current.downTime;

    if (dist < 5 && duration < 300) {
      onSelect(element.id);
      return;
    }

    onMoveEnd(element.id, dragRef.current.startX + dx, dragRef.current.startY + dy);
  }, [element.id, onMoveEnd, onSelect]);

  const onResizePointerMove = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragRef.current.active || !dragRef.current.resizing) return;
    const dx = event.clientX - dragRef.current.startClientX;
    const size = clampPhotoSize({
      width: dragRef.current.startWidth + dx,
      aspectRatio: dragRef.current.aspectRatio,
    });
    rootRef.current?.style.setProperty("--home-photo-width", `${size.width}px`);
    rootRef.current?.style.setProperty("--home-photo-height", `${size.height}px`);
  }, []);

  const onResizePointerUp = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragRef.current.active || !dragRef.current.resizing) return;
    dragRef.current.active = false;
    dragRef.current.resizing = false;
    const dx = event.clientX - dragRef.current.startClientX;
    const size = clampPhotoSize({
      width: dragRef.current.startWidth + dx,
      aspectRatio: dragRef.current.aspectRatio,
    });
    onResizeEnd(element.id, size.width, size.height);
  }, [element.id, onResizeEnd]);

  return (
    <div
      ref={rootRef}
      data-home-photo
      className={`home-photo-element absolute select-none ${selected ? "is-selected" : ""}`}
      style={{
        left: element.x,
        top: element.y,
        width: "var(--home-photo-width)",
        height: "var(--home-photo-height)",
        ["--home-photo-width" as string]: `${element.width}px`,
        ["--home-photo-height" as string]: `${element.height}px`,
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <div className="home-photo-card">
        <img
          src={element.imageUrl}
          alt={element.caption ?? ""}
          className="pointer-events-none h-full w-full rounded-[8px] object-cover"
          draggable={false}
        />

        <div className="home-photo-caption" data-caption-area>
          {editingCaption ? (
            <input
              value={caption}
              onChange={(event) => setCaption(event.target.value)}
              onBlur={commitCaption}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === "Escape") commitCaption();
              }}
              className="w-full bg-transparent text-xs text-black/60 outline-none"
              data-caption-area
              autoFocus
              maxLength={200}
            />
          ) : (
            <button
              type="button"
              className="block w-full truncate text-left text-xs text-black/45 cursor-text"
              data-caption-area
              onClick={(event) => {
                event.stopPropagation();
                setEditingCaption(true);
              }}
            >
              {element.caption || "添加标注…"}
            </button>
          )}
        </div>

        <button
          type="button"
          className="home-photo-delete"
          onClick={(event) => {
            event.stopPropagation();
            onDelete(element.id);
          }}
          title="删除"
        >
          &times;
        </button>

        <button
          type="button"
          className="home-photo-resize"
          onPointerDown={onResizePointerDown}
          onPointerMove={onResizePointerMove}
          onPointerUp={onResizePointerUp}
          title="调整大小"
        />
      </div>
    </div>
  );
}
