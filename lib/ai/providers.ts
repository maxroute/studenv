/**
 * Rangan's model chain: Groq big → Groq small → Cloudflare Workers AI.
 *
 * All three speak the OpenAI chat-completions format, so one request path
 * serves them. A provider is skipped when its keys are missing, and the next
 * one is tried when a call is rate limited, times out or fails. Server-only:
 * the keys must never reach a client bundle.
 */

export type ChatRole = "system" | "user" | "assistant";
export type ChatMessage = { role: ChatRole; content: string };

export type ProviderId = "groq-large" | "groq-small" | "cloudflare";

export type ProviderSpec = {
  id: ProviderId;
  model: string;
  /** Null when this provider's keys are not configured. */
  endpoint: (env: ProviderEnv) => { url: string; token: string } | null;
  /** Extra body fields this model accepts. */
  extraBody?: Record<string, unknown>;
};

export type ProviderEnv = {
  GROQ_API_KEY?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
  CLOUDFLARE_API_TOKEN?: string;
};

export type CompletionOptions = {
  maxTokens?: number;
  temperature?: number;
  /** Per-provider timeout. */
  timeoutMs?: number;
};

export type CompletionResult = {
  text: string;
  provider: ProviderId;
  model: string;
};

export type FallbackDeps = {
  fetch: typeof fetch;
  env: ProviderEnv;
  now: () => number;
  /** Shared across calls so a rate-limited provider is skipped until it recovers. */
  cooldowns: Map<ProviderId, number>;
};

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

export const PROVIDER_CHAIN: readonly ProviderSpec[] = [
  {
    id: "groq-large",
    model: "openai/gpt-oss-120b",
    endpoint: (env) => (env.GROQ_API_KEY ? { url: GROQ_URL, token: env.GROQ_API_KEY } : null),
    extraBody: { reasoning_effort: "low" },
  },
  {
    id: "groq-small",
    model: "openai/gpt-oss-20b",
    endpoint: (env) => (env.GROQ_API_KEY ? { url: GROQ_URL, token: env.GROQ_API_KEY } : null),
    extraBody: { reasoning_effort: "low" },
  },
  {
    id: "cloudflare",
    model: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
    endpoint: (env) =>
      env.CLOUDFLARE_ACCOUNT_ID && env.CLOUDFLARE_API_TOKEN
        ? {
            url: `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(env.CLOUDFLARE_ACCOUNT_ID)}/ai/v1/chat/completions`,
            token: env.CLOUDFLARE_API_TOKEN,
          }
        : null,
  },
];

const DEFAULT_TIMEOUT_MS = 20_000;
/** Used when a 429 carries no usable Retry-After. */
const DEFAULT_COOLDOWN_MS = 60_000;
const MAX_COOLDOWN_MS = 10 * 60_000;

/** Every provider failed or none is configured. Safe to show; carries no provider detail. */
export class AiUnavailableError extends Error {
  readonly status = 503;
  constructor(readonly attempts: Array<{ provider: ProviderId; reason: string }>) {
    super("Rangan is busy right now. Please try again in a minute.");
    this.name = "AiUnavailableError";
  }
}

type AttemptFailure = { reason: string; cooldownMs?: number };

/** Seconds or an HTTP date → milliseconds, clamped. */
export function parseRetryAfter(value: string | null, nowMs: number): number {
  if (!value) return DEFAULT_COOLDOWN_MS;
  const seconds = Number(value);
  const ms = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(value) - nowMs;
  if (!Number.isFinite(ms) || ms <= 0) return DEFAULT_COOLDOWN_MS;
  return Math.min(ms, MAX_COOLDOWN_MS);
}

function readText(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  const choices = (body as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const first: unknown = choices[0];
  if (typeof first !== "object" || first === null) return null;
  const message = (first as { message?: unknown }).message;
  if (typeof message !== "object" || message === null) return null;
  const content = (message as { content?: unknown }).content;
  return typeof content === "string" && content.trim() ? content.trim() : null;
}

async function callProvider(
  spec: ProviderSpec,
  target: { url: string; token: string },
  messages: ChatMessage[],
  options: CompletionOptions,
  deps: FallbackDeps,
): Promise<{ ok: true; text: string } | ({ ok: false } & AttemptFailure)> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const response = await deps.fetch(target.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${target.token}` },
      body: JSON.stringify({
        model: spec.model,
        messages,
        max_tokens: options.maxTokens ?? 1024,
        temperature: options.temperature ?? 0.3,
        ...spec.extraBody,
      }),
      signal: controller.signal,
    });
    if (response.status === 429) {
      return {
        ok: false,
        reason: "rate_limited",
        cooldownMs: parseRetryAfter(response.headers.get("retry-after"), deps.now()),
      };
    }
    if (!response.ok) return { ok: false, reason: `http_${response.status}` };
    const text = readText(await response.json().catch(() => null));
    return text ? { ok: true, text } : { ok: false, reason: "empty_response" };
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    return { ok: false, reason: aborted ? "timeout" : "network_error" };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Tries each configured provider in order and returns the first answer.
 * Throws `AiUnavailableError` when none answers.
 */
export async function completeWithFallback(
  messages: ChatMessage[],
  options: CompletionOptions,
  deps: FallbackDeps,
  chain: readonly ProviderSpec[] = PROVIDER_CHAIN,
): Promise<CompletionResult> {
  const attempts: Array<{ provider: ProviderId; reason: string }> = [];
  for (const spec of chain) {
    const target = spec.endpoint(deps.env);
    if (!target) {
      attempts.push({ provider: spec.id, reason: "not_configured" });
      continue;
    }
    const coolingUntil = deps.cooldowns.get(spec.id);
    if (coolingUntil !== undefined && coolingUntil > deps.now()) {
      attempts.push({ provider: spec.id, reason: "cooling_down" });
      continue;
    }
    const result = await callProvider(spec, target, messages, options, deps);
    if (result.ok) {
      deps.cooldowns.delete(spec.id);
      return { text: result.text, provider: spec.id, model: spec.model };
    }
    if (result.cooldownMs !== undefined) deps.cooldowns.set(spec.id, deps.now() + result.cooldownMs);
    attempts.push({ provider: spec.id, reason: result.reason });
  }
  throw new AiUnavailableError(attempts);
}

const processCooldowns = new Map<ProviderId, number>();

/** The real chain, reading keys from the server environment. */
export function complete(messages: ChatMessage[], options: CompletionOptions = {}) {
  return completeWithFallback(messages, options, {
    fetch: (input, init) => fetch(input, init),
    env: {
      GROQ_API_KEY: process.env.GROQ_API_KEY,
      CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID,
      CLOUDFLARE_API_TOKEN: process.env.CLOUDFLARE_API_TOKEN,
    },
    now: Date.now,
    cooldowns: processCooldowns,
  });
}
