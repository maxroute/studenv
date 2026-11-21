// ---------------------------------------------------------------------------
// One lesson video for a map, from YouTube's official search
// ---------------------------------------------------------------------------
//
// Uses the YouTube Data API (search.list), the sanctioned way to search
// YouTube. It needs a server-side key (YOUTUBE_API_KEY); without one, maps
// simply come without a video. Each search costs 100 of the key's 10,000 free
// daily units, so results are cached for a day. Among the results whose title
// names the subject, captioned videos come first (they tend to be real
// lessons, and their transcript lets Rangan cite them), then the most viewed;
// that check costs 1 more unit. Only the search words leave the server, never
// the student's notes.

import { z } from "zod";

export type YouTubeVideo = {
  videoId: string;
  title: string;
  channel: string;
};

export const YOUTUBE_VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

/** The watch page for a video id; built here, never taken from a response. */
export const youTubeWatchUrl = (videoId: string) => `https://www.youtube.com/watch?v=${videoId}`;

const TIMEOUT_MS = 6_000;
const CACHE_MS = 24 * 60 * 60 * 1000;
const CACHE_MAX = 300;

export type YouTubeFetch = (url: string, init: { signal: AbortSignal }) => Promise<{ ok: boolean; json: () => Promise<unknown> }>;

const searchResponse = z.object({
  items: z
    .array(
      z.object({
        id: z.object({ videoId: z.string().optional() }),
        snippet: z.object({ title: z.string(), channelTitle: z.string().default(""), liveBroadcastContent: z.string().optional() }),
      }),
    )
    .default([]),
});

/** YouTube titles come HTML-escaped. */
export function plainTitle(value: string, max = 200): string {
  const text = value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
  return text.slice(0, max);
}

const STOP_WORDS = new Set(["the", "a", "an", "of", "and", "in", "on", "for", "to", "what", "is", "how", "explained", "tutorial", "lecture", "video"]);
const meaningful = (text: string) =>
  text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word));

/** A rough English stem, so "boot", "boots" and "booting" match. */
export const stem = (word: string) => {
  for (const suffix of ["ing", "es", "ed", "s"]) {
    if (word.endsWith(suffix) && word.length - suffix.length >= 4) return word.slice(0, -suffix.length);
  }
  return word;
};

/** True when most of a title's letters are Latin: an English lesson, not one in another script. */
const mostlyLatin = (title: string) => {
  const letters = title.match(/\p{L}/gu) ?? [];
  return letters.length > 0 && letters.filter((letter) => /[A-Za-z]/.test(letter)).length / letters.length >= 0.6;
};

/**
 * Results whose title names the subject (at least one of its meaningful
 * words), in YouTube's order. Live streams are skipped, and so are titles
 * mostly in another script when the lesson is wanted in English.
 */
export function onTopicVideos(items: z.infer<typeof searchResponse>["items"], subject: string, language: "en" | "bn" = "en"): YouTubeVideo[] {
  const words = meaningful(subject);
  const found: YouTubeVideo[] = [];
  for (const item of items) {
    const videoId = item.id.videoId;
    if (!videoId || !YOUTUBE_VIDEO_ID.test(videoId) || (item.snippet.liveBroadcastContent && item.snippet.liveBroadcastContent !== "none")) continue;
    const title = plainTitle(item.snippet.title);
    if (language === "en" && !mostlyLatin(title)) continue;
    const titleStems = new Set(meaningful(title).map(stem));
    if (words.length && !words.some((word) => titleStems.has(stem(word)))) continue;
    found.push({ videoId, title, channel: plainTitle(item.snippet.channelTitle, 120) });
  }
  return found;
}

/** The first on-topic result, as YouTube ranks them; null when none names the subject. */
export function pickVideo(items: z.infer<typeof searchResponse>["items"], subject: string, language: "en" | "bn" = "en"): YouTubeVideo | null {
  return onTopicVideos(items, subject, language)[0] ?? null;
}

const statsResponse = z.object({
  items: z
    .array(
      z.object({
        id: z.string(),
        statistics: z.object({ viewCount: z.coerce.number().optional() }).partial().default({}),
        contentDetails: z.object({ caption: z.string().optional() }).partial().default({}),
      }),
    )
    .default([]),
});

/** Captioned videos first, then the most viewed; YouTube's order breaks ties. */
export function rankVideos(videos: YouTubeVideo[], stats: z.infer<typeof statsResponse>["items"]): YouTubeVideo[] {
  const byId = new Map(stats.map((item) => [item.id, item]));
  const score = (video: YouTubeVideo) => {
    const item = byId.get(video.videoId);
    return { captioned: item?.contentDetails.caption === "true" ? 1 : 0, views: item?.statistics.viewCount ?? 0 };
  };
  return videos
    .map((video, index) => ({ video, index, ...score(video) }))
    .sort((a, b) => b.captioned - a.captioned || b.views - a.views || a.index - b.index)
    .map((entry) => entry.video);
}

const cache = new Map<string, { at: number; video: YouTubeVideo | null }>();

/**
 * A lesson video for `query` whose title names `subject`: embeddable,
 * safe-search strict, 4 to 20 minutes long. Null without a key, without a
 * match, or when YouTube can't be reached; never throws.
 */
export async function findYouTubeVideo(
  query: string,
  subject: string,
  options: { apiKey?: string; fetch?: YouTubeFetch; language?: string; now?: () => number } = {},
): Promise<YouTubeVideo | null> {
  const text = query.replace(/\s+/g, " ").trim().slice(0, 120);
  const apiKey = options.apiKey?.trim();
  if (!text || !apiKey) return null;
  const now = options.now ?? Date.now;
  const language = options.language === "bn" ? "bn" : "en";
  const cacheKey = `${language}|${text.toLowerCase()}|${subject.toLowerCase()}`;
  const cached = cache.get(cacheKey);
  if (cached && now() - cached.at < CACHE_MS) return cached.video;

  const params = new URLSearchParams({
    part: "snippet",
    type: "video",
    q: text,
    maxResults: "8",
    safeSearch: "strict",
    videoEmbeddable: "true",
    videoDuration: "medium",
    relevanceLanguage: language,
    key: apiKey,
  });
  const fetcher: YouTubeFetch = options.fetch ?? ((url, init) => fetch(url, init));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetcher(`https://www.googleapis.com/youtube/v3/search?${params.toString()}`, { signal: controller.signal });
    if (!response.ok) return null;
    const candidates = onTopicVideos(searchResponse.parse(await response.json()).items, subject || text, language);
    let video = candidates[0] ?? null;
    if (candidates.length > 1) {
      // Views and captions; without them, YouTube's own order stands.
      const statsParams = new URLSearchParams({ part: "statistics,contentDetails", id: candidates.map((candidate) => candidate.videoId).join(","), key: apiKey });
      const stats = await fetcher(`https://www.googleapis.com/youtube/v3/videos?${statsParams.toString()}`, { signal: controller.signal })
        .then(async (reply) => (reply.ok ? statsResponse.parse(await reply.json()).items : []))
        .catch(() => []);
      video = rankVideos(candidates, stats)[0] ?? video;
    }
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value ?? "");
    cache.set(cacheKey, { at: now(), video });
    return video;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
