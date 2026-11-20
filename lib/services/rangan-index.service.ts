import type { HashedPassage } from "@/lib/rangan/chunking";
import { openTarget, type OpenTarget } from "@/lib/rangan/citations";
import { planSourceSync, type IndexedSource, type SourceVersion } from "@/lib/rangan/index-plan";
import { buildOrTsQuery, filterMeaningMatches, fuseRankings, passageRef, snippet, type IndexSourceType } from "@/lib/rangan/ranking";

export type RanganIndexDeps = {
  listSourceVersions: (ownerId: string) => Promise<SourceVersion[]>;
  listIndexedSources: (ownerId: string) => Promise<IndexedSource[]>;
  loadPassages: (ownerId: string, type: IndexSourceType, id: string) => Promise<HashedPassage[] | null>;
  replaceSourceChunks: (ownerId: string, source: SourceVersion, passages: readonly HashedPassage[]) => Promise<void>;
  removeSources: (ownerId: string, sources: readonly IndexedSource[]) => Promise<void>;
  listPendingEmbeddings: (
    ownerId: string,
    limit: number,
  ) => Promise<Array<{ id: string; contentHash: string; title: string; heading: string; content: string }>>;
  countPendingEmbeddings: (ownerId: string) => Promise<number>;
  saveEmbeddings: (ownerId: string, rows: Array<{ id: string; contentHash: string; vector: number[] }>) => Promise<void>;
  keywordSearch: (ownerId: string, tsQuery: string, limit: number) => Promise<string[]>;
  meaningSearch: (ownerId: string, vector: readonly number[], limit: number) => Promise<Array<{ id: string; similarity: number }>>;
  loadChunks: (
    ownerId: string,
    ids: readonly string[],
  ) => Promise<Array<{ id: string; sourceType: string; sourceId: string; anchor: string; title: string; heading: string; content: string }>>;
  findSourceTitle: (ownerId: string, type: IndexSourceType, id: string) => Promise<string | null>;
  /** Shelf item of each asset that has one, for opening PDF and video citations. */
  findItemIdsForAssets: (ownerId: string, assetIds: readonly string[]) => Promise<Map<string, string>>;
  /** Throws when embeddings are unavailable; the index then works by keyword only. */
  embed: (texts: readonly string[]) => Promise<number[][]>;
};

export type SyncLimits = { maxSources?: number; maxEmbeddings?: number };
export type SyncReport = { indexed: number; removed: number; embedded: number; pendingSources: number; pendingEmbeddings: number };

export type SearchResult = {
  ref: string;
  sourceType: string;
  sourceId: string;
  anchor: string;
  title: string;
  heading: string;
  snippet: string;
  /** The full passage, for building an answer. */
  content: string;
  matchedBy: string[];
  /** Where the passage opens; null when it has nothing to open. */
  open: OpenTarget | null;
};

/** Sources (re)indexed per refresh; the rest wait for the next one. */
export const SYNC_MAX_SOURCES = 25;
/** Passages embedded per refresh. */
export const SYNC_MAX_EMBEDDINGS = 128;
const CANDIDATES_PER_SEARCH = 24;
const MAX_RESULTS_PER_SOURCE = 2;

/** Text a passage is embedded from: where it sits, then what it says. */
export const embeddingText = (row: { title: string; heading: string; content: string }) =>
  [row.title, row.heading, row.content].filter((part) => part.trim()).join("\n");

export function createRanganIndexService(deps: RanganIndexDeps) {
  /** One refresh per user at a time; a second caller waits for the running one. */
  const running = new Map<string, Promise<SyncReport>>();

  async function embedPending(ownerId: string, limit: number): Promise<number> {
    if (limit <= 0) return 0;
    const pending = await deps.listPendingEmbeddings(ownerId, limit);
    if (pending.length === 0) return 0;
    let vectors: number[][];
    try {
      vectors = await deps.embed(pending.map(embeddingText));
    } catch {
      return 0; // Keyword search still works; these passages are retried next time.
    }
    await deps.saveEmbeddings(
      ownerId,
      pending.map((row, index) => ({ id: row.id, contentHash: row.contentHash, vector: vectors[index] })),
    );
    return pending.length;
  }

  async function runSync(ownerId: string, limits: SyncLimits): Promise<SyncReport> {
    const maxSources = limits.maxSources ?? SYNC_MAX_SOURCES;
    const [current, indexed] = await Promise.all([deps.listSourceVersions(ownerId), deps.listIndexedSources(ownerId)]);
    const plan = planSourceSync(current, indexed);

    await deps.removeSources(ownerId, plan.removed);
    let indexedCount = 0;
    const vanished: IndexedSource[] = [];
    for (const source of plan.stale.slice(0, maxSources)) {
      const passages = await deps.loadPassages(ownerId, source.type, source.id);
      if (passages === null) {
        // Deleted between listing and loading.
        vanished.push({ type: source.type, id: source.id, version: source.version });
        continue;
      }
      await deps.replaceSourceChunks(ownerId, source, passages);
      indexedCount += 1;
    }
    await deps.removeSources(ownerId, vanished);

    const embedded = await embedPending(ownerId, limits.maxEmbeddings ?? SYNC_MAX_EMBEDDINGS);
    return {
      indexed: indexedCount,
      removed: plan.removed.length + vanished.length,
      embedded,
      pendingSources: Math.max(plan.stale.length - maxSources, 0),
      pendingEmbeddings: await deps.countPendingEmbeddings(ownerId),
    };
  }

  /** Brings the user's index up to date with their library, within the per-call limits. */
  function sync(ownerId: string, limits: SyncLimits = {}): Promise<SyncReport> {
    const active = running.get(ownerId);
    if (active) return active;
    const promise = runSync(ownerId, limits).finally(() => running.delete(ownerId));
    running.set(ownerId, promise);
    return promise;
  }

  /**
   * The user's passages that best match `query`, by keyword and by meaning,
   * at most two per source so one long document cannot crowd out the rest.
   */
  async function search(ownerId: string, query: string, limit = 8) {
    await sync(ownerId);

    const tsQuery = buildOrTsQuery(query);
    const [keywordIds, meaningMatches] = await Promise.all([
      tsQuery ? deps.keywordSearch(ownerId, tsQuery, CANDIDATES_PER_SEARCH) : Promise.resolve([]),
      deps
        .embed([query])
        .then(([vector]) => deps.meaningSearch(ownerId, vector, CANDIDATES_PER_SEARCH))
        .catch(() => null),
    ]);
    const fused = fuseRankings([
      { name: "keyword", ids: keywordIds },
      // A close match in meaning is the stronger signal when the two disagree.
      { name: "meaning", ids: meaningMatches ? filterMeaningMatches(meaningMatches) : [], weight: 1.1 },
    ]);

    const loaded = await deps.loadChunks(ownerId, fused.map((entry) => entry.id));
    const chunks = new Map(loaded.map((chunk) => [chunk.id, chunk]));
    const assetIds = [...new Set(loaded.filter((chunk) => chunk.sourceType === "pdf" || chunk.sourceType === "transcript").map((chunk) => chunk.sourceId))];
    const itemIdByAsset = assetIds.length ? await deps.findItemIdsForAssets(ownerId, assetIds) : new Map<string, string>();
    const perSource = new Map<string, number>();
    const results: SearchResult[] = [];
    for (const entry of fused) {
      const chunk = chunks.get(entry.id);
      if (!chunk) continue;
      const sourceKey = `${chunk.sourceType}:${chunk.sourceId}`;
      const used = perSource.get(sourceKey) ?? 0;
      if (used >= MAX_RESULTS_PER_SOURCE) continue;
      perSource.set(sourceKey, used + 1);
      results.push({
        ref: passageRef(chunk.sourceType, chunk.sourceId, chunk.anchor),
        sourceType: chunk.sourceType,
        sourceId: chunk.sourceId,
        anchor: chunk.anchor,
        title: chunk.title,
        heading: chunk.heading,
        snippet: snippet(chunk.content),
        content: chunk.content,
        matchedBy: entry.matchedBy,
        open: openTarget(chunk.sourceType, chunk.sourceId, chunk.anchor, itemIdByAsset),
      });
      if (results.length >= limit) break;
    }
    return { results, mode: meaningMatches === null ? ("keyword" as const) : ("hybrid" as const) };
  }

  /**
   * One source's passages in document order, read live (not from the index),
   * each with its citation and where it opens. Null when it is not the user's.
   */
  async function loadSource(ownerId: string, type: IndexSourceType, id: string) {
    const [title, passages] = await Promise.all([deps.findSourceTitle(ownerId, type, id), deps.loadPassages(ownerId, type, id)]);
    if (title === null || passages === null) return null;
    const itemIdByAsset =
      type === "pdf" || type === "transcript" ? await deps.findItemIdsForAssets(ownerId, [id]) : new Map<string, string>();
    return {
      title,
      passages: passages.map((passage) => ({
        ref: passageRef(type, id, passage.anchor),
        sourceType: type,
        title,
        heading: passage.heading,
        snippet: snippet(passage.content),
        content: passage.content,
        open: openTarget(type, id, passage.anchor, itemIdByAsset),
      })),
    };
  }

  return { sync, search, loadSource };
}
