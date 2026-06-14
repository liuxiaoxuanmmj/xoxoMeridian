"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type PostEditorProps = {
  currentUser: { id: string; displayName: string; avatarLabel: string };
  initialValues?: { title: string; content: string; slug: string };
};

export function PostEditor({ currentUser, initialValues }: PostEditorProps) {
  const router = useRouter();
  const isEditing = !!initialValues;
  const [title, setTitle] = useState(initialValues?.title ?? "");
  const [content, setContent] = useState(initialValues?.content ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError("");

    try {
      const url = isEditing ? `/api/posts/${initialValues!.slug}` : "/api/posts";
      const method = isEditing ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, content }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        setError(payload.error ?? "Failed to save post");
        setSubmitting(false);
        return;
      }

      const payload = await response.json();
      router.push(`/posts/${payload.post.slug}`);
    } catch {
      setError("Request failed. Please try again.");
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (submitting || !initialValues) return;
    setSubmitting(true);
    try {
      const response = await fetch(`/api/posts/${initialValues.slug}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        setError("Failed to delete post");
        setSubmitting(false);
        return;
      }
      router.push("/home");
    } catch {
      setError("Delete failed. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <form onSubmit={submit} className="space-y-6">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Post title"
          required
          disabled={submitting}
          className="w-full rounded-[10px] border border-[#d9d9d9] bg-white px-4 py-3 text-lg font-semibold text-black placeholder:text-black/30 focus:border-[#3a5b22] focus:ring-2 focus:ring-[#3a5b22]/15 focus:outline-none disabled:opacity-50"
        />

        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Write your post in Markdown..."
          required
          disabled={submitting}
          rows={20}
          className="w-full rounded-[10px] border border-[#d9d9d9] bg-white px-4 py-3 text-[15px] leading-relaxed text-black placeholder:text-black/30 font-mono resize-y focus:border-[#3a5b22] focus:ring-2 focus:ring-[#3a5b22]/15 focus:outline-none disabled:opacity-50"
        />

        <div className="flex items-center justify-between">
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={submitting}
              className="rounded-[10px] bg-[#3a5b22] px-6 py-2.5 text-sm font-medium text-white hover:bg-[#2e4a1a] transition-colors disabled:opacity-50"
            >
              {submitting ? "Saving..." : isEditing ? "Update" : "Publish"}
            </button>
            <button
              type="button"
              onClick={() => router.back()}
              disabled={submitting}
              className="rounded-[10px] border border-[#d9d9d9] bg-white px-6 py-2.5 text-sm text-black/60 hover:bg-neutral-50 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
          </div>

          {isEditing && (
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              disabled={submitting}
              className="rounded-[10px] border border-red-200 bg-white px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
            >
              Delete
            </button>
          )}
        </div>
      </form>

      {/* Delete confirmation */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setShowDeleteConfirm(false)}>
          <div className="bg-white rounded-[10px] p-6 shadow-soft max-w-sm w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm text-black mb-4">Are you sure you want to delete this post?</p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="rounded-[10px] border border-[#d9d9d9] bg-white px-4 py-2 text-sm text-black/60 hover:bg-neutral-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="rounded-[10px] bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
