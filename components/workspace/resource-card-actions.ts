"use client";

import { useWorkspaceStore } from "@/hooks/use-workspace-store";
import { centeredCardPosition, findResourceCard, resourceCardProps, type ResourceAsset } from "@/lib/workspace/resource-card";
import { useSelectionStore } from "@/lib/workspace/selection-engine";

/**
 * Puts a file on the open board as a resource card, centred on screen, and
 * selects it. A file already on the board is selected instead of added twice.
 * Returns false for files that get no card (pictures, snapshots).
 */
export function addResourceCardToBoard(asset: ResourceAsset): boolean {
  const existing = findResourceCard(useWorkspaceStore.getState().items, asset.id);
  if (existing) {
    useSelectionStore.getState().clearAndSelectIds([existing.id]);
    window.dispatchEvent(new CustomEvent("workspace-focus-item", { detail: { id: existing.id } }));
    return true;
  }
  const props = resourceCardProps(asset);
  if (!props) return false;
  const store = useWorkspaceStore.getState();
  store.addItem("resource-card", props, centeredCardPosition(store.viewport, { w: window.innerWidth, h: window.innerHeight }));
  const card = findResourceCard(useWorkspaceStore.getState().items, asset.id);
  if (card) useSelectionStore.getState().clearAndSelectIds([card.id]);
  return Boolean(card);
}
