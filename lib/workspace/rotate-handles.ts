// ---------------------------------------------------------------------------
// Corner rotation zones (AFFiNE edgeless-selected-rect)
// ---------------------------------------------------------------------------
// AFFiNE rotates from just outside each corner: an 18×18 px corner handle
// offset 12 px outward holds the 12 px resize circle (on top) and a 12 px
// transparent rotate zone in the outer quadrant. The rotate zone therefore
// covers the 12×12 px square diagonally outside the corner, minus the part
// under the resize circle. Sizes are constant in screen pixels.
// ---------------------------------------------------------------------------

export type RotateCorner = "top-left" | "top-right" | "bottom-right" | "bottom-left";

export const ROTATE_CORNERS: RotateCorner[] = ["top-left", "top-right", "bottom-right", "bottom-left"];

/** AFFiNE rotate-zone size (screen px). */
export const ROTATE_ZONE_PX = 12;
/** Larger zone for coarse pointers (touch) so rotation stays usable. */
export const ROTATE_ZONE_COARSE_PX = 24;

/**
 * Position of a corner's rotate zone in the item's local (unrotated) box, in
 * world units: a square of `sizePx` screen pixels diagonally outside the
 * corner, touching it.
 */
export function getRotateZoneBox(corner: RotateCorner, w: number, h: number, sizePx: number, zoom: number) {
  const size = sizePx / Math.max(zoom, 0.01);
  const left = corner.endsWith("left") ? -size : w;
  const top = corner.startsWith("top") ? -size : h;
  return { left, top, width: size, height: size };
}

/** Rotation of the cursor glyph per corner, before the item's own rotation (AFFiNE `rotateCursorMap`). */
const CORNER_CURSOR_BASE: Record<RotateCorner, number> = {
  "top-right": 0,
  "bottom-right": 90,
  "bottom-left": 180,
  "top-left": 270,
};

// lucide `rotate-cw` (ISC licence), drawn white-on-dark so it reads on any canvas.
const ROTATE_GLYPH = "M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8 M21 3v5h-5";

/** CSS cursor for a corner rotate zone, turned to match the item's rotation. */
export function getRotateCursor(corner: RotateCorner, itemRotation: number): string {
  const angle = (((CORNER_CURSOR_BASE[corner] + itemRotation) % 360) + 360) % 360;
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'>` +
    `<g transform='rotate(${+angle.toFixed(2)} 12 12)' fill='none' stroke-linecap='round' stroke-linejoin='round'>` +
    `<path d='${ROTATE_GLYPH}' stroke='white' stroke-width='4'/>` +
    `<path d='${ROTATE_GLYPH}' stroke='black' stroke-width='2'/>` +
    `</g></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 12 12, grab`;
}
