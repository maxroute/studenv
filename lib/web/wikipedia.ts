// ---------------------------------------------------------------------------
// Wikipedia: an open, free, keyless reference source for Rangan
// ---------------------------------------------------------------------------
//
// Only the search words leave the server (a question or a concept name),
// never the student's notes. Article intros are short, cited by Wikipedia
// itself, and openly licensed (CC BY-SA), so they can be quoted with a link.

import { z } from "zod";

export type WikiArticle = {
  title: string;
  description: string;
  /** The article's opening summary, plain text. */
  extract: string;
  url: string;
  lang: WikiLanguage;
};

export type WikiLanguage = "en" | "bn";

/** Wikimedia asks API clients to name themselves. */
const USER_AGENT = "Studenv-Rangan/1.0 (study assistant)";
const TIMEOUT_MS = 5_000;
const MAX_EXTRACT_CHARS = 1_500;
const CACHE_MS = 24 * 60 * 60 * 1000;
const CACHE_MAX = 500;

/** Bengali text is looked up on Bengali Wikipedia; everything else on English. */
export function wikiLanguage(text: string): WikiLanguage {
  const bengali = (text.match(/[ঀ-৿]/g) ?? []).length;
  const latin = (text.match(/[A-Za-z]/g) ?? []).length;
  return bengali > latin ? "bn" : "en";
}

/** The article's address, built here rather than taken from the response. */
export function articleUrl(lang: WikiLanguage, key: string) {
  return `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(key.replace(/ /g, "_")).replace(/%2F/g, "/")}`;
}

const searchResponse = z.object({
  pages: z.array(z.object({ key: z.string().min(1).max(300), title: z.string().min(1).max(300), description: z.string().nullable().optional() })),
});

const summaryResponse = z.object({
  type: z.string(),
  title: z.string(),
  description: z.string().optional(),
  extract: z.string(),
});

export type FetchLike = (url: string, init: { headers: Record<string, string>; signal: AbortSignal }) => Promise<{ ok: boolean; json: () => Promise<unknown> }>;

async function getJson(fetcher: FetchLike, url: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetcher(url, { headers: { "User-Agent": USER_AGENT, "Api-User-Agent": USER_AGENT, Accept: "application/json" }, signal: controller.signal });
    if (!response.ok) throw new Error("Wikipedia did not answer.");
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

const cache = new Map<string, { at: number; articles: WikiArticle[] }>();

/**
 * Up to `limit` Wikipedia articles for a query, each with its opening summary.
 * Disambiguation pages and empty summaries are skipped. Throws when
 * Wikipedia can't be reached; callers treat that as "no web results".
 */
export async function searchWikipedia(
  query: string,
  options: { limit?: number; fetch?: FetchLike; now?: () => number } = {},
): Promise<WikiArticle[]> {
  const text = query.replace(/\s+/g, " ").trim().slice(0, 300);
  if (!text) return [];
  const limit = Math.min(Math.max(options.limit ?? 2, 1), 5);
  const now = options.now ?? Date.now;
  const lang = wikiLanguage(text);
  const cacheKey = `${lang}|${limit}|${text.toLowerCase()}`;
  const cached = cache.get(cacheKey);
  if (cached && now() - cached.at < CACHE_MS) return cached.articles;

  const fetcher: FetchLike = options.fetch ?? ((url, init) => fetch(url, init));
  const host = `https://${lang}.wikipedia.org`;
  const found = searchResponse.parse(await getJson(fetcher, `${host}/w/rest.php/v1/search/page?q=${encodeURIComponent(text)}&limit=${limit + 1}`));
  const summaries = await Promise.all(
    found.pages.slice(0, limit + 1).map(async (page) => {
      try {
        const summary = summaryResponse.parse(await getJson(fetcher, `${host}/api/rest_v1/page/summary/${encodeURIComponent(page.key)}`));
        if (summary.type === "disambiguation" || !summary.extract.trim()) return null;
        const extract = summary.extract.replace(/\s+/g, " ").trim();
        return {
          title: summary.title,
          description: (summary.description ?? page.description ?? "").slice(0, 200),
          extract: extract.length > MAX_EXTRACT_CHARS ? `${extract.slice(0, MAX_EXTRACT_CHARS)}…` : extract,
          url: articleUrl(lang, page.key),
          lang,
        } satisfies WikiArticle;
      } catch {
        return null;
      }
    }),
  );
  const articles = summaries.filter((article): article is WikiArticle => article !== null).slice(0, limit);

  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value ?? "");
  cache.set(cacheKey, { at: now(), articles });
  return articles;
}
