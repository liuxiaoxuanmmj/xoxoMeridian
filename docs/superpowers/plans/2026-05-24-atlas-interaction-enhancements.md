# Atlas 画板交互增强 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix drag regression bug and add four interaction enhancements (caption click-to-edit, quick-connect, right-click context menu, photo delete verification).

**Architecture:** All changes are in 6 existing React components under `components/atlas/`. No new files, no DB changes, no new API endpoints. The drag fix addresses a timing race between pointer events, React state, and SSE snapshots. The interaction features add click detection, context menu, and upload position support.

**Tech Stack:** React 18, Next.js, TypeScript, Tailwind CSS

---

### Task 1: Fix drag regression — onPointerUp drops final position

**Files:**
- Modify: `components/atlas/AtlasElement.tsx:127-140`

- [ ] **Step 1: Fix onPointerUp to always send final position**

In `components/atlas/AtlasElement.tsx`, the `onPointerUp` callback has a throttle guard that skips the final `onDrag` call if < 100ms since the last send. Remove the guard so the final position always updates React state.

Change the `onPointerUp` callback from:

```typescript
  const onPointerUp = useCallback(() => {
    if (!dragRef.current.active) return;
    dragRef.current.active = false;
    setIsDragging(false);
    const { currentX, currentY, lastSend } = dragRef.current;

    // If we haven't sent a drag update recently, send one now to ensure cache is fresh
    const now = Date.now();
    if (now - lastSend >= DRAG_THROTTLE_MS) {
      onDragRef.current(element.id, currentX, currentY);
    }

    onDragEndRef.current(element.id, currentX, currentY);
  }, [element.id]);
```

to:

```typescript
  const onPointerUp = useCallback(() => {
    if (!dragRef.current.active) return;
    dragRef.current.active = false;
    setIsDragging(false);
    const { currentX, currentY } = dragRef.current;

    onDragRef.current(element.id, currentX, currentY);
    onDragEndRef.current(element.id, currentX, currentY);
  }, [element.id]);
```

- [ ] **Step 2: Commit**

```bash
git add components/atlas/AtlasElement.tsx
git commit -m "fix(atlas): always send final drag position in onPointerUp"
```

---

### Task 2: Fix drag regression — onElementDragEnd state update + delayed localDragIds removal

**Files:**
- Modify: `components/atlas/AtlasApp.tsx:111-126`

- [ ] **Step 1: Add setElements and delay localDragIds removal**

In `components/atlas/AtlasApp.tsx`, change `onElementDragEnd` from:

```typescript
  const onElementDragEnd = useCallback(
    async (id: string, x: number, y: number) => {
      fetch(`/api/atlas/drag`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ elementId: id, x, y }),
      }).catch(() => {});
      await fetch(`/api/atlas/elements/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ x, y }),
      }).catch(() => {});
      localDragIds.current.delete(id);
    },
    []
  );
```

to:

```typescript
  const onElementDragEnd = useCallback(
    async (id: string, x: number, y: number) => {
      setElements((prev) => prev.map((el) => (el.id === id ? { ...el, x, y } : el)));
      fetch(`/api/atlas/drag`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ elementId: id, x, y }),
      }).catch(() => {});
      await fetch(`/api/atlas/elements/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ x, y }),
      }).catch(() => {});
      setTimeout(() => localDragIds.current.delete(id), 1000);
    },
    []
  );
```

- [ ] **Step 2: Commit**

```bash
git add components/atlas/AtlasApp.tsx
git commit -m "fix(atlas): update React state in dragEnd and delay localDragIds removal"
```

---

### Task 3: Feature 40 — PolaroidCard click-to-edit caption

**Files:**
- Modify: `components/atlas/PolaroidCard.tsx:44-68`

- [ ] **Step 1: Change onDoubleClick to onClick and add data attribute**

In `components/atlas/PolaroidCard.tsx`, change the caption area (lines 44-68) from:

```tsx
      {/* Caption area in Polaroid bottom */}
      <div className="absolute bottom-1.5 left-2 right-6">
        {editingCaption ? (
          <input
            className="w-full bg-transparent text-xs text-ink/60 outline-none"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            onBlur={commitCaption}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === "Escape") commitCaption();
            }}
            autoFocus
            maxLength={200}
          />
        ) : (
          <p
            className="truncate text-xs text-ink/50"
            onDoubleClick={(e) => {
              e.stopPropagation();
              setEditingCaption(true);
            }}
          >
            {element.caption || <span className="italic text-ink/20">添加标注…</span>}
          </p>
        )}
      </div>
```

to:

```tsx
      {/* Caption area in Polaroid bottom */}
      <div className="absolute bottom-1.5 left-2 right-6" data-caption-area>
        {editingCaption ? (
          <input
            className="w-full bg-transparent text-xs text-ink/60 outline-none"
            data-caption-area
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            onBlur={commitCaption}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === "Escape") commitCaption();
            }}
            autoFocus
            maxLength={200}
          />
        ) : (
          <p
            className="truncate text-xs text-ink/50 cursor-text"
            data-caption-area
            onClick={(e) => {
              e.stopPropagation();
              setEditingCaption(true);
            }}
          >
            {element.caption || <span className="italic text-ink/20">添加备注…</span>}
          </p>
        )}
      </div>
```

- [ ] **Step 2: Commit**

```bash
git add components/atlas/PolaroidCard.tsx
git commit -m "feat(atlas): caption click-to-edit with data-caption-area"
```

---

### Task 4: Feature 40 — NoteCard click-to-edit

**Files:**
- Modify: `components/atlas/NoteCard.tsx:44-56`

- [ ] **Step 1: Change onDoubleClick to onClick and add data attribute**

In `components/atlas/NoteCard.tsx`, change the content display area (lines 44-56) from:

```tsx
        <div
          className="min-h-[3rem] whitespace-pre-wrap text-sm text-ink/80"
          onDoubleClick={(e) => {
            e.stopPropagation();
            setEditing(true);
          }}
        >
          {element.content || (
            <span className="italic text-ink/30">双击编辑…</span>
          )}
        </div>
```

to:

```tsx
        <div
          className="min-h-[3rem] whitespace-pre-wrap text-sm text-ink/80 cursor-text"
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
```

Also add `data-note-area` to the textarea (line 32-41):

```tsx
        <textarea
          ref={textareaRef}
          className="w-full resize-none bg-transparent text-sm text-ink outline-none"
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
```

- [ ] **Step 2: Commit**

```bash
git add components/atlas/NoteCard.tsx
git commit -m "feat(atlas): note click-to-edit with data-note-area"
```

---

### Task 5: Feature 40/43 — AtlasElement skip drag for interactive areas

**Files:**
- Modify: `components/atlas/AtlasElement.tsx:60-95`

- [ ] **Step 1: Add interactive area checks to onPointerDown**

In `components/atlas/AtlasElement.tsx`, the `onPointerDown` callback currently handles connectMode at the top. Add checks to skip drag for caption areas, note areas, and delete buttons. Change from:

```typescript
  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (connectMode) {
        e.stopPropagation();
        onClick(element.id);
        return;
      }

      e.stopPropagation();
      const target = e.currentTarget;
```

to:

```typescript
  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const hit = e.target as HTMLElement;
      if (hit.closest('[data-caption-area]') || hit.closest('[data-note-area]') || hit.closest('button[title="删除"]')) {
        return;
      }

      if (connectMode) {
        e.stopPropagation();
        onClick(element.id);
        return;
      }

      e.stopPropagation();
      const target = e.currentTarget;
```

- [ ] **Step 2: Commit**

```bash
git add components/atlas/AtlasElement.tsx
git commit -m "feat(atlas): skip drag for caption, note, and delete button areas"
```

---

### Task 6: Feature 41 — Distinguish click vs drag in AtlasElement

**Files:**
- Modify: `components/atlas/AtlasElement.tsx:33-50,60-95,98-140`

- [ ] **Step 1: Add click detection fields to dragRef and record start position/time**

In `components/atlas/AtlasElement.tsx`, expand the dragRef type and initial value. Change from:

```typescript
  const dragRef = useRef<{
    active: boolean;
    offsetX: number;
    offsetY: number;
    lastSend: number;
    currentX: number;
    currentY: number;
  }>({
    active: false,
    offsetX: 0,
    offsetY: 0,
    lastSend: 0,
    currentX: element.x,
    currentY: element.y,
  });
```

to:

```typescript
  const dragRef = useRef<{
    active: boolean;
    offsetX: number;
    offsetY: number;
    lastSend: number;
    currentX: number;
    currentY: number;
    startClientX: number;
    startClientY: number;
    downTime: number;
  }>({
    active: false,
    offsetX: 0,
    offsetY: 0,
    lastSend: 0,
    currentX: element.x,
    currentY: element.y,
    startClientX: 0,
    startClientY: 0,
    downTime: 0,
  });
```

- [ ] **Step 2: Record start position and time in onPointerDown**

In the `onPointerDown` callback, after the interactive area checks and before `target.setPointerCapture`, add the recording. Change the section that starts with `e.stopPropagation();` from:

```typescript
      e.stopPropagation();
      const target = e.currentTarget;
      target.setPointerCapture(e.pointerId);

      const parentTransform = target.parentElement;
      if (!parentTransform) return;

      const rect = parentTransform.getBoundingClientRect();
      const scale = rect.width > 0 ? parentTransform.clientWidth / rect.width : 1;

      const offsetX = (e.clientX - rect.left) * scale - element.x;
      const offsetY = (e.clientY - rect.top) * scale - element.y;

      const z = getNextZIndex();
      setLocalZ(z);
      setIsDragging(true);
      onDragStart(element.id);

      dragRef.current = {
        active: true,
        offsetX,
        offsetY,
        lastSend: 0,
        currentX: element.x,
        currentY: element.y,
      };
```

to:

```typescript
      e.stopPropagation();
      const target = e.currentTarget;
      target.setPointerCapture(e.pointerId);

      const parentTransform = target.parentElement;
      if (!parentTransform) return;

      const rect = parentTransform.getBoundingClientRect();
      const scale = rect.width > 0 ? parentTransform.clientWidth / rect.width : 1;

      const offsetX = (e.clientX - rect.left) * scale - element.x;
      const offsetY = (e.clientY - rect.top) * scale - element.y;

      const z = getNextZIndex();
      setLocalZ(z);
      setIsDragging(true);
      onDragStart(element.id);

      dragRef.current = {
        active: true,
        offsetX,
        offsetY,
        lastSend: 0,
        currentX: element.x,
        currentY: element.y,
        startClientX: e.clientX,
        startClientY: e.clientY,
        downTime: Date.now(),
      };
```

- [ ] **Step 3: Detect click in onPointerUp and call onClick instead of dragEnd**

Change `onPointerUp` (already modified in Task 1) from:

```typescript
  const onPointerUp = useCallback(() => {
    if (!dragRef.current.active) return;
    dragRef.current.active = false;
    setIsDragging(false);
    const { currentX, currentY } = dragRef.current;

    onDragRef.current(element.id, currentX, currentY);
    onDragEndRef.current(element.id, currentX, currentY);
  }, [element.id]);
```

to:

```typescript
  const onClickRef = useRef(onClick);
  useEffect(() => { onClickRef.current = onClick; }, [onClick]);

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.active) return;
    dragRef.current.active = false;
    setIsDragging(false);
    const { currentX, currentY, startClientX, startClientY, downTime } = dragRef.current;

    const dist = Math.hypot(e.clientX - startClientX, e.clientY - startClientY);
    const duration = Date.now() - downTime;

    if (dist < 5 && duration < 300) {
      onClickRef.current(element.id);
      return;
    }

    onDragRef.current(element.id, currentX, currentY);
    onDragEndRef.current(element.id, currentX, currentY);
  }, [element.id]);
```

Note: The `onPointerUp` signature now takes the event parameter `(e: React.PointerEvent<HTMLDivElement>)` — make sure the JSX also passes it. The current JSX `onPointerUp={onPointerUp}` already does this since React passes the event automatically.

- [ ] **Step 4: Commit**

```bash
git add components/atlas/AtlasElement.tsx
git commit -m "feat(atlas): detect click vs drag for quick-connect"
```

---

### Task 7: Feature 41 — Quick-connect logic in AtlasApp

**Files:**
- Modify: `components/atlas/AtlasApp.tsx:26-27,169-192`

- [ ] **Step 1: Add quick-connect timeout ref**

In `components/atlas/AtlasApp.tsx`, after the existing `connectFrom` state declaration (line 27), add a timeout ref:

```typescript
  const [connectFrom, setConnectFrom] = useState<string | null>(null);
  const connectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
```

- [ ] **Step 2: Rewrite onElementClick to support quick-connect without connectMode**

Change `onElementClick` from:

```typescript
  const onElementClick = useCallback(
    async (id: string) => {
      if (!connectMode) return;
      if (!connectFrom) {
        setConnectFrom(id);
        return;
      }
      if (connectFrom === id) {
        setConnectFrom(null);
        return;
      }
      const resp = await fetch(`/api/atlas/connections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromId: connectFrom, toId: id }),
      });
      if (resp.ok) {
        const { connection } = await resp.json();
        setConnections((prev) => [...prev, connection]);
      }
      setConnectFrom(null);
    },
    [connectMode, connectFrom]
  );
```

to:

```typescript
  const onElementClick = useCallback(
    async (id: string) => {
      if (!connectFrom) {
        setConnectFrom(id);
        if (connectTimeoutRef.current) clearTimeout(connectTimeoutRef.current);
        if (!connectMode) {
          connectTimeoutRef.current = setTimeout(() => {
            setConnectFrom(null);
            connectTimeoutRef.current = null;
          }, 1500);
        }
        return;
      }
      if (connectFrom === id) {
        if (connectTimeoutRef.current) { clearTimeout(connectTimeoutRef.current); connectTimeoutRef.current = null; }
        setConnectFrom(null);
        return;
      }
      if (connectTimeoutRef.current) { clearTimeout(connectTimeoutRef.current); connectTimeoutRef.current = null; }
      const resp = await fetch(`/api/atlas/connections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromId: connectFrom, toId: id }),
      });
      if (resp.ok) {
        const { connection } = await resp.json();
        setConnections((prev) => [...prev, connection]);
      }
      setConnectFrom(null);
    },
    [connectMode, connectFrom]
  );
```

- [ ] **Step 3: Clear timeout when toggling connectMode off**

In the `onToggleConnectMode` handler in the JSX (line 226-229), change from:

```tsx
        onToggleConnectMode={() => {
          setConnectMode((v) => !v);
          setConnectFrom(null);
        }}
```

to:

```tsx
        onToggleConnectMode={() => {
          setConnectMode((v) => !v);
          setConnectFrom(null);
          if (connectTimeoutRef.current) { clearTimeout(connectTimeoutRef.current); connectTimeoutRef.current = null; }
        }}
```

- [ ] **Step 4: Commit**

```bash
git add components/atlas/AtlasApp.tsx
git commit -m "feat(atlas): quick-connect without toolbar button"
```

---

### Task 8: Feature 42 — Right-click context menu in AtlasCanvas

**Files:**
- Modify: `components/atlas/AtlasCanvas.tsx:11-41,55-68,139-214`

- [ ] **Step 1: Add onContextMenu callback prop to AtlasCanvas**

In `components/atlas/AtlasCanvas.tsx`, add a new prop to the component signature. In the props type (after `connectFrom: string | null;`), add:

```typescript
  onContextMenu?: (screenX: number, screenY: number, canvasX: number, canvasY: number) => void;
```

And in the destructured props (after `connectFrom,`), add:

```typescript
  onContextMenu: onContextMenuProp,
```

- [ ] **Step 2: Add onContextMenu handler to the container div**

In the container `<div>` JSX (around line 139), add the `onContextMenu` handler. Add it after `onPointerUp={onPointerUp}`:

```tsx
      onContextMenu={(e) => {
        if (!onContextMenuProp) return;
        if (e.target !== e.currentTarget && !(e.target as HTMLElement).dataset.canvasBg) return;
        e.preventDefault();
        const rect = containerRef.current!.getBoundingClientRect();
        const canvasX = (e.clientX - rect.left - vpRef.current.x) / vpRef.current.zoom;
        const canvasY = (e.clientY - rect.top - vpRef.current.y) / vpRef.current.zoom;
        onContextMenuProp(e.clientX, e.clientY, canvasX, canvasY);
      }}
```

- [ ] **Step 3: Commit**

```bash
git add components/atlas/AtlasCanvas.tsx
git commit -m "feat(atlas): forward right-click context menu from canvas"
```

---

### Task 9: Feature 42 — Context menu state and rendering in AtlasApp

**Files:**
- Modify: `components/atlas/AtlasApp.tsx`

- [ ] **Step 1: Add context menu state**

In `components/atlas/AtlasApp.tsx`, after the `connectTimeoutRef` declaration (added in Task 7), add:

```typescript
  const [contextMenu, setContextMenu] = useState<{ screenX: number; screenY: number; canvasX: number; canvasY: number } | null>(null);
  const [uploadPosition, setUploadPosition] = useState<{ x: number; y: number } | null>(null);
```

- [ ] **Step 2: Add context menu handler and pass to AtlasCanvas**

Add a callback for the context menu after the existing callbacks (e.g., after `getNextZIndex`):

```typescript
  const onCanvasContextMenu = useCallback(
    (screenX: number, screenY: number, canvasX: number, canvasY: number) => {
      setContextMenu({ screenX, screenY, canvasX, canvasY });
    },
    []
  );
```

In the `<AtlasCanvas>` JSX, add the prop after `connectFrom={connectFrom}`:

```tsx
        onContextMenu={onCanvasContextMenu}
```

- [ ] **Step 3: Add close-menu effect**

After the `onCanvasContextMenu` definition, add an effect to close the menu on click-outside, scroll, or Escape:

```typescript
  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("pointerdown", close);
    window.addEventListener("wheel", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("wheel", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [contextMenu]);
```

- [ ] **Step 4: Render context menu and handle actions**

In the JSX return, after `<AtlasUploadModal ... />` and before the closing `</div>`, add the context menu:

```tsx
      {contextMenu && (
        <div
          className="fixed z-50 min-w-[140px] overflow-hidden rounded-lg border border-warm-200 bg-white shadow-lg"
          style={{ left: contextMenu.screenX, top: contextMenu.screenY }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-ink/80 hover:bg-warm-50"
            onClick={() => {
              setUploadPosition({ x: contextMenu.canvasX, y: contextMenu.canvasY });
              setUploadOpen(true);
              setContextMenu(null);
            }}
          >
            <span className="text-base">&#128247;</span> + 照片
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-ink/80 hover:bg-warm-50"
            onClick={() => {
              onAddNote(contextMenu.canvasX, contextMenu.canvasY);
              setContextMenu(null);
            }}
          >
            <span className="text-base">&#128221;</span> + 便签
          </button>
        </div>
      )}
```

- [ ] **Step 5: Update onUploaded to use uploadPosition**

Change the `<AtlasUploadModal>` JSX from:

```tsx
      <AtlasUploadModal
        isOpen={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onUploaded={(element) => {
          const vp = viewportRef.current;
          const cx = -vp.x / vp.zoom + window.innerWidth / 2 / vp.zoom;
          const cy = -vp.y / vp.zoom + window.innerHeight / 2 / vp.zoom;
          setElements((prev) => [...prev, { ...element, x: cx, y: cy }]);
        }}
      />
```

to:

```tsx
      <AtlasUploadModal
        isOpen={uploadOpen}
        onClose={() => { setUploadOpen(false); setUploadPosition(null); }}
        onUploaded={(element) => {
          if (uploadPosition) {
            setElements((prev) => [...prev, { ...element, x: uploadPosition.x, y: uploadPosition.y }]);
          } else {
            const vp = viewportRef.current;
            const cx = -vp.x / vp.zoom + window.innerWidth / 2 / vp.zoom;
            const cy = -vp.y / vp.zoom + window.innerHeight / 2 / vp.zoom;
            setElements((prev) => [...prev, { ...element, x: cx, y: cy }]);
          }
          setUploadPosition(null);
        }}
      />
```

- [ ] **Step 6: Commit**

```bash
git add components/atlas/AtlasApp.tsx
git commit -m "feat(atlas): right-click context menu for adding photos and notes"
```

---

### Task 10: Smoke test all features

- [ ] **Step 1: Start dev server**

```bash
cd /home/dadalv/xoxoMeridian && npm run dev
```

- [ ] **Step 2: Verify drag regression fix**

Open Atlas page in browser. Drag a photo/note and release. Confirm it stays at the dropped position without snapping back. Repeat 5+ times to check the probabilistic issue is resolved.

- [ ] **Step 3: Verify caption click-to-edit (Feature 40)**

Click on a photo's "添加备注…" text. Confirm input appears immediately on single click (no double-click needed). Type text, press Enter. Confirm it persists after page reload.

- [ ] **Step 4: Verify note click-to-edit**

Click on a note's "点击编辑…" text. Confirm textarea appears on single click. Type text, press Escape. Confirm it persists.

- [ ] **Step 5: Verify quick-connect (Feature 41)**

Without clicking the toolbar "连线" button: click on one element (quick tap, no drag), then within 1.5s click another element. Confirm a connection line appears between them. Wait >1.5s after clicking the first element — confirm the highlight ring disappears (timeout). Also verify the toolbar connect mode still works for continuous multi-connection.

- [ ] **Step 6: Verify right-click context menu (Feature 42)**

Right-click on canvas blank area. Confirm menu appears with "+ 照片" and "+ 便签". Click "+ 便签" — confirm note appears at click position (not viewport center). Click "+ 照片" — upload an image — confirm it appears at the right-click position. Right-click on an element — confirm no context menu appears (only browser default or nothing).

- [ ] **Step 7: Verify photo delete (Feature 43)**

Create a photo with connections. Click the × button on the photo. Confirm photo is removed along with all its connections. Confirm no console errors.

- [ ] **Step 8: Final commit if any adjustments were needed**

```bash
git add -A
git commit -m "fix(atlas): smoke test adjustments"
```
