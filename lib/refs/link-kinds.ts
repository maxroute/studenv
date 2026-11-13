// ---------------------------------------------------------------------------
// Link kinds: how a source points at a target
// ---------------------------------------------------------------------------
//
// Stored as plain strings (never a database enum), so a new kind is a code
// change only. Additive: a shipped kind keeps its meaning.

export const LINK_KINDS = ["mention", "link", "citation", "embed", "card", "source"] as const;

export type LinkKind = (typeof LINK_KINDS)[number];

export function isLinkKind(value: unknown): value is LinkKind {
  return LINK_KINDS.some((kind) => kind === value);
}
