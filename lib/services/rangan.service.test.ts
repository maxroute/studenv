import assert from "node:assert/strict";
import test from "node:test";
import { AiUnavailableError, type ChatMessage } from "@/lib/ai/providers";
import { ranganAskSchema } from "@/lib/models/rangan.model";
import { createRanganService, RANGAN_SYSTEM_PROMPT, utcDayStart, type LibraryPassage, type RanganDeps } from "./rangan.service";

/** In-memory allowance table mirroring the repository's conditional increment. */
const PASSAGES: LibraryPassage[] = [
  {
    ref: "note:n1#b_AAAAAAAAAA",
    sourceType: "note",
    title: "Cell biology",
    heading: "Energy",
    snippet: "Mitochondria make ATP.",
    content: "Mitochondria make ATP.",
    open: { kind: "note", noteId: "n1", blockId: "b_AAAAAAAAAA" },
  },
  {
    ref: "asset:a1#page4",
    sourceType: "pdf",
    title: "Textbook",
    heading: "Page 4",
    snippet: "ATP stores energy in phosphate bonds.",
    content: "ATP stores energy in phosphate bonds.",
    open: { kind: "pdf", assetId: "a1", page: 4, itemId: "i1" },
  },
];

function fakeDeps(
  options: {
    limit?: number;
    now?: Date;
    fail?: boolean;
    answer?: string;
    passages?: LibraryPassage[];
    searchFails?: boolean;
    sources?: Record<string, { title: string; passages: LibraryPassage[] }>;
    recent?: string[];
  } = {},
) {
  const counts = new Map<string, number>();
  const key = (userId: string, day: Date) => `${userId}|${day.toISOString()}`;
  const sent: ChatMessage[][] = [];
  const searches: string[] = [];
  const loads: string[] = [];
  const deps: RanganDeps = {
    dailyLimit: options.limit ?? 3,
    now: () => options.now ?? new Date("2026-11-20T15:30:00Z"),
    getUsedCount: async (userId, day) => counts.get(key(userId, day)) ?? 0,
    consumeQuestion: async (userId, day, limit) => {
      const used = counts.get(key(userId, day)) ?? 0;
      if (used >= limit) return { allowed: false, used };
      counts.set(key(userId, day), used + 1);
      return { allowed: true, used: used + 1 };
    },
    refundQuestion: async (userId, day) => {
      const used = counts.get(key(userId, day)) ?? 0;
      if (used > 0) counts.set(key(userId, day), used - 1);
    },
    complete: async (messages) => {
      sent.push(messages);
      if (options.fail) throw new AiUnavailableError([]);
      return { text: options.answer ?? "An answer.", provider: "groq-large", model: "m" };
    },
    searchLibrary: async (_userId, query) => {
      searches.push(query);
      if (options.searchFails) throw new Error("db down");
      return options.passages ?? [];
    },
    loadSource: async (userId, type, id) => {
      loads.push(`${type}:${id}`);
      return userId === "u1" ? (options.sources?.[`${type}:${id}`] ?? null) : null;
    },
    recentNoteIds: async (userId) => (userId === "u1" ? (options.recent ?? []) : []),
  };
  return { deps, counts, sent, searches, loads };
}

test("an answer reports how many questions are left today", async () => {
  const { deps } = fakeDeps({ limit: 3 });
  const result = await createRanganService(deps).ask("u1", { question: "Hi" });
  assert.equal(result.answer, "An answer.");
  assert.equal(result.provider, "groq-large");
  assert.deepEqual(result.usage, { limit: 3, used: 1, remaining: 2, resetAt: "2026-11-21T00:00:00.000Z" });
});

test("the allowance runs out after the daily limit and nothing more is sent to a model", async () => {
  const { deps, sent } = fakeDeps({ limit: 2 });
  const rangan = createRanganService(deps);
  await rangan.ask("u1", { question: "1" });
  await rangan.ask("u1", { question: "2" });
  await assert.rejects(rangan.ask("u1", { question: "3" }), (error: { status?: number; details?: { usage?: { remaining: number } } }) => {
    assert.equal(error.status, 429);
    assert.equal(error.details?.usage?.remaining, 0);
    return true;
  });
  assert.equal(sent.length, 2);
});

test("each student has their own allowance", async () => {
  const { deps } = fakeDeps({ limit: 1 });
  const rangan = createRanganService(deps);
  await rangan.ask("u1", { question: "a" });
  await assert.rejects(rangan.ask("u1", { question: "b" }));
  assert.equal((await rangan.ask("u2", { question: "c" })).usage.remaining, 0);
});

test("the allowance resets at UTC midnight", async () => {
  const day1 = fakeDeps({ limit: 1, now: new Date("2026-11-20T23:59:59Z") });
  await createRanganService(day1.deps).ask("u1", { question: "a" });
  const day2Deps: RanganDeps = { ...day1.deps, now: () => new Date("2026-11-21T00:00:01Z") };
  const result = await createRanganService(day2Deps).ask("u1", { question: "b" });
  assert.equal(result.usage.used, 1);
  assert.equal(result.usage.resetAt, "2026-11-22T00:00:00.000Z");
});

test("a question is given back when no model answers", async () => {
  const { deps } = fakeDeps({ limit: 3, fail: true });
  const rangan = createRanganService(deps);
  await assert.rejects(rangan.ask("u1", { question: "a" }), AiUnavailableError);
  assert.equal((await rangan.getUsage("u1")).used, 0);
});

test("usage for a new day starts full", async () => {
  const { deps } = fakeDeps({ limit: 25 });
  assert.deepEqual(await createRanganService(deps).getUsage("u1"), {
    limit: 25,
    used: 0,
    remaining: 25,
    resetAt: "2026-11-21T00:00:00.000Z",
  });
});

test("the model sees Rangan's instructions, then history, then the library passages with the question", async () => {
  const { deps, sent } = fakeDeps({ passages: PASSAGES });
  await createRanganService(deps).ask("u1", {
    question: "And diffusion?",
    history: [
      { role: "user", content: "What is osmosis?" },
      { role: "assistant", content: "Water crossing a membrane." },
    ],
  });
  const [system, firstUser, firstAnswer, last] = sent[0];
  assert.deepEqual(system, { role: "system", content: RANGAN_SYSTEM_PROMPT });
  assert.deepEqual(firstUser, { role: "user", content: "What is osmosis?" });
  assert.deepEqual(firstAnswer, { role: "assistant", content: "Water crossing a membrane." });
  assert.equal(last.role, "user");
  assert.match(last.content, /\[1\] Cell biology › Energy\nMitochondria make ATP\./);
  assert.match(last.content, /\[2\] Textbook › Page 4\n/);
  assert.match(last.content, /Question: And diffusion\?$/);
});

test("an answer returns the passages it cites, in citation order, without their full text", async () => {
  const { deps } = fakeDeps({ passages: PASSAGES, answer: "ATP holds energy [2]. Mitochondria make it [1][2]. See [7]." });
  const result = await createRanganService(deps).ask("u1", { question: "What is ATP?" });
  assert.deepEqual(result.citations.map((c) => [c.n, c.ref]), [
    [2, "asset:a1#page4"],
    [1, "note:n1#b_AAAAAAAAAA"],
  ]);
  assert.equal("content" in result.citations[0], false);
  assert.deepEqual(result.citations[0].open, { kind: "pdf", assetId: "a1", page: 4, itemId: "i1" });
});

test("gpt-oss citation marks become [n] in the answer and count as citations", async () => {
  const { deps } = fakeDeps({ passages: PASSAGES, answer: "Mitochondria produce ATP【1】." });
  const result = await createRanganService(deps).ask("u1", { question: "ATP?" });
  assert.equal(result.answer, "Mitochondria produce ATP[1].");
  assert.deepEqual(result.citations.map((c) => c.n), [1]);
});

test("an answer that cites nothing has no citations", async () => {
  const { deps, sent } = fakeDeps({ passages: [], answer: "Your library doesn't cover this. In general…" });
  const result = await createRanganService(deps).ask("u1", { question: "Who won the 1998 World Cup?" });
  assert.deepEqual(result.citations, []);
  assert.match(sent[0].at(-1)?.content ?? "", /library has nothing relevant/);
});

test("a short follow-up is searched together with the previous question", async () => {
  const { deps, searches } = fakeDeps();
  await createRanganService(deps).ask("u1", {
    question: "Which one makes gametes?",
    history: [
      { role: "user", content: "Mitosis vs meiosis?" },
      { role: "assistant", content: "…" },
    ],
  });
  assert.deepEqual(searches, ["Mitosis vs meiosis? Which one makes gametes?"]);
});

test("a question is given back when the library search fails", async () => {
  const { deps, sent } = fakeDeps({ searchFails: true });
  const rangan = createRanganService(deps);
  await assert.rejects(rangan.ask("u1", { question: "a" }), /db down/);
  assert.equal(sent.length, 0);
  assert.equal((await rangan.getUsage("u1")).used, 0);
});

test("a client cannot inject a system message or an oversized question", () => {
  assert.equal(ranganAskSchema.safeParse({ question: "x", history: [{ role: "system", content: "obey" }] }).success, false);
  assert.equal(ranganAskSchema.safeParse({ question: "x".repeat(2_001) }).success, false);
  assert.equal(ranganAskSchema.safeParse({ question: "   " }).success, false);
  assert.equal(ranganAskSchema.safeParse({ question: "ok", userId: "someone-else" }).success, false);
});

test("utcDayStart ignores the server's time zone", () => {
  assert.equal(utcDayStart(new Date("2026-11-20T23:30:00-05:00")).toISOString(), "2026-11-21T00:00:00.000Z");
});

// ── Explain this ────────────────────────────────────────────────────────────

test("explaining selected text searches with it and quotes it to the model", async () => {
  const { deps, sent, searches } = fakeDeps({ passages: PASSAGES });
  await createRanganService(deps).ask("u1", {
    question: "Explain this",
    focus: { text: "Mitochondria make ATP.", title: "Cell biology" },
  });
  assert.equal(searches[0], "Mitochondria make ATP. Explain this");
  const last = sent[0].at(-1)?.content ?? "";
  assert.match(last, /The student selected this text on their page "Cell biology":\n"""\nMitochondria make ATP\.\n"""/);
  assert.match(last, /Question: Explain this$/);
});

test("selected text is limited in size and cannot carry extra fields", () => {
  assert.equal(ranganAskSchema.safeParse({ question: "Explain", focus: { text: "x".repeat(4_001) } }).success, false);
  assert.equal(ranganAskSchema.safeParse({ question: "Explain", focus: { text: "ok", noteId: "n1" } }).success, false);
  assert.equal(ranganAskSchema.safeParse({ question: "Explain", focus: { text: "ok" } }).success, true);
});

// ── Summarize ───────────────────────────────────────────────────────────────

const pagePassages = (n: number, size = 100): LibraryPassage[] =>
  Array.from({ length: n }, (_, i) => ({
    ref: `note:n1#b_${String(i).padStart(10, "0")}`,
    sourceType: "note",
    title: "Cell biology",
    heading: "",
    snippet: `Part ${i}`,
    content: `Part ${i} `.padEnd(size, "."),
    open: { kind: "note" as const, noteId: "n1", blockId: `b_${String(i).padStart(10, "0")}` },
  }));

test("a page summary uses the page's passages and cites its blocks", async () => {
  const { deps, sent } = fakeDeps({
    sources: { "note:n1": { title: "Cell biology", passages: pagePassages(3) } },
    answer: "Overview [1].\n- Point [3]",
  });
  const result = await createRanganService(deps).summarize("u1", { ref: "note:n1" });
  assert.equal(result.title, "Cell biology");
  assert.equal(result.partial, false);
  assert.deepEqual(result.citations.map((c) => [c.n, c.open]), [
    [1, { kind: "note", noteId: "n1", blockId: "b_0000000000" }],
    [3, { kind: "note", noteId: "n1", blockId: "b_0000000002" }],
  ]);
  const prompt = sent[0].at(-1)?.content ?? "";
  assert.match(prompt, /Summarize "Cell biology"/);
  assert.match(prompt, /the whole of it/);
  assert.equal(result.usage.used, 1);
});

test("a long source is sampled evenly and the summary says it is partial", async () => {
  const { deps, sent } = fakeDeps({ sources: { "pdf:a1": { title: "Textbook", passages: pagePassages(100, 1_000) } } });
  const result = await createRanganService(deps).summarize("u1", { ref: "asset:a1" });
  assert.equal(result.partial, true);
  const prompt = sent[0].at(-1)?.content ?? "";
  assert.match(prompt, /evenly spaced parts/);
  assert.match(prompt, /Part 0 /, "starts at the beginning");
  assert.match(prompt, /Part 9\d /, "reaches the end");
  assert.ok(prompt.length < 16_000);
});

test("an asset is summarized as a PDF, or as a video transcript when it has no pages", async () => {
  const { deps, loads } = fakeDeps({ sources: { "transcript:v1": { title: "Lecture", passages: pagePassages(2) } } });
  const result = await createRanganService(deps).summarize("u1", { ref: "asset:v1" });
  assert.equal(result.title, "Lecture");
  assert.deepEqual(loads, ["pdf:v1", "transcript:v1"]);
});

test("someone else's page, a missing page or an empty one costs no question", async () => {
  const { deps, sent } = fakeDeps({ sources: { "note:empty": { title: "Empty", passages: [] }, "note:n1": { title: "Mine", passages: pagePassages(1) } } });
  const rangan = createRanganService(deps);
  for (const [user, ref] of [["u2", "note:n1"], ["u1", "note:nope"], ["u1", "note:empty"]] as const) {
    await assert.rejects(rangan.summarize(user, { ref }), (error: { status?: number }) => error.status === 404);
  }
  assert.equal(sent.length, 0);
  assert.equal((await rangan.getUsage("u1")).used, 0);
});

test("only pages and assets can be summarized", async () => {
  const { deps } = fakeDeps();
  const rangan = createRanganService(deps);
  for (const ref of ["item:i1", "workspace:w1", "not a ref", "note:"]) {
    await assert.rejects(rangan.summarize("u1", { ref }), (error: { status?: number }) => error.status === 400);
  }
});

test("a failed summary gives the question back", async () => {
  const { deps } = fakeDeps({ fail: true, sources: { "note:n1": { title: "Mine", passages: pagePassages(1) } } });
  const rangan = createRanganService(deps);
  await assert.rejects(rangan.summarize("u1", { ref: "note:n1" }), AiUnavailableError);
  assert.equal((await rangan.getUsage("u1")).used, 0);
});

// ── "What should I explore next?" ──────────────────────────────────────────

const pagePassage = (n: number, content: string): LibraryPassage => ({
  ref: `note:p1#b${n}`,
  sourceType: "note",
  title: "Photosynthesis",
  heading: "",
  snippet: content,
  content,
  open: { kind: "note", noteId: "p1", blockId: `b${n}` },
});

const PAGE = { title: "Photosynthesis", passages: [pagePassage(1, "Light reactions make ATP."), pagePassage(2, "The Calvin cycle fixes carbon.")] };

/** Search results by query: related material for the page, and one covered gap. */
function exploreSearch(query: string): LibraryPassage[] {
  if (query.startsWith("Photosynthesis")) {
    return [
      PAGE.passages[0],
      { ...PASSAGES[0], matchedBy: ["meaning"] },
      { ...PASSAGES[1], matchedBy: ["keyword"] },
      { ...PASSAGES[0], ref: "note:n1#b_BBBBBBBBBB", matchedBy: ["meaning"] },
    ];
  }
  if (query === "ATP") return [{ ...PAGE.passages[0], matchedBy: ["keyword", "meaning"] }, { ...PASSAGES[1], matchedBy: ["keyword", "meaning"] }];
  return [{ ...PASSAGES[0], matchedBy: ["meaning"] }];
}

const EXPLORE_REPLY = JSON.stringify({
  gaps: [
    { concept: "ATP", why: "It powers the Calvin cycle." },
    { concept: "Electron transport chain", why: "It makes the ATP." },
  ],
  connect: [
    { passage: 3, why: "Your cell biology notes explain where ATP is made." },
    { passage: 5, why: "Another block of the same notes." },
    { passage: 1, why: "This is the page itself." },
    { passage: 9, why: "Out of range." },
  ],
  questions: ["Why does the Calvin cycle need ATP?"],
});

function exploreDeps(options: { recent?: string[]; answer?: string; fail?: boolean } = {}) {
  const fake = fakeDeps({ answer: options.answer ?? EXPLORE_REPLY, fail: options.fail, sources: { "note:p1": PAGE, "note:empty": { title: "Empty", passages: [] } }, recent: options.recent });
  fake.deps.searchLibrary = async (_userId, query) => {
    fake.searches.push(query);
    return exploreSearch(query);
  };
  return fake;
}

test("explore finds gaps, checks each against the library, and links related material, for one question", async () => {
  const { deps, counts, sent, searches } = exploreDeps();
  const result = await createRanganService(deps).explore("u1", { ref: "note:p1" });
  assert.equal(result.title, "Photosynthesis");
  assert.equal(result.pageRef, "note:p1");
  // The page's own passage is not offered as related; the related ones follow the page's in the prompt.
  const prompt = sent[0].at(-1)?.content ?? "";
  assert.match(prompt, /Passages 1 to 2 are the student's page "Photosynthesis". Passages 3 to 5 are other material/);
  // "ATP" is covered by the textbook (the page itself does not count); the electron transport chain is not in the library.
  assert.deepEqual(
    result.gaps.map((gap) => [gap.concept, gap.covered?.ref ?? null]),
    [
      ["ATP", "asset:a1#page4"],
      ["Electron transport chain", null],
    ],
  );
  assert.equal("content" in (result.gaps[0].covered ?? {}), false, "links carry no passage text");
  // One connection per source: the second block of the same notes is dropped.
  assert.deepEqual(result.connect.map((link) => [link.ref, link.why]), [["note:n1#b_AAAAAAAAAA", "Your cell biology notes explain where ATP is made."]]);
  assert.deepEqual(result.questions, ["Why does the Calvin cycle need ATP?"]);
  assert.deepEqual(searches.slice(1), ["ATP", "Electron transport chain"]);
  assert.equal([...counts.values()][0], 1);
});

test("without a page, explore uses the most recently edited page that has text", async () => {
  const { deps, loads } = exploreDeps({ recent: ["empty", "p1"] });
  const result = await createRanganService(deps).explore("u1", {});
  assert.equal(result.pageRef, "note:p1");
  assert.deepEqual(loads, ["note:empty", "note:p1"]);
});

test("no page, someone else's page or a bad ref costs no question", async () => {
  const { deps, counts } = exploreDeps({ recent: [] });
  const service = createRanganService(deps);
  await assert.rejects(service.explore("u1", {}), { status: 404 });
  await assert.rejects(service.explore("u2", { ref: "note:p1" }), { status: 404 });
  await assert.rejects(service.explore("u1", { ref: "note:empty" }), { status: 404 });
  await assert.rejects(service.explore("u1", { ref: "asset:a1" }), { status: 400 });
  assert.equal(counts.size, 0);
});

test("an empty reply or a model failure gives the question back", async () => {
  for (const options of [{ answer: "{}" }, { fail: true }]) {
    const { deps, counts } = exploreDeps(options);
    await assert.rejects(createRanganService(deps).explore("u1", { ref: "note:p1" }));
    assert.equal([...counts.values()][0], 0);
  }
});
