"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import {
  Clipboard,
  Copy,
  CopyPlus,
  FolderClosed,
  FolderOpen,
  Layers,
  Lock,
  MousePointerSquareDashed,
  Redo2,
  Scissors,
  Trash2,
  Type,
  Undo2,
  Unlock,
} from "lucide-react";
import { useWorkspaceStore } from "@/hooks/use-workspace-store";
import { useSelectionStore } from "@/lib/workspace/selection-engine";
import { bringForward, bringToFront, sendBackward, sendToBack } from "@/lib/workspace/layer-engine";
import { groupItems, ungroupItems } from "@/lib/workspace/group-engine";
import { applyWorkspaceHistory } from "@/lib/workspace/keyboard-shortcuts";
import { useConnectorUiStore } from "@/lib/workspace/connector-ui-store";
import { clampMenuPosition, pasteOffsetForPoint } from "@/lib/workspace/context-menu";
import { elementGroupId, isElementLocked, setElementsLocked } from "@/lib/workspace/element-lock";

export type WorkspaceContextMenuState = {
  /** Screen point the menu opens from. */
  x: number;
  y: number;
  /** World point under it ("Paste here"). */
  world: { x: number; y: number };
  /** Elements (the current selection) or the empty canvas. */
  target: "selection" | "canvas";
  /** Opened from the keyboard: focus moves into the menu. */
  fromKeyboard: boolean;
};

type MenuEntry =
  | { kind: "item"; label: string; icon: ReactNode; shortcut?: string; danger?: boolean; disabled?: boolean; run: () => void }
  | { kind: "separator" };

const ICON = 14;

function modKey() {
  return typeof navigator !== "undefined" && /mac/i.test(navigator.platform) ? "⌘" : "Ctrl+";
}

/**
 * The context menu for every workspace element and for the empty canvas.
 * Actions run on the current selection, which the opener has already set.
 */
export function WorkspaceContextMenu({ menu, onClose }: { menu: WorkspaceContextMenuState; onClose: () => void }) {
  const items = useWorkspaceStore((state) => state.items);
  const copiedItems = useWorkspaceStore((state) => state.copiedItems);
  const canUndo = useWorkspaceStore((state) => state.canUndo);
  const canRedo = useWorkspaceStore((state) => state.canRedo);
  const selectedIds = useSelectionStore((state) => state.selectedIds);
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);

  // Close on a press outside, Escape, a scroll/zoom, a resize or the window
  // losing focus. Escape only closes the menu; it does not also deselect.
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (menuRef.current && event.target instanceof Node && menuRef.current.contains(event.target)) return;
      onClose();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", escape, true);
    window.addEventListener("pointerdown", outside, true);
    window.addEventListener("wheel", onClose, { capture: true, passive: true });
    window.addEventListener("resize", onClose);
    window.addEventListener("blur", onClose);
    return () => {
      window.removeEventListener("keydown", escape, true);
      window.removeEventListener("pointerdown", outside, true);
      window.removeEventListener("wheel", onClose, true);
      window.removeEventListener("resize", onClose);
      window.removeEventListener("blur", onClose);
    };
  }, [onClose]);

  useLayoutEffect(() => {
    const element = menuRef.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    setPosition(clampMenuPosition({ x: menu.x, y: menu.y }, { w: rect.width, h: rect.height }, { w: window.innerWidth, h: window.innerHeight }));
  }, [menu.x, menu.y, menu.target]);

  useEffect(() => {
    if (!menu.fromKeyboard || !position) return;
    menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus({ preventScroll: true });
  }, [menu.fromKeyboard, position]);

  const store = useWorkspaceStore.getState;
  const selection = useSelectionStore.getState;
  const selectedItems = items.filter((item) => selectedIds.includes(item.id));
  const isElementMenu = menu.target === "selection" && selectedItems.length > 0;
  const mod = modKey();

  let entries: MenuEntry[];
  if (isElementMenu) {
    const ids = selectedItems.map((item) => item.id);
    const allLocked = selectedItems.every(isElementLocked);
    const anyGrouped = selectedItems.some((item) => !!elementGroupId(item));
    const onlyConnector = selectedItems.length === 1 && selectedItems[0].type === "connector" ? selectedItems[0] : null;
    const reorder = (fn: typeof bringForward) => store().updateItems(fn(store().items, ids));

    entries = [
      { kind: "item", label: "Copy", icon: <Copy size={ICON} />, shortcut: `${mod}C`, run: () => store().copyItems(ids) },
      // Locked elements are left in place: Cut and Delete skip them.
      { kind: "item", label: "Cut", icon: <Scissors size={ICON} />, shortcut: `${mod}X`, disabled: allLocked, run: () => { store().cutItems(ids); selection().deselectAll(); } },
      { kind: "item", label: "Paste", icon: <Clipboard size={ICON} />, shortcut: `${mod}V`, disabled: copiedItems.length === 0, run: () => store().pasteItems() },
      { kind: "item", label: "Duplicate", icon: <CopyPlus size={ICON} />, shortcut: `${mod}D`, run: () => store().duplicateItems(ids) },
      ...(onlyConnector
        ? [
            { kind: "separator" } as const,
            {
              kind: "item",
              label: onlyConnector.props.label?.text ? "Edit text" : "Add text",
              icon: <Type size={ICON} />,
              disabled: allLocked,
              run: () => useConnectorUiStore.getState().setEditingLabel({ connectorId: onlyConnector.id, offset: onlyConnector.props.label?.offset ?? 0.5 }),
            } as const,
          ]
        : []),
      { kind: "separator" },
      { kind: "item", label: "Bring to front", icon: <Layers size={ICON} />, run: () => reorder(bringToFront) },
      { kind: "item", label: "Bring forward", icon: <Layers size={ICON} />, run: () => reorder(bringForward) },
      { kind: "item", label: "Send backward", icon: <Layers size={ICON} />, run: () => reorder(sendBackward) },
      { kind: "item", label: "Send to back", icon: <Layers size={ICON} />, run: () => reorder(sendToBack) },
      ...(ids.length > 1 || anyGrouped
        ? [
            { kind: "separator" } as const,
            ...(ids.length > 1
              ? [{
                  kind: "item",
                  label: "Group",
                  icon: <FolderClosed size={ICON} />,
                  shortcut: `${mod}G`,
                  run: () => {
                    const { items: next, newGroupId } = groupItems(store().items, ids);
                    store().updateItems(next);
                    selection().clearAndSelectIds(next.filter((item) => elementGroupId(item) === newGroupId).map((item) => item.id));
                  },
                } as const]
              : []),
            ...(anyGrouped
              ? [{ kind: "item", label: "Ungroup", icon: <FolderOpen size={ICON} />, shortcut: `⇧${mod}G`, run: () => store().updateItems(ungroupItems(store().items, ids)) } as const]
              : []),
          ]
        : []),
      { kind: "separator" },
      {
        kind: "item",
        label: allLocked ? "Unlock" : "Lock",
        icon: allLocked ? <Unlock size={ICON} /> : <Lock size={ICON} />,
        run: () => store().updateItems(setElementsLocked(store().items, ids, !allLocked)),
      },
      { kind: "separator" },
      {
        kind: "item",
        label: "Delete",
        icon: <Trash2 size={ICON} />,
        shortcut: "⌫",
        danger: true,
        disabled: allLocked,
        run: () => { store().removeItems(ids); selection().deselectAll(); },
      },
    ];
  } else {
    entries = [
      {
        kind: "item",
        label: "Paste here",
        icon: <Clipboard size={ICON} />,
        shortcut: `${mod}V`,
        disabled: copiedItems.length === 0,
        run: () => store().pasteItems(pasteOffsetForPoint(store().copiedItems, menu.world)),
      },
      {
        kind: "item",
        label: "Select all",
        icon: <MousePointerSquareDashed size={ICON} />,
        shortcut: `${mod}A`,
        disabled: items.length === 0,
        run: () => selection().clearAndSelectIds(store().items.map((item) => item.id)),
      },
      { kind: "separator" },
      { kind: "item", label: "Undo", icon: <Undo2 size={ICON} />, shortcut: `${mod}Z`, disabled: !canUndo, run: () => applyWorkspaceHistory("undo") },
      { kind: "item", label: "Redo", icon: <Redo2 size={ICON} />, shortcut: `⇧${mod}Z`, disabled: !canRedo, run: () => applyWorkspaceHistory("redo") },
    ];
  }

  const moveFocus = (step: number) => {
    const buttons = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? []);
    if (buttons.length === 0) return;
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = index < 0 ? (step > 0 ? 0 : buttons.length - 1) : (index + step + buttons.length) % buttons.length;
    buttons[next].focus({ preventScroll: true });
  };

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label={isElementMenu ? "Element actions" : "Canvas actions"}
      data-workspace-context-menu="true"
      data-no-canvas-gesture="true"
      className="fixed z-[1500] flex min-w-[200px] select-none flex-col rounded-xl border border-white/10 bg-slate-900/95 py-1.5 text-xs font-medium text-slate-200 shadow-2xl backdrop-blur-md"
      style={{ left: position?.x ?? menu.x, top: position?.y ?? menu.y, visibility: position ? "visible" : "hidden" }}
      onContextMenu={(event) => event.preventDefault()}
      onKeyDown={(event) => {
        // Keep arrow keys, Delete, Escape etc. from reaching canvas shortcuts.
        event.stopPropagation();
        if (event.key === "ArrowDown") { event.preventDefault(); moveFocus(1); }
        else if (event.key === "ArrowUp") { event.preventDefault(); moveFocus(-1); }
        else if (event.key === "Tab") { event.preventDefault(); onClose(); }
      }}
    >
      {entries.map((entry, index) =>
        entry.kind === "separator" ? (
          index > 0 && <div key={`sep-${index}`} role="separator" className="my-1 h-px bg-white/10" />
        ) : (
          <button
            key={entry.label}
            type="button"
            role="menuitem"
            disabled={entry.disabled}
            onClick={() => {
              entry.run();
              onClose();
            }}
            className={`flex w-full items-center justify-between gap-6 px-3.5 py-2 text-left outline-none transition-colors focus-visible:bg-white/10 disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent [@media(pointer:coarse)]:min-h-[44px] ${
              entry.danger ? "text-red-400 hover:bg-red-500/10" : "hover:bg-white/10"
            }`}
          >
            <span className="flex items-center gap-2.5">
              <span className={entry.danger ? "text-red-400" : "text-slate-400"}>{entry.icon}</span>
              <span>{entry.label}</span>
            </span>
            {entry.shortcut && <span className="font-mono text-[10px] text-slate-500 [@media(pointer:coarse)]:hidden">{entry.shortcut}</span>}
          </button>
        ),
      )}
    </div>
  );
}
