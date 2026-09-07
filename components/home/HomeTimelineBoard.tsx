"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { AtlasConnectionData } from "@/components/atlas/types";
import { Timeline } from "@/components/blog/Timeline";
import type { TimelinePost } from "@/components/blog/Timeline";
import { HomeSpatialLayer } from "@/components/home/HomeSpatialLayer";
import { HomeUploadModal } from "@/components/home/HomeUploadModal";
import type { HomeAnchor, HomeBoardSnapshot, HomeContextMenuState, HomePhotoElementData, HomeSpatialElementData } from "@/components/home/types";
import { isHomeBlankTarget } from "@/lib/home-spatial";

type PhotoMove = { x: number; y: number };
type PhotoMoveQueue = { pending: PhotoMove | null; running: boolean };
type PhotoMoveSaveState = PhotoMove & { status: "saving" | "failed" };

export function HomeTimelineBoard({
  posts,
  currentUserId,
  initialSnapshot,
}: {
  posts: TimelinePost[];
  currentUserId: string;
  initialSnapshot: HomeBoardSnapshot;
}) {
  const boardRef = useRef<HTMLDivElement>(null);
  const [anchors, setAnchors] = useState(() => new Map<string, HomeAnchor>());
  const [boardRect, setBoardRect] = useState<DOMRect | null>(null);
  const [elements, setElements] = useState(initialSnapshot.elements);
  const [connections, setConnections] = useState<AtlasConnectionData[]>(initialSnapshot.connections);
  const [connectFromId, setConnectFromId] = useState<string | null>(null);
  const connectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [contextMenu, setContextMenu] = useState<HomeContextMenuState | null>(null);
  const [uploadPosition, setUploadPosition] = useState<{ x: number; y: number } | null>(null);
  const [photoMoveSaveStates, setPhotoMoveSaveStates] = useState<Record<string, PhotoMoveSaveState>>({});
  const photoMoveQueuesRef = useRef(new Map<string, PhotoMoveQueue>());

  // Search state
  const searchParams = useSearchParams();
  const q = searchParams.get("q")?.trim() ?? "";
  const [searchState, setSearchState] = useState<{
    query: string;
    posts: TimelinePost[] | null;
  } | null>(null);

  useEffect(() => {
    if (!q) return;

    const controller = new AbortController();

    fetch(`/api/posts?q=${encodeURIComponent(q)}&limit=50`, { signal: controller.signal })
      .then((res) => res.json())
      .then((data) => {
        setSearchState({ query: q, posts: data.posts ?? [] });
      })
      .catch((err) => {
        if (err.name !== "AbortError") {
          console.error("Search failed:", err);
          setSearchState({ query: q, posts: null });
        }
      });

    return () => {
      controller.abort();
    };
  }, [q]);

  const currentSearchResults = searchState?.query === q ? searchState.posts : null;
  const displayPosts = q ? (currentSearchResults ?? posts) : posts;
  const emptyMessage = q && currentSearchResults !== null && currentSearchResults.length === 0
    ? "No posts match your search."
    : undefined;

  const photos = useMemo(
    () => elements.filter((element): element is HomePhotoElementData => element.type === "photo" && !!element.imageUrl),
    [elements]
  );

  const postElementByPostId = useMemo(() => {
    const result: Record<string, string> = {};
    for (const element of elements) {
      if ("postId" in element && element.postId) {
        result[element.postId] = element.id;
      }
    }
    return result;
  }, [elements]);

  const refreshBoardRect = useCallback(() => {
    setBoardRect(boardRef.current?.getBoundingClientRect() ?? null);
  }, []);

  useEffect(() => {
    refreshBoardRect();
    window.addEventListener("resize", refreshBoardRect);
    window.addEventListener("scroll", refreshBoardRect, { passive: true });
    return () => {
      window.removeEventListener("resize", refreshBoardRect);
      window.removeEventListener("scroll", refreshBoardRect);
    };
  }, [refreshBoardRect]);

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("wheel", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("wheel", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [contextMenu]);

  const registerAnchor = useCallback((id: string, getRect: () => DOMRect | null) => {
    setAnchors((current) => {
      const next = new Map(current);
      next.set(id, { id, kind: "post", getRect });
      return next;
    });
    refreshBoardRect();
    return () => {
      setAnchors((current) => {
        const next = new Map(current);
        next.delete(id);
        return next;
      });
    };
  }, [refreshBoardRect]);

  const registerPhotoAnchor = useCallback((id: string, getRect: () => DOMRect | null) => {
    setAnchors((current) => {
      const next = new Map(current);
      next.set(id, { id, kind: "photo", getRect });
      return next;
    });
    refreshBoardRect();
    return () => {
      setAnchors((current) => {
        const next = new Map(current);
        next.delete(id);
        return next;
      });
    };
  }, [refreshBoardRect]);

  const selectElement = useCallback(async (id: string) => {
    if (!connectFromId) {
      setConnectFromId(id);
      if (connectTimerRef.current) clearTimeout(connectTimerRef.current);
      connectTimerRef.current = setTimeout(() => {
        setConnectFromId(null);
        connectTimerRef.current = null;
      }, 1500);
      return;
    }

    if (connectFromId === id) {
      setConnectFromId(null);
      return;
    }

    if (connectTimerRef.current) {
      clearTimeout(connectTimerRef.current);
      connectTimerRef.current = null;
    }

    const response = await fetch("/api/home-board/connections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fromId: connectFromId, toId: id }),
    });

    if (response.ok) {
      const { connection } = await response.json();
      setConnections((prev) => [...prev, connection]);
    }

    setConnectFromId(null);
  }, [connectFromId]);

  const patchElement = useCallback(async (id: string, patch: Record<string, unknown>) => {
    await fetch(`/api/home-board/elements/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }).catch(() => {});
  }, []);

  const updatePhoto = useCallback((id: string, patch: Partial<HomePhotoElementData>) => {
    setElements((prev) => prev.map((element) => element.id === id ? { ...element, ...patch } as HomeSpatialElementData : element));
  }, []);

  const runPhotoMoveQueue = useCallback(async (id: string) => {
    const queue = photoMoveQueuesRef.current.get(id);
    if (!queue || queue.running) return;

    queue.running = true;
    try {
      while (queue.pending) {
        const target = queue.pending;
        queue.pending = null;
        setPhotoMoveSaveStates((current) => ({
          ...current,
          [id]: { ...target, status: "saving" },
        }));

        let saved = false;
        try {
          const response = await fetch(`/api/home-board/elements/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(target),
          });
          saved = response.ok;
        } catch {
          saved = false;
        }

        if (!saved) {
          if (queue.pending) continue;

          queue.pending = target;
          setPhotoMoveSaveStates((current) => ({
            ...current,
            [id]: { ...target, status: "failed" },
          }));
          return;
        }

        if (queue.pending) continue;

        photoMoveQueuesRef.current.delete(id);
        setPhotoMoveSaveStates((current) => {
          const next = { ...current };
          delete next[id];
          return next;
        });
      }
    } finally {
      queue.running = false;
    }
  }, []);

  const savePhotoMove = useCallback((id: string, x: number, y: number) => {
    const queue = photoMoveQueuesRef.current.get(id) ?? { pending: null, running: false };
    queue.pending = { x, y };
    photoMoveQueuesRef.current.set(id, queue);
    setPhotoMoveSaveStates((current) => ({
      ...current,
      [id]: { x, y, status: "saving" },
    }));
    void runPhotoMoveQueue(id);
  }, [runPhotoMoveQueue]);

  return (
    <div
      ref={boardRef}
      className="home-spatial-board relative"
      onContextMenu={(event) => {
        const target = event.target as HTMLElement;
        if (!isHomeBlankTarget(target)) return;
        const rect = boardRef.current?.getBoundingClientRect();
        if (!rect) return;

        event.preventDefault();
        setContextMenu({
          screenX: event.clientX,
          screenY: event.clientY,
          boardX: event.clientX - rect.left,
          boardY: event.clientY - rect.top,
        });
      }}
    >
      <HomeSpatialLayer
        boardRect={boardRect}
        anchors={anchors}
        photos={photos}
        connections={connections}
        connectFromId={connectFromId}
        contextMenu={contextMenu}
        onSelectElement={selectElement}
        onMovePhoto={(id, x, y) => updatePhoto(id, { x, y })}
        onMovePhotoEnd={(id, x, y) => {
          updatePhoto(id, { x, y });
          savePhotoMove(id, x, y);
        }}
        onResizePhotoEnd={(id, width, height) => {
          updatePhoto(id, { width, height });
          void patchElement(id, { width, height });
        }}
        onCaptionPhoto={(id, caption) => {
          updatePhoto(id, { caption });
          void patchElement(id, { caption });
        }}
        onDeletePhoto={async (id) => {
          setElements((prev) => prev.filter((element) => element.id !== id));
          setConnections((prev) => prev.filter((connection) => connection.fromId !== id && connection.toId !== id));
          await fetch(`/api/home-board/elements/${id}`, { method: "DELETE" }).catch(() => {});
        }}
        onDeleteConnection={async (id) => {
          setConnections((prev) => prev.filter((connection) => connection.id !== id));
          await fetch(`/api/home-board/connections?id=${id}`, { method: "DELETE" }).catch(() => {});
        }}
        onAddPhotoFromMenu={() => {
          if (!contextMenu) return;
          setUploadPosition({ x: contextMenu.boardX, y: contextMenu.boardY });
          setContextMenu(null);
        }}
        registerPhotoAnchor={registerPhotoAnchor}
      />

      {Object.keys(photoMoveSaveStates).length > 0 ? (
        <div className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 flex-col gap-2">
          {Object.entries(photoMoveSaveStates).map(([id, state]) => (
            <div
              key={id}
              className="flex items-center gap-3 rounded-lg border border-black/10 bg-white px-4 py-3 text-sm text-black/70 shadow-lg"
            >
              {state.status === "saving" ? (
                <span role="status">正在保存照片位置…</span>
              ) : (
                <>
                  <span role="alert">照片位置保存失败。</span>
                  <button
                    type="button"
                    className="rounded-md bg-sage-700 px-3 py-1.5 font-medium text-white hover:bg-sage-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sage-700"
                    aria-label="重试保存照片位置"
                    onClick={() => void runPhotoMoveQueue(id)}
                  >
                    重试
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      ) : null}

      <main className="relative z-20 mx-auto max-w-3xl px-6 py-12">
        <Timeline
          posts={displayPosts}
          currentUserId={currentUserId}
          postElementByPostId={postElementByPostId}
          connectFromId={connectFromId}
          onSpatialElementClick={selectElement}
          registerSpatialAnchor={registerAnchor}
          emptyMessage={emptyMessage}
        />
      </main>

      <HomeUploadModal
        isOpen={!!uploadPosition}
        position={uploadPosition}
        onClose={() => setUploadPosition(null)}
        onUploaded={(element) => {
          setElements((prev) => [...prev, element]);
          setUploadPosition(null);
        }}
      />
    </div>
  );
}
