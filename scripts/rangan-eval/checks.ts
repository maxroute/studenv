// ---------------------------------------------------------------------------
// Rangan quality checks: rules a reply must meet
// ---------------------------------------------------------------------------
//
// Pure: each check reads a reply and says whether it passed and why not. They
// catch what can be decided without judgement (the kind of reply, citations,
// the script it is written in, flowchart outcomes); the grader judges the rest.

import type { RanganReply } from "@/lib/services/rangan.service";

export type CheckResult = { name: string; ok: boolean; detail?: string };
export type Check = (reply: RanganReply) => CheckResult;

/** Every piece of text the student would read in a reply. */
export function replyText(reply: RanganReply): string {
  switch (reply.kind) {
    case undefined:
      return reply.answer;
    case "page":
      return `${reply.title}\n${reply.markdown}`;
    case "edit":
      return [reply.summary, ...reply.changes.map((change) => change.markdown), ...(reply.ops ?? []).map((op) => JSON.stringify(op))].join("\n");
    case "map": {
      const { draft, sections = [] } = reply.map;
      return [
        draft.title,
        draft.centre,
        ...draft.branches.flatMap((branch) => [branch.title, branch.note, ...branch.children.map((child) => `${child.title} ${child.note}`)]),
        ...draft.tips,
        ...sections.map((section) => JSON.stringify(section)),
      ].join("\n");
    }
    case "board-edit":
      return [reply.summary, ...reply.changes.map((change) => JSON.stringify(change)), ...(reply.ops ?? []).map((op) => JSON.stringify(op))].join("\n");
    case "task":
      return reply.tasks.map((task) => `${task.title} ${task.day} ${task.time ?? ""}`).join("\n");
  }
}

export const kindIs = (kind: RanganReply["kind"] | "answer"): Check => (reply) => {
  const actual = reply.kind ?? "answer";
  return { name: `reply is ${kind}`, ok: actual === kind, detail: actual === kind ? undefined : `got ${actual}` };
};

/** The reply cites a passage from this sample page. */
export const cites = (pageId: string): Check => (reply) => {
  const ok = reply.citations.some((citation) => citation.ref.startsWith(`note:${pageId}`));
  return { name: `cites ${pageId}`, ok, detail: ok ? undefined : `cited ${reply.citations.map((c) => c.ref.split("#")[0]).join(", ") || "nothing"}` };
};

/** The reply cites something from outside the library (Wikipedia). */
export const citesWeb: Check = (reply) => {
  const ok = reply.citations.some((citation) => citation.sourceType === "web");
  return { name: "cites the web", ok, detail: ok ? undefined : "no web source cited" };
};

/** Every [n] mark in the text points at a citation the reply carries. */
export const citationMarksValid: Check = (reply) => {
  const marks = [...replyText(reply).matchAll(/\[(\d{1,2})\]/g)].map((match) => Number(match[1]));
  const bad = marks.filter((n) => n < 1 || n > reply.citations.length);
  return { name: "citation marks match sources", ok: bad.length === 0, detail: bad.length ? `marks with no source: ${[...new Set(bad)].join(", ")}` : undefined };
};

const SCRIPTS = { bengali: /[ঀ-৿]/gu, devanagari: /[ऀ-ॿ]/gu } as const;

/**
 * Written in this script: at least `share` of its letters. Technical terms in
 * Latin letters (JWT, CO2) are normal, so the bar is a share, not all.
 */
export const writtenIn = (script: keyof typeof SCRIPTS, share = 0.5): Check => (reply) => {
  const text = replyText(reply).replace(/\[[^\]]*\]\([^)]*\)/g, "");
  const letters = (text.match(/\p{L}/gu) ?? []).length;
  const inScript = (text.match(SCRIPTS[script]) ?? []).length;
  const ratio = letters ? inScript / letters : 0;
  return { name: `written in ${script}`, ok: ratio >= share, detail: `${Math.round(ratio * 100)}% of letters` };
};

/** Mostly Latin letters (an English or romanised reply). */
export const writtenInLatin: Check = (reply) => {
  const text = replyText(reply);
  const letters = (text.match(/\p{L}/gu) ?? []).length;
  const latin = (text.match(/[A-Za-z]/g) ?? []).length;
  const ratio = letters ? latin / letters : 0;
  return { name: "written in Latin letters", ok: ratio >= 0.8, detail: `${Math.round(ratio * 100)}% of letters` };
};

export const includes = (pattern: RegExp, what: string): Check => (reply) => ({ name: `says ${what}`, ok: pattern.test(replyText(reply)) });
export const excludes = (pattern: RegExp, what: string): Check => (reply) => ({ name: `doesn't say ${what}`, ok: !pattern.test(replyText(reply)) });

/** A page reply has a few sections. */
export const hasHeadings = (min: number): Check => (reply) => {
  const count = reply.kind === "page" ? (reply.markdown.match(/^#{2,3} /gm) ?? []).length : 0;
  return { name: `page has ${min}+ headings`, ok: count >= min, detail: `${count} headings` };
};

/** The board has a diagram of this type. */
export const hasSection = (type: string): Check => (reply) => {
  const types: string[] = reply.kind === "map" ? (reply.map.sections ?? []).map((section) => section.type) : [];
  return { name: `board has a ${type}`, ok: types.includes(type), detail: `sections: ${types.join(", ") || "none"}` };
};

const SUCCESS = /grant|allow|success|approve|accept|signed in|logged in|run the handler|continue|proceed|done/i;
const FAILURE_EDGE = /^(no|false|invalid|fail(ed)?|wrong)$/i;

/**
 * A flowchart never sends a failed check to a success: an edge labelled "no"
 * out of a decision whose question is about validity must not end at a node
 * that reads like success. Decisions also need two different outcomes.
 */
export const flowchartOutcomesSane: Check = (reply) => {
  if (reply.kind !== "map") return { name: "flowchart outcomes make sense", ok: true, detail: "no board" };
  const flow = (reply.map.sections ?? []).find((section) => section.type === "flowchart");
  if (!flow || flow.type !== "flowchart") return { name: "flowchart outcomes make sense", ok: true, detail: "no flowchart" };
  const text = new Map(flow.nodes.map((node) => [node.id, node]));
  const problems: string[] = [];
  for (const node of flow.nodes.filter((candidate) => candidate.kind === "decision")) {
    const out = flow.edges.filter((edge) => edge.from === node.id);
    if (new Set(out.map((edge) => edge.to)).size < 2) problems.push(`"${node.text}" has one outcome`);
    for (const edge of out) {
      const target = text.get(edge.to);
      // "Expired?" is asked the other way round: its "no" is the good path.
      const askedNegatively = /expired|revoked|blocked|banned|locked|missing|empty|error/i.test(node.text);
      if (target && FAILURE_EDGE.test(edge.label) && !askedNegatively && target.kind === "end" && SUCCESS.test(target.text)) {
        problems.push(`"${node.text}" → ${edge.label} → "${target.text}"`);
      }
    }
  }
  return { name: "flowchart outcomes make sense", ok: problems.length === 0, detail: problems.join("; ") || undefined };
};
