// ---------------------------------------------------------------------------
// Reference links: where a reference opens in the app
// ---------------------------------------------------------------------------
//
// Client-safe. One `toUrl` per type that has a page today; a type gets its
// entry when its route ships (assets need a viewer route that takes a page
// or time). Until then, and for unknown types,
// `refToUrl` returns null rather than a link that would 404.

import type { Ref } from "./ref-grammar";
import { getRefType, noteRefType, workspaceRefType } from "./ref-types";

type ToUrl = (ref: Ref) => string;

const toUrlByType: Record<string, ToUrl | undefined> = {
  item: (ref) => `/shelf/${ref.id}`,
  // Block anchors become the URL fragment; the note page scrolls to the block.
  note: (ref) => `/notes/${ref.id}${ref.anchor !== undefined && noteRefType.parseAnchor?.(ref.anchor) ? `#${ref.anchor}` : ""}`,
  workspace: (ref) => {
    const anchor = ref.anchor !== undefined ? workspaceRefType.parseAnchor?.(ref.anchor) : null;
    return `/workspaces/${ref.id}${anchor ? `?focus=${encodeURIComponent(anchor.nodeId)}` : ""}`;
  },
};

/** Types `refToUrl` can link today. */
export function linkableRefTypes(): string[] {
  return Object.keys(toUrlByType).filter((type) => toUrlByType[type]).sort();
}

/**
 * The in-app URL for a canonical reference, or null when its type has no page
 * yet or is unknown. The id is already URL-safe (unreserved characters and
 * `%XX` escapes), so it is used as a path segment without re-encoding.
 */
export function refToUrl(ref: Ref): string | null {
  const def = getRefType(ref.type);
  if (!def || ref.id === "." || ref.id === "..") return null;
  const toUrl = toUrlByType[def.type];
  return toUrl ? toUrl(ref) : null;
}
