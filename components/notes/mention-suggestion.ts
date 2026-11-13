"use client";

import type { SuggestionKeyDownProps, SuggestionOptions, SuggestionProps } from "@tiptap/suggestion";
import type { NoteMentionItem } from "@/lib/notes/editor-extensions";

/**
 * The "@" picker: lists notes by title. A plain DOM popup (no extra
 * dependency) positioned under the caret; works with keyboard, mouse and touch.
 */
export function createMentionSuggestion(
  getItems: () => NoteMentionItem[],
): Omit<SuggestionOptions<NoteMentionItem>, "editor"> {
  return {
    char: "@",
    items: ({ query }) => {
      const q = query.trim().toLowerCase();
      return getItems()
        .filter((item) => !q || item.label.toLowerCase().includes(q))
        .slice(0, 8);
    },
    render: () => {
      let popup: HTMLDivElement | null = null;
      let selected = 0;
      let current: SuggestionProps<NoteMentionItem> | null = null;

      const choose = (index: number) => {
        const item = current?.items[index];
        if (item && current) current.command({ ref: item.ref, label: item.label });
      };

      const draw = () => {
        if (!popup || !current) return;
        popup.replaceChildren();
        if (current.items.length === 0) {
          const empty = document.createElement("div");
          empty.className = "note-mention-empty";
          empty.textContent = "No matching notes";
          popup.append(empty);
        }
        current.items.forEach((item, index) => {
          const button = document.createElement("button");
          button.type = "button";
          button.className = `note-mention-option${index === selected ? " active" : ""}`;
          button.textContent = item.label || "Untitled";
          // pointerdown keeps the editor focused, so the caret stays where @ was typed.
          button.addEventListener("pointerdown", (event) => {
            event.preventDefault();
            choose(index);
          });
          popup?.append(button);
        });
        const rect = current.clientRect?.();
        if (rect) {
          const top = Math.min(rect.bottom + 6, window.innerHeight - 240);
          const left = Math.max(8, Math.min(rect.left, window.innerWidth - 268));
          popup.style.top = `${top}px`;
          popup.style.left = `${left}px`;
        }
      };

      return {
        onStart: (props) => {
          current = props;
          selected = 0;
          popup = document.createElement("div");
          popup.className = "note-mention-popup";
          popup.setAttribute("role", "listbox");
          document.body.append(popup);
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
            selected = (selected + 1) % Math.max(1, current.items.length);
            draw();
            return true;
          }
          if (event.key === "ArrowUp") {
            selected = (selected - 1 + Math.max(1, current.items.length)) % Math.max(1, current.items.length);
            draw();
            return true;
          }
          if (event.key === "Enter") {
            choose(selected);
            return true;
          }
          return event.key === "Escape";
        },
        onExit: () => {
          popup?.remove();
          popup = null;
          current = null;
        },
      };
    },
  };
}
