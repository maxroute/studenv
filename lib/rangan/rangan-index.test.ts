import assert from "node:assert/strict";
import test from "node:test";
import { EMBEDDING_DIMENSIONS, embedTexts, EmbeddingUnavailableError, toVectorLiteral } from "@/lib/ai/embeddings";
import type { NoteDoc } from "@/lib/notes/note-format";
import { createRanganIndexService, embeddingText, type RanganIndexDeps } from "@/lib/services/rangan-index.service";
import {
  CHUNK_MAX_CHARS,
  chunkNoteDoc,
  chunkPdfPages,
  chunkPlainText,
  hashPassage,
  splitText,
  withHashes,
  type HashedPassage,
} from "./chunking";
import { planChunkSync, planSourceSync, type SourceVersion } from "./index-plan";
import { buildOrTsQuery, filterMeaningMatches, fuseRankings, passageRef, snippet, type IndexSourceType } from "./ranking";

const id = (n: number) => `b_${String(n).padStart(10, "0")}`;
const para = (n: number, text: string) => ({ type: "paragraph", attrs: { id: id(n) }, content: [{ type: "text", text }] });
const heading = (n: number, text: string) => ({ type: "heading", attrs: { id: id(n), level: 2 }, content: [{ type: "text", text }] });
const sentence = (word: string) => `${word} cells divide and grow in a careful cycle. `;

// ── chunking ────────────────────────────────────────────────────────────────

test("short text is one passage, long text is split on sentence boundaries with overlap", () => {
  assert.deepEqual(splitText("  One   two.  "), ["One two."]);
  const long = sentence("Plant").repeat(60);
  const pieces = splitText(long);
  assert.ok(pieces.length > 1);
  for (const piece of pieces) assert.ok(piece.length <= CHUNK_MAX_CHARS);
  for (const piece of pieces.slice(0, -1)) assert.match(piece, /\.$/, "pieces end at a sentence");
  const words = new Set(long.split(/\s+/));
  for (const piece of pieces) {
    assert.ok(words.has(piece.split(/\s+/)[0]), "no piece starts mid-word");
    assert.ok(words.has(piece.split(/\s+/).at(-1) ?? ""), "no piece ends mid-word");
  }
  assert.ok(pieces[0].slice(-40).length > 0 && pieces[1].includes(pieces[0].slice(-20)), "pieces overlap");
  assert.deepEqual(splitText("   "), []);
});

test("text without spaces is still split into bounded pieces", () => {
  const pieces = splitText("x".repeat(4_000));
  assert.ok(pieces.length >= 3);
  for (const piece of pieces) assert.ok(piece.length <= CHUNK_MAX_CHARS);
});

test("a note becomes passages anchored at their first block, under their heading", () => {
  const doc: NoteDoc = {
    type: "doc",
    content: [para(1, "Intro line."), heading(2, "Osmosis"), para(3, "Water crosses a membrane."), para(4, "Toward more solute.")],
  };
  const passages = chunkNoteDoc(doc);
  assert.deepEqual(passages, [
    { anchor: id(1), heading: "", content: "Intro line." },
    { anchor: id(2), heading: "Osmosis", content: "Osmosis\nWater crosses a membrane.\nToward more solute." },
  ]);
});

test("nested list items keep the list's first block id as their anchor", () => {
  const doc: NoteDoc = {
    type: "doc",
    content: [{ type: "bulletList", content: [{ type: "listItem", attrs: { id: id(7) }, content: [para(8, "Mitochondria")] }] }],
  };
  assert.equal(chunkNoteDoc(doc)[0].anchor, id(7));
});

test("PDF passages never cross a page and cite it", () => {
  const passages = chunkPdfPages([
    { pageNumber: 2, text: "Second page." },
    { pageNumber: 1, text: "First page." },
    { pageNumber: 3, text: null },
  ]);
  assert.deepEqual(passages.map((p) => [p.anchor, p.content]), [
    ["page1", "First page."],
    ["page2", "Second page."],
  ]);
});

test("the passage hash changes with text, anchor or heading", () => {
  const base = { anchor: "page1", heading: "", content: "Text" };
  const hash = hashPassage(base);
  assert.equal(hashPassage({ ...base }), hash);
  assert.notEqual(hashPassage({ ...base, content: "Text!" }), hash);
  assert.notEqual(hashPassage({ ...base, anchor: "page2" }), hash);
  assert.notEqual(hashPassage({ ...base, heading: "H" }), hash);
  assert.deepEqual(chunkPlainText(""), []);
});

// ── ranking ─────────────────────────────────────────────────────────────────

test("questions become an OR query of plain words with no tsquery operators", () => {
  assert.equal(buildOrTsQuery("What is osmosis?"), "what | is | osmosis");
  assert.equal(buildOrTsQuery("a & !b | c:* <-> (d)"), null);
  assert.equal(buildOrTsQuery("x' | ''); DROP TABLE"), "drop | table");
  assert.equal(buildOrTsQuery("কোষ বিভাজন"), "কোষ | বিভাজন");
  assert.equal(buildOrTsQuery("Page 3 and page 3"), "page | 3 | and");
  assert.equal(buildOrTsQuery("   "), null);
});

test("passages found by both searches rank above those found by one", () => {
  const fused = fuseRankings([
    { name: "keyword", ids: ["a", "b", "c"] },
    { name: "meaning", ids: ["c", "d"] },
  ]);
  assert.equal(fused[0].id, "c");
  assert.deepEqual(fused[0].matchedBy, ["keyword", "meaning"]);
  assert.deepEqual(fused.map((entry) => entry.id).sort(), ["a", "b", "c", "d"]);
});

test("citations point at the note block, PDF page, resource or Shelf item", () => {
  assert.equal(passageRef("note", "n1", id(1)), `note:n1#${id(1)}`);
  assert.equal(passageRef("note", "n1", ""), "note:n1");
  assert.equal(passageRef("pdf", "a1", "page4"), "asset:a1#page4");
  assert.equal(passageRef("transcript", "a1", ""), "asset:a1");
  assert.equal(passageRef("item", "i1", ""), "item:i1");
  assert.equal(snippet("word ".repeat(100), 40).endsWith("…"), true);
});

test("only clearly similar meaning matches count", () => {
  // Scores measured on the demo library for the query "cell".
  const cell = [
    { id: "cell-note", similarity: 0.451 },
    { id: "test-note", similarity: 0.44 },
    { id: "sticky", similarity: 0.429 },
  ];
  assert.deepEqual(filterMeaningMatches(cell), ["cell-note"]);
  // "how do plants make food from light": both photosynthesis notes, not the ATP one.
  const plants = [
    { id: "photosynthesis", similarity: 0.559 },
    { id: "calvin", similarity: 0.541 },
    { id: "atp", similarity: 0.417 },
  ];
  assert.deepEqual(filterMeaningMatches(plants), ["photosynthesis", "calvin"]);
  // Nothing in the library is about football.
  assert.deepEqual(filterMeaningMatches([{ id: "test", similarity: 0.381 }]), []);
  assert.deepEqual(filterMeaningMatches([]), []);
});

test("when keyword and meaning disagree, the closer meaning match wins the tie", () => {
  const fused = fuseRankings([
    { name: "keyword", ids: ["calvin", "photosynthesis"] },
    { name: "meaning", ids: ["photosynthesis", "calvin"], weight: 1.1 },
  ]);
  assert.deepEqual(fused.map((entry) => entry.id), ["photosynthesis", "calvin"]);
});

// ── sync plans ──────────────────────────────────────────────────────────────

test("new and changed sources are re-indexed and missing ones removed", () => {
  const current: SourceVersion[] = [
    { type: "note", id: "n1", title: "A", version: "1" },
    { type: "note", id: "n2", title: "B", version: "5" },
    { type: "pdf", id: "n2", title: "B", version: "r:2" },
  ];
  const plan = planSourceSync(current, [
    { type: "note", id: "n1", version: "1" },
    { type: "note", id: "n2", version: "4" },
    { type: "note", id: "gone", version: "1" },
  ]);
  assert.deepEqual(plan.stale.map((s) => `${s.type}:${s.id}`), ["note:n2", "pdf:n2"]);
  assert.deepEqual(plan.removed.map((s) => s.id), ["gone"]);
});

test("unchanged passages keep their rows when text is inserted above them", () => {
  const [a, b, c] = withHashes([
    { anchor: "", heading: "", content: "A" },
    { anchor: "", heading: "", content: "B" },
    { anchor: "", heading: "", content: "C" },
  ]);
  const plan = planChunkSync(
    [
      { id: "row-a", contentHash: a.contentHash },
      { id: "row-b", contentHash: b.contentHash },
      { id: "dup-b", contentHash: b.contentHash },
    ],
    [c, a, b],
  );
  assert.deepEqual(plan.keep, [
    { id: "row-a", ordinal: 1 },
    { id: "row-b", ordinal: 2 },
  ]);
  assert.deepEqual(plan.create.map((entry) => [entry.ordinal, entry.passage.content]), [[0, "C"]]);
  assert.deepEqual(plan.remove, ["dup-b"]);
});

// ── embeddings client ───────────────────────────────────────────────────────

const vector = (seed: number) => Array.from({ length: EMBEDDING_DIMENSIONS }, (_, i) => (i === seed ? 1 : 0));

test("embeddings are requested in batches and returned in order", async () => {
  const batches: number[] = [];
  const texts = Array.from({ length: 40 }, (_, i) => `t${i}`);
  const vectors = await embedTexts(texts, {
    env: { CLOUDFLARE_ACCOUNT_ID: "acct", CLOUDFLARE_API_TOKEN: "tok" },
    fetch: async (_url, init) => {
      const { input, model } = JSON.parse(String(init?.body)) as { input: string[]; model: string };
      assert.equal(model, "@cf/baai/bge-m3");
      batches.push(input.length);
      return new Response(JSON.stringify({ data: input.map((text) => ({ embedding: vector(Number(text.slice(1))) })) }));
    },
  });
  assert.deepEqual(batches, [32, 8]);
  assert.equal(vectors[39][39], 1);
});

test("embedding failures and malformed vectors become EmbeddingUnavailableError", async () => {
  const env = { CLOUDFLARE_ACCOUNT_ID: "acct", CLOUDFLARE_API_TOKEN: "tok" };
  await assert.rejects(embedTexts(["x"], { env: {}, fetch: async () => new Response("{}") }), EmbeddingUnavailableError);
  await assert.rejects(embedTexts(["x"], { env, fetch: async () => new Response("{}", { status: 500 }) }), EmbeddingUnavailableError);
  await assert.rejects(
    embedTexts(["x"], { env, fetch: async () => new Response(JSON.stringify({ data: [{ embedding: [1, 2] }] })) }),
    EmbeddingUnavailableError,
  );
  await assert.rejects(
    embedTexts(["x"], { env, fetch: async () => { throw new TypeError("offline"); } }),
    EmbeddingUnavailableError,
  );
  assert.equal(toVectorLiteral([0.5, -1, 2]), "[0.5,-1,2]");
});

// ── service with an in-memory store ─────────────────────────────────────────

type Row = { id: string; ownerId: string; sourceType: string; sourceId: string; ordinal: number; anchor: string; title: string; heading: string; content: string; contentHash: string; vector: number[] | null };

function memoryIndex(library: Record<string, { sources: SourceVersion[]; passages: Record<string, HashedPassage[]> }>, options: { embedFails?: boolean } = {}) {
  const rows: Row[] = [];
  const indexed: Array<{ ownerId: string; type: string; id: string; version: string }> = [];
  let nextId = 1;
  const calls = { loads: 0, embedded: 0 };
  const deps: RanganIndexDeps = {
    listSourceVersions: async (ownerId) => library[ownerId]?.sources ?? [],
    listIndexedSources: async (ownerId) => indexed.filter((s) => s.ownerId === ownerId).map(({ type, id, version }) => ({ type, id, version })),
    loadPassages: async (ownerId, type: IndexSourceType, id) => {
      calls.loads += 1;
      return library[ownerId]?.passages[`${type}:${id}`] ?? null;
    },
    replaceSourceChunks: async (ownerId, source, passages) => {
      const existing = rows.filter((r) => r.ownerId === ownerId && r.sourceType === source.type && r.sourceId === source.id);
      const plan = planChunkSync(existing, passages);
      for (const removeId of plan.remove) rows.splice(rows.findIndex((r) => r.id === removeId), 1);
      for (const keep of plan.keep) Object.assign(rows.find((r) => r.id === keep.id) ?? {}, { ordinal: keep.ordinal });
      for (const { ordinal, passage } of plan.create) {
        rows.push({ id: `c${nextId++}`, ownerId, sourceType: source.type, sourceId: source.id, ordinal, title: source.title, ...passage, vector: null });
      }
      const at = indexed.findIndex((s) => s.type === source.type && s.id === source.id);
      if (at >= 0) indexed.splice(at, 1);
      indexed.push({ ownerId, type: source.type, id: source.id, version: source.version });
    },
    removeSources: async (ownerId, sources) => {
      for (const source of sources) {
        for (let i = rows.length - 1; i >= 0; i -= 1) {
          if (rows[i].ownerId === ownerId && rows[i].sourceType === source.type && rows[i].sourceId === source.id) rows.splice(i, 1);
        }
        const at = indexed.findIndex((s) => s.ownerId === ownerId && s.type === source.type && s.id === source.id);
        if (at >= 0) indexed.splice(at, 1);
      }
    },
    listPendingEmbeddings: async (ownerId, limit) => rows.filter((r) => r.ownerId === ownerId && !r.vector).slice(0, limit),
    countPendingEmbeddings: async (ownerId) => rows.filter((r) => r.ownerId === ownerId && !r.vector).length,
    saveEmbeddings: async (ownerId, saved) => {
      for (const s of saved) {
        const row = rows.find((r) => r.id === s.id && r.ownerId === ownerId && r.contentHash === s.contentHash);
        if (row) row.vector = s.vector;
      }
    },
    keywordSearch: async (ownerId, tsQuery) => {
      const words = tsQuery.split(" | ");
      return rows
        .filter((r) => r.ownerId === ownerId && words.some((w) => r.content.toLowerCase().includes(w)))
        .map((r) => r.id);
    },
    meaningSearch: async (ownerId) =>
      rows.filter((r) => r.ownerId === ownerId && r.vector).map((r) => ({ id: r.id, similarity: 0.5 })).reverse(),
    loadChunks: async (ownerId, ids) => rows.filter((r) => r.ownerId === ownerId && ids.includes(r.id)),
    findItemIdsForAssets: async (_ownerId, assetIds) => new Map(assetIds.map((assetId) => [assetId, `item-of-${assetId}`])),
    findSourceTitle: async (ownerId, type, id) => library[ownerId]?.sources.find((s) => s.type === type && s.id === id)?.title ?? null,
    embed: async (texts) => {
      if (options.embedFails) throw new EmbeddingUnavailableError("http_500");
      calls.embedded += texts.length;
      return texts.map(() => vector(0));
    },
  };
  return { deps, rows, calls };
}

const passages = (...texts: string[]) => withHashes(texts.map((content) => ({ anchor: "", heading: "", content })));

test("a refresh indexes and embeds new sources, then does nothing when nothing changed", async () => {
  const lib = {
    u1: {
      sources: [{ type: "note" as const, id: "n1", title: "Bio", version: "1" }],
      passages: { "note:n1": passages("Osmosis moves water.", "Diffusion moves solutes.") },
    },
  };
  const { deps, rows, calls } = memoryIndex(lib);
  const index = createRanganIndexService(deps);
  assert.deepEqual(await index.sync("u1"), { indexed: 1, removed: 0, embedded: 2, pendingSources: 0, pendingEmbeddings: 0 });
  assert.equal(rows.length, 2);

  calls.loads = 0;
  calls.embedded = 0;
  assert.deepEqual(await index.sync("u1"), { indexed: 0, removed: 0, embedded: 0, pendingSources: 0, pendingEmbeddings: 0 });
  assert.equal(calls.loads, 0);
});

test("editing a note re-embeds only the passages that changed", async () => {
  const lib = {
    u1: {
      sources: [{ type: "note" as const, id: "n1", title: "Bio", version: "1" }],
      passages: { "note:n1": passages("Osmosis moves water.", "Diffusion moves solutes.") },
    },
  };
  const { deps, calls } = memoryIndex(lib);
  const index = createRanganIndexService(deps);
  await index.sync("u1");
  lib.u1.sources = [{ type: "note", id: "n1", title: "Bio", version: "2" }];
  lib.u1.passages["note:n1"] = passages("A new first line.", "Osmosis moves water.", "Diffusion moves solutes.");
  calls.embedded = 0;
  const report = await index.sync("u1");
  assert.equal(report.indexed, 1);
  assert.equal(calls.embedded, 1);
});

test("deleted sources leave the index", async () => {
  const lib = {
    u1: { sources: [{ type: "note" as const, id: "n1", title: "Bio", version: "1" }], passages: { "note:n1": passages("Osmosis.") } },
  };
  const { deps, rows } = memoryIndex(lib);
  const index = createRanganIndexService(deps);
  await index.sync("u1");
  lib.u1.sources = [];
  assert.equal((await index.sync("u1")).removed, 1);
  assert.equal(rows.length, 0);
});

test("a big library is indexed a slice at a time", async () => {
  const sources = Array.from({ length: 5 }, (_, i) => ({ type: "note" as const, id: `n${i}`, title: `N${i}`, version: "1" }));
  const lib = { u1: { sources, passages: Object.fromEntries(sources.map((s) => [`note:${s.id}`, passages(`text ${s.id}`)])) } };
  const index = createRanganIndexService(memoryIndex(lib).deps);
  const first = await index.sync("u1", { maxSources: 2, maxEmbeddings: 1 });
  assert.equal(first.indexed, 2);
  assert.equal(first.pendingSources, 3);
  assert.equal(first.pendingEmbeddings, 1);
  assert.equal((await index.sync("u1", { maxSources: 2 })).pendingSources, 1);
});

test("search finds only the signed-in user's passages", async () => {
  const lib = {
    u1: { sources: [{ type: "note" as const, id: "n1", title: "Mine", version: "1" }], passages: { "note:n1": passages("osmosis is mine") } },
    u2: { sources: [{ type: "note" as const, id: "n2", title: "Theirs", version: "1" }], passages: { "note:n2": passages("osmosis is theirs") } },
  };
  const { deps } = memoryIndex(lib);
  const index = createRanganIndexService(deps);
  await index.sync("u2");
  const { results, mode } = await index.search("u1", "osmosis");
  assert.equal(mode, "hybrid");
  assert.deepEqual(results.map((r) => r.title), ["Mine"]);
  assert.deepEqual(results[0].matchedBy, ["keyword", "meaning"]);
  assert.equal(results[0].ref, "note:n1");
  assert.deepEqual(results[0].open, { kind: "note", noteId: "n1", blockId: null });
});

test("search falls back to keywords when embeddings are down, and still indexes", async () => {
  const lib = {
    u1: { sources: [{ type: "note" as const, id: "n1", title: "Bio", version: "1" }], passages: { "note:n1": passages("osmosis water", "unrelated") } },
  };
  const { deps, rows } = memoryIndex(lib, { embedFails: true });
  const { results, mode } = await createRanganIndexService(deps).search("u1", "osmosis");
  assert.equal(mode, "keyword");
  assert.deepEqual(results.map((r) => r.snippet), ["osmosis water"]);
  assert.ok(rows.every((row) => row.vector === null), "left pending for a later retry");
});

test("one long source cannot fill every result", async () => {
  const lib = {
    u1: {
      sources: [
        { type: "pdf" as const, id: "big", title: "Big", version: "1" },
        { type: "note" as const, id: "small", title: "Small", version: "1" },
      ],
      passages: {
        "pdf:big": passages("cell one", "cell two", "cell three", "cell four"),
        "note:small": passages("cell five"),
      },
    },
  };
  const { results } = await createRanganIndexService(memoryIndex(lib).deps).search("u1", "cell");
  assert.equal(results.filter((r) => r.sourceId === "big").length, 2);
  assert.deepEqual(results.find((r) => r.sourceId === "big")?.open, { kind: "pdf", assetId: "big", page: 1, itemId: "item-of-big" });
  assert.ok(results.some((r) => r.sourceId === "small"));
});

test("concurrent refreshes for one user share a single run", async () => {
  const lib = { u1: { sources: [{ type: "note" as const, id: "n1", title: "Bio", version: "1" }], passages: { "note:n1": passages("x") } } };
  const { deps, calls } = memoryIndex(lib);
  const index = createRanganIndexService(deps);
  const [a, b] = await Promise.all([index.sync("u1"), index.sync("u1")]);
  assert.equal(a, b);
  assert.equal(calls.loads, 1);
});

test("passages are embedded with their title and heading for context", () => {
  assert.equal(embeddingText({ title: "Bio", heading: "Osmosis", content: "Water moves." }), "Bio\nOsmosis\nWater moves.");
  assert.equal(embeddingText({ title: "Bio", heading: "", content: "Water." }), "Bio\nWater.");
});

test("a source loads live with its title, citations and open targets, only for its owner", async () => {
  const lib = {
    u1: {
      sources: [{ type: "pdf" as const, id: "a1", title: "Textbook", version: "1" }],
      passages: { "pdf:a1": withHashes([{ anchor: "page3", heading: "Page 3", content: "Enzymes speed reactions." }]) },
    },
  };
  const index = createRanganIndexService(memoryIndex(lib).deps);
  const source = await index.loadSource("u1", "pdf", "a1");
  assert.equal(source?.title, "Textbook");
  assert.deepEqual(
    source?.passages.map((p) => [p.ref, p.open]),
    [["asset:a1#page3", { kind: "pdf", assetId: "a1", page: 3, itemId: "item-of-a1" }]],
  );
  assert.equal(await index.loadSource("u2", "pdf", "a1"), null);
});
