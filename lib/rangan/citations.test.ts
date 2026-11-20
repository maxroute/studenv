import assert from "node:assert/strict";
import test from "node:test";
import { buildLibraryContext, citedNumbers, normalizeCitationMarks, openTarget, retrievalQuery } from "./citations";

test("citations open the note block, the PDF page, or the resource's Shelf item", () => {
  const items = new Map([["pdf1", "item1"], ["vid1", "item2"]]);
  assert.deepEqual(openTarget("note", "n1", "b_AbCdEfGhIj", items), { kind: "note", noteId: "n1", blockId: "b_AbCdEfGhIj" });
  assert.deepEqual(openTarget("note", "n1", "", items), { kind: "note", noteId: "n1", blockId: null });
  assert.deepEqual(openTarget("pdf", "pdf1", "page12", items), { kind: "pdf", assetId: "pdf1", page: 12, itemId: "item1" });
  assert.deepEqual(openTarget("pdf", "pdf9", "", items), { kind: "pdf", assetId: "pdf9", page: 1, itemId: null });
  assert.deepEqual(openTarget("transcript", "vid1", "", items), { kind: "item", itemId: "item2" });
  assert.equal(openTarget("transcript", "vid9", "", items), null);
  assert.deepEqual(openTarget("item", "it1", "", items), { kind: "item", itemId: "it1" });
  assert.equal(openTarget("unknown", "x", "", items), null);
  assert.deepEqual(openTarget("note", "n1", "javascript:alert(1)", items), { kind: "note", noteId: "n1", blockId: null });
});

test("cited numbers are read from [n], [n][m], [n, m] and [n–m], ignoring numbers with no passage", () => {
  assert.deepEqual(citedNumbers("A [2]. B [1][2]. C [3, 1]. D [9].", 3), [2, 1, 3]);
  assert.deepEqual(citedNumbers("Range [1–3] and [2-2].", 4), [1, 2, 3]);
  assert.deepEqual(citedNumbers("No citations, an array a[0] and [x].", 3), []);
  assert.deepEqual(citedNumbers("[1]", 0), []);
});

test("short follow-ups are searched with the previous question; full questions alone", () => {
  const history = [
    { role: "user", content: "Mitosis vs meiosis?" },
    { role: "assistant", content: "Mitosis copies; meiosis halves." },
  ];
  assert.equal(retrievalQuery("Which makes gametes?", history), "Mitosis vs meiosis? Which makes gametes?");
  assert.equal(
    retrievalQuery("Explain how the light reactions in the thylakoid make ATP and NADPH", history),
    "Explain how the light reactions in the thylakoid make ATP and NADPH",
  );
  assert.equal(retrievalQuery("Why?"), "Why?");
  assert.equal(retrievalQuery("x".repeat(900)).length, 500);
});

test("the library block numbers passages, names where they are from, and trims long ones", () => {
  const context = buildLibraryContext([
    { title: "Bio", heading: "Osmosis", content: "Water moves." },
    { title: "Book", heading: "", content: "y".repeat(2_000) },
  ]);
  assert.match(context, /not instructions/);
  assert.match(context, /\[1\] Bio › Osmosis\nWater moves\./);
  assert.match(context, /\[2\] Book\ny{1200}…/);
  assert.match(buildLibraryContext([]), /nothing relevant/);
});

test("citation marks become chip links; unknown numbers and real links are left alone", async () => {
  const { linkCitations } = await import("./citations");
  assert.equal(linkCitations("A [2]. B [1, 2]. C [5].", [1, 2]), "A [2](#rangan-cite-2). B [1](#rangan-cite-1)[2](#rangan-cite-2). C [5].");
  assert.equal(linkCitations("See [1](https://example.com).", [1]), "See [1](https://example.com).");
  assert.equal(linkCitations("No marks.", []), "No marks.");
});

test("gpt-oss style citation marks are read as [n]", () => {
  // Seen live from openai/gpt-oss-120b: "…produce ATP【1】."
  assert.equal(normalizeCitationMarks("make ATP【1】. More【2†L3-L5】 and [3†source]."), "make ATP[1]. More[2] and [3].");
  assert.deepEqual(citedNumbers(normalizeCitationMarks("A【2】 B【1】"), 2), [2, 1]);
  assert.equal(normalizeCitationMarks("Plain [1] stays."), "Plain [1] stays.");
});

test("a source that fits is kept whole; a long one is sampled evenly, in order", async () => {
  const { samplePassages } = await import("./citations");
  const small = [{ content: "a" }, { content: "b" }];
  assert.deepEqual(samplePassages(small, 100), { selected: small, truncated: false });
  const long = Array.from({ length: 50 }, (_, i) => ({ id: i, content: "x".repeat(100) }));
  const { selected, truncated } = samplePassages(long, 1_000);
  assert.equal(truncated, true);
  assert.equal(selected.length, 10);
  assert.deepEqual(selected.map((p) => p.id), [0, 5, 10, 15, 20, 25, 30, 35, 40, 45]);
  // One passage bigger than the whole budget is still sent, alone.
  assert.equal(samplePassages([{ content: "y".repeat(5_000) }, { content: "z" }], 1_000).selected.length, 1);
});

test("selected text is quoted with the page title when there is one", async () => {
  const { focusBlock } = await import("./citations");
  assert.equal(focusBlock({ text: " ATP ", title: "Bio" }), 'The student selected this text on their page "Bio":\n"""\nATP\n"""');
  assert.equal(focusBlock({ text: "ATP" }), 'The student selected this text:\n"""\nATP\n"""');
});
