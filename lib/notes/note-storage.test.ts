import test from "node:test";
import assert from "node:assert/strict";
import { createEmptyNoteDoc, NOTE_DOC_FORMAT, NOTE_DOC_MAX_BYTES } from "./note-format";
import { NoteDocError, NOTE_REFS_MAX, normalizeNoteTitle, noteExcerpt, prepareNoteDoc } from "./note-save";
import { CHECKPOINT_INTERVAL_MS, REVISION_CAP, revisionsToPrune, shouldCheckpoint, type RevisionStamp } from "./revision-policy";
import { isSortKey, sortKeyBetween } from "./sort-key";

const DAY = 24 * 60 * 60 * 1000;

// ── sort keys ──────────────────────────────────────────────────────────────

test("sort keys always land strictly between their neighbours", () => {
  const keys: string[] = [sortKeyBetween(null, null)];
  // Insert repeatedly at the front, the back and the middle.
  for (let i = 0; i < 300; i += 1) {
    const at = i % 3;
    const sorted = [...keys].sort();
    const key =
      at === 0 ? sortKeyBetween(null, sorted[0])
        : at === 1 ? sortKeyBetween(sorted[sorted.length - 1], null)
          : sortKeyBetween(sorted[Math.floor(sorted.length / 2) - 1], sorted[Math.floor(sorted.length / 2)]);
    assert.ok(isSortKey(key), `valid key ${key}`);
    assert.equal(keys.includes(key), false, "keys are unique");
    keys.push(key);
  }
  const sorted = [...keys].sort();
  for (let i = 1; i < sorted.length; i += 1) assert.ok(sorted[i - 1] < sorted[i]);
});

test("repeated inserts between the same two keys keep working", () => {
  let low = sortKeyBetween(null, null);
  const high = sortKeyBetween(low, null);
  for (let i = 0; i < 100; i += 1) {
    const mid = sortKeyBetween(low, high);
    assert.ok(low < mid && mid < high);
    low = mid;
  }
  assert.ok(low.length <= 64, "keys stay short enough for the column");
});

test("invalid neighbours are refused", () => {
  assert.throws(() => sortKeyBetween("b", "a"), RangeError);
  assert.throws(() => sortKeyBetween("a0", null), RangeError, "keys never end in 0");
});

// ── revision policy ────────────────────────────────────────────────────────

test("a checkpoint is due after 10 minutes, or when there is none", () => {
  const now = new Date("2026-11-14T12:00:00Z");
  assert.equal(shouldCheckpoint(null, now), true);
  assert.equal(shouldCheckpoint(new Date(now.getTime() - CHECKPOINT_INTERVAL_MS + 1), now), false);
  assert.equal(shouldCheckpoint(new Date(now.getTime() - CHECKPOINT_INTERVAL_MS), now), true);
});

test("retention: all for 30 days, daily to 180 days, weekly after, manual always", () => {
  const now = new Date("2026-11-14T12:00:00Z");
  const rev = (id: string, daysAgo: number, reason = "checkpoint"): RevisionStamp => ({
    id, reason, createdAt: new Date(now.getTime() - daysAgo * DAY),
  });
  const prune = revisionsToPrune(
    [
      rev("recent-a", 1), rev("recent-b", 1.01),
      rev("day40-new", 40.1), rev("day40-old", 40.2),
      rev("day200-a", 200), rev("day200-b", 201),
      rev("manual-old", 400, "manual"), rev("manual-dup", 400.01, "manual"),
    ],
    now,
  );
  assert.deepEqual(prune.sort(), ["day200-b", "day40-old"]);
});

test("retention caps a note at 500 revisions, never dropping manual ones", () => {
  const now = new Date("2026-11-14T12:00:00Z");
  const revisions: RevisionStamp[] = [];
  for (let i = 0; i < 600; i += 1) revisions.push({ id: `c${i}`, reason: "checkpoint", createdAt: new Date(now.getTime() - i * 60_000) });
  revisions.push({ id: "m-old", reason: "manual", createdAt: new Date(now.getTime() - 10 * DAY) });
  const prune = new Set(revisionsToPrune(revisions, now));
  assert.equal(revisions.length - prune.size, REVISION_CAP);
  assert.equal(prune.has("m-old"), false);
  assert.equal(prune.has("c0"), false, "the newest are kept");
  assert.equal(prune.has("c599"), true, "the oldest go first");
});

// ── saving ─────────────────────────────────────────────────────────────────

test("a valid doc is normalised, with its plain text and references", () => {
  const doc = {
    format: NOTE_DOC_FORMAT,
    version: 1,
    doc: { type: "doc", content: [{ type: "paragraph", attrs: { id: "b_aaaaaaaaaa" }, content: [
      { type: "text", text: "v < c and E > 0 " },
      { type: "mention", attrs: { ref: "note:n1", label: "Other" } },
    ] }] },
  };
  const prepared = prepareNoteDoc(doc);
  assert.equal(prepared.plainText, "v < c and E > 0 Other", "text that looks like markup is kept");
  assert.equal(prepared.refs.length, 1);
  assert.equal(prepared.docFormat, 1);
  assert.equal(JSON.parse(prepared.docJson).doc.content[0].attrs.id, "b_aaaaaaaaaa");
});

test("documents that are not notes, are from a newer version, or are too big are refused", () => {
  const status = (doc: unknown) => {
    try {
      prepareNoteDoc(doc);
      return 200;
    } catch (error) {
      assert.ok(error instanceof NoteDocError);
      return error.status;
    }
  };
  assert.equal(status("not json"), 422);
  assert.equal(status({ hello: "world" }), 422);
  assert.equal(status({ ...createEmptyNoteDoc(), version: 99 }), 422);
  const big = createEmptyNoteDoc();
  big.doc.content = [{ type: "paragraph", attrs: { id: "b_bbbbbbbbbb" }, content: [{ type: "text", text: "x".repeat(NOTE_DOC_MAX_BYTES) }] }];
  assert.equal(status(big), 413);
  const linky = createEmptyNoteDoc();
  linky.doc.content = [{ type: "paragraph", attrs: { id: "b_cccccccccc" }, content: Array.from({ length: NOTE_REFS_MAX + 1 }, (_, i) => ({ type: "mention", attrs: { ref: `note:n${i}`, label: "x" } })) }];
  assert.equal(status(linky), 422);
  assert.equal(status(createEmptyNoteDoc()), 200);
});

test("titles and excerpts are stored tidy", () => {
  assert.equal(normalizeNoteTitle("  Cell\n biology  "), "Cell biology");
  assert.equal(normalizeNoteTitle("   "), "Untitled");
  assert.equal(normalizeNoteTitle(undefined), "Untitled");
  assert.equal(normalizeNoteTitle("x".repeat(600)).length, 500);
  assert.equal(noteExcerpt("a\n\nb"), "a b");
  assert.equal(noteExcerpt("y".repeat(600)).length, 500);
});
