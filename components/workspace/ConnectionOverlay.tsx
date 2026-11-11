"use client";

import type { Vec } from "@/lib/workspace/connector-anchors";

/** AFFiNE `--affine-text-emphasis-color`. */
export const CONNECTION_EMPHASIS_COLOR = "#1e96eb";
const ANCHOR_RADIUS_PX = 5;
const ANCHOR_STROKE_PX = 2;

/**
 * Candidate anchors of the element under the pointer while a connector end is
 * being placed (AFFiNE ConnectionOverlay): white dots with an emphasis ring at
 * 60% opacity, and the chosen attachment point filled. Sizes are constant in
 * screen pixels at every zoom level. Rendered inside the world SVG space.
 */
export function ConnectionOverlay({
  anchors,
  highlight,
  zoom,
}: {
  anchors: readonly Vec[];
  highlight: Vec | null;
  zoom: number;
}) {
  const scale = 1 / Math.max(zoom, 0.01);
  const r = ANCHOR_RADIUS_PX * scale;
  const strokeWidth = ANCHOR_STROKE_PX * scale;
  return (
    <g aria-hidden="true" data-connection-overlay="true">
      <g opacity={0.6}>
        {anchors.map((anchor, index) => (
          <circle key={index} cx={anchor.x} cy={anchor.y} r={r} fill="white" stroke={CONNECTION_EMPHASIS_COLOR} strokeWidth={strokeWidth} />
        ))}
      </g>
      {highlight && (
        <circle
          data-connection-highlight="true"
          cx={highlight.x}
          cy={highlight.y}
          r={r}
          fill={CONNECTION_EMPHASIS_COLOR}
          stroke={CONNECTION_EMPHASIS_COLOR}
          strokeWidth={strokeWidth}
        />
      )}
    </g>
  );
}
