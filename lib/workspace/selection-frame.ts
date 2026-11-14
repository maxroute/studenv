import type { ConnectorAnchor, StudioItem, WorkspaceNodeType } from "@/types/workspace";
import { getConnectorAnchorPoint, type ConnectorPoint } from "./connector-geometry";

/**
 * Item types whose selection outline is drawn by SelectionOverlay as an
 * outline-only frame. They keep their own react-rnd drag/resize behavior and
 * never receive SelectionOverlay resize handles.
 */
const OUTLINE_ONLY_TYPES: ReadonlySet<WorkspaceNodeType> = new Set<WorkspaceNodeType>([
  "sticky",
  "free-text",
  "pdf-page",
  "pdf-fragment",
  "video-anchor",
  "resource-card",
  "note-card",
]);

export function usesOverlayOutlineOnly(type: string): boolean {
  return OUTLINE_ONLY_TYPES.has(type as WorkspaceNodeType);
}

/**
 * The rotation an item is visually shown at: the live preview while a rotate
 * gesture is in progress, otherwise the stored rotation.
 */
export function getEffectiveRotation(
  item: Pick<StudioItem, "id" | "rotation">,
  rotationPreviews: Readonly<Record<string, number>>,
): number {
  return rotationPreviews[item.id] ?? item.rotation ?? 0;
}

export type SelectionFrame = {
  left: number;
  top: number;
  width: number;
  height: number;
  rotation: number;
  center: ConnectorPoint;
  edgeMidpoints: Record<ConnectorAnchor, ConnectorPoint>;
};

/**
 * The stored world-space frame of an item, rotated about its center. The
 * outline renders this box with `rotate(rotation)` around its center, and the
 * connector handles sit on its edge midpoints, so both share one geometry.
 */
export function getSelectionFrame(
  item: Exclude<StudioItem, { type: "connector" }>,
  rotation: number = item.rotation ?? 0,
): SelectionFrame {
  return {
    left: item.x,
    top: item.y,
    width: item.w,
    height: item.h,
    rotation,
    center: { x: item.x + item.w / 2, y: item.y + item.h / 2 },
    edgeMidpoints: {
      top: getConnectorAnchorPoint(item, "top", rotation),
      right: getConnectorAnchorPoint(item, "right", rotation),
      bottom: getConnectorAnchorPoint(item, "bottom", rotation),
      left: getConnectorAnchorPoint(item, "left", rotation),
    },
  };
}
