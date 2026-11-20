import assert from "node:assert/strict";
import test from "node:test";
import { createStudyService, type LoadedStudySource, type StudyDeps } from "@/lib/services/study.service";
import {
  extractJsonArray,
  FLASHCARD_MAX,
  parseFlashcards,
  parseQuiz,
  selectStudyPassages,
  STUDY_BUDGET_CHARS,
} from "./generation";

const passage = (n: number, length = 1_000) => ({ anchor: `page${n}`, heading: `Page ${n}`, content: `p${n} `.padEnd(length, "x") });

test("a short source is used whole", () => {
  const passages = [passage(1), passage(2), passage(3)];
  assert.deepEqual(selectStudyPassages(passages), { selected: passages, partial: false });
});

test("a long source is sampled evenly, in order, within the budget", () => {
  const passages = Array.from({ length: 300 }, (_, index) => passage(index + 1));
  const { selected, partial } = selectStudyPassages(passages);
  assert.equal(partial, true);
  assert.ok(selected.reduce((sum, p) => sum + p.content.length, 0) <= STUDY_BUDGET_CHARS);
  const pages = selected.map((p) => Number(p.anchor.slice(4)));
  assert.deepEqual(pages, [...pages].sort((a, b) => a - b));
  assert.equal(pages[0], 1);
  assert.ok((pages.at(-1) ?? 0) > 250, "the end of the source is included");
});

test("the JSON array is found inside code fences or prose", () => {
  assert.deepEqual(extractJsonArray('Here you go:\n```json\n[{"a": 1}]\n```'), [{ a: 1 }]);
  assert.deepEqual(extractJsonArray("no json here"), []);
  assert.deepEqual(extractJsonArray("[not json]"), []);
  assert.deepEqual(extractJsonArray('{"a": [1]}'), [1]);
});

test("flashcards keep well-formed, distinct cards with a valid passage", () => {
  const reply = JSON.stringify([
    { front: "What is ATP?", back: "The cell's  energy\ncarrier.", passage: 2 },
    { front: "what is atp?", back: "Repeat", passage: 1 },
    { front: "", back: "No front" },
    { front: "Where?", back: "In mitochondria", passage: 9 },
    { front: "Why?", back: "Because", passage: "1" },
    "junk",
  ]);
  assert.deepEqual(parseFlashcards(reply, 3), [
    { front: "What is ATP?", back: "The cell's energy carrier.", passage: 1 },
    { front: "Where?", back: "In mitochondria", passage: null },
    { front: "Why?", back: "Because", passage: 0 },
  ]);
});

test("flashcards are capped", () => {
  const reply = JSON.stringify(Array.from({ length: 40 }, (_, i) => ({ front: `Q${i}`, back: `A${i}` })));
  assert.equal(parseFlashcards(reply, 1).length, FLASHCARD_MAX);
});

test("quiz questions need distinct options and an answer among them", () => {
  const good = { question: "Which organelle makes ATP?", options: ["Nucleus", "Mitochondria", "Ribosome", "Golgi"], answer: 1, explanation: "It runs respiration.", passage: 1 };
  const reply = JSON.stringify([
    good,
    { ...good, answer: 4 },
    { ...good, options: ["A", "a", "B", "C"] },
    { ...good, options: ["Only one"] },
    { ...good, answer: "2", explanation: undefined, passage: 0 },
  ]);
  assert.deepEqual(parseQuiz(reply, 2), [
    { question: good.question, options: good.options, answer: 1, explanation: "It runs respiration.", passage: 0 },
    { question: good.question, options: good.options, answer: 2, explanation: "", passage: null },
  ]);
});

// --- Service rules -------------------------------------------------------------

const source: LoadedStudySource = {
  kind: "pdf",
  id: "asset1",
  title: "Cell biology",
  passages: [passage(1, 200), passage(2, 200)],
  itemId: null,
};

function setup(options: { reply?: string; allowed?: boolean; found?: LoadedStudySource | null; failModel?: boolean } = {}) {
  const calls = { consumed: 0, refunded: 0, saved: [] as Array<{ front: string; sourceRef: string }>, prompts: [] as string[] };
  const deps: StudyDeps = {
    dailyLimit: 25,
    now: () => new Date("2026-11-20T10:00:00Z"),
    consumeQuestion: async () => {
      calls.consumed += 1;
      return { allowed: options.allowed ?? true, used: 3 };
    },
    refundQuestion: async () => {
      calls.refunded += 1;
    },
    loadSource: async (userId, ref) => (userId === "u1" && ref.type === "asset" && ref.id === "asset1" ? (options.found === undefined ? source : options.found) : null),
    complete: async (messages) => {
      calls.prompts.push(messages.map((m) => m.content).join("\n"));
      if (options.failModel) throw Object.assign(new Error("busy"), { status: 503 });
      return { text: options.reply ?? "[]", provider: "groq-large", model: "test" };
    },
    replaceAiCards: async (_userId, _source, cards) => {
      calls.saved.push(...cards.map((card) => ({ front: card.front, sourceRef: card.sourceRef })));
      return { created: cards.length, replaced: 2 };
    },
  };
  return { service: createStudyService(deps), calls };
}

test("flashcards are saved with the passage they came from, using one question", async () => {
  const { service, calls } = setup({ reply: JSON.stringify([{ front: "Q", back: "A", passage: 2 }, { front: "Q2", back: "A2" }]) });
  const result = await service.makeFlashcards("u1", { ref: "asset:asset1" });
  assert.equal(calls.consumed, 1);
  assert.equal(calls.refunded, 0);
  assert.deepEqual(calls.saved, [
    { front: "Q", sourceRef: "asset:asset1#page2" },
    { front: "Q2", sourceRef: "asset:asset1" },
  ]);
  assert.equal(result.created, 2);
  assert.equal(result.replaced, 2);
  assert.deepEqual(result.cards[0].source, {
    ref: "asset:asset1#page2",
    label: "p. 2",
    open: { kind: "pdf", assetId: "asset1", page: 2, itemId: null },
  });
  assert.match(calls.prompts[0], /Cell biology/);
});

test("a source that is not the user's, or has no text, costs nothing", async () => {
  const cases: Array<[string, string, LoadedStudySource | undefined]> = [
    ["u2", "asset:asset1", undefined],
    ["u1", "asset:asset1", { ...source, passages: [] }],
    ["u1", "item:x", undefined],
  ];
  for (const [userId, ref, found] of cases) {
    const { service, calls } = setup({ found });
    await assert.rejects(service.makeQuiz(userId, { ref }), (error: Error & { status?: number }) => error.status === 404 || error.status === 400);
    assert.equal(calls.consumed, 0);
  }
});

test("an unusable reply or a model failure gives the question back", async () => {
  for (const options of [{ reply: "Sorry, I can't." }, { failModel: true }]) {
    const { service, calls } = setup(options);
    await assert.rejects(service.makeFlashcards("u1", { ref: "asset:asset1" }));
    assert.equal(calls.consumed, 1);
    assert.equal(calls.refunded, 1);
    assert.deepEqual(calls.saved, []);
  }
});

test("a spent allowance stops before the model is asked", async () => {
  const { service, calls } = setup({ allowed: false });
  await assert.rejects(service.makeQuiz("u1", { ref: "asset:asset1" }), (error: Error & { status?: number }) => error.status === 429);
  assert.deepEqual(calls.prompts, []);
});

test("quiz questions link to their passage", async () => {
  const reply = JSON.stringify([{ question: "Q?", options: ["a", "b", "c", "d"], answer: 3, explanation: "Because.", passage: 1 }]);
  const { service } = setup({ reply });
  const quiz = await service.makeQuiz("u1", { ref: "asset:asset1" });
  assert.equal(quiz.questions.length, 1);
  assert.equal(quiz.questions[0].answer, 3);
  assert.equal(quiz.questions[0].source.label, "p. 1");
  assert.equal(quiz.partial, false);
});
