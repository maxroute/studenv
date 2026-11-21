"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent } from "react";
import { ChevronUp, Focus, Maximize2, Minus, Plus, Redo2, Undo2, X } from "lucide-react";
import { toast } from "react-hot-toast";
import { useSelectionStore } from "@/lib/workspace/selection-engine";
import { ignoreTouchNearPen } from "@/lib/workspace/palm-rejection";
import "./board-controls.css";

type BoardControlsProps = {
  /** The board's live zoom, 1 = 100%. */
  zoom: number;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  /** Zoom to the next 10% step, around the middle of the view. */
  onZoomBy: (direction: 1 | -1) => void;
  onZoomTo100: () => void;
  onFit: () => void;
  onZoomToSelection: () => void;
  /** True when the board's view has drifted away from its content. */
  showFitHint: boolean;
  onDismissFitHint: () => void;
};

const isMac = () => typeof navigator !== "undefined" && /mac/i.test(navigator.platform);

/** True when a key press is for typing, not for the board. */
function isTypingTarget(target: EventTarget | null) {
  return target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
}

/**
 * Undo and redo, and zoom, at the bottom-left of a board. Two quiet groups for
 * a mouse (small, with shortcuts in tooltips); for fingers, 44 to 48 px
 * buttons, and no − or + because two-finger pinch is the way to zoom. The zoom menu holds only what has no button or gesture of its
 * own: 100%, fit to screen and zoom to selection. While a pen is in use,
 * touches on these buttons are ignored.
 */
export function BoardControls({ zoom, canUndo, canRedo, onUndo, onRedo, onZoomBy, onZoomTo100, onFit, onZoomToSelection, showFitHint, onDismissFitHint }: BoardControlsProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const lastPenAtRef = useRef<number | null>(null);
  const rejectedTouchRef = useRef(false);
  const mod = isMac() ? "⌘" : "Ctrl+";

  // A pen moving or touching the screen means a palm may be resting on it.
  useEffect(() => {
    const note = (event: globalThis.PointerEvent) => {
      if (event.pointerType === "pen") lastPenAtRef.current = performance.now();
    };
    window.addEventListener("pointermove", note, { capture: true, passive: true });
    window.addEventListener("pointerdown", note, { capture: true, passive: true });
    return () => {
      window.removeEventListener("pointermove", note, { capture: true });
      window.removeEventListener("pointerdown", note, { capture: true });
    };
  }, []);

  const zoomToSelection = useCallback(() => {
    if (!useSelectionStore.getState().selectedIds.length) {
      toast("Select something to zoom to it.");
      return;
    }
    onZoomToSelection();
  }, [onZoomToSelection]);

  // Shift+1 fits the board, Shift+2 zooms to the selection, Shift+0 goes to 100%.
  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (!event.shiftKey || event.ctrlKey || event.metaKey || event.altKey || event.repeat || isTypingTarget(event.target)) return;
      if (event.code === "Digit1") onFit();
      else if (event.code === "Digit2") zoomToSelection();
      else if (event.code === "Digit0") onZoomTo100();
      else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onFit, onZoomTo100, zoomToSelection]);

  // The menu closes on a press elsewhere or Escape, and starts on its first item.
  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: globalThis.PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setMenuOpen(false);
      rootRef.current?.querySelector<HTMLButtonElement>(".bc-percent")?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  const openMenu = () => {
    setMenuOpen((open) => !open);
  };
  useEffect(() => {
    if (menuOpen) menuRef.current?.querySelector<HTMLButtonElement>(".bc-item")?.focus({ preventScroll: true });
  }, [menuOpen]);

  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const items = [...(menuRef.current?.querySelectorAll<HTMLButtonElement>(".bc-item") ?? [])];
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === "ArrowDown" ? (at + 1) % items.length : (at - 1 + items.length) % items.length;
    items[next]?.focus();
    event.preventDefault();
  };

  const choose = (action: () => void) => () => {
    action();
    setMenuOpen(false);
  };

  // A touch near the pen is a palm: stop it before it reaches a button.
  const onPointerDownCapture = (event: PointerEvent<HTMLDivElement>) => {
    if (ignoreTouchNearPen(event.pointerType, lastPenAtRef.current, performance.now())) {
      rejectedTouchRef.current = true;
      event.preventDefault();
      event.stopPropagation();
    }
  };
  const onClickCapture = (event: MouseEvent<HTMLDivElement>) => {
    if (!rejectedTouchRef.current) return;
    rejectedTouchRef.current = false;
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <div
      ref={rootRef}
      className="bc"
      role="group"
      aria-label="Board controls"
      onPointerDownCapture={onPointerDownCapture}
      onClickCapture={onClickCapture}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="bc-pill" role="group" aria-label="History">
        <button type="button" className="bc-btn" onClick={onUndo} disabled={!canUndo} title={`Undo (${mod}Z)`} aria-label="Undo">
          <Undo2 aria-hidden />
        </button>
        <button type="button" className="bc-btn" onClick={onRedo} disabled={!canRedo} title={`Redo (${mod}Shift+Z)`} aria-label="Redo">
          <Redo2 aria-hidden />
        </button>
      </div>

      <div className="bc-zoom">
      <div className="bc-pill" role="group" aria-label="Zoom">
        <button type="button" className="bc-btn bc-step" onClick={() => onZoomBy(-1)} title="Zoom out" aria-label="Zoom out">
          <Minus aria-hidden />
        </button>
        <button type="button" className="bc-btn bc-percent" onClick={openMenu} aria-haspopup="menu" aria-expanded={menuOpen} title="Zoom options" aria-label={`Zoom ${Math.round(zoom * 100)}%, open zoom options`}>
          <span aria-hidden>{Math.round(zoom * 100)}%</span>
          <ChevronUp aria-hidden />
        </button>
        <button type="button" className="bc-btn bc-step" onClick={() => onZoomBy(1)} title="Zoom in" aria-label="Zoom in">
          <Plus aria-hidden />
        </button>
      </div>
        {menuOpen ? (
          <div ref={menuRef} className="bc-menu" role="menu" aria-label="Zoom options" onKeyDown={onMenuKeyDown}>
            <button type="button" role="menuitem" className="bc-item" onClick={choose(onZoomTo100)}>
              <span aria-hidden className="bc-one">1:1</span> Zoom to 100%
              <kbd>⇧0</kbd>
            </button>
            <button type="button" role="menuitem" className="bc-item" onClick={choose(onFit)}>
              <Maximize2 aria-hidden /> Fit to screen
              <kbd>⇧1</kbd>
            </button>
            <button type="button" role="menuitem" className="bc-item" onClick={choose(zoomToSelection)}>
              <Focus aria-hidden /> Zoom to selection
              <kbd>⇧2</kbd>
            </button>
          </div>
        ) : null}
      </div>

      {showFitHint && !menuOpen ? (
        <div className="bc-tip" role="status">
          <span className="bc-tip-text">Lost your view?</span>
          <button type="button" className="bc-tip-fit" onClick={() => { onFit(); onDismissFitHint(); }}>
            <Maximize2 aria-hidden /> Fit to screen
          </button>
          <button type="button" className="bc-tip-x" onClick={onDismissFitHint} aria-label="Dismiss this tip">
            <X aria-hidden />
          </button>
        </div>
      ) : null}
    </div>
  );
}
