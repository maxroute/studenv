/** Where a page can be moved: the top level, or any page that isn't itself or inside it. */
import { noteAncestors, noteSubtreeIds } from "@/lib/notes/note-tree";

export type MovablePage = { id: string; title: string; parentId: string | null; sortKey: string; updatedAt: string };

/** The choices for "Move to…"; `value` is the new parent, "" for the top level. */
export function moveChoices(pages: readonly MovablePage[], id: string): Array<{ value: string; title: string; detail?: string }> {
  const blocked = noteSubtreeIds(pages, id);
  const choices = pages
    .filter((page) => !blocked.has(page.id))
    .map((page) => {
      // The pages above it, so two pages with one name can be told apart.
      const path = noteAncestors(pages, page.id).map((parent) => parent.title || "Untitled").join(" / ");
      return { value: page.id, title: page.title || "Untitled", ...(path ? { detail: `in ${path}` } : {}) };
    })
    .sort((a, b) => a.title.localeCompare(b.title));
  return [{ value: "", title: "Top level", detail: "Listed in Library on its own" }, ...choices];
}
