import assert from "node:assert/strict";
import test from "node:test";
import type { ItemRecord } from "@/types";
import { sanitizeItemInput } from "@/lib/security/sanitize";
import { buildItemUpdatePayload } from "./item-patch";

/** An item as `GET /api/items` returns it: no notes, excerpt cut to 300 chars. */
function listRow(overrides: Partial<ItemRecord> = {}): ItemRecord {
  return {
    id: "item-1",
    userId: "user-1",
    type: "pdf",
    title: "Cell biology",
    url: "https://example.com/cells.pdf",
    excerpt: `${"a".repeat(300)}…`,
    notes: null,
    status: "unread",
    starred: false,
    sourceHost: "example.com",
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
    tags: [{ id: "t1", name: "biology", color: "#f5a623" }],
    ...overrides,
  };
}

test("changing the status of a list row sends only the status", () => {
  const payload = buildItemUpdatePayload(listRow(), { status: "reading" });
  assert.deepEqual(payload, { status: "reading" });
  assert.equal("notes" in payload, false, "notes from a list row must never be sent");
  assert.equal("excerpt" in payload, false, "a shortened list excerpt must never be sent");
});

test("starring, renaming or editing the source URL never sends notes or excerpt", () => {
  for (const changes of [{ starred: true }, { title: "Mitosis" }, { url: "https://example.com/new.pdf" }]) {
    const payload = buildItemUpdatePayload(listRow(), changes);
    assert.deepEqual(payload, changes);
  }
});

test("editing notes sends only the notes", () => {
  const payload = buildItemUpdatePayload(listRow({ notes: "old" }), { notes: "new text" });
  assert.deepEqual(payload, { notes: "new text" });
});

test("a value that did not change is left out, so nothing is sent", () => {
  assert.deepEqual(buildItemUpdatePayload(listRow({ notes: "same" }), { notes: "same", status: "unread" }), {});
});

test("clearing a field sends null instead of falling back to the old value", () => {
  assert.deepEqual(buildItemUpdatePayload(listRow(), { url: null }), { url: null });
});

test("tags are sent as unique names, and only when they changed", () => {
  const tag = (name: string) => ({ id: name, name, color: "#f5a623" });
  assert.deepEqual(buildItemUpdatePayload(listRow(), { tags: [tag("biology"), tag("exam"), tag("exam")] }), {
    tags: ["biology", "exam"],
  });
  assert.deepEqual(buildItemUpdatePayload(listRow(), { tags: [tag("biology")] }), {});
  assert.deepEqual(buildItemUpdatePayload(listRow(), { tags: [] }), { tags: [] });
});

test("server: fields absent from an update stay undefined, so Prisma leaves them unchanged", () => {
  const sanitized = sanitizeItemInput({ status: "done" });
  assert.equal(sanitized.status, "done");
  for (const field of ["title", "url", "excerpt", "notes", "tags"] as const) {
    assert.equal(sanitized[field], undefined, `${field} must stay undefined when absent`);
  }
});
