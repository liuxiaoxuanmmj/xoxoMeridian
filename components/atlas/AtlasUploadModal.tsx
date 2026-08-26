"use client";

import { useRef, useState } from "react";
import { BaseModal, ModalActions } from "@/components/chat/BaseModal";
import type { AtlasElementData } from "@/components/atlas/types";

export function AtlasUploadModal({
  isOpen,
  onClose,
  onUploaded,
}: {
  isOpen: boolean;
  onClose: () => void;
  onUploaded: (element: AtlasElementData) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setError("");
    const url = URL.createObjectURL(f);
    setPreview(url);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    setBusy(true);
    setError("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("caption", caption);
      formData.append("x", "0");
      formData.append("y", "0");

      const resp = await fetch(`/api/atlas/uploads`, {
        method: "POST",
        body: formData,
      });

      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        throw new Error(data.error ?? `Upload failed: ${resp.status}`);
      }

      const { element } = await resp.json();
      onUploaded(element);
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleClose = () => {
    if (preview) URL.revokeObjectURL(preview);
    setFile(null);
    setPreview(null);
    setCaption("");
    setError("");
    onClose();
  };

  return (
    <BaseModal isOpen={isOpen} onClose={handleClose} title="上传照片">
      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        <div>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleFileChange}
            className="hidden"
          />
          {preview ? (
            <div className="relative">
              {/* Blob previews are local-only and must bypass the Next image optimizer. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={preview}
                alt="Preview"
                className="w-full rounded-[8px] object-cover"
                style={{ maxHeight: 240 }}
              />
              <button
                type="button"
                className="absolute right-2 top-2 rounded-[6px] bg-black/40 px-2 py-0.5 text-xs text-white transition-colors duration-200 hover:bg-black/60 cursor-pointer"
                onClick={() => {
                  URL.revokeObjectURL(preview);
                  setFile(null);
                  setPreview(null);
                }}
              >
                重选
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="flex h-32 w-full items-center justify-center rounded-[10px] border-2 border-dashed border-[#d9d9d9] bg-[#fafbfc] text-sm text-black/40 transition-colors duration-200 hover:border-[#3a5b22] hover:text-[#3a5b22] cursor-pointer"
            >
              点击选择图片（JPG / PNG / WebP，≤5MB）
            </button>
          )}
        </div>

        <div>
          <label className="text-sm font-medium text-black/70">标注（可选）</label>
          <input
            type="text"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            maxLength={200}
            className="mt-1 w-full rounded-[10px] border border-[#d9d9d9] bg-white px-4 py-3 text-[15px] leading-normal outline-none transition-colors duration-200 focus:border-[#3a5b22] focus:ring-2 focus:ring-[#3a5b22]/15"
            placeholder="给照片添加一行标注…"
          />
        </div>

        {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm leading-relaxed text-red-700">{error}</p>}

        <ModalActions
          busy={busy}
          onCancel={handleClose}
          submitLabel="上传"
          busyLabel="上传中…"
        />
      </form>
    </BaseModal>
  );
}
