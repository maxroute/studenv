// ---------------------------------------------------------------------------
// Speech to text: Whisper on Groq, then on Cloudflare Workers AI
// ---------------------------------------------------------------------------
//
// The audio is sent only to be transcribed and is not kept. Each provider is
// tried in turn; a missing key skips it.

import { voiceHint } from "@/lib/rangan/voice";

export type TranscribeProvider = "groq-whisper" | "cloudflare-whisper";

export type TranscribeEnv = {
  GROQ_API_KEY?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
  CLOUDFLARE_API_TOKEN?: string;
};

export type TranscribeDeps = {
  fetch: (input: string, init: RequestInit) => Promise<Response>;
  env: TranscribeEnv;
};

export class TranscribeUnavailableError extends Error {
  status = 503;
  constructor() {
    super("Voice typing isn't available right now. Please type instead.");
    this.name = "TranscribeUnavailableError";
  }
}

const GROQ_URL = "https://api.groq.com/openai/v1/audio/transcriptions";
const GROQ_MODEL = "whisper-large-v3-turbo";
const TIMEOUT_MS = 25_000;

const textOf = (value: unknown, path: string[]): string | null => {
  let current: unknown = value;
  for (const key of path) {
    if (typeof current !== "object" || current === null) return null;
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === "string" ? current : null;
};

/** The language spoken, when known: naming it stops Bengali being heard as Hindi. */
export type SpokenLanguage = "en" | "bn" | "hi" | null;

/** The language a provider says it heard ("Hindi", "hi", "bengali"…), when it is one Talk knows. */
export function heardLanguage(value: unknown): SpokenLanguage {
  const name = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (name === "hi" || name === "hindi") return "hi";
  if (name === "bn" || name === "bengali" || name === "bangla") return "bn";
  if (name === "en" || name === "english") return "en";
  return null;
}

type Heard = { text: string; heard: SpokenLanguage };

async function viaGroq(audio: Blob, filename: string, deps: TranscribeDeps, language: SpokenLanguage): Promise<Heard | null> {
  const key = deps.env.GROQ_API_KEY;
  if (!key) return null;
  const form = new FormData();
  form.append("file", audio, filename);
  form.append("model", GROQ_MODEL);
  // verbose_json also says which language was heard, which Auto needs.
  form.append("response_format", "verbose_json");
  form.append("temperature", "0");
  form.append("prompt", voiceHint(language ?? "en"));
  if (language) form.append("language", language);
  const response = await deps.fetch(GROQ_URL, { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) return null;
  const json: unknown = await response.json().catch(() => null);
  const text = textOf(json, ["text"]);
  return text === null ? null : { text, heard: language ?? heardLanguage(textOf(json, ["language"])) };
}

async function viaCloudflare(audio: Blob, deps: TranscribeDeps, language: SpokenLanguage): Promise<Heard | null> {
  const { CLOUDFLARE_ACCOUNT_ID: account, CLOUDFLARE_API_TOKEN: token } = deps.env;
  if (!account || !token) return null;
  const base64 = Buffer.from(await audio.arrayBuffer()).toString("base64");
  const response = await deps.fetch(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}/ai/run/@cf/openai/whisper-large-v3-turbo`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ audio: base64, initial_prompt: voiceHint(language ?? "en"), ...(language ? { language } : {}) }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) return null;
  const json: unknown = await response.json().catch(() => null);
  const text = textOf(json, ["result", "text"]);
  return text === null ? null : { text, heard: language ?? heardLanguage(textOf(json, ["result", "transcription_info", "language"])) };
}

/** The words in a recording, from the first provider that answers; throws when none can. */
export async function transcribeWithFallback(audio: Blob, filename: string, deps: TranscribeDeps, language: SpokenLanguage = null): Promise<{ text: string; provider: TranscribeProvider; heard: SpokenLanguage }> {
  const attempts: Array<[TranscribeProvider, () => Promise<Heard | null>]> = [
    ["groq-whisper", () => viaGroq(audio, filename, deps, language)],
    ["cloudflare-whisper", () => viaCloudflare(audio, deps, language)],
  ];
  for (const [provider, attempt] of attempts) {
    const result = await attempt().catch(() => null);
    if (result !== null) return { ...result, provider };
  }
  throw new TranscribeUnavailableError();
}

/** The real providers, with keys from the server environment. */
export function transcribe(audio: Blob, filename: string, language: SpokenLanguage = null) {
  return transcribeWithFallback(audio, filename, {
    fetch: (input, init) => fetch(input, init),
    env: {
      GROQ_API_KEY: process.env.GROQ_API_KEY,
      CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID,
      CLOUDFLARE_API_TOKEN: process.env.CLOUDFLARE_API_TOKEN,
    },
  }, language);
}
