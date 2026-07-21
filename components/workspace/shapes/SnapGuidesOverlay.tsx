// ---------------------------------------------------------------------------
// Shape Tool – Snap Alignment Guide Lines Overlay Component
// ---------------------------------------------------------------------------

"use client";

import React from "react";
import type { SnapGuideLine } from "@/lib/workspace/snapping-engine";

interface SnapGuidesOverlayProps {
  guides: SnapGuideLine[];
}

export function SnapGuidesOverlay({ guides }: SnapGuidesOverlayProps) {
  if (guides.length === 0) return null;

  return (
    <svg className="absolute inset-0 w-[10000px] h-[10000px] pointer-events-none z-[1150] overflow-visible">
      {guides.map((guide, idx) => {
        if (guide.type === "v") {
          return (
            <line
              key={`v-guide-${idx}`}
              x1={guide.value}
              y1={0}
              x2={guide.value}
              y2={10000}
              stroke="#ec4899" // figma magenta color
              strokeWidth="1.2"
              strokeDasharray="4 3"
            />
          );
        } else {
          return (
            <line
              key={`h-guide-${idx}`}
              x1={0}
              y1={guide.value}
              x2={10000}
              y2={guide.value}
              stroke="#ec4899" // figma magenta color
              strokeWidth="1.2"
              strokeDasharray="4 3"
            />
          );
        }
      })}
    </svg>
  );
}
