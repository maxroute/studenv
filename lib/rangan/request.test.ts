import assert from "node:assert/strict";
import test from "node:test";
import { QUICK_CHAIN } from "@/lib/ai/providers";
import { aboutSubject, countMentioned, mainScript, mentionsAny, parseReading, readingInstruction } from "./request";

test("the reading instruction carries the message and, for follow-ups, the previous question", () => {
  const text = readingInstruction("which one makes gametes?", "What is meiosis?");
  assert.match(text, /Message: """which one makes gametes\?"""/);
  assert.match(text, /conversation just before.*"""What is meiosis\?"""/);
  assert.doesNotMatch(readingInstruction("Hi"), /conversation just before/);
});

test("a reading gives the subject, a clean search, its names and terms, and actions", () => {
  const reply = 'Here:\n{"subject": "Operating systems", "search": "operating system kernel", "names": ["operating system", "OS", "OS", 7, "x"], "terms": ["kernel", "process", "scheduler"], "actions": ["page", "board", "dance"]}';
  assert.deepEqual(parseReading(reply), {
    subject: "Operating systems",
    search: "operating system kernel",
    names: ["Operating systems", "operating system", "OS"],
    terms: ["kernel", "process", "scheduler"],
    actions: ["page", "board"],
    chat: false,
  });
});

test("a message without a subject keeps every passage; an unreadable reply means no reading", () => {
  assert.deepEqual(parseReading('{"subject": null, "search": "what I know so far", "names": ["notes"], "terms": ["x", "y"], "actions": []}'), {
    subject: null,
    search: "what I know so far",
    names: [],
    terms: [],
    actions: [],
    chat: false,
  });
  assert.equal(parseReading("I think it is about OS."), null);
  assert.equal(parseReading('{"subject": null, "search": ""}'), null);
});

test("keywords match whole words and phrases only, in any script", () => {
  assert.equal(mentionsAny("The OS schedules processes.", ["OS"]), true);
  assert.equal(mentionsAny("Most people revise at night.", ["OS"]), false, "'os' inside 'Most' is not a match");
  assert.equal(mentionsAny("An operating  system manages memory.", ["operating system"]), false, "phrases match as written");
  assert.equal(mentionsAny("Operating System basics", ["operating system"]), true);
  assert.equal(mentionsAny("সালোকসংশ্লেষণ হলো আলো থেকে খাদ্য তৈরি।", ["সালোকসংশ্লেষণ"]), true);
  assert.equal(mentionsAny("Use a C++ compiler", ["C++"]), true, "symbols in keywords are matched literally");
  assert.equal(mentionsAny("Operating Systems lecture", ["operating system"]), true, "plurals count");
  assert.equal(mentionsAny("The kernel's job", ["kernel"]), true, "possessives count");
  assert.equal(mentionsAny("Kernelized methods", ["kernel"]), false);
});

test("only passages that name the subject or use two of its terms are kept", () => {
  const passage = (title: string, content: string) => ({ title, heading: "", content });
  const passages = [
    passage("Word Power Made Easy", "A note on time schedules: the process of learning and revision every day."),
    passage("Launch checklist", "Document the release process."),
    passage("CS notes", "The kernel's scheduler picks the next process."),
    passage("Operating Systems lecture", "Introduction."),
    passage("Lab", "We patched the kernel."),
  ];
  const subject = { names: ["operating system", "OS"], terms: ["kernel", "process", "scheduler", "memory management"] };
  assert.deepEqual(aboutSubject(passages, subject).map((p) => p.title), ["CS notes", "Operating Systems lecture"]);
  assert.equal(aboutSubject(passages, null).length, 5, "no subject, no filter");
  assert.equal(countMentioned("The kernel's scheduler picks the next process.", subject.terms), 3);
});

test("the quick chain skips the big model", () => {
  assert.deepEqual(QUICK_CHAIN.map((spec) => spec.id), ["groq-small", "cloudflare"]);
});

test("small talk is read as chat, with no subject to search", () => {
  assert.deepEqual(parseReading('{"subject": "Hello", "search": "hello", "names": ["hello"], "terms": ["greeting"], "actions": [], "chat": true}'), {
    subject: null,
    search: "hello",
    names: [],
    terms: [],
    actions: [],
    chat: true,
  });
  assert.equal(parseReading('{"subject": null, "search": "", "actions": [], "chat": true}')?.chat, true, "chat needs no search");
  assert.equal(parseReading('{"subject": "graphs", "search": "graphs", "actions": ["page"], "chat": true}')?.chat, false, "asking for something is not chat");
});

test("notes in another language are kept when meaning search found them", () => {
  const subject = { names: ["mitosis"], terms: ["prophase", "chromosome"] };
  const bengali = { title: "কোষ বিভাজন", heading: "মাইটোসিস", content: "মাইটোসিসে একটি কোষ থেকে দুটি একই রকম কোষ তৈরি হয়।" };
  // Found by meaning: kept, though it can't say "mitosis" in English.
  assert.equal(aboutSubject([{ ...bengali, matchedBy: ["meaning"] }], subject).length, 1);
  // Found by keyword only, or in the same script without naming the subject: still left out.
  assert.equal(aboutSubject([{ ...bengali, matchedBy: ["keyword"] }], subject).length, 0);
  assert.equal(aboutSubject([{ title: "Vocabulary", heading: "", content: "A process is a series of actions.", matchedBy: ["meaning"] }], subject).length, 0);
  assert.equal(mainScript("Photosynthesis needs CO2"), "Latin");
  assert.equal(mainScript("সালোকসংশ্লেষণ CO2"), "Bengali");
  assert.equal(mainScript("प्रकाश संश्लेषण"), "Devanagari");
});
