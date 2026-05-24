"use client";

import { useCallback, useRef, useState, useEffect } from "react";

import type { AtlasElementData } from "@/components/atlas/types";
import { NoteCard } from "@/components/atlas/NoteCard";
import { PolaroidCard } from "@/components/atlas/PolaroidCard";

const DRAG_THROTTLE_MS = 100;

export function AtlasElement({
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
  }>({
    active: false,
    offsetX: 0,
    offsetY: 0,
    lastSend: 0,
    currentX: element.x,
    currentY: element.y,
  });

  const onDragRef = useRef(onDrag);
  const onDragEndRef = useRef(onDragEnd);

  useEffect(() => {
    onDragRef.current = onDrag;
    onDragEndRef.current = onDragEnd;
  }, [onDrag, onDragEnd]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
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

      // Update position via inline style for performance (no React state update per frame)
      target.style.transform = `translate3d(${x}px, ${y}px, 0) rotate(${element.rotation}deg)`;

      const now = Date.now();
      if (now - dragRef.current.lastSend >= DRAG_THROTTLE_MS) {
        dragRef.current.lastSend = now;
        onDragRef.current(element.id, x, y);
      }
    },
    [element.id, element.rotation]
  );

  const onPointerUp = useCallback(() => {
    if (!dragRef.current.active) return;
    dragRef.current.active = false;
    setIsDragging(false);
    const { currentX, currentY } = dragRef.current;

    onDragRef.current(element.id, currentX, currentY);
    onDragEndRef.current(element.id, currentX, currentY);
  }, [element.id]);

  return (
    <div
      className={`absolute select-none ${connectMode ? "cursor-pointer" : "cursor-grab active:cursor-grabbing"} ${
        isConnectFrom ? "ring-2 ring-amber-400 ring-offset-2" : ""
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
