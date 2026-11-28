import assert from "node:assert/strict";
import test from "node:test";
import type { RanganReply } from "@/lib/services/rangan.service";
import { citationMarksValid, cites, flowchartOutcomesSane, writtenIn, writtenInLatin } from "./checks";

const usage = { limit: 25, used: 1, remaining: 24, resetAt: "", asOf: "" };
const answer = (text: string, refs: string[] = []): RanganReply => ({
  answer: text,
  provider: "groq-large",
  usage,
  citations: refs.map((ref, index) => ({ n: index + 1, ref, sourceType: ref.startsWith("http") ? "web" : "note", title: "", heading: "", snippet: "", open: null })),
  support: { checked: true, removed: 0 },
});

test("citations: a mark with no source fails, and the cited page is found", () => {
  assert.equal(citationMarksValid(answer("Header [1] and payload [2].", ["note:fxjwt#b_1"])).ok, false);
  assert.equal(citationMarksValid(answer("Header [1].", ["note:fxjwt#b_1"])).ok, true);
  assert.equal(cites("fxjwt")(answer("x", ["note:fxjwt#b_fxjwt1xxxx"])).ok, true);
  assert.equal(cites("fxtrig")(answer("x", ["note:fxjwt#b_fxjwt1xxxx"])).ok, false);
});

test("language: Bengali, Devanagari and Latin are told apart, technical words allowed", () => {
  assert.equal(writtenIn("bengali")(answer("সালোকসংশ্লেষণ হল আলোর শক্তিকে রাসায়নিক শক্তিতে রূপান্তর, CO2 লাগে")).ok, true);
  assert.equal(writtenIn("bengali")(answer("Photosynthesis turns light into chemical energy.")).ok, false);
  assert.equal(writtenIn("devanagari")(answer("प्रकाश संश्लेषण में ऑक्सीजन पानी से आती है")).ok, true);
  assert.equal(writtenInLatin(answer("JWT verify karne ke liye signature check hota hai")).ok, true);
});

const board = (nodes: Array<[string, string, string]>, edges: Array<[string, string, string]>): RanganReply => ({
  kind: "map",
  provider: "groq-large",
  usage,
  citations: [],
  support: { checked: true, removed: 0 },
  map: {
    draft: { title: "t", centre: "c", image: null, video: null, branches: [], links: [], tips: [] },
    outline: [],
    sources: [],
    images: [],
    reading: [],
    video: null,
    sections: [
      {
        type: "flowchart",
        heading: "h",
        nodes: nodes.map(([id, kind, text]) => ({ id, kind: kind as "start" | "step" | "decision" | "end", text })),
        edges: edges.map(([from, to, label]) => ({ from, to, label })),
      },
    ],
  },
});

test("a failed check that leads to success is caught; 'Expired? no' going on is fine", () => {
  const wrong = board(
    [["a", "decision", "Signature valid?"], ["b", "end", "Access granted"], ["c", "step", "Check expiry"]],
    [["a", "c", "yes"], ["a", "b", "no"]],
  );
  const check = flowchartOutcomesSane(wrong);
  assert.equal(check.ok, false);
  assert.match(check.detail ?? "", /Signature valid\?.*no.*Access granted/);
  const right = board(
    [["a", "decision", "Expired?"], ["b", "end", "Access granted"], ["c", "end", "Reject with 401"]],
    [["a", "b", "no"], ["a", "c", "yes"]],
  );
  assert.equal(flowchartOutcomesSane(right).ok, true);
  const oneWay = board([["a", "decision", "Valid?"], ["b", "end", "Reject"]], [["a", "b", "yes"], ["a", "b", "no"]]);
  assert.equal(flowchartOutcomesSane(oneWay).ok, false);
});
