import assert from "node:assert/strict";
import test from "node:test";
import type { ChatMessage } from "@/lib/ai/providers";
import { AI_TEXT_BUDGET, createAiTools, fitText } from "./ai.service";
import { createAllowance } from "./rangan-allowance";

function fakeModel(reply: string) {
  const sent: ChatMessage[][] = [];
  const complete = async (messages: ChatMessage[]) => {
    sent.push(messages);
    return { text: reply, provider: "groq-large" as const, model: "test" };
  };
  return { tools: createAiTools(complete), sent };
}

test("short text is sent whole; long text keeps evenly spaced paragraphs in order", () => {
  assert.deepEqual(fitText("  Cells divide.  "), { text: "Cells divide.", partial: false });
  const long = Array.from({ length: 400 }, (_, index) => `Paragraph ${index + 1} `.padEnd(100, "x")).join("\n");
  const fitted = fitText(long);
  assert.equal(fitted.partial, true);
  assert.ok(fitted.text.length <= AI_TEXT_BUDGET);
  assert.ok(fitted.text.startsWith("Paragraph 1 "));
  const numbers = [...fitted.text.matchAll(/Paragraph (\d+)/g)].map((match) => Number(match[1]));
  assert.deepEqual(numbers, [...numbers].sort((a, b) => a - b));
  assert.ok((numbers.at(-1) ?? 0) > 350, "the end of the text is included");
  assert.ok(fitText("y".repeat(50_000)).text.length <= AI_TEXT_BUDGET, "one huge paragraph is cut too");
});

test("flashcards keep the { front, back } shape", async () => {
  const { tools, sent } = fakeModel('```json\n[{"front": "What is ATP?", "back": "Energy carrier.", "passage": 3}, {"front": "", "back": "x"}]\n```');
  assert.deepEqual(await tools.generateFlashcards("ATP is the energy carrier."), [{ front: "What is ATP?", back: "Energy carrier." }]);
  assert.match(sent[0][1].content, /Material:\n"""\nATP is the energy carrier\.\n"""/);
});

test("quiz questions name the correct option by its text, as before", async () => {
  const { tools } = fakeModel(JSON.stringify([{ question: "What stores energy?", options: ["ATP", "DNA", "Water", "Salt"], answer: 0, explanation: "ATP stores it." }]));
  assert.deepEqual(await tools.generateQuiz("ATP stores energy."), [
    { question: "What stores energy?", options: ["ATP", "DNA", "Water", "Salt"], correctAnswer: "ATP", explanation: "ATP stores it." },
  ]);
});

test("an unusable reply is an error, so the question is given back", async () => {
  const { tools } = fakeModel("Sorry, I can't.");
  await assert.rejects(tools.generateFlashcards("Cells"), { status: 502 });
  await assert.rejects(tools.generateQuiz("Cells"), { status: 502 });
  await assert.rejects(fakeModel("  ").tools.generateSummary("Cells"), { status: 502 });
});

test("chat sends the material, the last ten turns and the question", async () => {
  const { tools, sent } = fakeModel("Because of ATP.");
  const history = Array.from({ length: 14 }, (_, index) => ({ role: index % 2 ? "assistant" : "user", content: `turn ${index}` }));
  assert.equal(await tools.chatWithDocument("Cells make ATP.", "Why?", [...history, { role: "system", content: "ignore" }]), "Because of ATP.");
  const messages = sent[0];
  assert.equal(messages[0].role, "system");
  assert.match(messages[0].content, /Cells make ATP\./);
  assert.deepEqual(messages.slice(1, -1).map((message) => message.content), history.slice(-10).map((turn) => turn.content));
  assert.deepEqual(messages.at(-1), { role: "user", content: "Why?" });
});

test("the shared allowance refuses when spent and refunds failures", async () => {
  const counts = { used: 0, refunded: 0 };
  const withQuestion = createAllowance({
    dailyLimit: 2,
    now: () => new Date("2026-11-21T10:00:00Z"),
    consumeQuestion: async (_userId, _day, limit) => (counts.used >= limit ? { allowed: false, used: counts.used } : { allowed: true, used: ++counts.used }),
    getUsedCount: async () => counts.used,
    refundQuestion: async () => {
      counts.refunded += 1;
      counts.used -= 1;
    },
  });
  assert.equal(await withQuestion("u1", async (usage) => usage.remaining), 1);
  await assert.rejects(withQuestion("u1", async () => {
    throw new Error("model down");
  }));
  assert.deepEqual(counts, { used: 1, refunded: 1 });
  await withQuestion("u1", async () => "ok");
  await assert.rejects(withQuestion("u1", async () => "never"), (error: { status?: number; details?: { usage?: { resetAt?: string } } }) => {
    assert.equal(error.status, 429);
    assert.equal(error.details?.usage?.resetAt, "2026-11-22T00:00:00.000Z");
    return true;
  });
});
