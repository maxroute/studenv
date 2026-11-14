"use client";

import type { SuggestionOptions } from "@tiptap/suggestion";
import type { NoteMentionItem } from "@/lib/notes/editor-extensions";
import { popupRenderer } from "./suggestion-popup";

const GROUPS: Record<NonNullable<NoteMentionItem["kind"]>, { label: string; badge: string }> = {
  note: { label: "Pages", badge: "📄" },
  resource: { label: "Resources", badge: "📚" },
  workspace: { label: "Workspaces", badge: "⬚" },
};

/** Up to `perGroup` matches of each kind, pages first, title-prefix matches first. */
export function filterMentions(items: readonly NoteMentionItem[], query: string, perGroup = 6): NoteMentionItem[] {
  const q = query.trim().toLowerCase();
  const rank = (item: NoteMentionItem) => (!q ? 1 : item.label.toLowerCase().startsWith(q) ? 0 : item.label.toLowerCase().includes(q) ? 1 : 2);
  const result: NoteMentionItem[] = [];
  for (const kind of ["note", "resource", "workspace"] as const) {
    result.push(
      ...items
        .filter((item) => (item.kind ?? "note") === kind && rank(item) < 2)
        .sort((a, b) => rank(a) - rank(b))
        .slice(0, perGroup),
    );
  }
  return result;
}

/** The "@" picker: pages, Shelf resources and workspaces, grouped. */
export function createMentionSuggestion(getItems: () => NoteMentionItem[]): Omit<SuggestionOptions<NoteMentionItem>, "editor"> {
  return {
    char: "@",
    // Titles have spaces ("Cell biology"); the popup hides once nothing matches.
    allowSpaces: true,
    items: ({ query }) => filterMentions(getItems(), query),
    render: popupRenderer<NoteMentionItem>((item) => {
      const group = GROUPS[item.kind ?? "note"];
      return { title: item.label || "Untitled", badge: group.badge, group: group.label };
    }, "Nothing matches"),
  };
}
