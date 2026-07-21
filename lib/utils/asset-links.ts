import type { UploadableAssetKind } from "@/lib/utils/media-assets";

const youtubeHosts = new Set([
  "youtu.be",
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
]);

const socialWebpageHosts = new Set([
  "instagram.com",
  "www.instagram.com",
  "m.instagram.com",
  "facebook.com",
  "www.facebook.com",
  "x.com",
  "www.x.com",
  "twitter.com",
  "www.twitter.com",
  "tiktok.com",
  "www.tiktok.com",
]);

const extensionToKind: Record<string, UploadableAssetKind> = {
  pdf: "pdf",
  png: "image",
  jpg: "image",
  jpeg: "image",
  gif: "image",
  webp: "image",
  bmp: "image",
  svg: "image",
  mp4: "video",
  mov: "video",
  m4v: "video",
  webm: "video",
  ogg: "video",
  avi: "video",
  mkv: "video",
  mp3: "audio",
  wav: "audio",
  m4a: "audio",
  aac: "audio",
  oga: "audio",
  flac: "audio",
};

const extensionToMimeType: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  svg: "image/svg+xml",
  mp4: "video/mp4",
  mov: "video/quicktime",
  m4v: "video/x-m4v",
  webm: "video/webm",
  ogg: "video/ogg",
  avi: "video/x-msvideo",
  mkv: "video/x-matroska",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  m4a: "audio/mp4",
  aac: "audio/aac",
  oga: "audio/ogg",
  flac: "audio/flac",
};

export type UrlAssetKind = UploadableAssetKind | "webpage";

function getExtensionFromUrl(url: URL) {
  const pathname = url.pathname.toLowerCase();
  const lastSegment = pathname.split("/").filter(Boolean).at(-1) ?? "";
  const dotIndex = lastSegment.lastIndexOf(".");

  if (dotIndex === -1) {
    return "";
  }

  return lastSegment.slice(dotIndex + 1);
}

export function getExternalUrlExtension(rawUrl: string) {
  try {
    return getExtensionFromUrl(normalizeExternalUrl(rawUrl));
  } catch {
    return "";
  }
}

function titleFromUrl(url: URL) {
  const lastSegment = url.pathname.split("/").filter(Boolean).at(-1);
  if (lastSegment) {
    const decoded = decodeURIComponent(lastSegment).replace(/\.[^.]+$/, "");
    if (decoded.trim().length > 0) {
      return decoded;
    }
  }

  return url.hostname.replace(/^www\./, "");
}

export function normalizeExternalUrl(rawUrl: string) {
  const value = rawUrl.trim();
  return new URL(value.startsWith("http://") || value.startsWith("https://") ? value : `https://${value}`);
}

export function inferAssetFromExternalUrl(
  rawUrl: string,
  options?: { contentType?: string | null; title?: string | null },
) {
  const normalizedUrl = normalizeExternalUrl(rawUrl);
  const hostname = normalizedUrl.hostname.toLowerCase();
  const extension = getExtensionFromUrl(normalizedUrl);
  const normalizedContentType = (options?.contentType ?? "").toLowerCase().split(";")[0].trim();

  let kind: UrlAssetKind = "webpage";
  let mimeType: string | undefined;

  if (youtubeHosts.has(hostname)) {
    kind = "video";
    mimeType = "text/html";
  } else if (socialWebpageHosts.has(hostname)) {
    kind = "webpage";
    mimeType = "text/html";
  } else if (normalizedContentType === "application/pdf") {
    kind = "pdf";
    mimeType = "application/pdf";
  } else if (normalizedContentType.startsWith("image/")) {
    kind = "image";
    mimeType = normalizedContentType;
  } else if (normalizedContentType.startsWith("video/")) {
    kind = "video";
    mimeType = normalizedContentType;
  } else if (normalizedContentType.startsWith("audio/")) {
    kind = "audio";
    mimeType = normalizedContentType;
  } else if (extensionToKind[extension]) {
    kind = extensionToKind[extension];
    mimeType = extensionToMimeType[extension];
  }

  return {
    normalizedUrl: normalizedUrl.toString(),
    sourceHost: hostname,
    kind,
    mimeType,
    title: options?.title?.trim() || titleFromUrl(normalizedUrl),
  };
}

export function isDirectMediaLikeUrl(rawUrl: string) {
  const extension = getExternalUrlExtension(rawUrl);
  return Boolean(extension && extensionToKind[extension] && extensionToKind[extension] !== "pdf");
}
