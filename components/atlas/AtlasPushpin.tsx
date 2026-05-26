"use client";

import { useId } from "react";

export function AtlasPushpin({ cx, cy }: { cx: number; cy: number }) {
  const gradientId = useId();
  const r = 6;
  return (
    <g style={{ pointerEvents: "none" }}>
      {/* Shadow */}
      <circle cx={cx + 1} cy={cy + 2} r={r} fill="rgba(0,0,0,0.15)" />
      {/* Pin body */}
      <circle cx={cx} cy={cy} r={r} fill={`url(#${gradientId})`} stroke="#888" strokeWidth={0.5} />
      {/* Specular highlight */}
      <circle cx={cx - 2} cy={cy - 2} r={2} fill="rgba(255,255,255,0.6)" />
      {/* Gradient definition */}
      <defs>
        <radialGradient id={gradientId} cx="35%" cy="35%" r="65%">
          <stop offset="0%" stopColor="#e0e0e0" />
          <stop offset="50%" stopColor="#b0b0b0" />
          <stop offset="100%" stopColor="#707070" />
        </radialGradient>
      </defs>
    </g>
  );
}
