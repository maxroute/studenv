import assert from "node:assert/strict";
import test from "node:test";
import { aiGenerateSchema, type GeneratedFlashcard } from "@/lib/models/ai.model";
import {
  createAiGenerateService,
  normalizeGeneratedFlashcards,
  type AiGenerateDeps,
} from "./ai-generate.service";

const OWNER = "user-owner";
const OTHER = "user-other";
const ASSET = "c" + "a".repeat(24);

/** In-memory stand-ins for the database and the model, recording every call. */
function fakeDeps(options: { cards?: unknown } = {}) {
  const calls: string[] = [];
  const store = { summary: null as string | null, flashcards: [] as GeneratedFlashcard[] };
  const deps: AiGenerateDeps = {
    isAssetOwnedBy: async (assetId, ownerId) => {
      calls.push("isAssetOwnedBy");
      return assetId === ASSET && ownerId === OWNER;
    },
    saveSummary: async (_assetId, summary) => {
      calls.push("saveSummary");
      store.summary = summary;
    },
    findSavedFlashcards: async () => {
      calls.push("findSavedFlashcards");
      return store.flashcards;
    },
    saveFlashcardsIfNone: async (_assetId, _transcript, cards) => {
      calls.push("saveFlashcardsIfNone");
      if (store.flashcards.length > 0) return { saved: false, flashcards: store.flashcards };
      store.flashcards = [...store.flashcards, ...cards];
      return { saved: true, flashcards: cards };
    },
    generateSummary: async () => {
      calls.push("generateSummary");
      return "a summary";
    },
    generateFlashcards: async () => {
      calls.push("generateFlashcards");
      return options.cards ?? [{ front: "Q1", back: "A1" }, { front: "Q2", back: "A2" }];
    },
    generateQuiz: async () => {
      calls.push("generateQuiz");
      return [];
    },
    chatWithDocument: async () => {
      calls.push("chatWithDocument");
      return "an answer";
    },
  };
  return { deps, calls, store };
}

const MODEL_OR_WRITE = ["generateSummary", "generateFlashcards", "saveSummary", "saveFlashcardsIfNone"];

test("a summary for another user's asset is refused before the model runs or anything is written", async () => {
  const { deps, calls, store } = fakeDeps();
  const run = createAiGenerateService(deps);
  await assert.rejects(run(OTHER, { action: "summary", text: "notes", assetId: ASSET }), { status: 404 });
  assert.equal(calls.some((call) => MODEL_OR_WRITE.includes(call)), false);
  assert.equal(store.summary, null);
});

test("flashcards for another user's asset are refused before the model runs or anything is written", async () => {
  const { deps, calls, store } = fakeDeps();
  const run = createAiGenerateService(deps);
  await assert.rejects(run(OTHER, { action: "flashcards", text: "notes", assetId: ASSET }), { status: 404 });
  assert.equal(calls.some((call) => MODEL_OR_WRITE.includes(call)), false);
  assert.deepEqual(store.flashcards, []);
});

test("an asset id that does not exist is refused the same way", async () => {
  const { deps } = fakeDeps();
  const run = createAiGenerateService(deps);
  await assert.rejects(run(OWNER, { action: "summary", text: "x", assetId: "c" + "b".repeat(24) }), { status: 404 });
});

test("the owner's summary is generated and saved", async () => {
  const { deps, store } = fakeDeps();
  const run = createAiGenerateService(deps);
  assert.deepEqual(await run(OWNER, { action: "summary", text: "notes", assetId: ASSET }), { summary: "a summary" });
  assert.equal(store.summary, "a summary");
});

test("generating flashcards twice saves one set and does not call the model again", async () => {
  const { deps, calls, store } = fakeDeps();
  const run = createAiGenerateService(deps);
  const first = await run(OWNER, { action: "flashcards", text: "notes", assetId: ASSET });
  const second = await run(OWNER, { action: "flashcards", text: "notes", assetId: ASSET });
  assert.equal(store.flashcards.length, 2, "cards must not be appended a second time");
  assert.deepEqual(second, first);
  assert.equal(calls.filter((call) => call === "generateFlashcards").length, 1);
});

test("without an asset, flashcards are generated and nothing is stored", async () => {
  const { deps, calls } = fakeDeps();
  const run = createAiGenerateService(deps);
  const result = await run(OTHER, { action: "flashcards", text: "notes" });
  assert.equal("flashcards" in result && result.flashcards.length, 2);
  assert.equal(calls.includes("isAssetOwnedBy") || calls.includes("saveFlashcardsIfNone"), false);
});

test("malformed cards from the model are dropped", () => {
  assert.deepEqual(
    normalizeGeneratedFlashcards([{ front: "Q", back: "A" }, { front: "" , back: "A" }, { front: "Q" }, "junk", null]),
    [{ front: "Q", back: "A" }],
  );
  assert.deepEqual(normalizeGeneratedFlashcards({ not: "an array" }), []);
});

test("request bodies are validated per action", () => {
  const ok = (body: unknown) => aiGenerateSchema.safeParse(body).success;
  assert.equal(ok({ action: "summary", text: "Recap this" }), true, "the study room recap body stays valid");
  assert.equal(ok({ action: "chat", text: "doc", userMessage: "hi", history: [{ role: "user", content: "x" }] }), true);
  assert.equal(ok({ action: "analyze_asset", assetId: ASSET }), false, "unknown actions are rejected");
  assert.equal(ok({ action: "summary", text: "   " }), false, "blank text is rejected");
  assert.equal(ok({ action: "summary", text: "x", assetId: "../etc" }), false, "asset ids must be ids");
  assert.equal(ok({ action: "summary", text: "x".repeat(80_001) }), false, "oversized text is rejected");
  assert.equal(ok({ action: "quiz", text: "x", assetId: ASSET }), false, "fields an action does not use are rejected");
  assert.equal(ok({ action: "chat", text: "d", userMessage: "q", history: [{ role: "system", content: "x" }] }), false);
});
