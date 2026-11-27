/**
 * Pages opened earlier in this tab, kept in memory so opening one again shows
 * it at once while the fresh copy loads. Nothing is written to the browser;
 * a reload or signing out (a full page change) empties it.
 */

/** Enough for a study session's worth of pages, without holding large documents forever. */
export const NOTE_CACHE_LIMIT = 30;

export type CachedNote = { id: string; version: number };

export function createNoteCache<T extends CachedNote>(limit = NOTE_CACHE_LIMIT) {
  const entries = new Map<string, T>();
  return {
    get(id: string): T | null {
      const entry = entries.get(id);
      if (!entry) return null;
      // Most recently used last, so the oldest is dropped first.
      entries.delete(id);
      entries.set(id, entry);
      return entry;
    },
    /** Keeps the newer copy: a slow response can't replace a saved version with an older one. */
    put(entry: T) {
      const current = entries.get(entry.id);
      if (current && current.version > entry.version) return;
      entries.delete(entry.id);
      entries.set(entry.id, entry);
      while (entries.size > limit) {
        const oldest = entries.keys().next().value;
        if (oldest === undefined) break;
        entries.delete(oldest);
      }
    },
    forget(id: string) {
      entries.delete(id);
    },
    get size() {
      return entries.size;
    },
  };
}
