// ---------------------------------------------------------------------------
// Fit to screen, zoom to selection and zoom steps (pure)
// ---------------------------------------------------------------------------
//
// No React or DOM. The board's camera is `{ x, y, scale }`: a world point `w`
// is drawn at `w * scale + (x, y)` in canvas pixels.

import type { StudioItem } from "@/types/workspace";
import { clampScale, zoomCameraAt, type Camera } from "@/lib/workspace/navigation";

export type Bounds = { left: number; top: number; right: number; bottom: number };
export type Insets = { top?: number; right?: number; bottom?: number; left?: number };

/**
 * The box that holds `items`, rotation included; null when none take space.
 * Connectors are skipped: they have no position of their own (every connector
 * is stored as a 1 x 1 box at the world origin), so counting them would pull a
 * board far from the origin out to a tiny zoom with its content in a corner.
 */
export function contentBounds(items: readonly StudioItem[]): Bounds | null {
  let bounds: Bounds | null = null;
  for (const item of items) {
    if (item.type === "connector") continue;
    const radians = ((item.rotation ?? 0) * Math.PI) / 180;
    const width = Math.abs(item.w * Math.cos(radians)) + Math.abs(item.h * Math.sin(radians));
    const height = Math.abs(item.w * Math.sin(radians)) + Math.abs(item.h * Math.cos(radians));
    const left = item.x + item.w / 2 - width / 2;
    const top = item.y + item.h / 2 - height / 2;
    bounds = bounds
      ? { left: Math.min(bounds.left, left), top: Math.min(bounds.top, top), right: Math.max(bounds.right, left + width), bottom: Math.max(bounds.bottom, top + height) }
      : { left, top, right: left + width, bottom: top + height };
  }
  return bounds;
}

export type FitOptions = {
  /** Space kept free on every side, in canvas px; default scales with the view, 20 to 48. */
  padding?: number;
  /** Extra space kept free on a side (controls or bars drawn over the canvas). */
  insets?: Insets;
  /** Never zoom in past this; 1 keeps small boards at their real size. */
  maxScale?: number;
};

/** The camera that shows `bounds` whole and centred in a view of `view` px. */
export function fitCamera(bounds: Bounds, view: { width: number; height: number }, options: FitOptions = {}): Camera {
  const padding = options.padding ?? Math.min(48, Math.max(20, Math.min(view.width, view.height) * 0.06));
  const inset = { top: options.insets?.top ?? 0, right: options.insets?.right ?? 0, bottom: options.insets?.bottom ?? 0, left: options.insets?.left ?? 0 };
  const areaWidth = Math.max(1, view.width - inset.left - inset.right - padding * 2);
  const areaHeight = Math.max(1, view.height - inset.top - inset.bottom - padding * 2);
  const contentWidth = Math.max(1, bounds.right - bounds.left);
  const contentHeight = Math.max(1, bounds.bottom - bounds.top);
  const scale = clampScale(Math.min(areaWidth / contentWidth, areaHeight / contentHeight, options.maxScale ?? 1));
  return {
    scale,
    x: inset.left + padding + (areaWidth - contentWidth * scale) / 2 - bounds.left * scale,
    y: inset.top + padding + (areaHeight - contentHeight * scale) / 2 - bounds.top * scale,
  };
}

/** The next zoom a − or + press goes to: the nearest 10% step in that direction, from 10% to 500%. */
export function stepScale(scale: number, direction: 1 | -1): number {
  const percent = Math.round(scale * 100);
  // From 87%, + goes to 90% and − to 80%; from 90%, + goes to 100%.
  const next = direction === 1 ? Math.floor(percent / 10) * 10 + 10 : Math.ceil(percent / 10) * 10 - 10;
  return clampScale(Math.max(10, Math.min(500, next)) / 100);
}

/** The camera after zooming to `scale` with the middle of the view staying put. */
export function zoomAroundCentre(camera: Camera, view: { width: number; height: number }, scale: number): Camera {
  return zoomCameraAt(camera, { x: view.width / 2, y: view.height / 2 }, scale);
}
