"use client";

import Link from "next/link";
import { useState } from "react";

export function AtlasToolbar({
  roomId,
  zoom,
  onZoomChange,
  onAddNote,
  onAddPhoto,
  connectMode,
  onToggleConnectMode,
  connectFrom,
  onClearBoard,
}: {
  roomId: string;
  zoom: number;
  onZoomChange: (z: number) => void;
  onAddNote: () => void;
  onAddPhoto: () => void;
  connectMode: boolean;
  onToggleConnectMode: () => void;
  connectFrom: string | null;
  onClearBoard: () => void;
}) {
  const [showConfirm, setShowConfirm] = useState(false);
  const zoomPct = Math.round(zoom * 100);

  const handleClear = () => {
    onClearBoard();
    setShowConfirm(false);
  };

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-warm-200 bg-white/80 px-4 backdrop-blur">
      <div className="flex items-center gap-3">
        <Link
          href={`/chat/${roomId}`}
          className="rounded-md border border-warm-300 bg-white px-2.5 py-1 text-xs font-medium text-ink/70 hover:bg-warm-100"
        >
          &larr; 返回聊天
        </Link>
        <h1 className="text-sm font-semibold text-ink">Atlas</h1>
        <span className="text-xs text-ink/40">记忆画板</span>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onZoomChange(Math.max(0.25, zoom - 0.25))}
          className="rounded border border-warm-300 bg-white px-2 py-1 text-xs text-ink/70 hover:bg-warm-100"
        >
          &minus;
        </button>
        <span className="min-w-[3rem] text-center text-xs text-ink/60">{zoomPct}%</span>
        <button
          type="button"
          onClick={() => onZoomChange(Math.min(3, zoom + 0.25))}
          className="rounded border border-warm-300 bg-white px-2 py-1 text-xs text-ink/70 hover:bg-warm-100"
        >
          +
        </button>

        <div className="mx-2 h-5 w-px bg-warm-200" />

        <button
          type="button"
          onClick={onAddNote}
          className="rounded-md border border-sage-300 bg-sage-50 px-3 py-1 text-xs font-medium text-sage-700 hover:bg-sage-100"
        >
          + 笔记
        </button>

        <button
          type="button"
          onClick={onAddPhoto}
          className="rounded-md border border-sage-300 bg-sage-50 px-3 py-1 text-xs font-medium text-sage-700 hover:bg-sage-100"
        >
          + 照片
        </button>

        <button
          type="button"
          onClick={onToggleConnectMode}
          className={`rounded-md border px-3 py-1 text-xs font-medium transition ${
            connectMode
              ? "border-amber-400 bg-amber-50 text-amber-700"
              : "border-sage-300 bg-sage-50 text-sage-700 hover:bg-sage-100"
          }`}
        >
          {connectMode
            ? connectFrom
              ? "点击目标元素"
              : "点击起始元素"
            : "连线"}
        </button>

        <div className="mx-2 h-5 w-px bg-warm-200" />

        {!showConfirm ? (
          <button
            type="button"
            onClick={() => setShowConfirm(true)}
            className="rounded-md border border-red-300 bg-white px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
          >
            清空画板
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-xs text-red-600">确认清空？</span>
            <button
              type="button"
              onClick={handleClear}
              className="rounded-md border border-red-400 bg-red-50 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-100"
            >
              确认
            </button>
            <button
              type="button"
              onClick={() => setShowConfirm(false)}
              className="rounded-md border border-warm-300 bg-white px-2 py-1 text-xs text-ink/70 hover:bg-warm-100"
            >
              取消
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
