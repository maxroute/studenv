/** Matching for the app-wide search: pages, boards, files, tasks, groups and screens. */
export type SearchKind = "screen" | "page" | "board" | "pdf" | "video" | "link" | "task" | "group";

export type SearchEntry = {
  key: string;
  kind: SearchKind;
  title: string;
  /** Extra words that find it: tags, a task's category, a file's opening text. */
  keywords?: string[];
  updatedAt?: string;
};

/** Lower is better; null means it does not match. Every word typed must be found. */
function score(entry: SearchEntry, words: string[]): number | null {
  const title = entry.title.toLowerCase();
  const titleWords = title.split(/[^\p{L}\p{N}]+/u);
  const keywords = (entry.keywords ?? []).join(" ").toLowerCase();
  let total = 0;
  for (const word of words) {
    if (title.startsWith(word)) total += 0;
    else if (titleWords.some((part) => part.startsWith(word))) total += 1;
    else if (title.includes(word)) total += 2;
    else if (keywords.includes(word)) total += 3;
    else return null;
  }
  return total;
}

/** The best matches first, newest first among equals. With nothing typed there are no results. */
export function searchEverything<T extends SearchEntry>(entries: T[], query: string, limit = 8): T[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  return entries
    .map((entry) => ({ entry, rank: score(entry, words) }))
    .filter((match): match is { entry: T; rank: number } => match.rank !== null)
    .sort((a, b) => a.rank - b.rank || (b.entry.updatedAt ?? "").localeCompare(a.entry.updatedAt ?? "") || a.entry.title.localeCompare(b.entry.title))
    .slice(0, limit)
    .map((match) => match.entry);
}
