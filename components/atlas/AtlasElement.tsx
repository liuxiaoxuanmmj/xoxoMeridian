"use client";

import { useCallback, useRef, useState, useEffect, useLayoutEffect, memo } from "react";

import type { AtlasElementData } from "@/components/atlas/types";
import { NoteCard } from "@/components/atlas/NoteCard";
import { PolaroidCard } from "@/components/atlas/PolaroidCard";

function AtlasElementInner({
  element,
  onDragStart,
  onDrag,
  onDragEnd,
  onUpdate,
  onDelete,
  onClick,
  getNextZIndex,
  connectMode,
  isConnectFrom,
}: {
  element: AtlasElementData;
  onDragStart: (id: string) => void;
  onDrag: (id: string, x: number, y: number) => void;
  onDragEnd: (id: string, x: number, y: number) => void;
  onUpdate: (id: string, patch: Partial<AtlasElementData>) => void;
  onDelete: (id: string) => void;
  onClick: (id: string) => void;
  getNextZIndex: () => number;
  connectMode: boolean;
  isConnectFrom: boolean;
}) {
  const [localZ, setLocalZ] = useState(element.zIndex);
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{
    active: boolean;
    offsetX: number;
    offsetY: number;
    lastSend: number;
    currentX: number;
    currentY: number;
    startClientX: number;
    startClientY: number;
    downTime: number;
  }>({
    active: false,
    offsetX: 0,
    offsetY: 0,
    lastSend: 0,
    currentX: element.x,
    currentY: element.y,
    startClientX: 0,
    startClientY: 0,
    downTime: 0,
  });

  const onDragRef = useRef(onDrag);
  const onDragEndRef = useRef(onDragEnd);
  const onUpdateRef = useRef(onUpdate);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const lastReportedHeight = useRef(element.height);

  useEffect(() => {
    onDragRef.current = onDrag;
    onDragEndRef.current = onDragEnd;
    onUpdateRef.current = onUpdate;
  }, [onDrag, onDragEnd, onUpdate]);

  useLayoutEffect(() => {
    if (element.type !== "note") return;
    const el = wrapperRef.current;
    if (!el) return;
    const rendered = el.offsetHeight;
    if (Math.abs(rendered - lastReportedHeight.current) > 10) {
      lastReportedHeight.current = rendered;
      onUpdateRef.current(element.id, { height: rendered });
    }
  }, [element.id, element.type, element.content]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const hit = e.target as HTMLElement;
      if (hit.closest('[data-caption-area]') || hit.closest('[data-note-area]') || hit.closest('button[title="删除"]')) {
        return;
      }

      if (connectMode) {
        e.stopPropagation();
        onClick(element.id);
        return;
      }

      e.stopPropagation();
      const target = e.currentTarget;
      target.setPointerCapture(e.pointerId);

      const parentTransform = target.parentElement;
      if (!parentTransform) return;

      const rect = parentTransform.getBoundingClientRect();
      const scale = rect.width > 0 ? parentTransform.clientWidth / rect.width : 1;

      const offsetX = (e.clientX - rect.left) * scale - element.x;
      const offsetY = (e.clientY - rect.top) * scale - element.y;

      const z = getNextZIndex();
      setLocalZ(z);
      setIsDragging(true);
      onDragStart(element.id);

      dragRef.current = {
        active: true,
        offsetX,
        offsetY,
        lastSend: 0,
        currentX: element.x,
        currentY: element.y,
        startClientX: e.clientX,
        startClientY: e.clientY,
        downTime: Date.now(),
      };
    },
    [element.id, element.x, element.y, connectMode, onClick, getNextZIndex, onDragStart]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragRef.current.active) return;

      const target = e.currentTarget;
      const parentTransform = target.parentElement;
      if (!parentTransform) return;

      const rect = parentTransform.getBoundingClientRect();
      const scale = rect.width > 0 ? parentTransform.clientWidth / rect.width : 1;

      const x = (e.clientX - rect.left) * scale - dragRef.current.offsetX;
      const y = (e.clientY - rect.top) * scale - dragRef.current.offsetY;

      dragRef.current.currentX = x;
      dragRef.current.currentY = y;

      target.style.transform = `translate3d(${x}px, ${y}px, 0) rotate(${element.rotation}deg)`;

      onDragRef.current(element.id, x, y);
    },
    [element.id, element.rotation]
  );

  const onClickRef = useRef(onClick);
  useEffect(() => { onClickRef.current = onClick; }, [onClick]);

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.active) return;
    dragRef.current.active = false;
    setIsDragging(false);
    const { currentX, currentY, startClientX, startClientY, downTime } = dragRef.current;

    const dist = Math.hypot(e.clientX - startClientX, e.clientY - startClientY);
    const duration = Date.now() - downTime;

    if (dist < 5 && duration < 300) {
      onClickRef.current(element.id);
      return;
    }

    onDragRef.current(element.id, currentX, currentY);
    onDragEndRef.current(element.id, currentX, currentY);
  }, [element.id]);

  return (
    <div
      ref={wrapperRef}
      className={`absolute select-none ${connectMode ? "cursor-pointer" : "cursor-grab active:cursor-grabbing"} ${
        isConnectFrom ? "ring-2 ring-[#3a5b22] ring-offset-2" : ""
      }`}
      style={{
        transform: `translate3d(${element.x}px, ${element.y}px, 0) rotate(${element.rotation}deg)`,
        zIndex: isDragging ? localZ : element.zIndex,
        filter: isDragging
          ? "drop-shadow(0 8px 16px rgba(0,0,0,0.18))"
          : "drop-shadow(0 2px 6px rgba(0,0,0,0.10))",
        transition: isDragging ? "filter 0.15s" : "filter 0.15s, transform 0.1s",
        width: element.width,
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {element.type === "note" ? (
        <NoteCard
          element={element}
          onUpdate={onUpdate}
          onDelete={onDelete}
        />
      ) : (
        <PolaroidCard
          element={element}
          onUpdate={onUpdate}
          onDelete={onDelete}
        />
      )}
    </div>
  );
}

export const AtlasElement = memo(AtlasElementInner);
