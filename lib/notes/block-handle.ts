// ---------------------------------------------------------------------------
// Block handle: drag blocks to reorder them, tap for the block menu
// ---------------------------------------------------------------------------
//
// A grip appears beside the block under the mouse (or, on touch screens,
// beside the block being edited). Dragging it with mouse, pen or finger moves
// the block; a tap opens a menu (turn into, duplicate, delete, move, copy
// link). Pointer events with capture, not HTML drag-and-drop, so the same
// code works on iOS. What moves where is decided by block-moves.ts.

import { Extension, type Editor } from "@tiptap/core";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { placeFloating } from "./floating";
import { blockUnits, deleteUnit, dropGaps, duplicateUnit, moveUnit, shiftUnit, type BlockUnit } from "./block-moves";

const handleKey = new PluginKey("noteBlockHandle");
const DRAG_THRESHOLD = 5;
const GRIP_SVG =
  '<svg width="12" height="18" viewBox="0 0 12 18" aria-hidden="true"><g fill="currentColor"><circle cx="3" cy="3" r="1.6"/><circle cx="9" cy="3" r="1.6"/><circle cx="3" cy="9" r="1.6"/><circle cx="9" cy="9" r="1.6"/><circle cx="3" cy="15" r="1.6"/><circle cx="9" cy="15" r="1.6"/></g></svg>';

type TurnInto = { label: string; run: (editor: Editor) => void; textOnly: boolean };

const TURN_INTO: TurnInto[] = [
  { label: "Text", textOnly: true, run: (e) => e.chain().focus().setParagraph().run() },
  { label: "Heading 1", textOnly: true, run: (e) => e.chain().focus().setHeading({ level: 1 }).run() },
  { label: "Heading 2", textOnly: true, run: (e) => e.chain().focus().setHeading({ level: 2 }).run() },
  { label: "Heading 3", textOnly: true, run: (e) => e.chain().focus().setHeading({ level: 3 }).run() },
  { label: "Bulleted list", textOnly: true, run: (e) => e.chain().focus().toggleBulletList().run() },
  { label: "Numbered list", textOnly: true, run: (e) => e.chain().focus().toggleOrderedList().run() },
  { label: "To-do list", textOnly: true, run: (e) => e.chain().focus().toggleTaskList().run() },
  { label: "Quote", textOnly: true, run: (e) => e.chain().focus().toggleBlockquote().run() },
  { label: "Code", textOnly: true, run: (e) => e.chain().focus().toggleCodeBlock().run() },
];

function unitDom(view: EditorView, unit: BlockUnit): HTMLElement | null {
  const dom = view.nodeDOM(unit.pos);
  return dom instanceof HTMLElement ? dom : null;
}

/** The unit whose box contains `y`; list items win over their list. */
function unitAtY(view: EditorView, y: number): BlockUnit | null {
  let found: BlockUnit | null = null;
  for (const unit of blockUnits(view.state.doc)) {
    const rect = unitDom(view, unit)?.getBoundingClientRect();
    if (!rect || rect.height === 0) continue;
    if (y >= rect.top - 2 && y <= rect.bottom + 2) {
      if (!found || unit.listPos !== null) found = unit;
    }
  }
  return found;
}

/** The unit holding the selection (a list item if inside one). */
function unitAtSelection(view: EditorView): BlockUnit | null {
  const at = view.state.selection.from;
  let found: BlockUnit | null = null;
  for (const unit of blockUnits(view.state.doc)) {
    if (at > unit.pos && at < unit.pos + unit.node.nodeSize) {
      if (!found || unit.listPos !== null) found = unit;
    }
  }
  return found;
}

/** The drop gap nearest to `y` for `unit`, with the y of its line. */
function gapAtY(view: EditorView, unit: BlockUnit, y: number): { gap: number; lineY: number } | null {
  const gaps = dropGaps(view.state.doc, unit);
  let best: { gap: number; lineY: number; distance: number } | null = null;
  for (const gap of gaps) {
    const after = view.state.doc.resolve(gap).nodeAfter;
    let lineY: number;
    if (after) {
      const dom = view.nodeDOM(gap);
      if (!(dom instanceof HTMLElement)) continue;
      lineY = dom.getBoundingClientRect().top - 2;
    } else {
      // The end of the list / document: below the last sibling.
      const before = view.state.doc.resolve(gap).nodeBefore;
      const dom = before ? view.nodeDOM(gap - before.nodeSize) : null;
      if (!(dom instanceof HTMLElement)) continue;
      lineY = dom.getBoundingClientRect().bottom + 2;
    }
    const distance = Math.abs(lineY - y);
    if (!best || distance < best.distance) best = { gap, lineY, distance };
  }
  return best ? { gap: best.gap, lineY: best.lineY } : null;
}

function menuButton(label: string, onClick: () => void, danger = false) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `note-block-menu-item${danger ? " danger" : ""}`;
  button.setAttribute("role", "menuitem");
  button.textContent = label;
  button.addEventListener("pointerdown", (event) => event.preventDefault());
  button.addEventListener("click", onClick);
  return button;
}

class BlockHandleView {
  private readonly handle: HTMLButtonElement;
  private readonly line: HTMLDivElement;
  private menu: HTMLDivElement | null = null;
  private current: BlockUnit | null = null;
  private drag: { pointerId: number; startX: number; startY: number; moving: boolean; gap: number | null } | null = null;
  private frame = 0;
  private lastPointer: { x: number; y: number } | null = null;
  private readonly coarse = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches === true;

  constructor(private readonly view: EditorView, private readonly editor: Editor) {
    this.handle = document.createElement("button");
    this.handle.type = "button";
    this.handle.className = "note-block-handle";
    this.handle.setAttribute("aria-label", "Drag to move, or open the block menu");
    this.handle.title = "Drag to move · Click for options";
    this.handle.innerHTML = GRIP_SVG;
    this.handle.hidden = true;
    this.line = document.createElement("div");
    this.line.className = "note-drop-line";
    this.line.hidden = true;
    const host = this.host();
    host?.append(this.handle, this.line);

    this.handle.addEventListener("pointerdown", this.onHandleDown);
    this.handle.addEventListener("pointermove", this.onHandleMove);
    this.handle.addEventListener("pointerup", this.onHandleUp);
    this.handle.addEventListener("pointercancel", this.onHandleCancel);
    this.handle.addEventListener("lostpointercapture", this.onHandleCancel);
    this.handle.addEventListener("keydown", this.onHandleKey);
    document.addEventListener("mousemove", this.onMouseMove, { passive: true });
  }

  private host(): HTMLElement | null {
    return this.view.dom.parentElement;
  }

  update() {
    if (this.drag?.moving) return;
    if (!this.view.editable) {
      this.hide();
      return;
    }
    if (this.coarse) {
      // Touch screens have no hover: follow the block being edited.
      this.show(this.view.hasFocus() || this.menu ? unitAtSelection(this.view) : null);
    } else if (this.current) {
      // The document changed under a shown handle: re-place it.
      const fresh = blockUnits(this.view.state.doc).find((unit) => unit.pos === this.current?.pos);
      this.show(fresh ?? null);
    }
  }

  destroy() {
    cancelAnimationFrame(this.frame);
    document.removeEventListener("mousemove", this.onMouseMove);
    this.closeMenu();
    this.handle.remove();
    this.line.remove();
  }

  private hide() {
    if (this.menu || this.drag) return;
    this.current = null;
    this.handle.hidden = true;
  }

  private show(unit: BlockUnit | null) {
    const host = this.host();
    const dom = unit ? unitDom(this.view, unit) : null;
    if (!unit || !host || !dom) {
      this.hide();
      return;
    }
    this.current = unit;
    const hostRect = host.getBoundingClientRect();
    const rect = dom.getBoundingClientRect();
    // Centre the grip on the block's first line.
    const lineHeight = Number.parseFloat(getComputedStyle(dom).lineHeight) || 24;
    const firstLine = Math.min(rect.height, lineHeight);
    this.handle.style.top = `${rect.top - hostRect.top + firstLine / 2 - 12}px`;
    // Never off the left edge of the screen.
    const left = Math.max(rect.left - hostRect.left - 26, 2 - hostRect.left);
    this.handle.style.left = `${left}px`;
    this.handle.hidden = false;
  }

  private readonly onMouseMove = (event: MouseEvent) => {
    if (this.coarse || this.drag || this.menu || !this.view.editable) return;
    this.lastPointer = { x: event.clientX, y: event.clientY };
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      const pointer = this.lastPointer;
      const host = this.host();
      if (!pointer || !host) return;
      const rect = host.getBoundingClientRect();
      // The gutter left of the text counts as inside, so the grip can be reached.
      const inside = pointer.x >= rect.left - 48 && pointer.x <= rect.right && pointer.y >= rect.top && pointer.y <= rect.bottom;
      if (!inside) {
        this.hide();
        return;
      }
      this.show(unitAtY(this.view, pointer.y));
    });
  };

  private readonly onHandleDown = (event: PointerEvent) => {
    if (!this.current || event.button !== 0) return;
    event.preventDefault();
    this.handle.setPointerCapture(event.pointerId);
    this.drag = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, moving: false, gap: null };
  };

  private readonly onHandleMove = (event: PointerEvent) => {
    const drag = this.drag;
    if (!drag || drag.pointerId !== event.pointerId || !this.current) return;
    if (!drag.moving) {
      if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < DRAG_THRESHOLD) return;
      drag.moving = true;
      this.closeMenu();
      this.host()?.classList.add("note-dragging");
      unitDom(this.view, this.current)?.classList.add("note-drag-source");
    }
    // Scroll when dragging near the top or bottom of the screen.
    const edge = 56;
    if (event.clientY < edge) window.scrollBy(0, -12);
    else if (event.clientY > window.innerHeight - edge) window.scrollBy(0, 12);
    const target = gapAtY(this.view, this.current, event.clientY);
    const host = this.host();
    if (!target || !host) return;
    drag.gap = target.gap;
    const hostRect = host.getBoundingClientRect();
    const dom = unitDom(this.view, this.current);
    const left = dom ? dom.getBoundingClientRect().left - hostRect.left : 0;
    this.line.style.top = `${target.lineY - hostRect.top - 1}px`;
    this.line.style.left = `${left}px`;
    this.line.hidden = false;
  };

  private readonly onHandleUp = (event: PointerEvent) => {
    const drag = this.drag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const unit = this.current;
    this.endDrag();
    if (!unit) return;
    if (!drag.moving) {
      this.toggleMenu(unit);
      return;
    }
    if (drag.gap === null) return;
    const tr = moveUnit(this.view.state, unit.pos, drag.gap);
    if (tr) {
      this.view.dispatch(tr.scrollIntoView());
      this.view.focus();
    }
  };

  private readonly onHandleCancel = () => {
    if (this.drag) this.endDrag();
  };

  private readonly onHandleKey = (event: KeyboardEvent) => {
    if (!this.current) return;
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      this.shift(this.current, event.key === "ArrowUp" ? -1 : 1);
    }
  };

  private endDrag() {
    const unit = this.current;
    if (unit) unitDom(this.view, unit)?.classList.remove("note-drag-source");
    this.host()?.classList.remove("note-dragging");
    this.line.hidden = true;
    if (this.drag && this.handle.hasPointerCapture(this.drag.pointerId)) this.handle.releasePointerCapture(this.drag.pointerId);
    this.drag = null;
  }

  private shift(unit: BlockUnit, direction: -1 | 1) {
    const tr = shiftUnit(this.view.state, unit.pos, direction);
    if (!tr) return;
    this.view.dispatch(tr.scrollIntoView());
    const moved = unitAtSelection(this.view);
    this.show(moved);
  }

  private closeMenu() {
    this.menu?.remove();
    this.menu = null;
    document.removeEventListener("pointerdown", this.onOutside, true);
  }

  private readonly onOutside = (event: PointerEvent) => {
    const target = event.target as Node;
    if (this.menu?.contains(target) || this.handle.contains(target)) return;
    this.closeMenu();
  };

  private toggleMenu(unit: BlockUnit) {
    if (this.menu) {
      this.closeMenu();
      return;
    }
    const menu = document.createElement("div");
    menu.className = "note-block-menu";
    menu.setAttribute("role", "menu");
    const act = (run: () => void) => () => {
      this.closeMenu();
      run();
    };
    const selectInside = () => {
      const inside = Math.min(unit.pos + 1, this.view.state.doc.content.size);
      this.view.dispatch(this.view.state.tr.setSelection(TextSelection.near(this.view.state.doc.resolve(inside))));
    };
    const isText = unit.node.isTextblock || (unit.listPos !== null && unit.node.firstChild?.isTextblock === true);
    if (isText) {
      const heading = document.createElement("div");
      heading.className = "note-block-menu-heading";
      heading.textContent = "Turn into";
      menu.append(heading);
      for (const option of TURN_INTO) {
        menu.append(menuButton(option.label, act(() => {
          selectInside();
          option.run(this.editor);
        })));
      }
      const divider = document.createElement("div");
      divider.className = "note-block-menu-sep";
      menu.append(divider);
    }
    menu.append(
      menuButton("Move up", act(() => this.shift(unit, -1))),
      menuButton("Move down", act(() => this.shift(unit, 1))),
      menuButton("Duplicate", act(() => {
        const tr = duplicateUnit(this.view.state, unit.pos);
        if (tr) this.view.dispatch(tr);
      })),
    );
    const blockId = typeof unit.node.attrs.id === "string" ? unit.node.attrs.id : null;
    if (blockId && navigator.clipboard) {
      menu.append(menuButton("Copy link to block", act(() => {
        const url = `${window.location.origin}${window.location.pathname}#${blockId}`;
        void navigator.clipboard.writeText(url).catch(() => undefined);
      })));
    }
    menu.append(menuButton("Delete", act(() => {
      const tr = deleteUnit(this.view.state, unit.pos);
      if (tr) this.view.dispatch(tr);
      this.hide();
    }), true));

    document.body.append(menu);
    placeFloating(menu, this.handle.getBoundingClientRect(), { gap: 4, maxHeight: 420 });
    this.menu = menu;
    document.addEventListener("pointerdown", this.onOutside, true);
  }
}

export const BlockHandle = Extension.create({
  name: "blockHandle",
  addProseMirrorPlugins() {
    const editor = this.editor;
    return [
      new Plugin({
        key: handleKey,
        view: (view) => new BlockHandleView(view, editor),
      }),
    ];
  },
});
