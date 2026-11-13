import assert from "node:assert/strict";
import test from "node:test";
import { createItemSchema, updateItemSchema } from "@/lib/models/item.model";
import { sanitizeItemInput } from "./sanitize";

/** What `PUT /api/items/[id]` stores: body validation, then the service's sanitising. */
function savedNotes(notes: string) {
  return sanitizeItemInput(updateItemSchema.parse({ notes })).notes;
}

test("notes keep text between < and >", () => {
  assert.equal(savedNotes("v < c and E > 0"), "v < c and E > 0");
});

test("notes that look like markup are stored verbatim (they are only rendered as React text)", () => {
  const notes = "Use <b>bold</b> for keys\nif a<b and b>c then a<c";
  assert.equal(savedNotes(notes), notes);
});

test("creating a note item keeps < and > in its notes", () => {
  const input = createItemSchema.parse({ type: "note", title: "Physics", notes: "v < c and E > 0" });
  assert.equal(sanitizeItemInput(input).notes, "v < c and E > 0");
});

test("notes are still trimmed, cleared to null when empty, and length-limited", () => {
  assert.equal(savedNotes("  spaced  "), "spaced");
  assert.equal(savedNotes(""), null);
  assert.equal(updateItemSchema.safeParse({ notes: "x".repeat(50_001) }).success, false);
});
