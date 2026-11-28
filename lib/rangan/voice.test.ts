import assert from "node:assert/strict";
import test from "node:test";
import { audioType, cleanTranscript, createSpeechEndDetector, speakable, spokenDue, voiceReply } from "./voice";

test("only recordings browsers make are taken, whatever their codec", () => {
  assert.equal(audioType("audio/webm;codecs=opus"), "audio/webm");
  assert.equal(audioType("audio/mp4"), "audio/mp4");
  assert.equal(audioType("AUDIO/OGG; codecs=opus"), "audio/ogg");
  assert.equal(audioType("video/webm"), null);
  assert.equal(audioType("application/octet-stream"), null);
});

test("a transcript of silence is empty; speech is tidied", () => {
  assert.equal(cleanTranscript("  Thank you. "), "");
  assert.equal(cleanTranscript("[BLANK_AUDIO]"), "");
  assert.equal(cleanTranscript(" make a task to solve   5 problems "), "make a task to solve 5 problems");
  assert.equal(cleanTranscript("x".repeat(3_000)).length, 2_000);
});

test("short spoken replies are heard as yes, no or stop; anything else is a new request", () => {
  for (const text of ["Yes.", "yeah, add it", "Sure!", "do it", "haan", "theek hai", "OK"]) assert.equal(voiceReply(text), "yes", text);
  for (const text of ["No.", "not now", "cancel", "nahi", "don't"]) assert.equal(voiceReply(text), "no", text);
  for (const text of ["Stop.", "that's all", "bas"]) assert.equal(voiceReply(text), "stop", text);
  assert.equal(voiceReply("yes and also make a page on graphs please"), null, "a longer message is a request");
  assert.equal(voiceReply("what is a heap"), null);
  assert.equal(voiceReply("nobody knows"), null, "'no' must be a whole word");
  assert.equal(voiceReply(""), null);
});

test("answers are read without Markdown or citation marks, and long ones are cut at a sentence", () => {
  assert.equal(speakable("## Heaps\n\nA **heap** is a tree [1]. See [the docs](https://x.y).\n\n- fast\n- simple"), "Heaps A heap is a tree. See the docs. fast simple");
  const long = `${"This is a sentence. ".repeat(60)}`;
  const spoken = speakable(long, 200);
  assert.ok(spoken.length < 240);
  assert.ok(spoken.endsWith("The rest is on screen."));
  assert.doesNotMatch(speakable("```js\nlet x = 1;\n```\nDone."), /let x/);
});

test("a task's due time is said the way people say it", () => {
  assert.equal(spokenDue("2026-11-21", "23:59", "2026-11-21", "en-US"), "today by 11:59 PM");
  assert.equal(spokenDue("2026-11-22", "18:00", "2026-11-21", "en-US"), "tomorrow by 6:00 PM");
  assert.equal(spokenDue("2026-11-25", null, "2026-11-21", "en-US"), "on Wednesday, November 25");
});

test("a turn ends after speech and a pause, or gives up when nobody speaks", () => {
  const detector = createSpeechEndDetector({ endAfterMs: 1_000, noSpeechMs: 5_000, maxMs: 20_000 });
  assert.equal(detector.sample(0.001, 0), "listening");
  assert.equal(detector.sample(0.2, 500), "listening", "speaking");
  assert.equal(detector.sample(0.001, 1_200), "listening", "a short pause in speech");
  assert.equal(detector.sample(0.3, 1_400), "listening");
  assert.equal(detector.sample(0.001, 2_500), "done", "a full pause after speech ends the turn");

  const quiet = createSpeechEndDetector({ noSpeechMs: 5_000 });
  assert.equal(quiet.sample(0, 0), "listening");
  assert.equal(quiet.sample(0, 5_000), "nothing");

  const long = createSpeechEndDetector({ endAfterMs: 1_000, maxMs: 3_000 });
  long.sample(0.5, 0);
  assert.equal(long.sample(0.5, 3_000), "done", "the longest recording stops on its own");
});

test("a request ending in 'stop' is sent without it, and voice mode then ends", async () => {
  const { withoutTrailingStop } = await import("./voice");
  assert.deepEqual(withoutTrailingStop("please create a note on mathematics, trigonometry chapter. Stop."), { text: "please create a note on mathematics, trigonometry chapter", stop: true });
  assert.deepEqual(withoutTrailingStop("Write a paragraph on Studenv. Stop."), { text: "Write a paragraph on Studenv", stop: true });
  assert.deepEqual(withoutTrailingStop("explain how a bus stop works"), { text: "explain how a bus stop works", stop: false });
  assert.deepEqual(withoutTrailingStop("stop"), { text: "stop", stop: false }, "'stop' alone is handled as a reply, not a request");
});

test("the expected-words list is never taken for something said", async () => {
  const { VOICE_VOCABULARY } = await import("./voice");
  assert.equal(cleanTranscript(VOICE_VOCABULARY), "");
  assert.equal(cleanTranscript("Studenv, Rangan."), "");
  assert.equal(cleanTranscript("Explain the fs module"), "Explain the fs module");
});

test("Talk listens in the chosen language; in Auto the server decides each turn", async () => {
  const { judgedLanguage, transcriptChoice, listeningLanguage, scriptLanguage, speechLanguage, voiceHint, isTalkLanguage, VOICE_VOCABULARY: english } = await import("./voice");
  assert.equal(scriptLanguage("সালোকসংশ্লেষণ কী? CO2"), "bn");
  assert.equal(scriptLanguage("प्रकाश संश्लेषण क्या है"), "hi");
  assert.equal(scriptLanguage("bhai JWT kya hai"), null);
  assert.equal(listeningLanguage("bn"), "bn");
  assert.equal(listeningLanguage("auto"), null, "no lock-in from earlier turns: one misheard turn mustn't force the rest");
  assert.equal(judgedLanguage("B"), "bn");
  assert.equal(judgedLanguage(" A\n"), "hi");
  assert.equal(judgedLanguage("The answer is B."), "bn");
  assert.equal(judgedLanguage("not sure"), null);
  assert.equal(transcriptChoice("झाल", "ঝাল"), "A: झाल\nB: ঝাল");
  assert.equal(voiceHint("en"), english);
  assert.match(voiceHint("bn"), /[ঀ-৿]/u);
  assert.ok(!voiceHint("bn").includes("LeetCode"), "no English list with Bengali speech");
  assert.equal(speechLanguage("এটি মাইটোসিস", "en-US"), "bn-IN");
  assert.equal(speechLanguage("Hello", "en-US"), "en-US");
  assert.ok(isTalkLanguage("hi") && !isTalkLanguage("fr"));
});
