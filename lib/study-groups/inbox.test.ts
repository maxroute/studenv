import assert from "node:assert/strict";
import test from "node:test";
import { inboxPreview, readUpTo, sortByActivity, totalUnread, unreadLabel, type GroupInboxEntry } from "./inbox";

const message = (createdAt: string, content: string | null = "hi") => ({ id: createdAt, content, authorId: "u2", authorName: "Mira", createdAt, attachmentCount: 0, attachmentName: null });
const entry = (groupId: string, unreadCount: number, at: string | null): GroupInboxEntry => ({ groupId, unreadCount, lastMessage: at ? message(at) : null });

test("badges add up and long counts are cut short", () => {
  assert.equal(totalUnread([entry("a", 2, null), entry("b", 5, null)]), 7);
  assert.equal(unreadLabel(99), "99");
  assert.equal(unreadLabel(100), "99+");
});

test("the list shows the text, or what was shared", () => {
  assert.equal(inboxPreview(message("2026-01-01", "see page 4")), "see page 4");
  assert.equal(inboxPreview({ ...message("2026-01-01", null), attachmentCount: 1, attachmentName: "notes.pdf" }), "notes.pdf");
  assert.equal(inboxPreview({ ...message("2026-01-01", null), attachmentCount: 3 }), "Shared 3 files");
});

test("the group with the newest message comes first", () => {
  const groups = [{ id: "a", updatedAt: "2026-01-03T00:00:00Z" }, { id: "b", updatedAt: "2026-01-01T00:00:00Z" }];
  const inbox = new Map([["b", entry("b", 1, "2026-01-05T00:00:00Z")]]);
  assert.deepEqual(sortByActivity(groups, inbox).map((group) => group.id), ["b", "a"]);
});

test("a read is never recorded in the future, and junk is refused", () => {
  const now = new Date("2026-11-28T12:00:00Z");
  assert.equal(readUpTo("2026-11-28T11:00:00.000Z", now)?.toISOString(), "2026-11-28T11:00:00.000Z");
  assert.equal(readUpTo("2030-01-01T00:00:00.000Z", now), now);
  assert.equal(readUpTo("yesterday", now), null);
  assert.equal(readUpTo(5, now), null);
});
