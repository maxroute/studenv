// ---------------------------------------------------------------------------
// Shape Tool – Centralized Keyboard Shortcuts Hook
// ---------------------------------------------------------------------------

"use client";

import { useEffect } from "react";
import { useSelectionStore } from "@/lib/workspace/selection-engine";
import { useWorkspaceStore } from "@/hooks/use-workspace-store";
import { groupItems, ungroupItems } from "./group-engine";

/** Undo or redo one workspace step, keeping only the selected ids that still exist. */
export function applyWorkspaceHistory(direction: "undo" | "redo") {
  const store = useWorkspaceStore.getState();
  const changed = direction === "undo" ? store.undo() : store.redo();
  if (!changed) return;
  const existing = new Set(useWorkspaceStore.getState().items.map((item) => item.id));
  const { selectedIds, clearAndSelectIds } = useSelectionStore.getState();
  const kept = selectedIds.filter((id) => existing.has(id));
  if (kept.length !== selectedIds.length) clearAndSelectIds(kept);
}

interface KeyboardShortcutsOptions {
  onActivateShapeTool?: () => void;
  /** `C` without modifiers (connector tool / mode cycling). */
  onActivateConnectorTool?: () => void;
}

export function useKeyboardShortcuts(options: KeyboardShortcutsOptions = {}) {
  const { onActivateShapeTool, onActivateConnectorTool } = options;
  const { selectedIds, deselectAll, clearAndSelectIds } = useSelectionStore();
  const {
    items,
    updateItems,
    removeItems,
    duplicateItems,
    copyItems,
    pasteItems,
    cutItems,
    batchUpdateItems,
  } = useWorkspaceStore();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Avoid firing shortcuts when user is typing inside text fields
      const activeEl = document.activeElement;
      if (
        activeEl &&
        (activeEl.tagName === "INPUT" ||
          activeEl.tagName === "TEXTAREA" ||
          activeEl.getAttribute("contenteditable") === "true")
      ) {
        return;
      }

      const isMac = typeof navigator !== "undefined" && navigator.platform.toUpperCase().indexOf("MAC") >= 0;
      const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

      // ── Undo (Cmd/Ctrl+Z) / Redo (Cmd/Ctrl+Shift+Z, Cmd/Ctrl+Y) ───────────
      // Cmd+Y is handled on Mac too, so it redoes instead of opening the
      // browser's History.
      const isUndoKey = e.key === "z" || e.key === "Z";
      if (cmdOrCtrl && !e.altKey && (isUndoKey || (!e.shiftKey && (e.key === "y" || e.key === "Y")))) {
        e.preventDefault();
        applyWorkspaceHistory(isUndoKey && !e.shiftKey ? "undo" : "redo");
        return;
      }

      // ── Select All (Ctrl+A) ────────────────────────────────────────────────
      if (cmdOrCtrl && (e.key === "a" || e.key === "A")) {
        e.preventDefault();
        clearAndSelectIds(items.map((i) => i.id));
        return;
      }

      // ── Deselect All (Escape) ──────────────────────────────────────────────
      if (e.key === "Escape") {
        e.preventDefault();
        deselectAll();
        return;
      }

      if (!cmdOrCtrl && !e.altKey && !e.shiftKey && (e.key === "s" || e.key === "S")) {
        e.preventDefault();
        onActivateShapeTool?.();
        return;
      }

      if (!cmdOrCtrl && !e.altKey && !e.shiftKey && (e.key === "c" || e.key === "C") && onActivateConnectorTool) {
        e.preventDefault();
        onActivateConnectorTool();
        return;
      }

      // If nothing is selected, we don't handle other shortcuts
      if (selectedIds.length === 0) {
        // Paste is allowed even when selection is empty
        if (cmdOrCtrl && (e.key === "v" || e.key === "V")) {
          e.preventDefault();
          pasteItems();
        }
        return;
      }

      // ── Delete / Backspace ─────────────────────────────────────────────────
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        removeItems(selectedIds);
        deselectAll();
        return;
      }

      // ── Duplicate (Ctrl+D) ─────────────────────────────────────────────────
      if (cmdOrCtrl && (e.key === "d" || e.key === "D")) {
        e.preventDefault();
        duplicateItems(selectedIds);
        return;
      }

      // ── Clipboard (Ctrl+C, Ctrl+X, Ctrl+V) ─────────────────────────────────
      if (cmdOrCtrl && (e.key === "c" || e.key === "C")) {
        e.preventDefault();
        copyItems(selectedIds);
        return;
      }
      if (cmdOrCtrl && (e.key === "x" || e.key === "X")) {
        e.preventDefault();
        cutItems(selectedIds);
        return;
      }
      if (cmdOrCtrl && (e.key === "v" || e.key === "V")) {
        e.preventDefault();
        pasteItems();
        return;
      }

      // ── Grouping (Ctrl+G, Ctrl+Shift+G) ────────────────────────────────────
      if (cmdOrCtrl && (e.key === "g" || e.key === "G")) {
        e.preventDefault();
        if (e.shiftKey) {
          // Ungroup
          const nextItems = ungroupItems(items, selectedIds);
          updateItems(nextItems);
        } else {
          // Group
          if (selectedIds.length > 1) {
            const { items: nextItems, newGroupId } = groupItems(items, selectedIds);
            updateItems(nextItems);
            clearAndSelectIds(
              nextItems.filter((i) => (i.props as { groupId?: string }).groupId === newGroupId).map((i) => i.id)
            );
          }
        }
        return;
      }

      // ── Arrow Keys Nudging ─────────────────────────────────────────────────
      if (
        e.key === "ArrowLeft" ||
        e.key === "ArrowRight" ||
        e.key === "ArrowUp" ||
        e.key === "ArrowDown"
      ) {
        e.preventDefault();
        const nudgeDistance = e.shiftKey ? 10 : 1;
        let dx = 0;
        let dy = 0;

        if (e.key === "ArrowLeft") dx = -nudgeDistance;
        if (e.key === "ArrowRight") dx = nudgeDistance;
        if (e.key === "ArrowUp") dy = -nudgeDistance;
        if (e.key === "ArrowDown") dy = nudgeDistance;

        const updates = items
          .filter((item) => selectedIds.includes(item.id) && !(item.props as { locked?: boolean }).locked)
          .map((item) => ({
            id: item.id,
            changes: {
              x: item.x + dx,
              y: item.y + dy,
            },
          }));

        if (updates.length > 0) {
          batchUpdateItems(updates);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    items,
    selectedIds,
    clearAndSelectIds,
    deselectAll,
    removeItems,
    duplicateItems,
    copyItems,
    cutItems,
    pasteItems,
    updateItems,
    batchUpdateItems,
    onActivateShapeTool,
    onActivateConnectorTool,
  ]);
}
