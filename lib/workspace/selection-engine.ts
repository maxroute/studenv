// ---------------------------------------------------------------------------
// Shape Tool – Selection State Engine (Zustand Micro-Store)
// ---------------------------------------------------------------------------

"use client";

import { create } from "zustand";

interface SelectionState {
  selectedIds: string[];
  select: (id: string) => void;
  toggle: (id: string) => void;
  deselectAll: () => void;
  selectIds: (ids: string[]) => void;
  clearAndSelectIds: (ids: string[]) => void;
}

export const useSelectionStore = create<SelectionState>()((set, get) => ({
  selectedIds: [],

  select: (id) => {
    set({ selectedIds: [id] });
  },

  toggle: (id) => {
    const { selectedIds } = get();
    if (selectedIds.includes(id)) {
      set({ selectedIds: selectedIds.filter((x) => x !== id) });
    } else {
      set({ selectedIds: [...selectedIds, id] });
    }
  },

  deselectAll: () => {
    set({ selectedIds: [] });
  },

  selectIds: (ids) => {
    const { selectedIds } = get();
    const uniqueIds = Array.from(new Set([...selectedIds, ...ids]));
    set({ selectedIds: uniqueIds });
  },

  clearAndSelectIds: (ids) => {
    set({ selectedIds: Array.from(new Set(ids)) });
  },
}));

/**
 * Checks if a bounding box intersects a selection rectangle.
 */
export function isIntersecting(
  item: { x: number; y: number; w: number; h: number },
  rect: { x: number; y: number; w: number; h: number }
): boolean {
  return (
    item.x < rect.x + rect.w &&
    item.x + item.w > rect.x &&
    item.y < rect.y + rect.h &&
    item.y + item.h > rect.y
  );
}
