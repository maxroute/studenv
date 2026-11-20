// ---------------------------------------------------------------------------
// What an index refresh has to do (pure)
// ---------------------------------------------------------------------------

import type { HashedPassage } from "./chunking";
import type { IndexSourceType } from "./ranking";

export type SourceVersion = { type: IndexSourceType; id: string; title: string; version: string };
export type IndexedSource = { type: string; id: string; version: string };

const key = (type: string, id: string) => `${type}:${id}`;

/**
 * Sources to (re)index, new ones and changed ones first in the order given,
 * and indexed sources that no longer exist (deleted, or no longer the user's).
 */
export function planSourceSync(current: readonly SourceVersion[], indexed: readonly IndexedSource[]) {
  const indexedVersions = new Map(indexed.map((source) => [key(source.type, source.id), source.version]));
  const currentKeys = new Set(current.map((source) => key(source.type, source.id)));
  return {
    stale: current.filter((source) => indexedVersions.get(key(source.type, source.id)) !== source.version),
    removed: indexed.filter((source) => !currentKeys.has(key(source.type, source.id))),
  };
}

/**
 * Matches a source's new passages to its stored ones by content hash. A match
 * keeps its row (and its embedding) and only moves to its new position; the
 * rest are created, and stored rows left unmatched (including duplicates) go.
 */
export function planChunkSync(
  existing: ReadonlyArray<{ id: string; contentHash: string }>,
  passages: readonly HashedPassage[],
) {
  const unmatched = new Map<string, string[]>();
  for (const row of existing) {
    const ids = unmatched.get(row.contentHash) ?? [];
    ids.push(row.id);
    unmatched.set(row.contentHash, ids);
  }
  const keep: Array<{ id: string; ordinal: number }> = [];
  const create: Array<{ ordinal: number; passage: HashedPassage }> = [];
  passages.forEach((passage, ordinal) => {
    const id = unmatched.get(passage.contentHash)?.shift();
    if (id) keep.push({ id, ordinal });
    else create.push({ ordinal, passage });
  });
  const remove = [...unmatched.values()].flat();
  return { keep, create, remove };
}
