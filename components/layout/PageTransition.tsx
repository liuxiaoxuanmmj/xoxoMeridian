"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Wraps page content with a fade+slide-up entrance animation.
 * Mimics Astro Paper's view-transition feel using CSS keyframes.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Small delay so the browser has a paint frame before animating.
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div ref={ref} className={mounted ? "page-enter" : ""}>
      {children}
    </div>
  );
}
