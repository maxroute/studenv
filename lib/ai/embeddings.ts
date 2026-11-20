/**
 * Text embeddings from Cloudflare Workers AI (`@cf/baai/bge-m3`, multilingual,
 * 1024 dimensions). Server-only. Callers treat a failure as "meaning search
 * unavailable" and fall back to keyword search.
 */

export const EMBEDDING_MODEL = "@cf/baai/bge-m3";
export const EMBEDDING_DIMENSIONS = 1024;
/** Texts per request. */
export const EMBEDDING_BATCH = 32;
/** Longest text sent; passages are shorter, this only guards odd input. */
const EMBEDDING_MAX_CHARS = 4_000;

export type EmbeddingEnv = { CLOUDFLARE_ACCOUNT_ID?: string; CLOUDFLARE_API_TOKEN?: string };
export type EmbeddingDeps = { fetch: typeof fetch; env: EmbeddingEnv; timeoutMs?: number };

export class EmbeddingUnavailableError extends Error {
  constructor(readonly reason: string) {
    super("Embeddings are unavailable.");
    this.name = "EmbeddingUnavailableError";
  }
}

function readVectors(body: unknown, expected: number): number[][] | null {
  if (typeof body !== "object" || body === null) return null;
  const data = (body as { data?: unknown }).data;
  if (!Array.isArray(data) || data.length !== expected) return null;
  const vectors: number[][] = [];
  for (const entry of data) {
    const vector = typeof entry === "object" && entry !== null ? (entry as { embedding?: unknown }).embedding : undefined;
    if (
      !Array.isArray(vector) ||
      vector.length !== EMBEDDING_DIMENSIONS ||
      !vector.every((value) => typeof value === "number" && Number.isFinite(value))
    ) {
      return null;
    }
    vectors.push(vector);
  }
  return vectors;
}

/** One vector per text, in order. Throws `EmbeddingUnavailableError` on any failure. */
export async function embedTexts(texts: readonly string[], deps: EmbeddingDeps): Promise<number[][]> {
  if (texts.length === 0) return [];
  const { CLOUDFLARE_ACCOUNT_ID: account, CLOUDFLARE_API_TOKEN: token } = deps.env;
  if (!account || !token) throw new EmbeddingUnavailableError("not_configured");
  const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}/ai/v1/embeddings`;

  const out: number[][] = [];
  for (let start = 0; start < texts.length; start += EMBEDDING_BATCH) {
    const batch = texts.slice(start, start + EMBEDDING_BATCH).map((text) => text.slice(0, EMBEDDING_MAX_CHARS));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? 15_000);
    try {
      const response = await deps.fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ model: EMBEDDING_MODEL, input: batch }),
        signal: controller.signal,
      });
      if (!response.ok) throw new EmbeddingUnavailableError(`http_${response.status}`);
      const vectors = readVectors(await response.json().catch(() => null), batch.length);
      if (!vectors) throw new EmbeddingUnavailableError("bad_response");
      out.push(...vectors);
    } catch (error) {
      if (error instanceof EmbeddingUnavailableError) throw error;
      const aborted = error instanceof Error && error.name === "AbortError";
      throw new EmbeddingUnavailableError(aborted ? "timeout" : "network_error");
    } finally {
      clearTimeout(timer);
    }
  }
  return out;
}

/** pgvector's text form, e.g. `[0.1,0.2]`. Only finite numbers reach here. */
export function toVectorLiteral(vector: readonly number[]): string {
  return `[${vector.join(",")}]`;
}

/** The real client, reading keys from the server environment. */
export function embed(texts: readonly string[]) {
  return embedTexts(texts, {
    fetch: (input, init) => fetch(input, init),
    env: {
      CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID,
      CLOUDFLARE_API_TOKEN: process.env.CLOUDFLARE_API_TOKEN,
    },
  });
}
