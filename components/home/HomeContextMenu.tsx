"use client";

import { CameraIcon } from "@/components/icons";
import type { HomeContextMenuState } from "@/components/home/types";

export function HomeContextMenu({
  state,
  onAddPhoto,
}: {
  state: HomeContextMenuState;
  onAddPhoto: () => void;
}) {
  return (
    <div
      data-home-context-menu
      className="fixed z-50 min-w-[150px] overflow-hidden rounded-[10px] border border-[#e8e8e8] bg-white shadow-lg"
      style={{ left: state.screenX, top: state.screenY }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-black/70 transition-colors duration-200 hover:bg-sage-50 cursor-pointer"
        onClick={onAddPhoto}
      >
        <CameraIcon size={16} />
        添加图片
      </button>
    </div>
  );
}
