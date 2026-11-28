import assert from "node:assert/strict";
import test from "node:test";
import {
  AiUnavailableError,
  completeWithFallback,
  parseRetryAfter,
  type FallbackDeps,
  type ProviderEnv,
  type ProviderId,
} from "./providers";

const ALL_KEYS: ProviderEnv = {
  GROQ_API_KEY: "test-groq",
  CLOUDFLARE_ACCOUNT_ID: "acct",
  CLOUDFLARE_API_TOKEN: "test-cf",
};

type Reply = { status: number; body?: unknown; headers?: Record<string, string> } | "throw" | "abort";

function ok(text: string): Reply {
  return { status: 200, body: { choices: [{ message: { role: "assistant", content: text } }] } };
}

/** Answers each model with a scripted reply and records which models were called. */
function fakeDeps(replies: Partial<Record<string, Reply>>, env: ProviderEnv = ALL_KEYS, nowMs = 1_000_000) {
  const calls: Array<{ url: string; model: string; auth: string | null }> = [];
  const clock = { now: nowMs };
  const deps: FallbackDeps = {
    env,
    now: () => clock.now,
    cooldowns: new Map<ProviderId, number>(),
    fetch: async (input, init) => {
      const body = JSON.parse(String(init?.body)) as { model: string };
      const headers = new Headers(init?.headers);
      calls.push({ url: String(input), model: body.model, auth: headers.get("authorization") });
      const reply = replies[body.model] ?? { status: 500 };
      if (reply === "throw") throw new TypeError("fetch failed");
      if (reply === "abort") throw Object.assign(new Error("aborted"), { name: "AbortError" });
      return new Response(JSON.stringify(reply.body ?? {}), { status: reply.status, headers: reply.headers });
    },
  };
  return { deps, calls, clock };
}

const BIG = "openai/gpt-oss-120b";
const SMALL = "openai/gpt-oss-20b";
const CF = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const ASK = [{ role: "user" as const, content: "What is osmosis?" }];

test("the big Groq model answers when it is healthy", async () => {
  const { deps, calls } = fakeDeps({ [BIG]: ok("Water moving across a membrane.") });
  const result = await completeWithFallback(ASK, {}, deps);
  assert.equal(result.provider, "groq-large");
  assert.equal(result.text, "Water moving across a membrane.");
  assert.deepEqual(calls.map((c) => c.model), [BIG]);
  assert.equal(calls[0].auth, "Bearer test-groq");
});

test("a rate-limited big model falls back to the small one", async () => {
  const { deps, calls } = fakeDeps({ [BIG]: { status: 429, headers: { "retry-after": "30" } }, [SMALL]: ok("small") });
  const result = await completeWithFallback(ASK, {}, deps);
  assert.equal(result.provider, "groq-small");
  assert.deepEqual(calls.map((c) => c.model), [BIG, SMALL]);
});

test("both Groq models failing falls back to Cloudflare", async () => {
  const { deps, calls } = fakeDeps({ [BIG]: { status: 503 }, [SMALL]: "abort", [CF]: ok("cloudflare") });
  const result = await completeWithFallback(ASK, {}, deps);
  assert.equal(result.provider, "cloudflare");
  assert.deepEqual(calls.map((c) => c.model), [BIG, SMALL, CF]);
  assert.match(calls[2].url, /\/accounts\/acct\/ai\/v1\/chat\/completions$/);
  assert.equal(calls[2].auth, "Bearer test-cf");
});

test("a network error or an empty answer also moves down the chain", async () => {
  const { deps } = fakeDeps({ [BIG]: "throw", [SMALL]: { status: 200, body: { choices: [] } }, [CF]: ok("cf") });
  assert.equal((await completeWithFallback(ASK, {}, deps)).provider, "cloudflare");
});

test("missing Groq keys skip straight to Cloudflare without a request", async () => {
  const { deps, calls } = fakeDeps({ [CF]: ok("cf") }, { CLOUDFLARE_ACCOUNT_ID: "acct", CLOUDFLARE_API_TOKEN: "t" });
  const result = await completeWithFallback(ASK, {}, deps);
  assert.equal(result.provider, "cloudflare");
  assert.deepEqual(calls.map((c) => c.model), [CF]);
});

test("when every provider fails the error is safe to show and lists each attempt", async () => {
  const { deps } = fakeDeps({ [BIG]: { status: 500 }, [SMALL]: { status: 429 } }, { GROQ_API_KEY: "k" });
  await assert.rejects(completeWithFallback(ASK, {}, deps), (error: unknown) => {
    assert.ok(error instanceof AiUnavailableError);
    assert.equal(error.status, 503);
    assert.doesNotMatch(error.message, /groq|cloudflare|http/i);
    assert.deepEqual(error.attempts, [
      { provider: "groq-large", reason: "http_500" },
      { provider: "groq-small", reason: "rate_limited" },
      { provider: "cloudflare", reason: "not_configured" },
      { provider: "gemini", reason: "not_configured" },
    ]);
    return true;
  });
});

test("no keys at all fails without any request", async () => {
  const { deps, calls } = fakeDeps({}, {});
  await assert.rejects(completeWithFallback(ASK, {}, deps), AiUnavailableError);
  assert.equal(calls.length, 0);
});

test("a rate-limited provider is skipped until its Retry-After passes", async () => {
  const { deps, calls, clock } = fakeDeps({ [BIG]: { status: 429, headers: { "retry-after": "30" } }, [SMALL]: ok("small") });
  await completeWithFallback(ASK, {}, deps);
  calls.length = 0;

  clock.now += 10_000;
  await completeWithFallback(ASK, {}, deps);
  assert.deepEqual(calls.map((c) => c.model), [SMALL], "big model still cooling down");

  calls.length = 0;
  clock.now += 25_000;
  await completeWithFallback(ASK, {}, deps);
  assert.deepEqual(calls.map((c) => c.model), [BIG, SMALL], "big model tried again after 30 s");
});

test("Retry-After accepts seconds or a date and is clamped", () => {
  const now = Date.parse("2026-11-20T12:00:00Z");
  assert.equal(parseRetryAfter("12", now), 12_000);
  assert.equal(parseRetryAfter("Fri, 20 Nov 2026 12:00:05 GMT", now), 5_000);
  assert.equal(parseRetryAfter(null, now), 60_000);
  assert.equal(parseRetryAfter("nonsense", now), 60_000);
  assert.equal(parseRetryAfter("99999", now), 600_000);
});

test("the request body carries the model, the messages and the limits", async () => {
  let sent: Record<string, unknown> = {};
  const { deps } = fakeDeps({});
  deps.fetch = async (_input, init) => {
    sent = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(JSON.stringify({ choices: [{ message: { content: "hi" } }] }), { status: 200 });
  };
  await completeWithFallback(ASK, { maxTokens: 300, temperature: 0.1 }, deps);
  assert.equal(sent.model, BIG);
  assert.deepEqual(sent.messages, ASK);
  assert.equal(sent.max_tokens, 300);
  assert.equal(sent.temperature, 0.1);
});

test("more careful reasoning is asked of the models that reason, and only of them", async () => {
  const sent: Array<Record<string, unknown>> = [];
  const { deps } = fakeDeps({});
  deps.fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    sent.push(body);
    // The big model is busy, so the small one and then Cloudflare are asked too.
    return body.model === CF ? new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), { status: 200 }) : new Response("{}", { status: 500 });
  };
  await completeWithFallback(ASK, { reasoning: "medium" }, deps);
  assert.deepEqual(sent.map((body) => [body.model, body.reasoning_effort]), [[BIG, "medium"], [SMALL, "medium"], [CF, undefined]]);
  sent.length = 0;
  await completeWithFallback(ASK, {}, deps);
  assert.equal(sent[0].reasoning_effort, "low", "the default stays low");
});

test("Gemini is asked last, in the same request format, and never for quick helper steps", async () => {
  const { QUICK_CHAIN } = await import("./providers");
  const sent: Array<{ url: string; model: string; auth: string | null }> = [];
  const deps: FallbackDeps = {
    env: { GEMINI_API_KEY: "test-gemini" },
    now: () => 0,
    cooldowns: new Map(),
    fetch: async (input, init) => {
      const body = JSON.parse(String(init?.body)) as { model: string };
      sent.push({ url: String(input), model: body.model, auth: new Headers(init?.headers).get("authorization") });
      return new Response(JSON.stringify({ choices: [{ message: { content: "391" } }] }), { status: 200 });
    },
  };
  const result = await completeWithFallback(ASK, {}, deps);
  assert.equal(result.provider, "gemini");
  assert.deepEqual(sent, [{ url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", model: "gemini-3.5-flash", auth: "Bearer test-gemini" }]);
  assert.ok(!QUICK_CHAIN.some((spec) => spec.id === "gemini"));
});

test("Gemini gets room for its thinking on top of the reply's limit; the others don't", async () => {
  const limits: Array<[string, unknown]> = [];
  const { deps } = fakeDeps({});
  deps.env = { ...ALL_KEYS, GEMINI_API_KEY: "test-gemini" };
  deps.fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as { model: string; max_tokens: number };
    limits.push([body.model, body.max_tokens]);
    return body.model === "gemini-3.5-flash" ? new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), { status: 200 }) : new Response("{}", { status: 500 });
  };
  await completeWithFallback(ASK, { maxTokens: 1_000 }, deps);
  assert.deepEqual(limits, [[BIG, 1_000], [SMALL, 1_000], [CF, 1_000], ["gemini-3.5-flash", 5_000]]);
});
