import type { ItemType } from "@/types";

const videoHosts = new Set([
  "youtu.be",
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
  "vimeo.com",
  "www.vimeo.com",
  "loom.com",
  "www.loom.com",
]);

const videoExtensions = [".mp4", ".mov", ".webm", ".mkv"];

export function inferItemTypeFromUrl(url?: string | null): ItemType | null {
  if (!url) {
    return null;
  }

  try {
    const parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
    const hostname = parsed.hostname.toLowerCase();
    const pathname = parsed.pathname.toLowerCase();
    const href = parsed.toString().toLowerCase();

    if (videoHosts.has(hostname) || videoExtensions.some((ext) => pathname.endsWith(ext))) {
      return "video";
    }

    if (
      pathname.endsWith(".pdf") ||
      href.includes(".pdf?") ||
      href.endsWith(".pdf")
    ) {
      return "pdf";
    }

    return null;
  } catch {
    return null;
  }
}
