import assert from "node:assert/strict";
import test from "node:test";
import { smallTalk, smallTalkReply } from "./small-talk";

test("greetings, thanks and questions about Rangan are small talk", () => {
  for (const [message, kind] of [
    ["hello", "greeting"],
    ["hello!", "greeting"],
    ["Hey Rangan", "greeting"],
    ["good morning rangan", "greeting"],
    ["Namaste", "greeting"],
    ["thanks!", "thanks"],
    ["thank you so much", "thanks"],
    ["what is your name?", "identity"],
    ["Who are you", "identity"],
    ["how are you doing?", "wellbeing"],
    ["bye", "goodbye"],
    ["ok", "ack"],
  ] as const) {
    assert.equal(smallTalk(message), kind, message);
  }
});

test("anything that asks about a topic or asks for something is not small talk", () => {
  for (const message of [
    "hello, what is a binary tree?",
    "hi can you make a page on graphs",
    "thanks, now plan my week",
    "what is authentication",
    "good morning, remind me to revise at 6",
    "how are trees balanced",
    "",
  ]) {
    assert.equal(smallTalk(message), null, message);
  }
});

test("each kind gets a fitting reply", () => {
  assert.match(smallTalkReply("greeting", "hello"), /I'm Rangan/);
  assert.match(smallTalkReply("identity", "what is your name"), /librarian and learning companion/);
  assert.match(smallTalkReply("greeting", "good night"), /Bye for now/);
});
