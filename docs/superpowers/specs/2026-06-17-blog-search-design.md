# Blog Search Design Spec

## Overview

Add full-text search to the `/home` blog timeline, allowing users to search posts by title and content via a search input in the SiteNav bar. Initial page load behavior and spatial board initialization remain unchanged.

## Architecture

```
HomePage (server)
 ├─ initialPosts ← prisma.post.findMany({ take: 50 })  // unchanged
 ├─ initialSnapshot ← getHomeBoardSnapshot()            // unchanged
 │
 ├── SiteNav (client)
 │    └── SearchInput          ← only renders when pathname === "/home"
 │         ├─ reads ?q= from useSearchParams
 │         └─ debounce 300ms → router.replace('/home?q=...')
 │
 └── HomeTimelineBoard (client)
      ├─ receives initialPosts as prop (always 50 latest)
      ├─ reads ?q= from useSearchParams
      ├─ useEffect when q changes:
      │    ├─ q non-empty → fetch('/api/posts?q=...&limit=50') → setSearchResults
      │    └─ q empty → setSearchResults(null)  // fallback to initialPosts, no request
      └─ displayPosts = q ? searchResults : initialPosts
           └── Timeline (no changes needed)
```

**Key principle**: SiteNav writes to URL; HomeTimelineBoard reads from URL. They communicate exclusively through `?q=`, no shared React state.

## API Change

`GET /api/posts` — add optional `q` parameter:

```typescript
const q = searchParams.get("q")?.trim();
if (q) {
  where.OR = [
    { title: { contains: q, mode: "insensitive" } },
    { content: { contains: q, mode: "insensitive" } },
  ];
}
```

- Fully compatible with existing `type`, `authorId`, `cursor`, `limit` params.
- Uses PostgreSQL `ILIKE` via Prisma `contains` + `mode: "insensitive"`.
- When `q` is empty or missing, no OR condition is added, preserving existing behavior.
- Results include author included relation (same as current GET).

## Frontend Changes

### 1. `components/blog/SiteNav.tsx` — add SearchInput

- Conditionally render when `pathname === "/home"`.
- Controlled input: initialize `defaultValue` from `useSearchParams().get("q")`.
- On change: clear previous debounce timer, set 300ms timeout, then `router.replace(url)`.
- Clear button (×) visible only when input has text; resets URL to `/home` and clears input.
- Encode search terms with `encodeURIComponent` before inserting into URL.

### 2. `components/home/HomeTimelineBoard.tsx` — search state layer

- New state: `const [searchResults, setSearchResults] = useState<TimelinePost[] | null>(null)`.
- Read `searchParams` via `useSearchParams()`.
- `useEffect`: when `q` changes:
  - Empty: `setSearchResults(null)`.
  - Non-empty: `fetch('/api/posts?q=<encoded>&limit=50')` → parse JSON → `setSearchResults(posts)`.
  - On fetch error: `console.error`, keep previous results (do not crash the board).
- `displayPosts = searchParams.get("q") ? searchResults ?? [] : posts`.
- Pass `displayPosts` to `<Timeline>` instead of `posts`.

### 3. No changes to Timeline, PostCard, PostCardSpatialShell

Timeline already renders whatever posts array it receives. PostCardSpatialShell already handles `elementId: undefined` gracefully for posts without spatial elements.

## UI Design

Search input in SiteNav, placed between the nav links ("Blog", "Chat") and the "New Post" button:

- Width `w-48`, expands to `w-56` on focus, `transition-all duration-200`.
- Placholder: "Search posts..."
- Left: magnifying glass icon (`h-3.5 w-3.5`, `text-black/30`).
- Right: clear (×) button, visible only when input non-empty.
- Border: `border-[#d9d9d9]`, becomes `border-[#3a5b22]` on focus.
- Font: `text-xs`, matching rest of SiteNav.
- Empty state in timeline area: "No posts match your search." (rendered when `displayPosts.length === 0 && q`).

## Edge Cases

| Scenario | Handling |
|---|---|
| Special chars in query (`/`, `?`, `&`) | `encodeURIComponent` before URL insertion |
| Rapid typing | 300ms debounce, only latest value fires |
| API returns `[]` | Show empty state message in timeline |
| API error | `console.error`, keep previous results, board stays functional |
| Page refresh with `?q=...` | HomeTimelineBoard reads URL on mount, triggers search |
| Browser back/forward | URL change → useEffect fires, natural support |
| Non-home pages | SearchInput not rendered (`pathname !== "/home"`) |
| 50-post limit in search | Same `take: 50` behavior as existing endpoint |

## Spatial Board Boundary

- Posts in search results that lack a `home-board element` (i.e., not in `postElementByPostId`): `PostCardSpatialShell` receives `elementId: undefined` and skips anchor registration. No spatial interaction (connections/selection) for those cards.
- Posts hidden from timeline by search: their spatial elements remain in the database unchanged — no deletion, no position reset. Search is a view filter only.

## Testing

| Layer | Test |
|---|---|
| API integration | `GET /api/posts?q=docker` returns matching posts; `?q=` same as no q; combined with `type`/`authorId`/`cursor` |
| Component | `SearchInput`: debounce → URL update; clear button → URL reset to `/home`; not rendered on non-/home paths |
| Component | `HomeTimelineBoard`: shows initial posts when no q; fetches and shows results when q present; shows empty state on no matches; falls back to initial on q clear |

## Implementation Order

1. API: add `q` parameter to `GET /api/posts`
2. `SiteNav`: add `SearchInput` for `/home` route
3. `HomeTimelineBoard`: add search state + fetch + displayPosts logic
4. Tests: API test + component tests
