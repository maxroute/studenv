// ---------------------------------------------------------------------------
// Shape Tool – Selection Box Renderer and Selection Intersect Helpers
// ---------------------------------------------------------------------------

"use client";

import React from "react";

interface SelectionBoxProps {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function SelectionBox({ x, y, w, h }: SelectionBoxProps) {
  if (w <= 0 || h <= 0) return null;

  return (
    <div
      className="absolute bg-indigo-500/5 border border-indigo-500 rounded pointer-events-none z-[1200]"
      style={{
        left: x,
        top: y,
        width: w,
        height: h,
        borderWidth: 1.5,
      }}
    />
  );
}
