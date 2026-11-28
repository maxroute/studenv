import assert from "node:assert/strict";
import test from "node:test";
import { citedClaims, parsePartlySupported, parseSupportReply, removeCitations, splitBeyond, splitPartlySupported, splitSentences, supportInstruction, withoutBeyondCitations } from "./trust";

test("sentences keep their citation marks and join back to the answer exactly", () => {
  const answer = "Mitochondria make ATP [1]. The pH is 3.5 here [2].\n- Water is split.[3] Oxygen is released! Plants grow";
  const pieces = splitSentences(answer);
  assert.equal(pieces.join(""), answer);
  assert.deepEqual(pieces.map((piece) => piece.trim()), [
    "Mitochondria make ATP [1].",
    "The pH is 3.5 here [2].",
    "",
    "- Water is split.[3]",
    "Oxygen is released!",
    "Plants grow",
  ]);
});

test("claims are the sentences that cite real passages, without marks or Markdown", () => {
  const answer = "**Mitochondria** make ATP [1][2]. Cells divide.\n- Water is split [3].\n1. Ghosts exist [9].";
  assert.deepEqual(citedClaims(answer, 3), [
    { piece: 0, text: "Mitochondria make ATP.", numbers: [1, 2] },
    { piece: 3, text: "Water is split.", numbers: [3] },
  ]);
});

test("the check instruction lists each claim with what it cites", () => {
  const text = supportInstruction([{ piece: 0, text: "ATP stores energy.", numbers: [1, 2] }]);
  assert.match(text, /Claim 1 \(cites \[1\]\[2\]\): ATP stores energy\./);
});

test("only claims the checker rejects lose their citations; an unreadable reply means unchecked", () => {
  assert.deepEqual([...(parseSupportReply('```json\n[{"claim":1,"supported":true},{"claim":"2","supported":"false"},{"claim":7,"supported":false}]\n```', 3) ?? [])], [1]);
  assert.deepEqual([...(parseSupportReply('[{"claim": 1, "supported": true}]', 3) ?? [])], [], "a skipped claim counts as supported");
  assert.equal(parseSupportReply("I think they are fine.", 3), null);
  assert.equal(parseSupportReply('[{"claim": 9, "supported": false}]', 3), null, "no usable verdicts");
});

test("removing citations touches only the rejected sentences", () => {
  const answer = "ATP stores energy [1]. Cells make 1000 ATP a second [2][3]. Done.";
  assert.equal(removeCitations(answer, new Set([1])), "ATP stores energy [1]. Cells make 1000 ATP a second. Done.");
  assert.equal(removeCitations(answer, new Set()), answer);
});

test("the general-knowledge part is split off at its heading", () => {
  assert.deepEqual(splitBeyond("Your notes say X [1].\n\n### Beyond your sources\nAlso Y."), { sourced: "Your notes say X [1].", beyond: "Also Y." });
  assert.deepEqual(splitBeyond("## **Beyond your sources:**\nOnly general."), { sourced: "", beyond: "Only general." });
  assert.deepEqual(splitBeyond("Nothing beyond here."), { sourced: "Nothing beyond here.", beyond: null });
  assert.equal(splitBeyond("We went beyond your sources here.").beyond, null, "only a heading counts");
  assert.deepEqual(splitBeyond("Cited [1].\n### Beyond your sources – visualizing the OS\nDraw a map [2]."), {
    sourced: "Cited [1].",
    beyond: "Draw a map [2].",
  });
  assert.equal(withoutBeyondCitations("Cited [1].\n### Beyond your sources – visualizing the OS\nDraw a map [2]."), "Cited [1].\n### Beyond your sources – visualizing the OS\nDraw a map.");
  assert.equal(splitBeyond("### Beyond-your-sources trick\nx").beyond, null);
});

test("citations are removed from the general-knowledge part only", () => {
  const answer = "Your notes say X [1].\n\n### Beyond your sources\nStudy in chunks, as your notes suggest [2]. Also Y [3].";
  assert.equal(withoutBeyondCitations(answer), "Your notes say X [1].\n\n### Beyond your sources\nStudy in chunks, as your notes suggest. Also Y.");
  assert.equal(withoutBeyondCitations("No heading [1]."), "No heading [1].");
});

// Seen live: the note says meiosis brings variety through crossing over; the answer added independent assortment.
const MIXED = "- Mitosis makes two identical cells [1].\n- Meiosis creates variation through crossing over and independent assortment [2].\n";

test("the check may answer \"partly\", giving the part the passage says and the rest", () => {
  assert.match(supportInstruction(citedClaims(MIXED, 2)), /"partly", with "stated"/);
});

test("a partly backed sentence is split: the cited part, then the rest with no citation", () => {
  const claims = citedClaims(MIXED, 2);
  const reply = '[{"claim":1,"supported":true},{"claim":2,"supported":"partly","stated":"Meiosis creates variation through crossing over.","added":"Independent assortment also adds variation."}]';
  const partly = parsePartlySupported(reply, claims);
  assert.equal(partly.size, 1);
  assert.equal(
    splitPartlySupported(MIXED, claims, partly),
    "- Mitosis makes two identical cells [1].\n- Meiosis creates variation through crossing over[2]. Independent assortment also adds variation.\n",
  );
  // A "partly" counts as not fully supported, so with no usable rewording the citation still goes.
  assert.deepEqual([...(parseSupportReply(reply, 2) ?? [])], [1]);
});

test("a split keeps a Bengali full stop and a numbered list", () => {
  const answer = "1. মিয়োসিসে ক্রসিং ওভার এবং স্বাধীন বিন্যাসে বৈচিত্র্য আসে[2]।";
  const claims = citedClaims(answer, 2);
  const partly = parsePartlySupported('[{"claim":1,"supported":"partly","stated":"মিয়োসিসে ক্রসিং ওভারে বৈচিত্র্য আসে।","added":"স্বাধীন বিন্যাসও বৈচিত্র্য আনে।"}]', claims);
  assert.equal(splitPartlySupported(answer, claims, partly), "1. মিয়োসিসে ক্রসিং ওভারে বৈচিত্র্য আসে[2]। স্বাধীন বিন্যাসও বৈচিত্র্য আনে।");
});

test("rewordings that say more than the claim, carry marks or are empty aren't used", () => {
  const claims = citedClaims(MIXED, 2);
  const reply = (stated: string, added = "") => `[{"claim":2,"supported":"partly","stated":${JSON.stringify(stated)},"added":${JSON.stringify(added)}}]`;
  assert.equal(parsePartlySupported(reply("x".repeat(200)), claims).size, 0, "longer than the claim");
  assert.equal(parsePartlySupported(reply("Meiosis creates variation [2]."), claims).size, 0, "carries a mark");
  assert.equal(parsePartlySupported(reply(""), claims).size, 0, "empty");
  assert.equal(parsePartlySupported('[{"claim":9,"supported":"partly","stated":"x y z"}]', claims).size, 0, "no such claim");
});
