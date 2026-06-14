"use client";

import { useEffect, useRef, useCallback } from "react";

const SCROLL_PREFIX = "scrollPos:";

/**
 * Persists scroll position to sessionStorage so navigating back restores the
 * user's place. Uses sessionStorage so the memory is scoped to the tab session
 * and doesn't leak across restarts.
 */
export function useScrollMemory(key: string) {
  const storageKey = SCROLL_PREFIX + key;
  const restored = useRef(false);

  // Save scroll position on scroll (debounced via rAF)
  const ticking = useRef(false);
  useEffect(() => {
    const handleScroll = () => {
      if (!ticking.current) {
        requestAnimationFrame(() => {
          try {
            sessionStorage.setItem(storageKey, String(window.scrollY));
          } catch {
            // sessionStorage unavailable (private browsing, quota)
          }
          ticking.current = false;
        });
        ticking.current = true;
      }
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [storageKey]);

  // Restore on mount
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    try {
      const saved = sessionStorage.getItem(storageKey);
      if (saved) {
        const y = parseInt(saved, 10);
        if (y > 0) {
          // Wait for the page to fully render before scrolling
          requestAnimationFrame(() => {
            window.scrollTo({ top: y, behavior: "instant" as ScrollBehavior });
          });
        }
      }
    } catch {
      // sessionStorage unavailable
    }
  }, [storageKey]);

  // Clear saved position (e.g. after new post, or manual reset)
  const clearPosition = useCallback(() => {
    try {
      sessionStorage.removeItem(storageKey);
    } catch {
      // ignore
    }
  }, [storageKey]);

  return { clearPosition };
}
