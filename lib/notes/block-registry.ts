// ---------------------------------------------------------------------------
// Note node registry: the node types v1 understands
// ---------------------------------------------------------------------------
//
// Node names follow the editor's document JSON (ProseMirror). Each entry says
// whether the node is a block or inline, whether it carries a block id, what
// it may contain, and how to coerce its attributes. Attribute keys a type does
// not list are kept as they are, so attributes added by a newer build survive.
//
// Additive: a shipped node type keeps its name and meaning. Types not listed
// here load as `unsupported` / `unsupportedInline` and round-trip unchanged.

import { RefStringSchema, formatRef } from "@/lib/refs/ref-grammar";

export type NoteAttrs = Record<string, unknown>;

export type NodeContent =
  /** Inline nodes and text. */
  | "inline"
  /** Plain text only, without marks (code). */
  | "text"
  /** Block nodes. */
  | "blocks"
  /** An atom: no content. */
  | "none";

export interface NoteNodeDef {
  kind: "block" | "inline";
  /** Carries a permanent block id in `attrs.id`. */
  hasId: boolean;
  content: NodeContent;
  /** For `blocks` content: the only child types allowed. */
  children?: readonly string[];
  /** A disallowed or loose child is wrapped in this type. */
  wrapWith?: string;
  /** Coerces the attributes this type defines; returns only those keys. */
  coerceAttrs?: (attrs: NoteAttrs) => NoteAttrs;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const intAtLeast = (value: unknown, min: number, fallback: number) =>
  typeof value === "number" && Number.isInteger(value) && value >= min ? value : fallback;

const stringOr = (value: unknown, fallback: string, max = 100_000) =>
  typeof value === "string" && value.length <= max ? value : fallback;

/** A canonical reference string, or null when the value is not a valid reference. */
export function canonicalRefOrNull(value: unknown): string | null {
  const parsed = RefStringSchema.safeParse(value);
  return parsed.success ? formatRef(parsed.data) : null;
}

const cellAttrs = (attrs: NoteAttrs): NoteAttrs => ({
  colspan: intAtLeast(attrs.colspan, 1, 1),
  rowspan: intAtLeast(attrs.rowspan, 1, 1),
  colwidth:
    Array.isArray(attrs.colwidth) && attrs.colwidth.every((width) => intAtLeast(width, 0, -1) >= 0)
      ? attrs.colwidth
      : null,
});

export const NOTE_NODE_TYPES: Readonly<Record<string, NoteNodeDef>> = {
  paragraph: { kind: "block", hasId: true, content: "inline" },
  heading: {
    kind: "block",
    hasId: true,
    content: "inline",
    coerceAttrs: (attrs) => {
      const level = intAtLeast(attrs.level, 1, 1);
      return { level: level <= 6 ? level : 1 };
    },
  },
  blockquote: { kind: "block", hasId: true, content: "blocks" },
  bulletList: { kind: "block", hasId: false, content: "blocks", children: ["listItem"], wrapWith: "listItem" },
  orderedList: {
    kind: "block",
    hasId: false,
    content: "blocks",
    children: ["listItem"],
    wrapWith: "listItem",
    coerceAttrs: (attrs) => ({ start: intAtLeast(attrs.start, 1, 1) }),
  },
  listItem: { kind: "block", hasId: true, content: "blocks" },
  taskList: { kind: "block", hasId: false, content: "blocks", children: ["taskItem"], wrapWith: "taskItem" },
  taskItem: {
    kind: "block",
    hasId: true,
    content: "blocks",
    coerceAttrs: (attrs) => ({ checked: attrs.checked === true }),
  },
  codeBlock: {
    kind: "block",
    hasId: true,
    content: "text",
    coerceAttrs: (attrs) => ({
      language: typeof attrs.language === "string" && attrs.language.length <= 64 ? attrs.language : null,
    }),
  },
  callout: {
    kind: "block",
    hasId: true,
    content: "blocks",
    // Any short string, so a variant added later is not coerced away.
    coerceAttrs: (attrs) => ({ variant: stringOr(attrs.variant, "info", 32) }),
  },
  details: {
    kind: "block",
    hasId: true,
    content: "blocks",
    children: ["detailsSummary", "detailsContent"],
    wrapWith: "detailsContent",
    coerceAttrs: (attrs) => ({ open: attrs.open === true }),
  },
  detailsSummary: { kind: "block", hasId: false, content: "inline" },
  detailsContent: { kind: "block", hasId: false, content: "blocks" },
  table: { kind: "block", hasId: true, content: "blocks", children: ["tableRow"], wrapWith: "tableRow" },
  tableRow: {
    kind: "block",
    hasId: false,
    content: "blocks",
    children: ["tableCell", "tableHeader"],
    wrapWith: "tableCell",
  },
  tableCell: { kind: "block", hasId: true, content: "blocks", coerceAttrs: cellAttrs },
  tableHeader: { kind: "block", hasId: true, content: "blocks", coerceAttrs: cellAttrs },
  horizontalRule: { kind: "block", hasId: false, content: "none" },
  embed: {
    kind: "block",
    hasId: true,
    content: "none",
    coerceAttrs: (attrs) => ({ ref: canonicalRefOrNull(attrs.ref) }),
  },
  blockMath: {
    kind: "block",
    hasId: true,
    content: "none",
    coerceAttrs: (attrs) => ({ latex: stringOr(attrs.latex, "") }),
  },
  citation: {
    kind: "block",
    hasId: true,
    content: "none",
    coerceAttrs: (attrs) => ({ ref: canonicalRefOrNull(attrs.ref), quote: stringOr(attrs.quote, "") }),
  },
  /** A block this build cannot show; `attrs.raw` is the original node, kept verbatim. */
  unsupported: { kind: "block", hasId: true, content: "none" },

  hardBreak: { kind: "inline", hasId: false, content: "none" },
  mention: {
    kind: "inline",
    hasId: false,
    content: "none",
    coerceAttrs: (attrs) => ({ ref: canonicalRefOrNull(attrs.ref), label: stringOr(attrs.label, "", 500) }),
  },
  inlineMath: {
    kind: "inline",
    hasId: false,
    content: "none",
    coerceAttrs: (attrs) => ({ latex: stringOr(attrs.latex, "") }),
  },
  /** An inline node this build cannot show; `attrs.raw` is the original node, kept verbatim. */
  unsupportedInline: { kind: "inline", hasId: false, content: "none" },
};

export function getNoteNodeDef(type: string): NoteNodeDef | undefined {
  return Object.hasOwn(NOTE_NODE_TYPES, type) ? NOTE_NODE_TYPES[type] : undefined;
}

/** Marks v1 understands. Unknown marks are kept verbatim. */
export const NOTE_MARK_TYPES = ["bold", "italic", "underline", "strike", "code", "highlight", "link"] as const;

/**
 * A link mark points at a URL (`href`) or at something in Studenv (`ref`).
 * `href` is kept as written: URLs are sanitised where they are rendered.
 */
export function coerceLinkMarkAttrs(attrs: NoteAttrs): NoteAttrs {
  return {
    href: typeof attrs.href === "string" && attrs.href.length <= 2048 ? attrs.href : null,
    ref: canonicalRefOrNull(attrs.ref),
  };
}
