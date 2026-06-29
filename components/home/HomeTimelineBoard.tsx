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
import { buildTimelineFocusIntervals } from "@/lib/study";

export function HomeTimelineBoard({
  posts,
  currentUserId,
  initialSnapshot,
  focusSessions,
}: {
  posts: TimelinePost[];
  currentUserId: string;
  initialSnapshot: HomeBoardSnapshot;
  focusSessions?: Array<{
    id: string;
    userId: string;
    startedAt: string;
    endedAt: string;
    actualMinutes: number;
    user?: { displayName: string } | null;
  }>;
}) {
  const boardRef = useRef<HTMLDivElement>(null);
  const anchorsRef = useRef(new Map<string, HomeAnchor>());
  const [boardRect, setBoardRect] = useState<DOMRect | null>(null);
  const [elements, setElements] = useState(initialSnapshot.elements);
  const [connections, setConnections] = useState<AtlasConnectionData[]>(initialSnapshot.connections);
  const [connectFromId, setConnectFromId] = useState<string | null>(null);
  const connectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [contextMenu, setContextMenu] = useState<HomeContextMenuState | null>(null);
  const [uploadPosition, setUploadPosition] = useState<{ x: number; y: number } | null>(null);

  // Search state
  const searchParams = useSearchParams();
  const q = searchParams.get("q")?.trim() ?? "";
  const [searchResults, setSearchResults] = useState<TimelinePost[] | null>(null);

  useEffect(() => {
    if (!q) {
      setSearchResults(null);
      return;
    }

    const controller = new AbortController();

    fetch(`/api/posts?q=${encodeURIComponent(q)}&limit=50`, { signal: controller.signal })
      .then((res) => res.json())
      .then((data) => {
        setSearchResults(data.posts ?? []);
      })
      .catch((err) => {
        if (err.name !== "AbortError") {
          console.error("Search failed:", err);
          setSearchResults(null);
        }
      });

    return () => {
      controller.abort();
    };
  }, [q]);

  const displayPosts = q ? (searchResults ?? posts) : posts;
  const emptyMessage = q && searchResults !== null && searchResults.length === 0
    ? "No posts match your search."
    : undefined;

  const focusIntervals = useMemo(
    () => focusSessions ? buildTimelineFocusIntervals(focusSessions) : [],
    [focusSessions]
  );

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
    anchorsRef.current.set(id, { id, kind: "post", getRect });
    refreshBoardRect();
    return () => {
      anchorsRef.current.delete(id);
    };
  }, [refreshBoardRect]);

  const registerPhotoAnchor = useCallback((id: string, getRect: () => DOMRect | null) => {
    anchorsRef.current.set(id, { id, kind: "photo", getRect });
    refreshBoardRect();
    return () => {
      anchorsRef.current.delete(id);
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
        anchors={anchorsRef.current}
        photos={photos}
        connections={connections}
        connectFromId={connectFromId}
        contextMenu={contextMenu}
        onSelectElement={selectElement}
        onMovePhoto={(id, x, y) => updatePhoto(id, { x, y })}
        onMovePhotoEnd={(id, x, y) => {
          updatePhoto(id, { x, y });
          void patchElement(id, { x, y });
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

      <main className="relative z-20 mx-auto max-w-3xl px-6 py-12">
        <Timeline
          posts={displayPosts}
          currentUserId={currentUserId}
          focusIntervals={focusIntervals}
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
