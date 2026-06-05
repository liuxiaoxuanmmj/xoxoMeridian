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
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-[#e8e8e8] bg-white px-5">
      <div className="flex items-center gap-3">
        <Link
          href={`/chat/${roomId}`}
          className="rounded-[10px] border border-[#d9d9d9] bg-white px-3 py-1.5 text-xs font-medium text-black/60 transition-colors duration-200 hover:bg-neutral-50 focus:ring-2 focus:ring-[#3a5b22]/15 focus:outline-none cursor-pointer"
        >
          &larr; 返回聊天
        </Link>
        <h1 className="text-sm font-semibold text-black">Atlas</h1>
        <span className="text-xs text-black/40">记忆画板</span>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onZoomChange(Math.max(0.25, zoom - 0.25))}
          className="rounded-[8px] border border-[#d9d9d9] bg-white px-2 py-1 text-xs text-black/60 transition-colors duration-200 hover:bg-neutral-50 focus:ring-2 focus:ring-[#3a5b22]/15 focus:outline-none cursor-pointer"
        >
          &minus;
        </button>
        <span className="min-w-[3rem] text-center text-xs text-black/50">{zoomPct}%</span>
        <button
          type="button"
          onClick={() => onZoomChange(Math.min(3, zoom + 0.25))}
          className="rounded-[8px] border border-[#d9d9d9] bg-white px-2 py-1 text-xs text-black/60 transition-colors duration-200 hover:bg-neutral-50 focus:ring-2 focus:ring-[#3a5b22]/15 focus:outline-none cursor-pointer"
        >
          +
        </button>

        <div className="mx-2 h-5 w-px bg-[#e8e8e8]" />

        <button
          type="button"
          onClick={onAddNote}
          className="rounded-[10px] border border-[#d9d9d9] bg-white px-3 py-1 text-xs font-medium text-[#3a5b22] transition-colors duration-200 hover:bg-[#3a5b22] hover:text-white focus:ring-2 focus:ring-[#3a5b22]/15 focus:outline-none cursor-pointer"
        >
          + 笔记
        </button>

        <button
          type="button"
          onClick={onAddPhoto}
          className="rounded-[10px] border border-[#d9d9d9] bg-white px-3 py-1 text-xs font-medium text-[#3a5b22] transition-colors duration-200 hover:bg-[#3a5b22] hover:text-white focus:ring-2 focus:ring-[#3a5b22]/15 focus:outline-none cursor-pointer"
        >
          + 照片
        </button>

        <button
          type="button"
          onClick={onToggleConnectMode}
          className={`rounded-[10px] border px-3 py-1 text-xs font-medium transition-colors duration-200 focus:ring-2 focus:ring-[#3a5b22]/15 focus:outline-none cursor-pointer ${
            connectMode
              ? "border-amber-400 bg-amber-50 text-amber-700"
              : "border-[#d9d9d9] bg-white text-[#3a5b22] hover:bg-[#3a5b22] hover:text-white"
          }`}
        >
          {connectMode
            ? connectFrom
              ? "点击目标元素"
              : "点击起始元素"
            : "连线"}
        </button>

        <div className="mx-2 h-5 w-px bg-[#e8e8e8]" />

        {!showConfirm ? (
          <button
            type="button"
            onClick={() => setShowConfirm(true)}
            className="rounded-[10px] border border-red-200 bg-white px-3 py-1 text-xs font-medium text-red-600 transition-colors duration-200 hover:bg-red-50 focus:ring-2 focus:ring-red-500/15 focus:outline-none cursor-pointer"
          >
            清空画板
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-xs text-red-600">确认清空？</span>
            <button
              type="button"
              onClick={handleClear}
              className="rounded-[10px] border border-red-300 bg-red-50 px-2 py-1 text-xs font-medium text-red-700 transition-colors duration-200 hover:bg-red-100 focus:ring-2 focus:ring-red-500/15 focus:outline-none cursor-pointer"
            >
              确认
            </button>
            <button
              type="button"
              onClick={() => setShowConfirm(false)}
              className="rounded-[10px] border border-[#d9d9d9] bg-white px-2 py-1 text-xs text-black/60 transition-colors duration-200 hover:bg-neutral-50 focus:ring-2 focus:ring-[#3a5b22]/15 focus:outline-none cursor-pointer"
            >
              取消
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
