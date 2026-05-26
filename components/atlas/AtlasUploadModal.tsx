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
              <img
                src={preview}
                alt="Preview"
                className="w-full rounded-md object-cover"
                style={{ maxHeight: 240 }}
              />
              <button
                type="button"
                className="absolute right-2 top-2 rounded bg-black/40 px-2 py-0.5 text-xs text-white hover:bg-black/60"
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
              className="flex h-32 w-full items-center justify-center rounded-md border-2 border-dashed border-warm-300 bg-warm-50 text-sm text-ink/40 hover:border-sage-400 hover:text-sage-600"
            >
              点击选择图片（JPG / PNG / WebP，≤5MB）
            </button>
          )}
        </div>

        <div>
          <label className="text-xs font-medium text-ink/60">标注（可选）</label>
          <input
            type="text"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            maxLength={200}
            className="mt-1 w-full rounded border border-warm-300 bg-white px-3 py-1.5 text-sm text-ink outline-none focus:border-sage-400 focus:ring-1 focus:ring-sage-400"
            placeholder="给照片添加一行标注…"
          />
        </div>

        {error && <p className="text-xs text-red-500">{error}</p>}

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
