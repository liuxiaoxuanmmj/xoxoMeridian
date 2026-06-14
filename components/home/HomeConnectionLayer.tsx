"use client";

import type { AtlasConnectionData } from "@/components/atlas/types";
import type { HomeAnchor } from "@/components/home/types";
import { getRectCenter } from "@/lib/home-spatial";

function HomePin({ cx, cy }: { cx: number; cy: number }) {
  return (
    <g style={{ pointerEvents: "none" }}>
      <circle cx={cx + 1} cy={cy + 2} r={5} fill="rgba(40,48,52,0.12)" />
      <circle cx={cx} cy={cy} r={5} fill="#dfead8" stroke="#668a5b" strokeWidth={1} />
      <circle cx={cx - 1.5} cy={cy - 1.5} r={1.6} fill="rgba(255,255,255,0.7)" />
    </g>
  );
}

export function HomeConnectionLayer({
  boardRect,
  anchors,
  connections,
  onDelete,
}: {
  boardRect: DOMRect | null;
  anchors: Map<string, HomeAnchor>;
  connections: AtlasConnectionData[];
  onDelete: (id: string) => void;
}) {
  if (!boardRect) return null;

  return (
    <svg className="home-connection-layer" aria-hidden="true">
      {connections.map((connection) => {
        const from = anchors.get(connection.fromId)?.getRect();
        const to = anchors.get(connection.toId)?.getRect();
        if (!from || !to) return null;

        const start = getRectCenter(from, boardRect);
        const end = getRectCenter(to, boardRect);
        const midX = (start.x + end.x) / 2;
        const midY = (start.y + end.y) / 2;
        const sag = Math.min(Math.abs(end.x - start.x) * 0.22 + 18, 120);
        const path = `M ${start.x},${start.y} Q ${midX},${midY + sag} ${end.x},${end.y}`;

        return (
          <g key={connection.id}>
            <path
              d={path}
              fill="none"
              stroke="transparent"
              strokeWidth={14}
              style={{ pointerEvents: "stroke", cursor: "pointer" }}
              onClick={(event) => {
                event.stopPropagation();
                onDelete(connection.id);
              }}
            />
            <path
              d={path}
              fill="none"
              stroke={connection.color || "#668a5b"}
              strokeWidth={2}
              strokeLinecap="round"
              strokeDasharray="6 4"
              style={{ pointerEvents: "none" }}
            />
            <HomePin cx={start.x} cy={start.y} />
            <HomePin cx={end.x} cy={end.y} />
          </g>
        );
      })}
    </svg>
  );
}
