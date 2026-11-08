// ---------------------------------------------------------------------------
// Shape Tool – Shape creation / cloning helpers
// ---------------------------------------------------------------------------

import type { ShapeKind, ShapeStyle } from "./shape-types";
import { getDefaultShapeStyle } from "./shape-types";

/** The props sub-object for a shape workspace node */
export interface ShapeNodeProps {
  kind: ShapeKind;
  fill: { type: "solid" | "transparent"; color: string };
  stroke: { width: number; color: string; style: "solid" | "dashed" | "dotted" };
  cornerRadius: number;
  opacity: number;
  shadow: boolean;
  locked: boolean;
  groupId?: string;
  startPoint?: { x: number; y: number };
  endPoint?: { x: number; y: number };
  w?: number;
  h?: number;
}

/**
 * Build the `props` payload for a new shape workspace node.
 * Optionally accepts partial style overrides.
 */
export function buildShapeProps(
  kind: ShapeKind,
  overrides?: Partial<ShapeStyle> & {
    startPoint?: { x: number; y: number };
    endPoint?: { x: number; y: number };
    w?: number;
    h?: number;
  },
): ShapeNodeProps {
  const defaults = getDefaultShapeStyle(kind);
  return {
    kind,
    fill: overrides?.fill ?? defaults.fill,
    stroke: overrides?.stroke ?? defaults.stroke,
    cornerRadius: overrides?.cornerRadius ?? defaults.cornerRadius,
    opacity: overrides?.opacity ?? defaults.opacity,
    shadow: overrides?.shadow ?? defaults.shadow,
    locked: overrides?.locked ?? defaults.locked,
    groupId: overrides?.groupId,
    startPoint: overrides?.startPoint,
    endPoint: overrides?.endPoint,
    w: overrides?.w,
    h: overrides?.h,
  };
}

/** Generate a unique item id */
export function generateShapeId(): string {
  const uuid =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2, 11);
  return `shape-${uuid}`;
}

/**
 * Minimum dimensions to accept a shape creation drag.
 * Anything smaller is treated as a click (ignored).
 */
export const MIN_SHAPE_SIZE = 8;

/**
 * Default dimensions when a shape is "click-placed" (no drag distance).
 */
export const DEFAULT_SHAPE_DIMENSIONS: Record<ShapeKind, { w: number; h: number }> = {
  rectangle: { w: 160, h: 100 },
  "rounded-rectangle": { w: 160, h: 100 },
  circle: { w: 120, h: 120 },
  ellipse: { w: 160, h: 100 },
  triangle: { w: 140, h: 120 },
  diamond: { w: 120, h: 120 },
  hexagon: { w: 130, h: 120 },
  pentagon: { w: 130, h: 120 },
  star: { w: 130, h: 130 },
  arrow: { w: 160, h: 80 },
  line: { w: 200, h: 4 },
};

/**
 * Checks if a workspace item type is a canvas primitive.
 * Primitives render directly on the canvas without white background wrappers/containers.
 */
export function isCanvasPrimitive(type: string): boolean {
  return type === "shape" || type === "drawing" || type === "free-text" || type === "text" || type === "sticky";
}

/**
 * Checks if a workspace item type has been migrated to the unified SelectionOverlay.
 * We incrementally migrate objects: first shapes, then notes (text), then others.
 */
export function isMigratedToSelectionOverlay(type: string): boolean {
  return type === "shape" || type === "text" || type === "image";
}

