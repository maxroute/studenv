"use client";

import type { SuggestionKeyDownProps, SuggestionOptions, SuggestionProps } from "@tiptap/suggestion";

export type PopupEntry = {
  /** Shown in bold. */
  title: string;
  /** Second line (block description, item type, …). */
  detail?: string;
  /** Small label on the left (icon glyph or group). */
  badge?: string;
  /** Optional group heading; consecutive entries with the same group share one heading. */
  group?: string;
};

/**
 * The popup used by "/" and "@": a plain DOM list under the caret. Arrow keys,
 * Enter, Escape, mouse and touch all work; pressing an entry keeps the editor
 * focused so the caret stays where the trigger was typed.
 */
export function popupRenderer<T>(toEntry: (item: T) => PopupEntry, emptyText: string): SuggestionOptions<T>["render"] {
  return () => {
    let popup: HTMLDivElement | null = null;
    let selected = 0;
    let current: SuggestionProps<T> | null = null;

    const choose = (index: number) => {
      const item = current?.items[index];
      if (item !== undefined && current) current.command(item);
    };

    const draw = () => {
      if (!popup || !current) return;
      popup.replaceChildren();
      // Queries may contain spaces ("cell bio"); once one matches nothing, the
      // user is just writing a sentence, so get out of the way.
      const writingOn = current.items.length === 0 && /\s/.test(current.query);
      popup.style.display = writingOn ? "none" : "";
      if (writingOn) return;
      if (current.items.length === 0) {
        const empty = document.createElement("div");
        empty.className = "note-popup-empty";
        empty.textContent = emptyText;
        popup.append(empty);
      }
      let lastGroup: string | undefined;
      current.items.forEach((item, index) => {
        const entry = toEntry(item);
        if (entry.group && entry.group !== lastGroup) {
          const heading = document.createElement("div");
          heading.className = "note-popup-group";
          heading.textContent = entry.group;
          popup?.append(heading);
        }
        lastGroup = entry.group;
        const button = document.createElement("button");
        button.type = "button";
        button.setAttribute("role", "option");
        button.setAttribute("aria-selected", String(index === selected));
        button.className = `note-popup-option${index === selected ? " active" : ""}`;
        if (entry.badge) {
          const badge = document.createElement("span");
          badge.className = "note-popup-badge";
          badge.textContent = entry.badge;
          button.append(badge);
        }
        const text = document.createElement("span");
        text.className = "note-popup-text";
        const title = document.createElement("span");
        title.className = "note-popup-title";
        title.textContent = entry.title;
        text.append(title);
        if (entry.detail) {
          const detail = document.createElement("span");
          detail.className = "note-popup-detail";
          detail.textContent = entry.detail;
          text.append(detail);
        }
        button.append(text);
        button.addEventListener("pointerdown", (event) => {
          event.preventDefault();
          choose(index);
        });
        popup?.append(button);
        if (index === selected) window.requestAnimationFrame(() => button.scrollIntoView({ block: "nearest" }));
      });
      place();
    };

    // On phones the on-screen keyboard shrinks the visible area (the visual
    // viewport). Browsers disagree on what the caret rect is relative to
    // (iOS Safari: the visual viewport; Chrome: the layout viewport), while
    // `position: fixed` is always laid out against the layout viewport. So
    // measure where the popup's fixed origin lands in rect coordinates and do
    // the maths there, keeping the popup inside what the user can see.
    const place = () => {
      const rect = current?.clientRect?.();
      if (!popup || !rect) return;
      popup.style.top = "0px";
      popup.style.left = "0px";
      const origin = popup.getBoundingClientRect();
      const viewport = window.visualViewport;
      const visibleTop = (viewport?.offsetTop ?? 0) + origin.top + 8;
      const visibleBottom = (viewport ? viewport.offsetTop + viewport.height : window.innerHeight) + origin.top - 8;
      const visibleLeft = (viewport?.offsetLeft ?? 0) + origin.left + 8;
      const visibleRight = (viewport ? viewport.offsetLeft + viewport.width : window.innerWidth) + origin.left - 8;
      const roomBelow = visibleBottom - (rect.bottom + 6);
      const roomAbove = rect.top - 6 - visibleTop;
      const height = Math.min(popup.scrollHeight, 320, Math.max(roomBelow, roomAbove, 120));
      popup.style.maxHeight = `${height}px`;
      const top = roomBelow >= height || roomBelow >= roomAbove ? rect.bottom + 6 : rect.top - 6 - height;
      const left = Math.max(visibleLeft, Math.min(rect.left, visibleRight - origin.width));
      popup.style.top = `${Math.max(visibleTop, top) - origin.top}px`;
      popup.style.left = `${left - origin.left}px`;
    };

    const move = (delta: number) => {
      if (!current || current.items.length === 0) return;
      selected = (selected + delta + current.items.length) % current.items.length;
      draw();
    };

    return {
      onStart: (props) => {
        current = props;
        selected = 0;
        popup = document.createElement("div");
        popup.className = "note-popup";
        popup.setAttribute("role", "listbox");
        document.body.append(popup);
        window.visualViewport?.addEventListener("resize", place);
        window.visualViewport?.addEventListener("scroll", place);
        draw();
      },
      onUpdate: (props) => {
        current = props;
        selected = Math.min(selected, Math.max(0, props.items.length - 1));
        draw();
      },
      onKeyDown: ({ event }: SuggestionKeyDownProps) => {
        if (!current) return false;
        if (event.key === "ArrowDown") {
          move(1);
          return true;
        }
        if (event.key === "ArrowUp") {
          move(-1);
          return true;
        }
        if (event.key === "Escape") {
          if (popup) popup.style.display = "none";
          return true;
        }
        if (event.key === "Enter" || event.key === "Tab") {
          if (current.items.length === 0) return false;
          choose(selected);
          return true;
        }
        return event.key === "Escape";
      },
      onExit: () => {
        window.visualViewport?.removeEventListener("resize", place);
        window.visualViewport?.removeEventListener("scroll", place);
        popup?.remove();
        popup = null;
        current = null;
      },
    };
  };
}
