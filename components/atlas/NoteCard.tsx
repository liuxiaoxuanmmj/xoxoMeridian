"use client";

import { useRef, useState } from "react";
import type { AtlasElementData } from "@/components/atlas/types";

export function NoteCard({
  element,
  onUpdate,
  onDelete,
}: {
  element: AtlasElementData;
  onUpdate: (id: string, patch: Partial<AtlasElementData>) => void;
  onDelete: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(element.content ?? "");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const commitEdit = () => {
    setEditing(false);
    if (text !== (element.content ?? "")) {
      onUpdate(element.id, { content: text });
    }
  };

  return (
    <div
      className="relative rounded-sm border border-amber-200/60 bg-amber-50 shadow-sm"
      style={{ minHeight: 80, padding: "12px 14px 24px" }}
    >
      {editing ? (
        <textarea
          ref={textareaRef}
          className="w-full resize-none bg-transparent text-sm text-ink outline-none break-words"
          data-note-area
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={(e) => {
            if (e.key === "Escape") commitEdit();
          }}
          autoFocus
          rows={4}
        />
      ) : (
        <div
          className="min-h-[3rem] whitespace-pre-wrap break-words text-sm text-ink/80 cursor-text"
          data-note-area
          onClick={(e) => {
            e.stopPropagation();
            setEditing(true);
          }}
        >
          {element.content || (
            <span className="italic text-ink/30">点击编辑…</span>
          )}
        </div>
      )}

      <button
        type="button"
        className="absolute right-1 top-1 rounded p-0.5 text-[10px] text-ink/30 hover:bg-red-100 hover:text-red-500"
        onClick={(e) => {
          e.stopPropagation();
          onDelete(element.id);
        }}
        title="删除"
      >
        &times;
      </button>
    </div>
  );
}
