// ---------------------------------------------------------------------------
// Does a YouTube video or Wikipedia article really exist?
// ---------------------------------------------------------------------------
//
// A model can write a plausible but made-up video id or article name. Before a
// link or embed is offered, YouTube and Wikipedia addresses are checked with
// those sites' own public endpoints. Only these fixed hosts are ever fetched:
// an address on any other site is not looked up here (and never fetched from
// the server), so this can't be used to reach internal addresses.

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

const YOUTUBE_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"]);
const WIKIPEDIA = /^([a-z]{2,12})(?:\.m)?\.wikipedia\.org$/;

/** The address to ask about a link, or null when this check doesn't cover its site. */
export function checkEndpoint(href: string): string | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = url.hostname.toLowerCase();
  if (YOUTUBE_HOSTS.has(host)) return `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url.toString())}`;
  const wiki = WIKIPEDIA.exec(host);
  const title = url.pathname.startsWith("/wiki/") ? url.pathname.slice("/wiki/".length) : null;
  if (wiki && title) return `https://${wiki[1]}.wikipedia.org/api/rest_v1/page/summary/${title}`;
  return null;
}

/**
 * True unless the link is a YouTube video or Wikipedia article that doesn't
 * exist. Links to other sites are kept as written; a check that can't run
 * (offline, slow) keeps the link too.
 */
export async function linkExists(href: string, fetcher: FetchLike = fetch): Promise<boolean> {
  const endpoint = checkEndpoint(href);
  if (!endpoint) return true;
  try {
    const response = await fetcher(endpoint, { signal: AbortSignal.timeout(4_000), headers: { Accept: "application/json" } });
    if (response.status === 404 || response.status === 400 || response.status === 401 || response.status === 403) return false;
    return true;
  } catch {
    return true;
  }
}
