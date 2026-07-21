// ---------------------------------------------------------------------------
// Shape Tool – Right-Click Context Menu
// ---------------------------------------------------------------------------

"use client";

import React, { useEffect, useRef } from "react";
import { useWorkspaceStore } from "@/hooks/use-workspace-store";
import { useSelectionStore } from "@/lib/workspace/selection-engine";
import {
  bringForward,
  sendBackward,
  bringToFront,
  sendToBack,
} from "@/lib/workspace/layer-engine";
import { groupItems, ungroupItems } from "@/lib/workspace/group-engine";
import {
  Copy,
  Clipboard,
  Scissors,
  Trash2,
  Layers,
  Lock,
  Unlock,
  FolderOpen,
  FolderClosed,
} from "lucide-react";

interface ShapeContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
}

export function ShapeContextMenu({ x, y, onClose }: ShapeContextMenuProps) {
  const { selectedIds } = useSelectionStore();
  const {
    items,
    updateItems,
    removeItems,
    duplicateItems,
    copyItems,
    pasteItems,
    cutItems,
    updateItemProps,
  } = useWorkspaceStore();

  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on click outside
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [onClose]);

  if (selectedIds.length === 0) return null;

  const selectedItems = items.filter((item) => selectedIds.includes(item.id));
  const isAllLocked = selectedItems.every((item) => (item.props as { locked?: boolean }).locked === true);
  const isAnyGrouped = selectedItems.some((item) => !!(item.props as { groupId?: string }).groupId);

  const handleAction = (action: () => void) => {
    action();
    onClose();
  };

  // Layer functions
  const handleBringToFront = () => {
    updateItems(bringToFront(items, selectedIds));
  };
  const handleSendToBack = () => {
    updateItems(sendToBack(items, selectedIds));
  };
  const handleBringForward = () => {
    updateItems(bringForward(items, selectedIds));
  };
  const handleSendBackward = () => {
    updateItems(sendBackward(items, selectedIds));
  };

  // Lock / Unlock functions
  const handleLockToggle = () => {
    selectedItems.forEach((item) => {
      updateItemProps(item.id, { locked: !isAllLocked });
    });
  };

  // Delete / Duplicate / Copy / Paste / Cut
  const handleDelete = () => {
    removeItems(selectedIds);
    useSelectionStore.getState().deselectAll();
  };
  const handleDuplicate = () => {
    duplicateItems(selectedIds);
  };
  const handleCopy = () => {
    copyItems(selectedIds);
  };
  const handleCut = () => {
    cutItems(selectedIds);
  };
  const handlePaste = () => {
    pasteItems();
  };

  // Group / Ungroup
  const handleGroup = () => {
    const { items: nextItems, newGroupId } = groupItems(items, selectedIds);
    updateItems(nextItems);
    // Auto select the new group
    useSelectionStore.getState().clearAndSelectIds(
      nextItems.filter((i) => (i.props as { groupId?: string }).groupId === newGroupId).map((i) => i.id)
    );
  };

  const handleUngroup = () => {
    const nextItems = ungroupItems(items, selectedIds);
    updateItems(nextItems);
  };

  return (
    <div
      ref={menuRef}
      className="fixed bg-slate-900/95 backdrop-blur-md border border-white/10 rounded-xl shadow-2xl py-1.5 z-[1500] min-w-[200px] text-xs text-slate-200 select-none flex flex-col font-medium"
      style={{ left: x, top: y }}
    >
      <button
        onClick={() => handleAction(handleCopy)}
        className="w-full flex items-center justify-between px-3.5 py-2 hover:bg-white/10 transition-colors"
      >
        <span className="flex items-center gap-2.5">
          <Copy size={13} className="text-slate-400" />
          <span>Copy</span>
        </span>
        <span className="text-[10px] text-slate-500 font-mono">Ctrl+C</span>
      </button>

      <button
        onClick={() => handleAction(handleCut)}
        className="w-full flex items-center justify-between px-3.5 py-2 hover:bg-white/10 transition-colors"
      >
        <span className="flex items-center gap-2.5">
          <Scissors size={13} className="text-slate-400" />
          <span>Cut</span>
        </span>
        <span className="text-[10px] text-slate-500 font-mono">Ctrl+X</span>
      </button>

      <button
        onClick={() => handleAction(handlePaste)}
        className="w-full flex items-center justify-between px-3.5 py-2 hover:bg-white/10 transition-colors"
      >
        <span className="flex items-center gap-2.5">
          <Clipboard size={13} className="text-slate-400" />
          <span>Paste</span>
        </span>
        <span className="text-[10px] text-slate-500 font-mono">Ctrl+V</span>
      </button>

      <button
        onClick={() => handleAction(handleDuplicate)}
        className="w-full flex items-center justify-between px-3.5 py-2 hover:bg-white/10 transition-colors border-b border-white/5 pb-2"
      >
        <span className="flex items-center gap-2.5">
          <Copy size={13} className="text-slate-400" />
          <span>Duplicate</span>
        </span>
        <span className="text-[10px] text-slate-500 font-mono">Ctrl+D</span>
      </button>

      <div className="h-px bg-white/5 my-1" />

      {/* Layer depth controls */}
      <button
        onClick={() => handleAction(handleBringForward)}
        className="w-full flex items-center gap-2.5 px-3.5 py-2 hover:bg-white/10 transition-colors"
      >
        <Layers size={13} className="text-slate-400 rotate-180" />
        <span>Bring Forward</span>
      </button>
      <button
        onClick={() => handleAction(handleSendBackward)}
        className="w-full flex items-center gap-2.5 px-3.5 py-2 hover:bg-white/10 transition-colors"
      >
        <Layers size={13} className="text-slate-400" />
        <span>Send Backward</span>
      </button>
      <button
        onClick={() => handleAction(handleBringToFront)}
        className="w-full flex items-center gap-2.5 px-3.5 py-2 hover:bg-white/10 transition-colors"
      >
        <Layers size={13} className="text-slate-400 font-bold" />
        <span>Bring to Front</span>
      </button>
      <button
        onClick={() => handleAction(handleSendToBack)}
        className="w-full flex items-center gap-2.5 px-3.5 py-2 hover:bg-white/10 transition-colors border-b border-white/5 pb-2"
      >
        <Layers size={13} className="text-slate-400 text-opacity-50" />
        <span>Send to Back</span>
      </button>

      <div className="h-px bg-white/5 my-1" />

      {/* Grouping */}
      {selectedIds.length > 1 && (
        <button
          onClick={() => handleAction(handleGroup)}
          className="w-full flex items-center justify-between px-3.5 py-2 hover:bg-white/10 transition-colors"
        >
          <span className="flex items-center gap-2.5">
            <FolderClosed size={13} className="text-slate-400" />
            <span>Group Objects</span>
          </span>
          <span className="text-[10px] text-slate-500 font-mono">Ctrl+G</span>
        </button>
      )}

      {isAnyGrouped && (
        <button
          onClick={() => handleAction(handleUngroup)}
          className="w-full flex items-center justify-between px-3.5 py-2 hover:bg-white/10 transition-colors border-b border-white/5 pb-2"
        >
          <span className="flex items-center gap-2.5">
            <FolderOpen size={13} className="text-slate-400" />
            <span>Ungroup Objects</span>
          </span>
          <span className="text-[10px] text-slate-500 font-mono">Ctrl+Shift+G</span>
        </button>
      )}

      <div className="h-px bg-white/5 my-1" />

      {/* Lock/Unlock */}
      <button
        onClick={() => handleAction(handleLockToggle)}
        className="w-full flex items-center gap-2.5 px-3.5 py-2 hover:bg-white/10 transition-colors"
      >
        {isAllLocked ? (
          <>
            <Unlock size={13} className="text-slate-400" />
            <span>Unlock Selection</span>
          </>
        ) : (
          <>
            <Lock size={13} className="text-slate-400" />
            <span>Lock Selection</span>
          </>
        )}
      </button>

      {/* Delete */}
      <button
        onClick={() => handleAction(handleDelete)}
        className="w-full flex items-center gap-2.5 px-3.5 py-2 text-red-400 hover:bg-red-500/10 transition-colors"
      >
        <Trash2 size={13} className="text-red-400" />
        <span>Delete</span>
      </button>
    </div>
  );
}
