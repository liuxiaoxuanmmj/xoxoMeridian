"use client";

import { useCallback, useEffect, useRef } from "react";

type BaseModalProps = {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
};

export function BaseModal({ isOpen, onClose, title, children }: BaseModalProps) {
  const backdropRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (!isOpen) return;
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      onClick={(e) => {
        if (e.target === backdropRef.current) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-ink">{title}</h2>
        {children}
      </div>
    </div>
  );
}

type ModalActionsProps = {
  busy: boolean;
  onCancel: () => void;
  submitLabel?: string;
  busyLabel?: string;
};

export function ModalActions({
  busy,
  onCancel,
  submitLabel = "保存",
  busyLabel = "保存中…",
}: ModalActionsProps) {
  return (
    <div className="flex gap-2 pt-2">
      <button
        type="button"
        onClick={onCancel}
        disabled={busy}
        className="flex-1 rounded border border-warm-300 bg-white px-4 py-2 text-sm font-medium text-ink/70 hover:bg-warm-50 disabled:opacity-50"
      >
        取消
      </button>
      <button
        type="submit"
        disabled={busy}
        className="flex-1 rounded bg-sage-600 px-4 py-2 text-sm font-medium text-white hover:bg-sage-700 disabled:opacity-50"
      >
        {busy ? busyLabel : submitLabel}
      </button>
    </div>
  );
}
