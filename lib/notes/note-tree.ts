// ---------------------------------------------------------------------------
// Page tree helpers for the notes sidebar and breadcrumbs
// ---------------------------------------------------------------------------

export type TreeNote = { id: string; title: string; parentId: string | null; sortKey: string };

export type NoteTreeNode<T extends TreeNote = TreeNote> = T & { children: NoteTreeNode<T>[] };

/** Nests notes by parent and orders siblings by sort key. Orphans (parent missing) go to the top level. */
export function buildNoteTree<T extends TreeNote>(notes: readonly T[]): NoteTreeNode<T>[] {
  const byId = new Map<string, NoteTreeNode<T>>();
  for (const note of notes) byId.set(note.id, { ...note, children: [] });
  const roots: NoteTreeNode<T>[] = [];
  for (const node of byId.values()) {
    const parent = node.parentId ? byId.get(node.parentId) : undefined;
    (parent ? parent.children : roots).push(node);
  }
  const sort = (list: NoteTreeNode<T>[]) => {
    list.sort((a, b) => (a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : a.id.localeCompare(b.id)));
    for (const node of list) sort(node.children);
  };
  sort(roots);
  return roots;
}

/** Ancestors from the top level down to (not including) the note. Stops on cycles. */
export function noteAncestors<T extends TreeNote>(notes: readonly T[], id: string): T[] {
  const byId = new Map(notes.map((note) => [note.id, note]));
  const chain: T[] = [];
  const seen = new Set<string>([id]);
  let parentId = byId.get(id)?.parentId ?? null;
  while (parentId && !seen.has(parentId)) {
    const parent = byId.get(parentId);
    if (!parent) break;
    chain.unshift(parent);
    seen.add(parentId);
    parentId = parent.parentId;
  }
  return chain;
}

/** Ids of a note and everything under it, for "move to" choices that would create a cycle. */
export function noteSubtreeIds(notes: readonly TreeNote[], id: string): Set<string> {
  const ids = new Set<string>([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const note of notes) {
      if (note.parentId && ids.has(note.parentId) && !ids.has(note.id)) {
        ids.add(note.id);
        grew = true;
      }
    }
  }
  return ids;
}
