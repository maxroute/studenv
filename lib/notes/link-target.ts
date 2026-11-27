/** Where a link in a page goes: a web address (new tab) or a place in Studenv (same tab). */
import { parseRef } from "@/lib/refs/ref-grammar";
import { refToUrl } from "@/lib/refs/ref-links";

export type LinkTarget = { kind: "web"; url: string; label: string } | { kind: "app"; url: string; label: string };

/** Only http, https and mailto open; anything else ("javascript:", "data:") is ignored. */
export function linkTarget(attrs: { href?: unknown; ref?: unknown }): LinkTarget | null {
  const ref = parseRef(attrs.ref);
  const inApp = ref ? refToUrl(ref) : null;
  if (inApp) return { kind: "app", url: inApp, label: "Studenv" };
  if (typeof attrs.href !== "string") return null;
  // A path in Studenv ("/notes/…"), never "//elsewhere.com".
  if (/^\/(?!\/)/.test(attrs.href)) return { kind: "app", url: attrs.href, label: "Studenv" };
  try {
    const url = new URL(attrs.href);
    if (url.protocol === "mailto:") return { kind: "web", url: url.href, label: url.pathname };
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return { kind: "web", url: url.href, label: url.hostname.replace(/^www\./, "") };
  } catch {
    return null;
  }
}
