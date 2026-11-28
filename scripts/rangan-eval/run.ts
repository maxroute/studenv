// ---------------------------------------------------------------------------
// Rangan quality checks: run them
// ---------------------------------------------------------------------------
//
//   npx tsx --env-file=.env.local scripts/rangan-eval/run.ts [options]
//
//   --only=id,id     run just these cases
//   --area=board     run one area (answer, page, board, edit, task, safety)
//   --grade          also have the big model grade each reply (1 to 5)
//   --media          let boards search YouTube (spends the shared daily quota)
//   --out=dir        where to write results.json (default: no file)
//   --pause=ms       wait between cases, to stay within free rate limits (default 4000)
//   --chain=id,id    answer with only these models, in order (groq-large, groq-small,
//                    cloudflare); the default is the app's own chain with fallbacks
//
// Testing keys: EVAL_GROQ_API_KEY, EVAL_CLOUDFLARE_ACCOUNT_ID and
// EVAL_CLOUDFLARE_API_TOKEN in .env.local, when set, are used instead of the
// app's own, so test runs don't spend the free limits the app needs.
//
// Rangan runs as in the app (same prompts, models and Wikipedia), but with
// the sample library in memory and questions counted in memory: nothing is
// read from or written to the database.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { complete, completeQuick, completeWithFallback, PROVIDER_CHAIN, type ChatMessage, type CompletionOptions } from "@/lib/ai/providers";
import { createRanganService, type RanganReply } from "@/lib/services/rangan.service";
import { linkExists } from "@/lib/web/link-check";
import { findCommonsImage } from "@/lib/web/wikimedia-images";
import { searchWikipedia, wikiLanguage } from "@/lib/web/wikipedia";
import { findYouTubeVideo } from "@/lib/web/youtube-search";
import { CASES, type EvalCase } from "./cases";
import { replyText, type CheckResult } from "./checks";
import { loadSource, searchLibrary } from "./library";

// Before anything calls a model: the providers read these at call time.
for (const name of ["GROQ_API_KEY", "CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_API_TOKEN"] as const) {
  const testing = process.env[`EVAL_${name}`];
  if (testing) process.env[name] = testing;
}
const usingTestKeys = ["GROQ_API_KEY", "CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_API_TOKEN"].filter((name) => process.env[`EVAL_${name}`]);

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, value = "true"] = arg.replace(/^--/, "").split("=");
    return [key, value] as const;
  }),
);
const only = args.get("only")?.split(",");
const area = args.get("area");
const grade = args.has("grade");
const media = args.has("media");
const pause = Number(args.get("pause") ?? 4_000);

/** One model or a few, without the app's fallbacks: to see how each one does on its own. */
const chain = args.get("chain")?.split(",");
const chosen = chain ? PROVIDER_CHAIN.filter((spec) => chain.includes(spec.id)) : null;
if (chain && chosen?.length !== chain.length) throw new Error(`Unknown model in --chain; use ${PROVIDER_CHAIN.map((spec) => spec.id).join(", ")}`);
const env = { GROQ_API_KEY: process.env.GROQ_API_KEY, CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN: process.env.CLOUDFLARE_API_TOKEN };
const onChain = (messages: ChatMessage[], options?: CompletionOptions) =>
  completeWithFallback(messages, options ?? {}, { fetch, env, now: Date.now, cooldowns: new Map() }, chosen ?? PROVIDER_CHAIN);

/** The models each case's calls landed on, in order: the free tier's limits push some down the chain. */
const calls: string[] = [];
const traced = <T extends (...args: never[]) => Promise<{ provider: string }>>(call: T) =>
  (async (...args: Parameters<T>) => {
    try {
      const result = await call(...args);
      calls.push(result.provider);
      return result;
    } catch (problem) {
      calls.push("failed");
      throw problem;
    }
  }) as T;

const rangan = createRanganService({
  dailyLimit: 10_000,
  now: () => new Date(),
  getUsedCount: async () => 0,
  consumeQuestion: async () => ({ allowed: true, used: 1 }),
  refundQuestion: async () => undefined,
  complete: traced(chosen ? onChain : complete),
  completeQuick: traced(chosen ? onChain : completeQuick),
  searchLibrary: (_user, query, limit) => searchLibrary(query, limit),
  loadSource: (_user, type, id) => loadSource(type, id),
  recentNoteIds: async () => ["fxjwt", "fxphoto", "fxtrig", "fxcell"],
  linkExists: (href) => linkExists(href),
  findImage: (query) => findCommonsImage(query),
  findVideo: media ? (query, subject) => findYouTubeVideo(query, subject, { apiKey: process.env.YOUTUBE_API_KEY, language: wikiLanguage(subject) }) : undefined,
  ownsBoard: async (_user, boardId) => boardId === "fxboard",
  findBoardCard: async () => null,
  searchWeb: async (query) =>
    (await searchWikipedia(query, { limit: 2 })).map((article) => ({
      ref: article.url,
      sourceType: "web",
      title: article.title,
      heading: "Wikipedia",
      snippet: article.extract.slice(0, 220),
      content: article.extract,
      open: { kind: "web" as const, url: article.url },
    })),
});

const GRADER = [
  "You grade replies from Rangan, a study assistant for school and college students.",
  "Judge only what is asked: is it correct, does it answer the request, is it clear for a student, is it in the language the student used?",
  "Before judging, solve every question, example and answer in the reply yourself and check every fact and formula: one wrong answer a student would learn caps the score at 2.",
  'Reply with only JSON: {"score": 1-5, "problems": ["short problem", ...]}. 5 = correct and excellent; 3 = usable with flaws; 1 = wrong or useless.',
].join("\n");

async function gradeReply(test: EvalCase, text: string): Promise<{ score: number | null; problems: string[]; model: string | null }> {
  try {
    const result = await complete(
      [
        { role: "system", content: GRADER },
        { role: "user", content: `Student's request: """${test.input.question}"""\nA good reply: ${test.expect}\n\nRangan's reply:\n"""${text.slice(0, 6_000)}"""` },
      ],
      { maxTokens: 4_000, temperature: 0, reasoning: "medium", timeoutMs: 45_000 },
    );
    const json = JSON.parse(result.text.slice(result.text.indexOf("{"), result.text.lastIndexOf("}") + 1));
    const score = Number(json.score);
    return { score: score >= 1 && score <= 5 ? score : null, problems: Array.isArray(json.problems) ? json.problems.map(String).slice(0, 5) : [], model: result.model };
  } catch {
    return { score: null, problems: ["grader failed"], model: null };
  }
}

type Outcome = {
  id: string;
  area: string;
  language: string;
  ms: number;
  provider: string | null;
  /** Corrections the page check applied; -1 when it couldn't run. */
  pageFixes?: number;
  /** Citations the support check took off because their passage didn't back the sentence. */
  removedCitations: number;
  checks: CheckResult[];
  passed: boolean;
  error?: string;
  grade?: Awaited<ReturnType<typeof gradeReply>>;
  text?: string;
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  console.log(usingTestKeys.length ? `using testing keys: ${usingTestKeys.join(", ")}` : "using the app's keys (set EVAL_GROQ_API_KEY in .env.local to keep tests off them)");
  const cases = CASES.filter((test) => (!only || only.includes(test.id)) && (!area || test.area === area));
  if (!process.env.GROQ_API_KEY && !process.env.CLOUDFLARE_API_TOKEN) throw new Error("No AI keys: run with --env-file=.env.local");
  const outcomes: Outcome[] = [];
  for (const [index, test] of cases.entries()) {
    if (index) await wait(pause);
    const started = Date.now();
    let reply: RanganReply | null = null;
    calls.length = 0;
    const factCheck = (value: RanganReply | null) => (value?.kind === "page" ? value.factCheck : undefined);
    let error: string | undefined;
    try {
      reply = await rangan.ask("eval-user", test.input);
    } catch (problem) {
      error = problem instanceof Error ? problem.message : String(problem);
    }
    const ms = Date.now() - started;
    const checks = reply ? test.checks.map((check) => check(reply as RanganReply)) : [{ name: "replied", ok: false, detail: error }];
    const text = reply ? replyText(reply) : "";
    const checkedPage = factCheck(reply);
    const outcome: Outcome = { pageFixes: checkedPage ? (checkedPage.checked ? checkedPage.fixed : -1) : undefined, id: test.id, area: test.area, language: test.language, ms, provider: reply?.provider ?? null, removedCitations: reply?.support.removed ?? 0, checks, passed: checks.every((check) => check.ok), error, text };
    if (grade && reply) outcome.grade = await gradeReply(test, text);
    outcomes.push(outcome);
    const failed = checks.filter((check) => !check.ok).map((check) => `${check.name}${check.detail ? ` (${check.detail})` : ""}`);
    console.log(
      `${outcome.passed ? "PASS" : "FAIL"}  ${test.id.padEnd(24)} ${test.language.padEnd(8)} ${String(Math.round(ms / 100) / 10).padStart(5)}s  ${(outcome.provider ?? "-").padEnd(10)}` +
        `${outcome.pageFixes !== undefined ? `  (page check: ${outcome.pageFixes < 0 ? "didn't run" : `${outcome.pageFixes} fix${outcome.pageFixes === 1 ? "" : "es"}`})` : ""}` +
        `${outcome.removedCitations ? `  (check removed ${outcome.removedCitations} citation${outcome.removedCitations === 1 ? "" : "s"})` : ""}` +
        `  [${calls.join(" → ")}]` +
        `${outcome.grade ? `  grade ${outcome.grade.score ?? "?"}` : ""}${failed.length ? `\n      ✗ ${failed.join("\n      ✗ ")}` : ""}` +
        `${outcome.grade?.problems.length ? `\n      · ${outcome.grade.problems.join("\n      · ")}` : ""}`,
    );
  }
  const passed = outcomes.filter((outcome) => outcome.passed).length;
  const graded = outcomes.flatMap((outcome) => (outcome.grade?.score ? [outcome.grade.score] : []));
  const byLanguage = [...new Set(outcomes.map((outcome) => outcome.language))].map((language) => {
    const group = outcomes.filter((outcome) => outcome.language === language);
    return `${language} ${group.filter((outcome) => outcome.passed).length}/${group.length}`;
  });
  console.log(`\n${passed}/${outcomes.length} passed all rules · ${byLanguage.join(" · ")}${graded.length ? ` · average grade ${(graded.reduce((a, b) => a + b, 0) / graded.length).toFixed(2)}` : ""}`);
  console.log(`models used: ${[...new Set(outcomes.map((outcome) => outcome.provider ?? "none"))].join(", ")}`);
  const out = args.get("out");
  if (out) {
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, "results.json"), JSON.stringify({ at: new Date().toISOString(), outcomes }, null, 2));
    console.log(`wrote ${join(out, "results.json")}`);
  }
}

main().catch((problem) => {
  console.error(problem instanceof Error ? problem.message : problem);
  process.exit(1);
});
