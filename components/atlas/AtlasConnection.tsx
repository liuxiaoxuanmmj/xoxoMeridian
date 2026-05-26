"use client";

import type { AtlasConnectionData, AtlasElementData } from "@/components/atlas/types";
import { AtlasPushpin } from "@/components/atlas/AtlasPushpin";

export function AtlasConnection({
  connection,
  fromEl,
  toEl,
  onDelete,
}: {
  connection: AtlasConnectionData;
  fromEl: AtlasElementData;
  toEl: AtlasElementData;
  onDelete: (id: string) => void;
}) {
  const fx = fromEl.x + fromEl.width / 2;
  const fy = fromEl.y + fromEl.height / 2;
  const tx = toEl.x + toEl.width / 2;
  const ty = toEl.y + toEl.height / 2;

  const mx = (fx + tx) / 2;
  const my = (fy + ty) / 2;
  const sag = Math.abs(tx - fx) * 0.3 + 20;
  const controlY = my + sag;

  const path = `M ${fx},${fy} Q ${mx},${controlY} ${tx},${ty}`;

  return (
    <g>
      {/* Invisible wider hit area for easier clicking */}
      <path
        d={path}
        fill="none"
        stroke="transparent"
        strokeWidth={12}
        style={{ pointerEvents: "stroke", cursor: "pointer" }}
        onClick={(e) => {
          e.stopPropagation();
          onDelete(connection.id);
        }}
      />
      {/* Visible rope */}
      <path
        d={path}
        fill="none"
        stroke={connection.color}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeDasharray="6 3"
        style={{ pointerEvents: "none" }}
      />
      {/* Pushpins at endpoints */}
      <AtlasPushpin cx={fx} cy={fy} />
      <AtlasPushpin cx={tx} cy={ty} />
    </g>
  );
}
