// ---------------------------------------------------------------------------
// Shape Tool – Layer Ordering Z-Index Engine
// ---------------------------------------------------------------------------

import type { StudioItem } from "@/types/workspace";

/**
 * Normalizes all z-indices in a sequential 1-based index to avoid leaks
 * and extreme numbers, while keeping the relative ordering exact.
 */
export function normalizeZIndices(items: StudioItem[]): StudioItem[] {
  const sorted = [...items].sort((a, b) => a.zIndex - b.zIndex);
  return items.map((item) => {
    const idx = sorted.findIndex((s) => s.id === item.id);
    return { ...item, zIndex: idx + 1 };
  });
}

/**
 * Brings selected elements one level forward.
 */
export function bringForward(items: StudioItem[], selectedIds: string[]): StudioItem[] {
  const normalized = normalizeZIndices(items);
  const sorted = [...normalized].sort((a, b) => a.zIndex - b.zIndex);

  // We iterate from top to bottom (highest z-index to lowest)
  for (let i = sorted.length - 2; i >= 0; i--) {
    const current = sorted[i];
    const next = sorted[i + 1];

    if (selectedIds.includes(current.id) && !selectedIds.includes(next.id)) {
      // Swap z-indices
      const tempZ = current.zIndex;
      current.zIndex = next.zIndex;
      next.zIndex = tempZ;

      // Swap position in sorted array to avoid double-swapping
      sorted[i] = next;
      sorted[i + 1] = current;
    }
  }

  return sorted;
}

/**
 * Sends selected elements one level backward.
 */
export function sendBackward(items: StudioItem[], selectedIds: string[]): StudioItem[] {
  const normalized = normalizeZIndices(items);
  const sorted = [...normalized].sort((a, b) => a.zIndex - b.zIndex);

  // We iterate from bottom to top (lowest z-index to highest)
  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    const prev = sorted[i - 1];

    if (selectedIds.includes(current.id) && !selectedIds.includes(prev.id)) {
      // Swap z-indices
      const tempZ = current.zIndex;
      current.zIndex = prev.zIndex;
      prev.zIndex = tempZ;

      // Swap position in sorted array to avoid double-swapping
      sorted[i] = prev;
      sorted[i - 1] = current;
    }
  }

  return sorted;
}

/**
 * Brings selected elements to the very top.
 */
export function bringToFront(items: StudioItem[], selectedIds: string[]): StudioItem[] {
  const normalized = normalizeZIndices(items);
  const selected = normalized.filter((item) => selectedIds.includes(item.id));
  const unselected = normalized.filter((item) => !selectedIds.includes(item.id));

  // Sort selected items among themselves to preserve their relative z-index
  selected.sort((a, b) => a.zIndex - b.zIndex);

  let startZ = unselected.length + 1;
  const updatedSelected = selected.map((item, idx) => ({
    ...item,
    zIndex: startZ + idx,
  }));

  const updatedUnselected = unselected.map((item, idx) => ({
    ...item,
    zIndex: idx + 1,
  }));

  return [...updatedUnselected, ...updatedSelected];
}

/**
 * Sends selected elements to the very bottom.
 */
export function sendToBack(items: StudioItem[], selectedIds: string[]): StudioItem[] {
  const normalized = normalizeZIndices(items);
  const selected = normalized.filter((item) => selectedIds.includes(item.id));
  const unselected = normalized.filter((item) => !selectedIds.includes(item.id));

  // Sort selected items among themselves to preserve their relative z-index
  selected.sort((a, b) => a.zIndex - b.zIndex);

  const updatedSelected = selected.map((item, idx) => ({
    ...item,
    zIndex: idx + 1,
  }));

  let startZ = selected.length + 1;
  const updatedUnselected = unselected.map((item, idx) => ({
    ...item,
    zIndex: startZ + idx,
  }));

  return [...updatedSelected, ...updatedUnselected];
}
