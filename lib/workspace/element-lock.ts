// ---------------------------------------------------------------------------
// Element lock & group rules (every element type)
// ---------------------------------------------------------------------------
// A locked element stays selectable (so it can be unlocked, copied or
// reordered) but cannot be moved, resized, rotated, deleted, erased, edited
// or re-routed. Groups are a shared `groupId` on the member elements.
// ---------------------------------------------------------------------------

import type { StudioItem } from "@/types/workspace";

export function isElementLocked(item: StudioItem): boolean {
  return (item.props as { locked?: boolean }).locked === true;
}

export function elementGroupId(item: StudioItem): string | undefined {
  return (item.props as { groupId?: string }).groupId;
}

/** Pressing an element selects it together with the rest of its group. */
export function groupSelection(targetId: string, items: readonly StudioItem[]): string[] {
  const target = items.find((item) => item.id === targetId);
  if (!target) return [];
  const groupId = elementGroupId(target);
  if (!groupId) return [targetId];
  return [targetId, ...items.filter((item) => item.id !== targetId && elementGroupId(item) === groupId).map((item) => item.id)];
}

/** The ids an edit may change: locked elements are left out. */
export function unlockedIds(items: readonly StudioItem[], ids: readonly string[]): string[] {
  const wanted = new Set(ids);
  return items.filter((item) => wanted.has(item.id) && !isElementLocked(item)).map((item) => item.id);
}

/** Locks or unlocks `ids` in one change (one undo step). */
export function setElementsLocked(items: StudioItem[], ids: readonly string[], locked: boolean): StudioItem[] {
  const wanted = new Set(ids);
  return items.map((item) =>
    wanted.has(item.id) && isElementLocked(item) !== locked
      ? ({ ...item, props: { ...item.props, locked } } as StudioItem)
      : item,
  );
}

/**
 * Copies of grouped elements (duplicate, paste) form new groups: every
 * original group id maps to one fresh id, so the copies never join the
 * originals' group.
 */
export function withFreshGroupIds<T extends StudioItem>(copies: T[], newId: () => string): T[] {
  const fresh = new Map<string, string>();
  return copies.map((item) => {
    const groupId = elementGroupId(item);
    if (!groupId) return item;
    let next = fresh.get(groupId);
    if (!next) {
      next = newId();
      fresh.set(groupId, next);
    }
    return { ...item, props: { ...item.props, groupId: next } };
  });
}
