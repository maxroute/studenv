import { test } from "node:test";
import assert from "node:assert/strict";
import type { RanganTurn } from "@/hooks/use-rangan-store";
import { conversationHistory } from "./history";

const usage = { limit: 25, used: 1, remaining: 24, resetsAt: "2026-11-28T00:00:00.000Z" };
const base = { provider: "groq-large" as const, usage, citations: [], support: { checked: true, removed: 0 } };

const turns = [
  { id: "1", role: "user", content: "Explain the fs module in Node.js" },
  { id: "2", role: "assistant", content: "The fs module reads and writes files.", citations: [] },
  { id: "3", role: "user", content: "make a note on what you just said" },
  { id: "4", role: "page", noteId: null, draft: { ...base, kind: "page", title: "Node.js fs module", markdown: "# x", outline: ["Reading files", "Writing files"] } },
  { id: "5", role: "error", content: "Rangan is busy.", retry: null },
  { id: "6", role: "user", content: "Create the board", quote: "readFile" },
  { id: "7", role: "map", boardId: "w1", map: { draft: { title: "fs map" }, outline: ["Reading (uses)", "  readFile", "Writing (uses)"], sources: [], images: [], reading: [], video: null } },
] as unknown as RanganTurn[];

test("what Rangan made is told in words, and errors are left out", () => {
  const history = conversationHistory(turns, 10, 4_000);
  assert.deepEqual(history.map((turn) => turn.role), ["user", "assistant", "user", "assistant", "user", "assistant"]);
  assert.equal(history[3].content, 'I wrote a new page, "Node.js fs module". Not created yet. Its sections: Reading files; Writing files.');
  assert.equal(history[4].content, 'About this selected text: "readFile"\nCreate the board');
  assert.equal(history[5].content, 'I drafted a board (mind map), "fs map". The student created the board. Branches: Reading (uses); Writing (uses).');
});

test("only the newest turns are sent, each cut to size", () => {
  const history = conversationHistory(turns, 2, 20);
  assert.equal(history.length, 2);
  assert.ok(history.every((turn) => turn.content.length <= 20));
  assert.equal(history[0].role, "user");
});
