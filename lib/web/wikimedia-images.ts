// ---------------------------------------------------------------------------
// Pictures for Rangan's map boards, from Wikimedia Commons
// ---------------------------------------------------------------------------
//
// Only an article's lead picture is used, and only when the file lives on
// Wikimedia Commons, where every file is freely licensed. Pictures stored on
// Wikipedia itself are often "fair use" (logos, screenshots) and are skipped.
// Each picture keeps its author and licence, shown as a credit on the board.
// Only the search words leave the server, never the student's notes.

import { z } from "zod";
import { RANGAN_USER_AGENT } from "@/lib/web/client-name";
import { wikiLanguage, type FetchLike } from "@/lib/web/wikipedia";

export type CommonsImage = {
  /** A Commons thumbnail, as Wikipedia picks it (about 330px wide). */
  src: string;
  width: number;
  height: number;
  /** The Wikipedia article the picture leads. */
  alt: string;
  /** "Author · Licence". */
  credit: string;
  /** The file's page on Commons, where the full licence is. */
  sourceUrl: string;
};

const USER_AGENT = RANGAN_USER_AGENT;
const TIMEOUT_MS = 5_000;
/** Wikimedia serves files from either host. */
const MEDIA_HOSTS = new Set(["upload.wikimedia.org", "thumb.wikimedia.org"]);
const COMMONS_PATH = /^\/wikipedia\/commons\/(?:thumb\/)?[0-9a-f]\/[0-9a-f]{2}\/([^/]+)/;

/** True for a picture stored on Wikimedia Commons (not Wikipedia's own, possibly non-free, files). */
export function isCommonsImageUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && MEDIA_HOSTS.has(url.hostname) && COMMONS_PATH.test(url.pathname) && !url.search && !url.hash;
  } catch {
    return false;
  }
}

/** True for a Commons file page. */
export function isCommonsFilePage(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "commons.wikimedia.org" && url.pathname.startsWith("/wiki/File:") && !url.search && !url.hash;
  } catch {
    return false;
  }
}

/** True for an English or Bengali Wikipedia article address, as `articleUrl` builds them. */
export function isWikipediaArticleUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && /^(en|bn)\.wikipedia\.org$/.test(url.hostname) && /^\/wiki\/[^:]+$/.test(url.pathname) && !url.search && !url.hash;
  } catch {
    return false;
  }
}

/** The file name a Commons upload URL points at, decoded; null when it isn't one. */
export function commonsFileName(src: string): string | null {
  try {
    const url = new URL(src);
    const match = MEDIA_HOSTS.has(url.hostname) ? COMMONS_PATH.exec(url.pathname) : null;
    return match ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

/** A media URL without the tracking parameters Wikipedia adds (`?utm_source=…`); null when it isn't a URL. */
export function withoutQuery(src: string): string | null {
  try {
    const url = new URL(src);
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * The author from Commons' "Artist" field. It is HTML and sometimes carries
 * badges and notes ("The SVG code is valid…"); a linked user name is
 * preferred, then the plain text.
 */
export function authorName(html: string): string {
  const user = /<a\b[^>]*href="[^"]*(?:User:|\/wiki\/User)[^"]*"[^>]*>([\s\S]*?)<\/a>/i.exec(html);
  const name = user ? plainCredit(user[1]) : "";
  return name || plainCredit(html);
}

/** Plain text from Commons' HTML metadata (author names often come as links). */
export function plainCredit(html: string, max = 80): string {
  const text = html
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

const searchResponse = z.object({ pages: z.array(z.object({ key: z.string().min(1).max(300) })) });
const imageRef = z.object({ source: z.string(), width: z.number().positive(), height: z.number().positive() });
const summaryResponse = z.object({
  type: z.string(),
  title: z.string(),
  thumbnail: imageRef.optional(),
});
const metaValue = z.object({ value: z.union([z.string(), z.number()]).transform(String) }).optional();
const commonsResponse = z.object({
  query: z.object({
    pages: z.record(
      z.object({
        imageinfo: z
          .array(z.object({ extmetadata: z.object({ LicenseShortName: metaValue, Artist: metaValue, NonFree: metaValue, Credit: metaValue }).partial() }))
          .optional(),
      }),
    ),
  }),
});

async function getJson(fetcher: FetchLike, url: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetcher(url, { headers: { "User-Agent": USER_AGENT, "Api-User-Agent": USER_AGENT, Accept: "application/json" }, signal: controller.signal });
    if (!response.ok) throw new Error("Wikimedia did not answer.");
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The lead picture of the best Wikipedia article for `query`, when it is a
 * freely licensed Commons file; null otherwise. Never throws: a picture is
 * an extra, and a map is fine without it.
 */
export async function findCommonsImage(query: string, options: { fetch?: FetchLike } = {}): Promise<CommonsImage | null> {
  const text = query.replace(/\s+/g, " ").trim().slice(0, 120);
  if (!text) return null;
  const fetcher: FetchLike = options.fetch ?? ((url, init) => fetch(url, init));
  const host = `https://${wikiLanguage(text)}.wikipedia.org`;
  try {
    const found = searchResponse.parse(await getJson(fetcher, `${host}/w/rest.php/v1/search/page?q=${encodeURIComponent(text)}&limit=1`));
    const key = found.pages[0]?.key;
    if (!key) return null;
    const summary = summaryResponse.parse(await getJson(fetcher, `${host}/api/rest_v1/page/summary/${encodeURIComponent(key)}`));
    if (summary.type === "disambiguation") return null;
    const thumb = summary.thumbnail;
    const src = thumb ? withoutQuery(thumb.source) : null;
    if (!thumb || !src || !isCommonsImageUrl(src)) return null;
    const name = commonsFileName(src);
    if (!name) return null;

    const info = commonsResponse.parse(
      await getJson(fetcher, `https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=extmetadata&titles=${encodeURIComponent(`File:${name}`)}`),
    );
    const meta = Object.values(info.query.pages)[0]?.imageinfo?.[0]?.extmetadata;
    const licence = plainCredit(meta?.LicenseShortName?.value ?? "", 40);
    if (!licence || meta?.NonFree?.value || /fair use|non-?free/i.test(licence)) return null;
    const author = authorName(meta?.Artist?.value ?? meta?.Credit?.value ?? "") || "Unknown author";

    // Wikimedia only serves standard thumbnail widths, so the one Wikipedia picked is kept.
    return {
      src,
      width: Math.round(thumb.width),
      height: Math.round(thumb.height),
      alt: summary.title.slice(0, 120),
      credit: `${author} · ${licence}`.slice(0, 130),
      sourceUrl: `https://commons.wikimedia.org/wiki/${encodeURIComponent(`File:${name}`.replace(/ /g, "_")).replace(/%3A/g, ":")}`,
    };
  } catch {
    return null;
  }
}
