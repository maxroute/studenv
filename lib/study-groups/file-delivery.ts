/**
 * How a group chat file is sent back to the browser. Pure helpers, no I/O.
 *
 * Files are served from this app's own origin (`/group-files/...`), so a file
 * type a browser could run as a page (HTML, SVG, XML, scripts) must never be
 * shown inline: it is always a download.
 */

/** Types that are safe to show in the browser tab. Everything else downloads. */
const INLINE_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/avif",
  "text/plain",
]);

function isInlineType(mimeType: string) {
  return (
    INLINE_TYPES.has(mimeType) ||
    /^video\/[a-z0-9.+-]+$/.test(mimeType) ||
    /^audio\/[a-z0-9.+-]+$/.test(mimeType)
  );
}

/** A file name safe for a header: no quotes, slashes or control characters. */
function headerSafeName(name: string) {
  const cleaned = name
    .replace(/[\u0000-\u001f\u007f"\\/]/g, "_")
    .trim()
    .slice(0, 180);
  return cleaned || "shared-file";
}

/** RFC 5987 encoding: encodeURIComponent leaves ' ( ) * as they are. */
function encodeHeaderValue(value: string) {
  return encodeURIComponent(value).replace(
    /['()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

/**
 * The Content-Type and Content-Disposition for a stored file.
 * `download` asks for a download even when the type could be shown inline.
 */
export function fileResponseHeaders(input: {
  name: string;
  mimeType: string;
  download: boolean;
}) {
  const mimeType = input.mimeType.trim().toLowerCase();
  const inline = !input.download && isInlineType(mimeType);
  const name = headerSafeName(input.name);
  const asciiName = name.replace(/[^\x20-\x7e]/g, "_");
  const disposition = `${inline ? "inline" : "attachment"}; filename="${asciiName}"; filename*=UTF-8''${encodeHeaderValue(name)}`;

  return {
    // Plain text is shown as UTF-8 so Bengali or Hindi notes read correctly.
    contentType: !inline
      ? "application/octet-stream"
      : mimeType === "text/plain"
        ? "text/plain; charset=utf-8"
        : mimeType,
    disposition,
    inline,
  };
}

export type ByteRange =
  | { kind: "full" }
  | { kind: "partial"; start: number; end: number }
  | { kind: "unsatisfiable" };

/** Reads a `Range: bytes=...` header for a file of `size` bytes (one range only). */
export function parseByteRange(header: string | null, size: number): ByteRange {
  if (!header) {
    return { kind: "full" };
  }

  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || size <= 0 || (match[1] === "" && match[2] === "")) {
    return { kind: "unsatisfiable" };
  }

  let start: number;
  let end: number;

  if (match[1] === "") {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) {
      return { kind: "unsatisfiable" };
    }
    start = Math.max(size - suffix, 0);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] === "" ? size - 1 : Number(match[2]);
  }

  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    start >= size ||
    end < start
  ) {
    return { kind: "unsatisfiable" };
  }

  return { kind: "partial", start, end: Math.min(end, size - 1) };
}

/** The address a group member opens a chat file at. It never expires. */
export function groupFileUrl(groupId: string, attachmentId: string) {
  return `/group-files/${encodeURIComponent(groupId)}/${encodeURIComponent(attachmentId)}`;
}

/** The same file, asked for as a download. */
export function groupFileDownloadUrl(url: string) {
  return `${url}${url.includes("?") ? "&" : "?"}download=1`;
}
