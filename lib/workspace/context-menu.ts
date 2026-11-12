// ---------------------------------------------------------------------------
// Workspace context menu – pure rules (no React/DOM)
// ---------------------------------------------------------------------------
// One menu for every element type and for the empty canvas. It opens from:
//   • mouse / touchpad right-click
//   • a 1 s finger or pen long-press (cancelled by moving > 8 px or a second
//     pointer landing)
//   • the pen barrel button
//   • Shift+F10 or the Menu key
// ---------------------------------------------------------------------------

import type { StudioItem } from "@/types/workspace";
import { getItemSelectionBounds } from "./connector-selection";
import { groupSelection } from "./element-lock";

export const LONG_PRESS_DURATION_MS = 1000;
export const LONG_PRESS_MOVE_TOLERANCE_PX = 8;
export const CONTEXT_MENU_MARGIN_PX = 8;

type Point = { x: number; y: number };
type Size = { w: number; h: number };

type Press = { pointerId: number; startX: number; startY: number; x: number; y: number };

/**
 * Tracks one finger or pen press until it qualifies as a long-press. The
 * caller owns the timer: start it when `down` returns true, clear it whenever
 * `pending` becomes false, and call `fire` when it elapses.
 */
export class LongPressTracker {
  private press: Press | null = null;

  get pending() {
    return this.press !== null;
  }

  /** Returns true when a long-press starts tracking. Any second pointer cancels. */
  down(pointerId: number, pointerType: string, x: number, y: number): boolean {
    if (this.press) {
      this.press = null;
      return false;
    }
    if (pointerType !== "touch" && pointerType !== "pen") return false;
    this.press = { pointerId, startX: x, startY: y, x, y };
    return true;
  }

  move(pointerId: number, x: number, y: number) {
    const press = this.press;
    if (!press || press.pointerId !== pointerId) return;
    if (Math.hypot(x - press.startX, y - press.startY) > LONG_PRESS_MOVE_TOLERANCE_PX) {
      this.press = null;
      return;
    }
    press.x = x;
    press.y = y;
  }

  /** Release or OS cancel of the tracked pointer ends it without firing. */
  end(pointerId: number) {
    if (this.press?.pointerId === pointerId) this.press = null;
  }

  cancel() {
    this.press = null;
  }

  /** The timer elapsed: the press is a long-press at its current position. */
  fire(): { pointerId: number; x: number; y: number } | null {
    const press = this.press;
    this.press = null;
    return press ? { pointerId: press.pointerId, x: press.x, y: press.y } : null;
  }
}

/** Shift+F10 or the dedicated Menu key opens the menu from the keyboard. */
export function isContextMenuKey(event: { key: string; shiftKey: boolean; ctrlKey: boolean; metaKey: boolean; altKey: boolean }) {
  if (event.ctrlKey || event.metaKey || event.altKey) return false;
  return event.key === "ContextMenu" || (event.shiftKey && event.key === "F10");
}

/**
 * The selection the menu acts on. Opening it on an element that is already
 * selected keeps the whole selection (like a desktop file manager); opening it
 * on another element selects that element and the rest of its group.
 */
export function selectionForContextMenu(targetId: string, selectedIds: readonly string[], items: readonly StudioItem[]): string[] {
  if (selectedIds.includes(targetId)) return [...selectedIds];
  return groupSelection(targetId, items);
}

/**
 * Keeps the menu inside the viewport: it opens down-right of the anchor and
 * flips left/up when it would overflow, then clamps to the margin.
 */
export function clampMenuPosition(anchor: Point, menu: Size, viewport: Size, margin = CONTEXT_MENU_MARGIN_PX): Point {
  const place = (start: number, size: number, limit: number) => {
    let value = start;
    if (value + size > limit - margin) value = start - size;
    return Math.max(margin, Math.min(value, limit - margin - size));
  };
  return { x: place(anchor.x, menu.w, viewport.w), y: place(anchor.y, menu.h, viewport.h) };
}

/** Top-left corner of the copied elements, so "Paste here" puts it at the pointer. */
export function pasteOffsetForPoint(copied: readonly StudioItem[], point: Point): Point | undefined {
  const lookup = new Map(copied.map((item) => [item.id, item] as const));
  let minX = Infinity;
  let minY = Infinity;
  for (const item of copied) {
    const bounds = getItemSelectionBounds(item, lookup);
    if (!bounds) continue;
    minX = Math.min(minX, bounds.x);
    minY = Math.min(minY, bounds.y);
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return undefined;
  return { x: point.x - minX, y: point.y - minY };
}

/** World-space centre of the selection, where a keyboard-opened menu appears. */
export function selectionCenter(selectedIds: readonly string[], items: readonly StudioItem[]): Point | null {
  const lookup = new Map(items.map((item) => [item.id, item] as const));
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const id of selectedIds) {
    const item = lookup.get(id);
    const bounds = item ? getItemSelectionBounds(item, lookup) : null;
    if (!bounds) continue;
    minX = Math.min(minX, bounds.x);
    minY = Math.min(minY, bounds.y);
    maxX = Math.max(maxX, bounds.x + bounds.w);
    maxY = Math.max(maxY, bounds.y + bounds.h);
  }
  if (!Number.isFinite(minX)) return null;
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
}
