// ---------------------------------------------------------------------------
// Shape Tool – Grouping Logic (Ctrl+G and Ctrl+Shift+G Helpers)
// ---------------------------------------------------------------------------

import type { StudioItem } from "@/types/workspace";

/**
 * Assigns a unique groupId to all selected items to group them.
 */
export function groupItems(items: StudioItem[], selectedIds: string[]): { items: StudioItem[]; newGroupId: string } {
  const newGroupId = `group-${Math.random().toString(36).slice(2, 11)}`;
  
  const updatedItems = items.map((item) => {
    if (selectedIds.includes(item.id)) {
      return {
        ...item,
        props: {
          ...item.props,
          groupId: newGroupId,
        },
      } as StudioItem;
    }
    return item;
  });

  return { items: updatedItems, newGroupId };
}

/**
 * Dissolves group associations from selected items.
 */
export function ungroupItems(items: StudioItem[], selectedIds: string[]): StudioItem[] {
  // Find all groupIds associated with the selected items
  const groupIdsToUngroup = new Set<string>();
  items.forEach((item) => {
    const groupId = (item.props as { groupId?: string }).groupId;
    if (selectedIds.includes(item.id) && groupId) {
      groupIdsToUngroup.add(groupId);
    }
  });

  if (groupIdsToUngroup.size === 0) return items;

  // Clear groupId for any item belonging to these groups
  return items.map((item) => {
    const groupId = (item.props as { groupId?: string }).groupId;
    if (groupId && groupIdsToUngroup.has(groupId)) {
      const nextProps = { ...item.props } as { groupId?: string };
      delete nextProps.groupId;
      return {
        ...item,
        props: nextProps,
      } as StudioItem;
    }
    return item;
  });
}

/**
 * Expands a list of item IDs to include all items in their respective groups.
 * This guarantees that selecting one member of a group selects all members.
 */
export function resolveGroupSelection(items: StudioItem[], selectedIds: string[]): string[] {
  const resolvedIds = new Set<string>(selectedIds);
  const activeGroupIds = new Set<string>();

  // Collect groups that have at least one member selected
  items.forEach((item) => {
    const groupId = (item.props as { groupId?: string }).groupId;
    if (selectedIds.includes(item.id) && groupId) {
      activeGroupIds.add(groupId);
    }
  });

  if (activeGroupIds.size === 0) return selectedIds;

  // Add all other members of those groups to the selection
  items.forEach((item) => {
    const groupId = (item.props as { groupId?: string }).groupId;
    if (groupId && activeGroupIds.has(groupId)) {
      resolvedIds.add(item.id);
    }
  });

  return Array.from(resolvedIds);
}
