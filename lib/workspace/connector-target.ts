// ---------------------------------------------------------------------------
// Connector target detection — where a dragged connector end attaches
// ---------------------------------------------------------------------------
// Mirrors AFFiNE's ConnectionOverlay.renderConnector rules:
//   1. A candidate is any connectable item whose rotated bounds, expanded by
//      CANDIDATE_BOUND_PADDING world units, contain the pointer.
//   2. Within ANCHOR_SNAP_SCREEN_PX screen pixels of any candidate anchor →
//      that anchor.
//   3. Otherwise, for the topmost candidate: within OUTLINE_SNAP_WORLD world
//      units of its outline → that exact outline point.
//   4. Otherwise → the topmost candidate's nearest anchor.
//   5. No candidate → a free end at the pointer.
// ---------------------------------------------------------------------------

import type { ConnectorEnd, StudioItem } from "@/types/workspace";
import { isConnectableWorkspaceItem } from "./connector-geometry";
import {
  getConnectorAnchors,
  getNearestOutlinePoint,
  getRotatedBounds,
  toRelativePosition,
  vec,
  type ConnectableItem,
  type ConnectorAnchorPoint,
  type Vec,
} from "./connector-anchors";

export const CANDIDATE_BOUND_PADDING = 10;
export const ANCHOR_SNAP_SCREEN_PX = 8;
export const OUTLINE_SNAP_WORLD = 8;

export type ConnectionTargetKind = "anchor" | "outline" | "free";

export type ConnectionTarget = {
  end: ConnectorEnd;
  kind: ConnectionTargetKind;
  /** The resolved attachment point (world). */
  point: Vec;
  targetId: string | null;
  /** Anchors to display for the emphasised candidate (empty for free ends). */
  anchors: ConnectorAnchorPoint[];
};

export type FindConnectionTargetOptions = {
  /** Current canvas zoom; converts screen-space thresholds to world units. */
  zoom: number;
  /** Item ids that may not be targets (e.g. the connector's other end). */
  excludeIds?: Iterable<string>;
};

function candidateContains(item: ConnectableItem, point: Vec) {
  const bounds = getRotatedBounds(item);
  return (
    point.x >= bounds.x - CANDIDATE_BOUND_PADDING &&
    point.x <= bounds.x + bounds.w + CANDIDATE_BOUND_PADDING &&
    point.y >= bounds.y - CANDIDATE_BOUND_PADDING &&
    point.y <= bounds.y + bounds.h + CANDIDATE_BOUND_PADDING
  );
}

export function findConnectionTarget(
  point: Vec,
  items: readonly StudioItem[],
  { zoom, excludeIds = [] }: FindConnectionTargetOptions,
): ConnectionTarget {
  const excluded = new Set(excludeIds);
  const safeZoom = Math.max(zoom, 0.01);
  const candidates = items
    .filter((item): item is ConnectableItem => isConnectableWorkspaceItem(item) && !excluded.has(item.id))
    .filter((item) => candidateContains(item, point))
    .sort((a, b) => a.zIndex - b.zIndex);

  if (candidates.length === 0) {
    return { end: { position: [point.x, point.y] }, kind: "free", point, targetId: null, anchors: [] };
  }

  // Rule 2: screen-space anchor snap on any candidate (closest wins).
  let snapped: { item: ConnectableItem; anchor: ConnectorAnchorPoint; anchors: ConnectorAnchorPoint[]; screen: number } | null = null;
  for (const item of candidates) {
    const anchors = getConnectorAnchors(item);
    for (const anchor of anchors) {
      const screen = vec.dist(anchor, point) * safeZoom;
      if (screen < ANCHOR_SNAP_SCREEN_PX && (!snapped || screen < snapped.screen)) {
        snapped = { item, anchor, anchors, screen };
      }
    }
  }
  if (snapped) {
    return {
      end: { id: snapped.item.id, position: [...snapped.anchor.position] },
      kind: "anchor",
      point: { x: snapped.anchor.x, y: snapped.anchor.y },
      targetId: snapped.item.id,
      anchors: snapped.anchors,
    };
  }

  const topmost = candidates[candidates.length - 1];
  const anchors = getConnectorAnchors(topmost);

  // Rule 3: precise attachment on the outline.
  const onOutline = getNearestOutlinePoint(topmost, point);
  if (onOutline.distance < OUTLINE_SNAP_WORLD) {
    const position = toRelativePosition(topmost, onOutline);
    return {
      end: { id: topmost.id, position: [clamp01(position[0]), clamp01(position[1])] },
      kind: "outline",
      point: { x: onOutline.x, y: onOutline.y },
      targetId: topmost.id,
      anchors,
    };
  }

  // Rule 4: nearest anchor of the topmost candidate.
  const nearest = anchors.reduce((best, anchor) => (vec.dist(anchor, point) < vec.dist(best, point) ? anchor : best));
  return {
    end: { id: topmost.id, position: [...nearest.position] },
    kind: "anchor",
    point: { x: nearest.x, y: nearest.y },
    targetId: topmost.id,
    anchors,
  };
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}
