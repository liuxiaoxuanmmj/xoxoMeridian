"use client";

import { useScrollMemory } from "@/hooks/useScrollMemory";

/**
 * Invisible component that restores saved scroll position on mount
 * and persists it on scroll. Drop this into any page that should
 * remember its scroll position across client-side navigations.
 */
export function ScrollRestore({ storageKey }: { storageKey: string }) {
  useScrollMemory(storageKey);
  return null;
}
