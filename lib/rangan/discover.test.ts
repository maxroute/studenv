import assert from "node:assert/strict";
import test from "node:test";
import { coveringResult, isExploreRequest, parseExploreReply, rankRelated, sourceKey } from "./discover";

const candidate = (sourceType: string, sourceId: string, anchor: string, similarity: number) => ({ chunk: { sourceType, sourceId, anchor }, similarity });

test("sources are keyed the way links name them", () => {
  assert.equal(sourceKey("note", "n1"), "note:n1");
  assert.equal(sourceKey("pdf", "a1"), "asset:a1");
  assert.equal(sourceKey("transcript", "v1"), "asset:v1");
  assert.equal(sourceKey("item", "i1"), "item:i1");
});

test("related keeps each source's closest passage, best first, above the floor", () => {
  const ranked = rankRelated(
    [
      candidate("note", "a", "b1", 0.62),
      candidate("note", "a", "b2", 0.71),
      candidate("pdf", "p", "page3", 0.66),
      candidate("note", "weak", "b1", 0.55),
      candidate("transcript", "v", "t=1000", 0.58),
    ],
    { self: "note:page", linked: new Set() },
  );
  assert.deepEqual(ranked.map(({ chunk, similarity }) => [chunk.sourceId, chunk.anchor, similarity]), [
    ["a", "b2", 0.71],
    ["p", "page3", 0.66],
    ["v", "t=1000", 0.58],
  ]);
});

test("related leaves out the page itself and what it links to or is linked from", () => {
  const ranked = rankRelated(
    [candidate("note", "page", "b1", 0.99), candidate("pdf", "linked", "page1", 0.9), candidate("note", "backlink", "b1", 0.8), candidate("note", "new", "b1", 0.7)],
    { self: "note:page", linked: new Set(["asset:linked", "note:backlink"]) },
  );
  assert.deepEqual(ranked.map(({ chunk }) => chunk.sourceId), ["new"]);
});

test("related shows at most five sources", () => {
  const many = Array.from({ length: 8 }, (_, index) => candidate("note", `n${index}`, "", 0.9 - index / 100));
  assert.equal(rankRelated(many, { self: "note:page", linked: new Set() }).length, 5);
});

test("the explore reply keeps distinct gaps, connections to related passages only, and questions", () => {
  const reply = `Here:\n${JSON.stringify({
    gaps: [{ concept: " ATP ", why: "It  powers things." }, { concept: "atp" }, { concept: "" }, { concept: "Electron transport" }],
    connect: [{ passage: 2, why: "page itself" }, { passage: "4", why: "Adds detail." }, { passage: 4 }, { passage: 7 }, { passage: 5 }],
    questions: ["Why?", "Why?", 3, "How?"],
  })}`;
  assert.deepEqual(parseExploreReply(reply, 3, 3), {
    gaps: [
      { concept: "ATP", why: "It powers things." },
      { concept: "Electron transport", why: "" },
    ],
    connect: [
      { passage: 0, why: "Adds detail." },
      { passage: 1, why: "" },
    ],
    questions: ["Why?", "How?"],
  });
  assert.deepEqual(parseExploreReply("no json", 3, 3), { gaps: [], connect: [], questions: [] });
});

test("a gap is covered only by material outside the page that matched by keyword and meaning", () => {
  const results = [
    { ref: "note:page#b1", matchedBy: ["keyword", "meaning"] },
    { ref: "note:other#b1", matchedBy: ["meaning"] },
    { ref: "asset:pdf#page2", matchedBy: ["keyword", "meaning"] },
  ];
  assert.equal(coveringResult(results, "note:page")?.ref, "asset:pdf#page2");
  assert.equal(coveringResult(results.slice(0, 2), "note:page"), null);
  assert.equal(coveringResult([{ ref: "note:pages#b1", matchedBy: ["keyword", "meaning"] }], "note:page")?.ref, "note:pages#b1", "a page with a longer id is not the page");
});

test("a chat message asks what to explore only when it says so", () => {
  for (const message of [
    "What should I explore next?",
    "what can I study next about this",
    "What am I missing?",
    "What else should I learn about photosynthesis?",
    "Are there gaps in my notes?",
  ]) {
    assert.equal(isExploreRequest(message), true, message);
  }
  for (const message of ["Explore the history of Rome", "What is next to the nucleus?", "Summarize what I know so far", "Plan my revision", ""]) {
    assert.equal(isExploreRequest(message), false, message);
  }
});
