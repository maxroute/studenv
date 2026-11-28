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
  const result = await createRanganService(deps).ask("u1", { question: "What is ATP?" });
  assert.equal(result.answer, "An answer.");
  assert.equal(result.provider, "groq-large");
  assert.deepEqual(result.usage, { limit: 3, used: 1, remaining: 2, resetAt: "2026-11-21T00:00:00.000Z", asOf: "2026-11-20T15:30:00.000Z" });
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
    asOf: "2026-11-20T15:30:00.000Z",
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
  assert.match(last.content, /\[1\] \(the student's library\) › Cell biology › Energy\nMitochondria make ATP\./);
  assert.match(last.content, /\[2\] \(the student's library\) › Textbook › Page 4\n/);
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

test("explaining a selection is about that exact text, not the page around it", async () => {
  const { deps, sent } = fakeDeps({ passages: PASSAGES });
  await createRanganService(deps).ask("u1", { question: "Explain this", focus: { text: "thatatata", title: "Launch checklist" } });
  const last = sent[0].at(-1)?.content ?? "";
  assert.match(last, /Answer about exactly this selected text/);
  assert.match(last, /never explain the page's title or another topic instead/);
  assert.match(last, /no clear meaning \(random letters, a placeholder, a typo\), say so/);
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

// ── Trusted answers: support check and Wikipedia ───────────────────────────

const WIKI: LibraryPassage = {
  ref: "https://en.wikipedia.org/wiki/ATP",
  sourceType: "web",
  title: "Adenosine triphosphate",
  heading: "Wikipedia",
  snippet: "ATP is the energy currency of the cell.",
  content: "ATP is the energy currency of the cell.",
  open: { kind: "web", url: "https://en.wikipedia.org/wiki/ATP" },
};

/** A model that answers with `answer`, then checks claims with `verdict` (or fails the check). */
function twoStepDeps(options: { answer: string; verdict?: string; checkFails?: boolean; passages?: LibraryPassage[]; web?: LibraryPassage[] }) {
  const fake = fakeDeps({ passages: options.passages ?? PASSAGES });
  let calls = 0;
  const webQueries: string[] = [];
  fake.deps.complete = async (messages) => {
    fake.sent.push(messages);
    calls += 1;
    if (calls === 1) return { text: options.answer, provider: "groq-large", model: "m" };
    if (options.checkFails) throw new AiUnavailableError([]);
    return { text: options.verdict ?? "[]", provider: "groq-large", model: "m" };
  };
  fake.deps.searchWeb = async (query) => {
    webQueries.push(query);
    return options.web ?? [];
  };
  return { ...fake, webQueries };
}

test("a citation its passage doesn't support is removed, and the answer says how many", async () => {
  const { deps, sent, counts } = twoStepDeps({
    answer: "Mitochondria make ATP [1]. ATP is made only at night [2].",
    verdict: '[{"claim": 1, "supported": true}, {"claim": 2, "supported": false}]',
  });
  const result = await createRanganService(deps).ask("u1", { question: "Where is ATP made?" });
  assert.equal(result.answer, "Mitochondria make ATP [1]. ATP is made only at night.");
  assert.deepEqual(result.support, { checked: true, removed: 1 });
  assert.deepEqual(result.citations.map((citation) => citation.n), [1], "the removed citation is not listed as a source");
  assert.equal(sent.length, 2);
  assert.match(sent[1].at(-1)?.content ?? "", /Claim 2 \(cites \[2\]\): ATP is made only at night\./);
  assert.equal([...counts.values()][0], 1, "the check uses no extra question");
});

test("when the check can't run, the answer is kept and marked unchecked", async () => {
  const { deps } = twoStepDeps({ answer: "Mitochondria make ATP [1].", checkFails: true });
  const result = await createRanganService(deps).ask("u1", { question: "Where is ATP made?" });
  assert.equal(result.answer, "Mitochondria make ATP [1].");
  assert.deepEqual(result.support, { checked: false, removed: 0 });
});

test("an answer without citations needs no check", async () => {
  const { deps, sent } = twoStepDeps({ answer: "### Beyond your sources\nATP is energy." });
  const result = await createRanganService(deps).ask("u1", { question: "What is ATP?" });
  assert.deepEqual(result.support, { checked: true, removed: 0 });
  assert.equal(sent.length, 1);
});

test("Wikipedia is searched only when the library has little on the question", async () => {
  const rich = twoStepDeps({ answer: "A.", web: [WIKI] });
  await createRanganService(rich.deps).ask("u1", { question: "Where is ATP made?" });
  assert.deepEqual(rich.webQueries, [], "two library passages are enough");

  const thin = twoStepDeps({ answer: "ATP is the energy currency [2].", verdict: '[{"claim":1,"supported":true}]', passages: [PASSAGES[0]], web: [WIKI] });
  const result = await createRanganService(thin.deps).ask("u1", { question: "What is ATP?" });
  assert.deepEqual(thin.webQueries, ["What is ATP?"]);
  assert.match(thin.sent[0].at(-1)?.content ?? "", /\[2\] \(Wikipedia\) › Adenosine triphosphate › Wikipedia/);
  assert.deepEqual(result.citations.map((citation) => [citation.n, citation.sourceType]), [[2, "web"]]);
});

test("a Wikipedia failure still answers from the library", async () => {
  const { deps } = twoStepDeps({ answer: "Only notes.", passages: [PASSAGES[0]] });
  deps.searchWeb = async () => {
    throw new Error("offline");
  };
  const result = await createRanganService(deps).ask("u1", { question: "What is ATP?" });
  assert.equal(result.answer, "Only notes.");
});

test("Rangan is told to keep general knowledge under its own heading", () => {
  assert.match(RANGAN_SYSTEM_PROMPT, /### Beyond your sources/);
  assert.match(RANGAN_SYSTEM_PROMPT, /Never mix general knowledge into a cited sentence/);
});

// ── Reading the request: search the subject, not the whole message ─────────

const VOCABULARY: LibraryPassage = {
  ref: "asset:vocab#page94",
  sourceType: "pdf",
  title: "Word Power Made Easy",
  heading: "Page 94",
  snippet: "A note on time schedules.",
  content: "A note on time schedules: make learning and revision a daily process so it is easy.",
  open: { kind: "pdf", assetId: "vocab", page: 94, itemId: null },
};
const OS_NOTE: LibraryPassage = {
  ref: "note:os#b_AAAAAAAAAA",
  sourceType: "note",
  title: "CS notes",
  heading: "Kernel",
  snippet: "The kernel schedules processes.",
  content: "The kernel schedules processes on the CPU.",
  open: { kind: "note", noteId: "os", blockId: "b_AAAAAAAAAA" },
};
const OS_REQUEST =
  "create a new note on operating system and also make a proper understanding so that it is easy so i urge you to take it to the board too so that i can visualize the learning i want make the visualization map of the os to teach me and for my revision too";

function readingDeps(options: { reading?: string | Error; library?: LibraryPassage[]; answer?: string }) {
  const fake = fakeDeps({ passages: options.library ?? [VOCABULARY, OS_NOTE], answer: options.answer ?? "The kernel schedules processes [1]." });
  const quick: ChatMessage[][] = [];
  const webQueries: string[] = [];
  fake.deps.completeQuick = async (messages) => {
    quick.push(messages);
    if (options.reading instanceof Error) throw options.reading;
    return { text: options.reading ?? "", provider: "groq-small", model: "m" };
  };
  fake.deps.searchWeb = async (query) => {
    webQueries.push(query);
    return [];
  };
  return { ...fake, quick, webQueries };
}

/** A question about operating systems, with no page or board to make. */
const OS_READING = JSON.stringify({ subject: "operating systems", search: "operating system kernel processes", names: ["operating system", "OS"], terms: ["kernel", "process", "scheduler"], actions: [] });

test("the subject is searched, not the whole message, and an unrelated book is left out", async () => {
  const { deps, searches, sent, quick } = readingDeps({ reading: OS_READING });
  const result = await createRanganService(deps).ask("u1", { question: OS_REQUEST });
  assert.equal(quick.length, 1, "one quick reading call");
  assert.match(quick[0][1].content, /create a new note on operating system/);
  assert.deepEqual(searches, ["operating system kernel processes"]);
  const prompt = sent[0].at(-1)?.content ?? "";
  assert.doesNotMatch(prompt, /Word Power Made Easy/, "the vocabulary book is not given to the model");
  assert.match(prompt, /\[1\] \(the student's library\) › CS notes › Kernel/);
  assert.deepEqual(result.citations.map((citation) => citation.title), ["CS notes"]);
});

test("with nothing on the subject in the library, Wikipedia is searched for the subject", async () => {
  const { deps, webQueries, sent } = readingDeps({ reading: OS_READING, library: [VOCABULARY] });
  await createRanganService(deps).ask("u1", { question: OS_REQUEST });
  // Nothing relevant comes back here, so the subject's other names are tried too.
  assert.deepEqual(webQueries, ["operating systems", "operating system", "OS"]);
  assert.doesNotMatch(sent[0].at(-1)?.content ?? "", /Word Power Made Easy/);
});

test("if the reading fails, the message is searched as before", async () => {
  const { deps, searches } = readingDeps({ reading: new Error("busy") });
  await createRanganService(deps).ask("u1", { question: "What does the kernel do?" });
  assert.deepEqual(searches, ["What does the kernel do?"]);
});

test("Explain this skips the reading and searches the selected text", async () => {
  const { deps, quick, searches } = readingDeps({ reading: OS_READING });
  await createRanganService(deps).ask("u1", { question: "Explain this", focus: { text: "The kernel schedules processes." } });
  assert.equal(quick.length, 0);
  assert.match(searches[0], /^The kernel schedules processes\./);
});

test("a citation inside the general-knowledge part is removed and not listed as a source", async () => {
  const { deps } = readingDeps({
    reading: OS_READING,
    answer: "The kernel schedules processes [1].\n\n### Beyond your sources\nStudy in 30-minute chunks [2].",
    library: [OS_NOTE, { ...OS_NOTE, ref: "note:os#b_BBBBBBBBBB", content: "The kernel also handles interrupts.", heading: "Interrupts" }],
  });
  const result = await createRanganService(deps).ask("u1", { question: "What does the OS kernel do?" });
  assert.equal(result.answer, "The kernel schedules processes [1].\n\n### Beyond your sources\nStudy in 30-minute chunks.");
  assert.deepEqual(result.citations.map((citation) => citation.n), [1]);
});

// ── Writing a new page and changing the open page ──────────────────────────

const PAGE_READING = JSON.stringify({ subject: "operating systems", search: "operating system kernel", names: ["operating system", "OS"], terms: ["kernel", "process"], actions: ["page"] });
const EDIT_READING = JSON.stringify({ subject: "operating systems", search: "operating system kernel", names: ["operating system", "OS"], terms: ["kernel", "process"], actions: ["edit"] });

/** The first model call writes; later ones check citations. */
function pageDeps(options: { reading: string; write: string; verdict?: string; sources?: Record<string, { title: string; passages: LibraryPassage[] }> }) {
  const fake = readingDeps({ reading: options.reading, library: [OS_NOTE] });
  let calls = 0;
  fake.deps.complete = async (messages) => {
    fake.sent.push(messages);
    calls += 1;
    return { text: calls === 1 ? options.write : (options.verdict ?? "[]"), provider: "groq-large", model: "m" };
  };
  fake.deps.loadSource = async (userId, type, id) => (userId === "u1" ? (options.sources?.[`${type}:${id}`] ?? null) : null);
  return fake;
}

const OPEN_PAGE = {
  ref: "note:mine",
  title: "OS",
  blocks: [
    { type: "heading", text: "OS", locked: false },
    { type: "paragraph", text: "The kernel is the core.", locked: false },
    { type: "pdfPage", text: "Textbook p. 4", locked: false },
  ],
};

test("asking for a page returns a draft with its outline and cited sources, for one question", async () => {
  const { deps, sent, counts } = pageDeps({
    reading: PAGE_READING,
    write: "# Operating Systems\n## The kernel\nThe kernel schedules processes [1].\n## Revision\n### Test yourself\nQ: What is the kernel?\nA: The core.",
    verdict: '[{"claim": 1, "supported": true}]',
  });
  const reply = await createRanganService(deps).ask("u1", { question: "make me a note on operating systems" });
  assert.equal(reply.kind, "page");
  if (reply.kind !== "page") return;
  assert.equal(reply.title, "Operating Systems");
  assert.deepEqual(reply.outline, ["The kernel", "Revision", "Test yourself"]);
  assert.deepEqual(reply.citations.map((citation) => citation.ref), [OS_NOTE.ref]);
  assert.match(sent[0][0].content, /writing a study page/);
  assert.match(sent[0][1].content, /Write a study page about "operating systems"/);
  assert.equal([...counts.values()][0], 1);
  assert.equal(reply.map, undefined);
});

const MAP_REPLY = JSON.stringify({
  title: "OS map",
  centre: "Operating System",
  branches: [
    { title: "Kernel", note: "The core", relation: "has", passage: 1, children: [{ title: "Scheduler" }] },
    { title: "Memory", note: "Where data lives", relation: "manages", children: [{ title: "Paging" }] },
  ],
  links: [{ from: "Scheduler", to: "Paging", label: "shares" }],
  tips: ["Draw the layers"],
});

/** The model answers each call in turn: page, citation check, map, ... */
function sequenceDeps(reading: string, replies: string[], extra: Partial<RanganDeps> = {}) {
  const fake = readingDeps({ reading, library: [OS_NOTE] });
  let call = 0;
  fake.deps.complete = async (messages) => {
    fake.sent.push(messages);
    return { text: replies[Math.min(call++, replies.length - 1)], provider: "groq-large", model: "m" };
  };
  Object.assign(fake.deps, extra);
  return fake;
}

test("a page request that also asks for a board brings a map, for the same one question", async () => {
  const reading = PAGE_READING.replace('"actions":["page"]', '"actions":["page","board"]');
  const { deps, counts } = sequenceDeps(reading, ["# OS\n## Kernel\nIt runs things.", MAP_REPLY]);
  const reply = await createRanganService(deps).ask("u1", { question: "make a note and a mind map on operating systems" });
  assert.equal(reply.kind, "page");
  if (reply.kind !== "page") return;
  assert.equal(reply.map?.draft.centre, "Operating System");
  assert.deepEqual(reply.map?.sources, [{ n: 1, ref: OS_NOTE.ref, sourceType: "note", title: "CS notes" }]);
  assert.equal([...counts.values()][0], 1);
});

test("asking for a board returns a map draft with its outline", async () => {
  const reading = PAGE_READING.replace('"actions":["page"]', '"actions":["board"]');
  const { deps, sent } = sequenceDeps(reading, [MAP_REPLY]);
  const reply = await createRanganService(deps).ask("u1", { question: "make a mind map of operating systems" });
  assert.equal(reply.kind, "map");
  if (reply.kind !== "map") return;
  assert.deepEqual(reply.map.outline, ["Kernel (has)", "  Scheduler", "Memory (manages)", "  Paging"]);
  assert.match(sent[0][1].content, /Plan a mind map that teaches "operating systems"/);
});

test("'create the board' after a chat makes a board on the subject talked about, even when the reading misses it", async () => {
  // The quick reading sees the last exchange, finds the subject, but leaves out the action.
  const reading = JSON.stringify({ subject: "operating systems", search: "operating system kernel", names: ["operating system"], terms: ["kernel"], actions: [] });
  const { deps, sent, quick } = sequenceDeps(reading, [MAP_REPLY]);
  const history = [
    { role: "user" as const, content: "Explain how an operating system kernel works" },
    { role: "assistant" as const, content: "The kernel schedules processes and manages memory." },
  ];
  const reply = await createRanganService(deps).ask("u1", { question: "Create the board", history });
  assert.equal(reply.kind, "map");
  assert.match(quick[0][1].content, /conversation just before[\s\S]*Student: Explain how an operating system kernel works\nRangan: The kernel schedules/);
  assert.match(sent[0][1].content, /Earlier in this conversation[\s\S]*Rangan: The kernel schedules processes/);
});

test("a board request never goes to a chat answer that points to another app", () => {
  assert.match(RANGAN_SYSTEM_PROMPT, /Never tell them to use another app/);
});

test("a map brings freely licensed pictures for what it asked, and the on-subject Wikipedia articles it used as reading", async () => {
  const reading = PAGE_READING.replace('"actions":["page"]', '"actions":["board"]');
  const withPictures = JSON.stringify({ ...JSON.parse(MAP_REPLY), image: "Operating system", branches: JSON.parse(MAP_REPLY).branches.map((b: object, i: number) => ({ ...b, image: i === 1 ? "Paging" : null })) });
  const asked: string[] = [];
  const picture = (name: string) => ({ src: `https://upload.wikimedia.org/wikipedia/commons/a/ab/${name}.png`, width: 400, height: 300, alt: name, credit: "A · CC0", sourceUrl: `https://commons.wikimedia.org/wiki/File:${name}.png` });
  const { deps } = sequenceDeps(reading, [withPictures], {
    findImage: async (query) => {
      asked.push(query);
      return query === "Paging" ? picture("Paging") : null;
    },
    searchWeb: async () => [
      { ref: "https://en.wikipedia.org/wiki/Operating_system", sourceType: "web", title: "Operating system", heading: "Wikipedia", snippet: "", content: "An OS manages a computer; its kernel runs each process.", open: { kind: "web", url: "https://en.wikipedia.org/wiki/Operating_system" } },
      { ref: "https://en.wikipedia.org/wiki/Operating_system", sourceType: "web", title: "Operating system", heading: "Wikipedia", snippet: "", content: "Again.", open: { kind: "web", url: "https://en.wikipedia.org/wiki/Operating_system" } },
      { ref: "https://en.wikipedia.org/wiki/Paging", sourceType: "web", title: "Paging", heading: "Wikipedia", snippet: "", content: "Paging splits memory.", open: { kind: "web", url: "https://en.wikipedia.org/wiki/Paging" } },
    ],
  });
  const reply = await createRanganService(deps).ask("u1", { question: "make a mind map of operating systems" });
  assert.equal(reply.kind, "map");
  if (reply.kind !== "map") return;
  assert.deepEqual(asked.sort(), ["Operating system", "Paging"]);
  assert.deepEqual(reply.map.images, [{ ...picture("Paging"), target: "Memory" }]);
  assert.deepEqual(reply.map.reading, [{ title: "Operating system", url: "https://en.wikipedia.org/wiki/Operating_system" }], "once, and only articles named for the subject");
});

test("a map brings a lesson video when it asks for one, searched with the request's subject", async () => {
  const reading = PAGE_READING.replace('"actions":["page"]', '"actions":["board"]');
  const withVideo = JSON.stringify({ ...JSON.parse(MAP_REPLY), video: "operating systems explained" });
  const asked: string[][] = [];
  const { deps } = sequenceDeps(reading, [withVideo], {
    findVideo: async (query, subject) => {
      asked.push([query, subject]);
      return { videoId: "AAAAAAAAAAA", title: "Operating systems explained", channel: "Teacher" };
    },
  });
  const reply = await createRanganService(deps).ask("u1", { question: "make a mind map of operating systems" });
  assert.equal(reply.kind, "map");
  if (reply.kind !== "map") return;
  assert.deepEqual(asked, [["operating systems explained", "operating systems"]]);
  assert.equal(reply.map.video?.videoId, "AAAAAAAAAAA");
});

test("a picture lookup that fails leaves the map without pictures", async () => {
  const reading = PAGE_READING.replace('"actions":["page"]', '"actions":["board"]');
  const withPicture = JSON.stringify({ ...JSON.parse(MAP_REPLY), image: "Operating system" });
  const { deps } = sequenceDeps(reading, [withPicture], { findImage: async () => { throw new Error("offline"); } });
  const reply = await createRanganService(deps).ask("u1", { question: "make a mind map of operating systems" });
  assert.equal(reply.kind, "map");
  if (reply.kind === "map") assert.deepEqual(reply.map.images, []);
});

test("a map reply that isn't a map is an error, so the question is given back", async () => {
  const reading = PAGE_READING.replace('"actions":["page"]', '"actions":["board"]');
  const { deps, counts } = sequenceDeps(reading, ["Sorry."]);
  await assert.rejects(createRanganService(deps).ask("u1", { question: "make a mind map" }), { status: 502 });
  assert.equal([...counts.values()][0], 0);
});

const OPEN_BOARD = {
  ref: "workspace:board1",
  title: "OS map",
  elements: [
    { key: "e1", type: "sticky", text: "Memory", selected: true, locked: false },
    { key: "e2", type: "sticky", text: "Operating System", selected: false, locked: false },
  ],
  edges: [{ from: "e2", to: "e1", label: "manages" }],
};

test("asking to add to the open board returns a plan on its elements", async () => {
  const reading = EDIT_READING;
  const plan = JSON.stringify({ summary: "Expanded Memory.", changes: [{ add: { to: "e1", title: "Paging", label: "uses", children: [{ title: "Page table" }] } }, { add: { to: "e7", title: "Nowhere" } }] });
  const { deps, sent } = sequenceDeps(reading, [plan], { ownsBoard: async (userId, id) => userId === "u1" && id === "board1" });
  const reply = await createRanganService(deps).ask("u1", { question: "expand the selected node", board: OPEN_BOARD });
  assert.equal(reply.kind, "board-edit");
  if (reply.kind !== "board-edit") return;
  assert.equal(reply.boardRef, "workspace:board1");
  assert.deepEqual(reply.changes, [{ kind: "add", to: "e1", node: { title: "Paging", note: "" }, label: "uses", children: [{ title: "Page table", note: "" }], also: [] }]);
  assert.match(sent[0][1].content, /e1\* \(sticky\) Memory/);
});

test("someone else's board can't be changed, and the question is given back", async () => {
  const { deps, counts } = sequenceDeps(EDIT_READING, ["{}"], { ownsBoard: async () => false });
  await assert.rejects(createRanganService(deps).ask("u1", { question: "expand the selected node", board: OPEN_BOARD }), { status: 404 });
  assert.equal([...counts.values()][0], 0);
});

test("a reply that isn't a page is an error, so the question is given back", async () => {
  const { deps, counts } = pageDeps({ reading: PAGE_READING, write: "Sorry, I can't." });
  await assert.rejects(createRanganService(deps).ask("u1", { question: "make me a note on operating systems" }), { status: 502 });
  assert.equal([...counts.values()][0], 0);
});

test("asking to change the open page returns a safe plan; locked blocks stay locked", async () => {
  const { deps, sent } = pageDeps({
    reading: EDIT_READING,
    sources: { "note:mine": { title: "OS", passages: [OS_NOTE] } },
    write: JSON.stringify({
      summary: "Simplified the kernel line.",
      changes: [
        { replace: [2, 2], markdown: "The **kernel** runs the computer [1]." },
        { replace: [3, 3], markdown: "replace the PDF page" },
      ],
    }),
    verdict: '[{"claim": 1, "supported": true}]',
  });
  const reply = await createRanganService(deps).ask("u1", { question: "simplify this page", page: OPEN_PAGE });
  assert.equal(reply.kind, "edit");
  if (reply.kind !== "edit") return;
  assert.equal(reply.pageRef, "note:mine");
  assert.deepEqual(reply.changes, [{ kind: "replace", from: 2, to: 2, markdown: "The **kernel** runs the computer [1]." }]);
  assert.match(sent[0][1].content, /\[3\] \(PDF page, locked\)/, "the server locks a PDF page even if the panel didn't");
});

test("someone else's page can't be changed, and the question is given back", async () => {
  const { deps, counts } = pageDeps({ reading: EDIT_READING, sources: {}, write: "{}" });
  await assert.rejects(createRanganService(deps).ask("u1", { question: "simplify this page", page: OPEN_PAGE }), { status: 404 });
  assert.equal([...counts.values()][0], 0);
});

test("an edit request with no page open is answered as a question", async () => {
  const { deps } = pageDeps({ reading: EDIT_READING, write: "The kernel schedules processes [1]." });
  const reply = await createRanganService(deps).ask("u1", { question: "simplify this page" });
  assert.equal(reply.kind, undefined);
  assert.equal(reply.answer, "The kernel schedules processes [1].");
});

// ── where Rangan looks: what is open, then the library, then the web ─────────

const OPEN_OS_PAGE = {
  ref: "note:open1",
  title: "My OS page",
  blocks: [
    { type: "heading", text: "Scheduling", locked: false },
    { type: "paragraph", text: "The scheduler picks which process runs on the kernel next.", locked: false },
    { type: "heading", text: "Gardening", locked: false },
    { type: "paragraph", text: "Water tomatoes in the morning.", locked: false },
  ],
};

test("the open page comes first, labelled as open; its indexed copy and unrelated parts are left out", async () => {
  const stale: LibraryPassage = { ...OS_NOTE, ref: "note:open1#b_BBBBBBBBBB", title: "My OS page", content: "Old text about the kernel." };
  const { deps, sent, webQueries } = readingDeps({ reading: OS_READING, library: [stale, OS_NOTE], answer: "This page says the scheduler picks the next process [1]. Your notes agree [2]." });
  const reply = await createRanganService(deps).ask("u1", { question: "how does the kernel scheduler pick a process?", page: OPEN_OS_PAGE });
  const prompt = sent[0].at(-1)?.content ?? "";
  assert.match(prompt, /\[1\] \(open in front of the student\) › My OS page › Scheduling\nThe scheduler picks/);
  assert.match(prompt, /\[2\] \(the student's library\) › CS notes › Kernel/);
  assert.doesNotMatch(prompt, /Old text about the kernel/, "the page's indexed copy isn't repeated");
  assert.doesNotMatch(prompt, /tomatoes/, "parts of the page that don't match aren't sent");
  assert.deepEqual(webQueries, [], "the page and the library were enough: no internet");
  assert.equal(reply.kind, undefined);
  if (reply.kind === undefined) assert.deepEqual(reply.citations.map((citation) => [citation.origin, citation.open?.kind]), [["open", "note"], ["library", "note"]]);
});

test("the open board comes first too, and its citations open the board", async () => {
  const { deps, sent } = readingDeps({ reading: OS_READING, library: [], answer: "This board links the kernel to scheduling [1]." });
  const board = {
    ref: "workspace:b1",
    title: "OS board",
    elements: [
      { key: "e1", type: "sticky", text: "Kernel", selected: false, locked: false },
      { key: "e2", type: "sticky", text: "Scheduler\nPicks the next process", selected: false, locked: false },
    ],
    edges: [{ from: "e1", to: "e2", label: "runs" }],
  };
  const reply = await createRanganService(deps).ask("u1", { question: "what does this board say about the kernel?", board });
  assert.match(sent[0].at(-1)?.content ?? "", /\[1\] \(open in front of the student\) › OS board\nKernel\n → runs → Scheduler/);
  if (reply.kind === undefined) assert.deepEqual(reply.citations[0].open, { kind: "board", boardId: "b1" });
});

test("the internet is used only when the open page and the library have too little, and then a lesson video is offered", async () => {
  const web: LibraryPassage = { ref: "https://en.wikipedia.org/wiki/Kernel_(operating_system)", sourceType: "web", title: "Kernel (operating system)", heading: "Wikipedia", snippet: "", content: "The kernel is the core of an OS.", open: { kind: "web", url: "https://en.wikipedia.org/wiki/Kernel_(operating_system)" } };
  const videoAsks: string[][] = [];
  const thin = readingDeps({ reading: OS_READING, library: [], answer: "Wikipedia says the kernel is the core [1]." });
  thin.deps.searchWeb = async () => [web];
  thin.deps.findVideo = async (query, subject) => {
    videoAsks.push([query, subject]);
    return { videoId: "AAAAAAAAAAA", title: "Operating systems explained", channel: "Teacher" };
  };
  const reply = await createRanganService(thin.deps).ask("u1", { question: "what is a kernel?" });
  assert.equal(reply.kind, undefined);
  if (reply.kind !== undefined) return;
  assert.deepEqual(reply.citations.map((citation) => citation.origin), ["web"]);
  assert.deepEqual(videoAsks, [["operating systems explained", "operating systems"]]);
  assert.equal(reply.video?.videoId, "AAAAAAAAAAA");

  // Enough in the library: no internet, so no video either.
  const rich = readingDeps({ reading: OS_READING, library: [OS_NOTE, { ...OS_NOTE, ref: "note:os2", title: "More OS notes" }] });
  let asked = false;
  rich.deps.findVideo = async () => {
    asked = true;
    return null;
  };
  const richReply = await createRanganService(rich.deps).ask("u1", { question: "what is a kernel?" });
  assert.deepEqual(rich.webQueries, []);
  assert.equal(asked, false);
  if (richReply.kind === undefined) assert.equal(richReply.video, undefined);
});

test("changing the open page doesn't also cite it as a source", async () => {
  const { deps, sent } = pageDeps({
    reading: EDIT_READING,
    sources: { "note:mine": { title: "OS", passages: [OS_NOTE] } },
    write: JSON.stringify({ summary: "Simplified.", changes: [{ replace: [2, 2], markdown: "The kernel runs things." }] }),
  });
  await createRanganService(deps).ask("u1", { question: "simplify this page", page: OPEN_PAGE });
  assert.doesNotMatch(sent[0][1].content, /open in front of the student/);
});

test("a Wikipedia article that only shares the subject's name is left out, and the subject's other names are tried", async () => {
  const reading = JSON.stringify({ subject: "northern lights", search: "northern lights cause", names: ["northern lights", "aurora borealis"], terms: ["solar wind", "magnetic field", "atmosphere"], actions: [] });
  const article = (title: string, content: string): LibraryPassage => ({ ref: `https://en.wikipedia.org/wiki/${title.replace(/ /g, "_")}`, sourceType: "web", title, heading: "Wikipedia", snippet: "", content, open: { kind: "web", url: `https://en.wikipedia.org/wiki/${title.replace(/ /g, "_")}` } });
  const { deps, sent, webQueries } = readingDeps({ reading, library: [], answer: "Auroras come from the solar wind [1]." });
  deps.searchWeb = async (query) => {
    webQueries.push(query);
    return query === "northern lights"
      ? [article("Northern Lights (Pullman novel)", "Northern Lights is a fantasy novel by Philip Pullman."), article("Minnesota Northern Lights", "A hockey team.")]
      : [article("Aurora", "An aurora is light in the upper atmosphere caused by the solar wind and Earth's magnetic field.")];
  };
  await createRanganService(deps).ask("u1", { question: "what causes the northern lights?" });
  assert.deepEqual(webQueries, ["northern lights", "aurora borealis"]);
  const prompt = sent[0].at(-1)?.content ?? "";
  assert.match(prompt, /\(Wikipedia\) › Aurora/);
  assert.doesNotMatch(prompt, /Pullman|hockey/);
});

// --- Planner tasks -------------------------------------------------------------

const DSA_REQUEST = "make a work that i want to solve 5 dsa problems before 12 am in the planner";
const DSA_TASK = JSON.stringify({ tasks: [{ title: "Solve 5 DSA problems", day: "2026-11-21", time: "00:00", priority: "medium", category: "Study", minutes: null, notes: null }] });

test("something to do becomes a planner task on the student's clock, not a page", async () => {
  const reading = JSON.stringify({ subject: "DSA problems", search: "data structures algorithms problems", names: ["DSA"], terms: ["array"], actions: ["task"] });
  const { deps, sent, searches, quick } = readingDeps({ reading, answer: DSA_TASK });
  const result = await createRanganService(deps).ask("u1", { question: DSA_REQUEST, where: "shelf", clock: { today: "2026-11-20", time: "21:05", timeZone: "Asia/Kolkata" } });
  assert.equal(result.kind, "task");
  assert.ok(result.kind === "task");
  assert.deepEqual(result.tasks, [{ title: "Solve 5 DSA problems", day: "2026-11-20", time: "23:59", priority: "medium", category: "Study", minutes: null, notes: null }]);
  assert.match(quick[0][1].content, /The student is on the Shelf/);
  assert.match(sent[0][1].content, /Friday 2026-11-20.*21:05 \(Asia\/Kolkata\)/);
  assert.deepEqual(searches, [], "a task needs no library search");
  assert.equal(result.usage.used, 1, "a task uses one question");
});

test("asked for outright, a task is made even when the reading is missing or says page", async () => {
  for (const reading of [new Error("busy"), JSON.stringify({ subject: "DSA", search: "DSA", names: [], terms: [], actions: ["page"] })]) {
    const { deps } = readingDeps({ reading, answer: DSA_TASK });
    const result = await createRanganService(deps).ask("u1", { question: DSA_REQUEST });
    assert.equal(result.kind, "task");
  }
});

test("a page asked for with a task word is still a page", async () => {
  const reading = JSON.stringify({ subject: "planner apps", search: "planner apps", names: ["planner app"], terms: ["calendar", "task"], actions: ["page", "task"] });
  const { deps } = readingDeps({ reading, answer: "# Planner apps\n\nThey hold tasks." });
  const result = await createRanganService(deps).ask("u1", { question: "write a page about planner apps and how tasks work" });
  assert.equal(result.kind, "page");
});

test("a task reply that can't be read gives the question back", async () => {
  const reading = JSON.stringify({ subject: null, search: "solve problems", names: [], terms: [], actions: ["task"] });
  const { deps } = readingDeps({ reading, answer: "Sure, I'll remember that." });
  const service = createRanganService(deps);
  await assert.rejects(service.ask("u1", { question: DSA_REQUEST }), (error: { status?: number; usage?: { used: number } }) => {
    assert.equal(error.status, 502);
    assert.equal(error.usage?.used, 0);
    return true;
  });
});

test("a study plan asked for in any words goes to the plan flow, and the question is given back", async () => {
  const reading = JSON.stringify({ subject: "graphs", search: "graphs", names: ["graph"], terms: ["vertex", "edge"], actions: ["plan"] });
  const { deps, sent } = readingDeps({ reading });
  await assert.rejects(createRanganService(deps).ask("u1", { question: "i want to get through this before my exam on friday" }), (error: { status?: number; details?: { reroute?: string }; usage?: { used: number } }) => {
    assert.equal(error.status, 409);
    assert.equal(error.details?.reroute, "plan");
    assert.equal(error.usage?.used, 0, "the question is given back");
    return true;
  });
  assert.equal(sent.length, 0, "the model isn't asked to answer");
});

test("a single thing to do by a time stays a task even if the reading also says plan", async () => {
  const reading = JSON.stringify({ subject: "DSA", search: "DSA", names: [], terms: [], actions: ["plan", "task"] });
  const { deps } = readingDeps({ reading, answer: DSA_TASK });
  const result = await createRanganService(deps).ask("u1", { question: "plan to solve 5 dsa problems before 12 am" });
  assert.equal(result.kind, "task");
});

test("small talk is answered at once: no search, no model, no question used", async () => {
  for (const question of ["hello", "hello!", "good morning rangan", "what is your name?", "thanks"]) {
    const { deps, sent, searches } = fakeDeps({ limit: 3 });
    const webQueries: string[] = [];
    deps.searchWeb = async (query) => {
      webQueries.push(query);
      return [];
    };
    const result = await createRanganService(deps).ask("u1", { question, history: [{ role: "user", content: "what is authentication?" }] });
    assert.equal(result.kind, undefined, question);
    assert.ok(result.kind === undefined && /Rangan|welcome/i.test(result.answer), question);
    assert.deepEqual(result.citations, []);
    assert.equal(result.usage.used, 0, `${question}: no question used`);
    assert.deepEqual([sent.length, searches.length, webQueries.length], [0, 0, 0], question);
  }
});

test("chit-chat the reader spots is answered without the library or the web", async () => {
  const reading = JSON.stringify({ subject: null, search: "", names: [], terms: [], actions: [], chat: true });
  const { deps, searches, webQueries, sent } = readingDeps({ reading, answer: "Haha, I'm a librarian, so I'd pick books!" });
  const result = await createRanganService(deps).ask("u1", { question: "do you like movies or books more?" });
  assert.ok(result.kind === undefined);
  assert.deepEqual(result.citations, []);
  assert.deepEqual([searches.length, webQueries.length], [0, 0]);
  assert.match(sent[0].at(-1)?.content ?? "", /small talk/);
});

test("a message read as having no subject never searches the web for its words", async () => {
  const reading = JSON.stringify({ subject: null, search: "what I know so far", names: [], terms: [], actions: [] });
  const { deps, webQueries } = readingDeps({ reading, library: [] });
  await createRanganService(deps).ask("u1", { question: "summarize what I know so far" });
  assert.deepEqual(webQueries, []);
});

// --- Page tools -------------------------------------------------------------------

const TOOL_PAGE = {
  ref: "note:cmabcdefghijklmnopqrstuvw",
  title: "Stacks",
  blocks: [
    { id: "b_para000001", type: "paragraph", text: "A stack is LIFO.", locked: false },
    { id: "list:b_task000001", type: "taskList", text: "Revise stacks", locked: false },
  ],
};

test("with a page open, an edit in plain words uses the page tools, even when the reading missed it", async () => {
  const reading = JSON.stringify({ subject: "stacks", search: "stacks", names: ["stack"], terms: ["LIFO"], actions: [] });
  const reply = JSON.stringify({ summary: "Bolded LIFO and ticked the to-do.", ops: [{ op: "format", block: 1, text: "LIFO", bold: true }, { op: "check", block: 2, done: true }] });
  const { deps, sent } = readingDeps({ reading, answer: reply });
  deps.loadSource = async () => ({ title: "Stacks", passages: [] });
  const result = await createRanganService(deps).ask("u1", { question: "make this bold and tick off revise stacks, add a to-do too", page: { ...TOOL_PAGE, selection: { block: "b_para000001", text: "LIFO" } } });
  assert.equal(result.kind, "edit");
  assert.ok(result.kind === "edit");
  assert.deepEqual(result.ops, [
    { op: "format", block: "b_para000001", text: "LIFO", set: { bold: true } },
    { op: "check", block: "list:b_task000001", item: null, done: true },
  ]);
  assert.deepEqual(result.changes, []);
  assert.match(sent[0].at(-1)?.content ?? "", /selected, in block \[1\]: """LIFO"""/);
});

test("a page sent without block ids still gets the older whole-block edit", async () => {
  const reading = JSON.stringify({ subject: "stacks", search: "stacks", names: [], terms: [], actions: ["edit"] });
  const reply = JSON.stringify({ summary: "Added a line.", changes: [{ insertAfter: 1, markdown: "Push adds, pop removes." }] });
  const { deps } = readingDeps({ reading, answer: reply });
  deps.loadSource = async () => ({ title: "Stacks", passages: [] });
  const blocks = TOOL_PAGE.blocks.map(({ type, text, locked }) => ({ type, text, locked }));
  const result = await createRanganService(deps).ask("u1", { question: "add a line about push and pop", page: { ref: TOOL_PAGE.ref, title: "Stacks", blocks } });
  assert.ok(result.kind === "edit");
  assert.equal(result.ops, undefined);
  assert.equal(result.changes.length, 1);
});

test("a made-up video or article is left out of a page edit, and the summary says so", async () => {
  const reading = JSON.stringify({ subject: "stacks", search: "stacks", names: [], terms: [], actions: ["edit"] });
  const reply = JSON.stringify({
    summary: "Linked stack and embedded a video.",
    ops: [
      { op: "link", block: 1, text: "stack", href: "https://en.wikipedia.org/wiki/Stack_(abstract_data_type)" },
      { op: "embed", after: 1, url: "https://www.youtube.com/watch?v=madeup00000" },
    ],
  });
  const { deps } = readingDeps({ reading, answer: reply });
  deps.loadSource = async () => ({ title: "Stacks", passages: [] });
  deps.linkExists = async (href) => !href.includes("madeup");
  const result = await createRanganService(deps).ask("u1", { question: "link stack and embed a video", page: TOOL_PAGE });
  assert.ok(result.kind === "edit");
  assert.deepEqual(result.ops?.map((op) => op.op), ["link"]);
  assert.match(result.summary, /One link couldn't be confirmed/);
});

test("'notes on X' becomes a new page even when the reading didn't ask for one", async () => {
  const reading = JSON.stringify({ subject: "SQL joins", search: "sql joins", names: ["SQL join"], terms: ["inner join"], actions: [] });
  const { deps, sent } = pageDeps({ reading, write: "<!-- kind: cheatsheet -->\n# SQL Joins\n## Inner join\nRows that match.", verdict: "[]" });
  const reply = await createRanganService(deps).ask("u1", { question: "notes on sql joins" });
  assert.equal(reply.kind, "page");
  assert.ok(reply.kind === "page");
  assert.equal(reply.title, "SQL Joins");
  assert.equal(reply.pageKind, "cheatsheet");
  assert.match(sent[0][1].content, /Choose the kind of page that fits/);
});

// --- Board tools ------------------------------------------------------------------

const STYLED_BOARD = {
  ...OPEN_BOARD,
  elements: [
    { key: "e1", type: "sticky", text: "Memory", selected: true, locked: false, style: "green" },
    { key: "e2", type: "sticky", text: "Operating System", selected: false, locked: false, style: "yellow" },
  ],
};

test("with a board open, plain-words changes use the board tools, with the user's library cards", async () => {
  const reading = JSON.stringify({ subject: "operating systems", search: "operating system kernel", names: ["operating system", "OS"], terms: ["kernel", "process"], actions: [] });
  const reply = JSON.stringify({
    summary: "Added paging, coloured it and laid out a tree.",
    ops: [
      { op: "add", what: "sticky", text: "Paging", color: "blue", link: { to: "e1", label: "uses" } },
      { op: "card", ref: "note:os", link: { to: "n1" } },
      { op: "arrange", keys: ["e2", "e1", "n1"], layout: "tree" },
      { op: "edit", key: "e9", text: "nowhere" },
    ],
  });
  const { deps, sent } = sequenceDeps(reading, [reply], {
    ownsBoard: async (userId, id) => userId === "u1" && id === "board1",
    findBoardCard: async (userId, ref) => (userId === "u1" && ref.id === "os" ? { type: "note-card", noteId: "os", title: "CS notes", excerpt: "The kernel…" } : null),
  });
  const result = await createRanganService(deps).ask("u1", { question: "add paging under memory, blue, and arrange everything as a tree", board: STYLED_BOARD });
  assert.ok(result.kind === "board-edit");
  assert.deepEqual(result.changes, []);
  assert.deepEqual(result.ops?.map((op) => op.op), ["add", "card", "arrange"]);
  assert.match(sent[0].at(-1)?.content ?? "", /e1\* \(sticky, green\) Memory/);
  assert.match(sent[0].at(-1)?.content ?? "", /note:os "CS notes"/);
});

test("on an open board, a 'board' reading with change words edits it rather than drafting a new map", async () => {
  const reading = JSON.stringify({ subject: "deadlock", search: "deadlock", names: ["deadlock"], terms: [], actions: ["board"] });
  const reply = JSON.stringify({ summary: "Coloured the tips.", ops: [{ op: "edit", key: "e1", color: "blue" }] });
  const { deps } = sequenceDeps(reading, [reply], { ownsBoard: async () => true });
  const result = await createRanganService(deps).ask("u1", { question: "make the memory sticky blue and add a green diamond shape", board: STYLED_BOARD });
  assert.equal(result.kind, "board-edit");
  const fresh = await createRanganService(sequenceDeps(reading, ["{}"], { ownsBoard: async () => true }).deps).ask("u1", { question: "make a mind map of deadlock", board: STYLED_BOARD }).catch((error: { status?: number }) => error);
  assert.notEqual((fresh as { kind?: string }).kind, "board-edit", "a new mind map is not an edit");
});

test("Rangan answers in the student's language, Bengali, Hindi and Hinglish included", async () => {
  const { RANGAN_SYSTEM_PROMPT } = await import("./rangan.service");
  for (const words of ["Bengali script gets Bengali", "Devanagari Hindi gets Hindi", "same mix in English letters, never Devanagari", "even when the passages are in another language"]) assert.ok(RANGAN_SYSTEM_PROMPT.includes(words), words);
});
