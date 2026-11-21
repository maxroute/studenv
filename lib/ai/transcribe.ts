// ---------------------------------------------------------------------------
// Speech to text: Whisper on Groq, then on Cloudflare Workers AI
// ---------------------------------------------------------------------------
//
// The audio is sent only to be transcribed and is not kept. Each provider is
// tried in turn; a missing key skips it.

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

async function viaGroq(audio: Blob, filename: string, deps: TranscribeDeps): Promise<string | null> {
  const key = deps.env.GROQ_API_KEY;
  if (!key) return null;
  const form = new FormData();
  form.append("file", audio, filename);
  form.append("model", GROQ_MODEL);
  form.append("response_format", "json");
  form.append("temperature", "0");
  const response = await deps.fetch(GROQ_URL, { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) return null;
  return textOf(await response.json().catch(() => null), ["text"]);
}

async function viaCloudflare(audio: Blob, deps: TranscribeDeps): Promise<string | null> {
  const { CLOUDFLARE_ACCOUNT_ID: account, CLOUDFLARE_API_TOKEN: token } = deps.env;
  if (!account || !token) return null;
  const base64 = Buffer.from(await audio.arrayBuffer()).toString("base64");
  const response = await deps.fetch(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}/ai/run/@cf/openai/whisper-large-v3-turbo`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ audio: base64 }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) return null;
  return textOf(await response.json().catch(() => null), ["result", "text"]);
}

/** The words in a recording, from the first provider that answers; throws when none can. */
export async function transcribeWithFallback(audio: Blob, filename: string, deps: TranscribeDeps): Promise<{ text: string; provider: TranscribeProvider }> {
  const attempts: Array<[TranscribeProvider, () => Promise<string | null>]> = [
    ["groq-whisper", () => viaGroq(audio, filename, deps)],
    ["cloudflare-whisper", () => viaCloudflare(audio, deps)],
  ];
  for (const [provider, attempt] of attempts) {
    const text = await attempt().catch(() => null);
    if (text !== null) return { text, provider };
  }
  throw new TranscribeUnavailableError();
}

/** The real providers, with keys from the server environment. */
export function transcribe(audio: Blob, filename: string) {
  return transcribeWithFallback(audio, filename, {
    fetch: (input, init) => fetch(input, init),
    env: {
      GROQ_API_KEY: process.env.GROQ_API_KEY,
      CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID,
      CLOUDFLARE_API_TOKEN: process.env.CLOUDFLARE_API_TOKEN,
    },
  });
}
