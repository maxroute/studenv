// ---------------------------------------------------------------------------
// Connector auto-complete & creation helpers (AFFiNE edgeless-auto-complete)
// ---------------------------------------------------------------------------
// Pure functions: next-object placement, drop placement, side positions,
// drag thresholds and connector-mode memory.
// ---------------------------------------------------------------------------

import type { ConnectorMode, StudioItem } from "@/types/workspace";
import type { Vec } from "./connector-anchors";

export type AutoCompleteDirection = "right" | "bottom" | "left" | "top";

/** Gap between a source and its auto-completed neighbour (AFFiNE MAIN_GAP). */
export const AUTO_COMPLETE_MAIN_GAP = 100;
/** Step between alternative placements when the first spot is taken (SECOND_GAP). */
export const AUTO_COMPLETE_SECOND_GAP = 20;
/** Pointer travel (world units) before an arrow press becomes a drag. */
export const AUTO_COMPLETE_DRAG_THRESHOLD = 8;
/** Hover time before the next-shape ghost appears. */
export const AUTO_COMPLETE_PREVIEW_DELAY_MS = 300;
/** Screen-space distance from the selection edge to each arrow centre (72×44 wrapper, margin = 44/2). */
export const AUTO_COMPLETE_ARROW_MARGIN_PX = 22;
/** Shape arrows: right, bottom, left, top. Notes/stickies: right, left. */
export const SHAPE_DIRECTIONS: AutoCompleteDirection[] = ["right", "bottom", "left", "top"];
export const STICKY_DIRECTIONS: AutoCompleteDirection[] = ["right", "left"];

type Bound = { x: number; y: number; w: number; h: number };

/** Relative start/end positions for a connector leaving through `direction`. */
export function getAutoCompletePositions(direction: AutoCompleteDirection): { start: [number, number]; end: [number, number] } {
  switch (direction) {
    case "right": return { start: [1, 0.5], end: [0, 0.5] };
    case "bottom": return { start: [0.5, 1], end: [0.5, 0] };
    case "left": return { start: [0, 0.5], end: [1, 0.5] };
    case "top": return { start: [0.5, 0], end: [0.5, 1] };
  }
}

function overlaps(a: Bound, b: Bound) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function normalizeDegrees(angle: number) {
  return ((angle % 360) + 360) % 360;
}

/**
 * Bound for the object created by clicking an auto-complete arrow
 * (AFFiNE `nextBound`): same size, MAIN_GAP away in the arrow's direction
 * (rotation-aware), stepping sideways by size + SECOND_GAP, alternating
 * either side, until it no longer overlaps any already-connected element.
 */
export function getNextAutoCompleteBound(direction: AutoCompleteDirection, source: Bound & { rotation?: number }, occupied: Bound[]): Bound {
  const { x, y, w, h } = source;
  const baseAngle = { right: 0, bottom: 90, left: 180, top: 270 }[direction];
  const angle = normalizeDegrees(baseAngle + (source.rotation ?? 0));
  let next: Bound;
  if (angle >= 45 && angle <= 135) next = { x, y: y + h + AUTO_COMPLETE_MAIN_GAP, w, h };
  else if (angle >= 135 && angle <= 225) next = { x: x - w - AUTO_COMPLETE_MAIN_GAP, y, w, h };
  else if (angle >= 225 && angle <= 315) next = { x, y: y - h - AUTO_COMPLETE_MAIN_GAP, w, h };
  else next = { x: x + w + AUTO_COMPLETE_MAIN_GAP, y, w, h };

  const isFree = (bound: Bound) => !occupied.some((other) => overlaps(bound, other));
  if (isFree(next)) return next;
  for (let count = 1; count < 200; count += 1) {
    const step = Math.ceil(count / 2);
    const sign = count % 2 === 1 ? -1 : 1;
    const candidate = direction === "right" || direction === "left"
      ? { ...next, y: next.y + sign * (h + AUTO_COMPLETE_SECOND_GAP) * step }
      : { ...next, x: next.x + sign * (w + AUTO_COMPLETE_SECOND_GAP) * step };
    if (isFree(candidate)) return candidate;
  }
  return next;
}

/** Bounds of every element connected to `itemId` (used to avoid stacking new objects). */
export function getConnectedBounds(itemId: string, items: readonly StudioItem[]): Bound[] {
  const ids = new Set<string>();
  for (const item of items) {
    if (item.type !== "connector") continue;
    const { source, target } = item.props;
    if (source.id === itemId && target.id) ids.add(target.id);
    if (target.id === itemId && source.id) ids.add(source.id);
  }
  return items.filter((item) => ids.has(item.id)).map(({ x, y, w, h }) => ({ x, y, w, h }));
}

/**
 * Placement for an object created from the drop panel at a free connector end
 * (AFFiNE `_generateTarget`): the arriving direction picks which side of the
 * new object attaches at the drop point.
 */
export function getDropTargetPlacement(beforeEnd: Vec, end: Vec, size: { w: number; h: number }): { bound: Bound; position: [number, number] } {
  const angle = normalizeDegrees((Math.atan2(end.y - beforeEnd.y, end.x - beforeEnd.x) * 180) / Math.PI);
  const { w, h } = size;
  if (angle >= 45 && angle <= 135) return { bound: { x: end.x - w / 2, y: end.y, w, h }, position: [0.5, 0] };
  if (angle >= 135 && angle <= 225) return { bound: { x: end.x - w, y: end.y - h / 2, w, h }, position: [1, 0.5] };
  if (angle >= 225 && angle <= 315) return { bound: { x: end.x - w / 2, y: end.y - h, w, h }, position: [0.5, 1] };
  return { bound: { x: end.x, y: end.y - h / 2, w, h }, position: [0, 0.5] };
}

// ── connector mode memory ──────────────────────────────────────────────────

/** Order cycled by pressing `C` while the connector tool is active (AFFiNE). */
export const CONNECTOR_MODE_CYCLE: ConnectorMode[] = ["curve", "elbow", "straight"];

export function getNextConnectorMode(mode: ConnectorMode): ConnectorMode {
  const index = CONNECTOR_MODE_CYCLE.indexOf(mode);
  return CONNECTOR_MODE_CYCLE[(index + 1) % CONNECTOR_MODE_CYCLE.length];
}

const LAST_MODE_KEY = "studenv:connector:last-mode";

/** Last-used connector mode for new connectors (per browser, best effort). */
export function readLastConnectorMode(fallback: ConnectorMode): ConnectorMode {
  try {
    const stored = typeof window !== "undefined" ? window.localStorage.getItem(LAST_MODE_KEY) : null;
    return CONNECTOR_MODE_CYCLE.includes(stored as ConnectorMode) ? (stored as ConnectorMode) : fallback;
  } catch {
    return fallback;
  }
}

export function writeLastConnectorMode(mode: ConnectorMode) {
  try {
    window.localStorage.setItem(LAST_MODE_KEY, mode);
  } catch {
    // Storage can be unavailable (private mode, blocked site data); memory is optional.
  }
}
