// ---------------------------------------------------------------------------
// Note document format: versioned envelope around the editor's JSON
// ---------------------------------------------------------------------------
//
// { "format": "studenv-note", "version": 1, "doc": { "type": "doc", "content": [...] } }
//
// `parseNoteDoc` never fails to load and never throws content away:
//  1. Unparseable JSON or a wrong envelope gives an empty doc holding an
//     `unsupported` block with the raw input.
//  2. An older version is migrated step by step.
//  3. A newer version (written by a newer build) loads read-only: never save it.
//  4. Unknown node types are wrapped as `unsupported` / `unsupportedInline`
//     with the original node; `serializeNoteDoc` writes the original back.
//  5. Missing or duplicate block ids get new ids (the first occurrence keeps
//     its id) and the doc is marked `repaired`, so the next save keeps the fix.
//  6. Bad attributes are coerced to defaults; unknown attribute keys are kept.
//
// Pure: no React, no Prisma.

import { generateBlockId, isBlockId } from "./block-ids";
import { coerceTextStyleAttrs } from "./text-styles";
import {
  NOTE_NODE_TYPES,
  coerceLinkMarkAttrs,
  getNoteNodeDef,
  isRecord,
  type NoteAttrs,
  type NoteNodeDef,
} from "./block-registry";

export const NOTE_DOC_FORMAT = "studenv-note";
export const NOTE_DOC_VERSION = 1;
/** Deepest nesting kept as editable nodes; anything deeper is kept verbatim as unsupported. */
export const NOTE_DOC_MAX_DEPTH = 64;
/** Largest serialised doc the note service accepts (checked where docs are saved). */
export const NOTE_DOC_MAX_BYTES = 2 * 1024 * 1024;

export type NoteMark = { type: string; attrs?: NoteAttrs };

export type NoteNode = {
  type: string;
  attrs?: NoteAttrs;
  content?: NoteNode[];
  marks?: NoteMark[];
  text?: string;
};

export type NoteDoc = { type: "doc"; content: NoteNode[] };

export type NoteDocEnvelope = { format: typeof NOTE_DOC_FORMAT; version: number; doc: NoteDoc };

export type ParsedNoteDoc = {
  envelope: NoteDocEnvelope;
  /** Something was fixed on load; the next save should persist it. */
  repaired: boolean;
  /** False for a doc written by a newer build: show it, never save it back. */
  canSave: boolean;
  warnings: string[];
};

export type ParseNoteDocOptions = { generateId?: () => string };

/**
 * Steps from version N to N + 1, keyed by N. Each is pure and tested. Empty
 * while only version 1 exists.
 */
const MIGRATIONS: Readonly<Record<number, (doc: unknown) => unknown>> = {};

export function createEmptyNoteDoc(generateId: () => string = generateBlockId): NoteDocEnvelope {
  return {
    format: NOTE_DOC_FORMAT,
    version: NOTE_DOC_VERSION,
    doc: { type: "doc", content: [{ type: "paragraph", attrs: { id: generateId() } }] },
  };
}

type Context = {
  generateId: () => string;
  usedIds: Set<string>;
  repaired: boolean;
  warnings: string[];
};

function repair(ctx: Context, warning: string) {
  ctx.repaired = true;
  if (!ctx.warnings.includes(warning)) ctx.warnings.push(warning);
}

/** Keeps the node's id when it is valid and unused; otherwise assigns a new one. */
function claimId(ctx: Context, candidate: unknown, report: boolean): string {
  if (isBlockId(candidate) && !ctx.usedIds.has(candidate)) {
    ctx.usedIds.add(candidate);
    return candidate;
  }
  let id = ctx.generateId();
  while (ctx.usedIds.has(id)) id = ctx.generateId();
  ctx.usedIds.add(id);
  if (report) repair(ctx, isBlockId(candidate) ? "duplicate block id replaced" : "missing block id assigned");
  return id;
}

function nodeIdOf(raw: unknown): unknown {
  return isRecord(raw) && isRecord(raw.attrs) ? raw.attrs.id : undefined;
}

function unsupportedBlock(ctx: Context, raw: unknown): NoteNode {
  // Wrapping changes nothing stored: the original is written back on save.
  return { type: "unsupported", attrs: { id: claimId(ctx, nodeIdOf(raw), false), raw } };
}

function unsupportedInline(raw: unknown): NoteNode {
  return { type: "unsupportedInline", attrs: { raw } };
}

function sameValue(a: unknown, b: unknown) {
  return a === b || JSON.stringify(a) === JSON.stringify(b);
}

function normalizeAttrs(ctx: Context, def: NoteNodeDef, raw: Record<string, unknown>): NoteAttrs {
  const original = isRecord(raw.attrs) ? raw.attrs : {};
  if (raw.attrs !== undefined && !isRecord(raw.attrs)) repair(ctx, "invalid attributes reset");
  const attrs: NoteAttrs = { ...original };
  if (def.coerceAttrs) {
    const coerced = def.coerceAttrs(original);
    for (const [key, value] of Object.entries(coerced)) {
      if (!sameValue(original[key], value)) repair(ctx, `attribute "${key}" coerced`);
      attrs[key] = value;
    }
  }
  return attrs;
}

function normalizeMarks(ctx: Context, raw: unknown, allowMarks: boolean): NoteMark[] | undefined {
  if (raw === undefined) return undefined;
  if (!allowMarks) {
    repair(ctx, "marks removed from code");
    return undefined;
  }
  if (!Array.isArray(raw)) {
    repair(ctx, "invalid marks removed");
    return undefined;
  }
  const marks: NoteMark[] = [];
  for (const entry of raw) {
    if (!isRecord(entry) || typeof entry.type !== "string" || (entry.attrs !== undefined && !isRecord(entry.attrs))) {
      repair(ctx, "invalid marks removed");
      continue;
    }
    if (entry.type === "link") {
      const original = isRecord(entry.attrs) ? entry.attrs : {};
      const attrs: NoteAttrs = { ...original };
      for (const [key, value] of Object.entries(coerceLinkMarkAttrs(original))) {
        // An absent key stays absent; only a bad value is replaced.
        if (original[key] === undefined && value === null) continue;
        if (!sameValue(original[key], value)) repair(ctx, "link mark coerced");
        attrs[key] = value;
      }
      marks.push({ type: "link", attrs });
      continue;
    }
    if (entry.type === "textStyle") {
      // Colour and font are written into a style attribute: only safe values survive.
      const original = isRecord(entry.attrs) ? entry.attrs : {};
      const attrs: NoteAttrs = { ...original };
      for (const [key, value] of Object.entries(coerceTextStyleAttrs(original))) {
        if (original[key] === undefined && value === null) continue;
        if (!sameValue(original[key], value)) repair(ctx, "text style coerced");
        attrs[key] = value;
      }
      if (Object.values(attrs).every((value) => value === null || value === undefined)) {
        repair(ctx, "empty text style removed");
        continue;
      }
      marks.push({ type: "textStyle", attrs });
      continue;
    }
    // Unknown and attribute-free marks are kept as they are.
    marks.push(entry.attrs !== undefined ? { type: entry.type, attrs: entry.attrs } : { type: entry.type });
  }
  return marks.length > 0 ? marks : undefined;
}

function normalizeText(ctx: Context, raw: Record<string, unknown>, allowMarks: boolean): NoteNode | null {
  if (typeof raw.text !== "string" || raw.text.length === 0) {
    repair(ctx, "empty text removed");
    return null;
  }
  const marks = normalizeMarks(ctx, raw.marks, allowMarks);
  return marks ? { type: "text", text: raw.text, marks } : { type: "text", text: raw.text };
}

function isInlineInput(raw: unknown): boolean {
  if (!isRecord(raw) || typeof raw.type !== "string") return false;
  if (raw.type === "text") return true;
  return getNoteNodeDef(raw.type)?.kind === "inline";
}

/** Normalises one known node; `def` is its registry entry. */
function normalizeKnown(ctx: Context, raw: Record<string, unknown>, type: string, def: NoteNodeDef, depth: number): NoteNode {
  const attrs = normalizeAttrs(ctx, def, raw);
  if (def.hasId) attrs.id = type === "unsupported" ? claimId(ctx, attrs.id, false) : claimId(ctx, attrs.id, true);

  const node: NoteNode = { type };
  if (Object.keys(attrs).length > 0) node.attrs = attrs;
  if (raw.marks !== undefined && def.kind === "inline") {
    const marks = normalizeMarks(ctx, raw.marks, true);
    if (marks) node.marks = marks;
  }

  const rawContent = raw.content;
  if (def.content === "none") {
    if (rawContent !== undefined) repair(ctx, `content removed from ${type}`);
    return node;
  }
  if (rawContent !== undefined && !Array.isArray(rawContent)) repair(ctx, "invalid content reset");
  const children = Array.isArray(rawContent) ? rawContent : [];
  const content =
    def.content === "blocks"
      ? normalizeBlocks(ctx, children, def, depth + 1)
      : normalizeInlines(ctx, children, def.content === "text", depth + 1);
  if (content.length > 0) node.content = content;
  return node;
}

function normalizeInlines(ctx: Context, children: unknown[], textOnly: boolean, depth: number): NoteNode[] {
  const result: NoteNode[] = [];
  for (const child of children) {
    if (!isRecord(child) || typeof child.type !== "string") {
      repair(ctx, "malformed node removed");
      continue;
    }
    if (child.type === "text") {
      const text = normalizeText(ctx, child, !textOnly);
      if (text) result.push(text);
      continue;
    }
    if (textOnly) {
      // Code holds plain text: keep the node's text, not the node.
      repair(ctx, "non-text content removed from code");
      continue;
    }
    const def = getNoteNodeDef(child.type);
    if (!def || def.kind !== "inline" || depth > NOTE_DOC_MAX_DEPTH) {
      result.push(unsupportedInline(child));
      continue;
    }
    result.push(normalizeKnown(ctx, child, child.type, def, depth));
  }
  return result;
}

function wrapIn(ctx: Context, wrapperType: string, child: NoteNode): NoteNode {
  const wrapper: NoteNode = { type: wrapperType, content: [child] };
  const def = getNoteNodeDef(wrapperType);
  if (def?.coerceAttrs) wrapper.attrs = def.coerceAttrs({});
  if (def?.hasId) wrapper.attrs = { ...wrapper.attrs, id: claimId(ctx, undefined, false) };
  return wrapper;
}

function emptyParagraph(ctx: Context): NoteNode {
  return { type: "paragraph", attrs: { id: claimId(ctx, undefined, false) } };
}

function normalizeBlocks(ctx: Context, children: unknown[], parent: NoteNodeDef | null, depth: number): NoteNode[] {
  const result: NoteNode[] = [];
  let looseInline: unknown[] = [];

  const placeBlock = (node: NoteNode) => {
    if (parent?.children && !parent.children.includes(node.type)) {
      if (parent.wrapWith) {
        repair(ctx, `${node.type} wrapped in ${parent.wrapWith}`);
        result.push(wrapIn(ctx, parent.wrapWith, node));
        return;
      }
    }
    result.push(node);
  };

  const flushInline = () => {
    if (looseInline.length === 0) return;
    repair(ctx, "loose inline content wrapped in a paragraph");
    const paragraph: NoteNode = { type: "paragraph", attrs: { id: claimId(ctx, undefined, false) } };
    const content = normalizeInlines(ctx, looseInline, false, depth + 1);
    if (content.length > 0) paragraph.content = content;
    looseInline = [];
    placeBlock(paragraph);
  };

  for (const child of children) {
    if (!isRecord(child) || typeof child.type !== "string") {
      flushInline();
      repair(ctx, "malformed node removed");
      continue;
    }
    if (isInlineInput(child)) {
      looseInline.push(child);
      continue;
    }
    flushInline();
    const def = getNoteNodeDef(child.type);
    if (!def || depth > NOTE_DOC_MAX_DEPTH) {
      placeBlock(unsupportedBlock(ctx, child));
      continue;
    }
    placeBlock(normalizeKnown(ctx, child, child.type, def, depth));
  }
  flushInline();

  // Containers are never empty: an editor cannot hold an empty list item or cell.
  if (result.length === 0 && parent !== null) {
    // Persisted on the next save, so the filler's ids stay stable.
    repair(ctx, "empty container filled");
    let filler = emptyParagraph(ctx);
    if (parent.wrapWith) {
      // Walk the wrapper chain down to something that holds a paragraph.
      const chain: string[] = [];
      for (let type: string | undefined = parent.wrapWith; type; type = getNoteNodeDef(type)?.wrapWith) {
        chain.push(type);
        if (chain.length > 4) break;
      }
      for (const type of chain.reverse()) filler = wrapIn(ctx, type, filler);
    }
    result.push(filler);
  }
  return result;
}

function wrongEnvelope(ctx: Context, raw: unknown, warning: string): NoteDocEnvelope {
  repair(ctx, warning);
  return {
    format: NOTE_DOC_FORMAT,
    version: NOTE_DOC_VERSION,
    doc: { type: "doc", content: [{ type: "unsupported", attrs: { id: claimId(ctx, undefined, false), raw } }] },
  };
}

/** Loads a stored note document. Accepts the JSON string or an already-parsed value. */
export function parseNoteDoc(input: unknown, options: ParseNoteDocOptions = {}): ParsedNoteDoc {
  const ctx: Context = {
    generateId: options.generateId ?? generateBlockId,
    usedIds: new Set(),
    repaired: false,
    warnings: [],
  };
  const done = (envelope: NoteDocEnvelope, canSave = true): ParsedNoteDoc => ({
    envelope,
    repaired: ctx.repaired,
    canSave,
    warnings: ctx.warnings,
  });

  let value: unknown = input;
  if (typeof input === "string") {
    try {
      value = JSON.parse(input);
    } catch {
      return done(wrongEnvelope(ctx, input, "unreadable document kept as raw text"));
    }
  }

  if (
    !isRecord(value) ||
    value.format !== NOTE_DOC_FORMAT ||
    typeof value.version !== "number" ||
    !Number.isInteger(value.version) ||
    value.version < 1 ||
    !isRecord(value.doc) ||
    value.doc.type !== "doc"
  ) {
    return done(wrongEnvelope(ctx, input, "unrecognised document kept as raw data"));
  }

  let doc: unknown = value.doc;
  const newer = value.version > NOTE_DOC_VERSION;
  if (newer) {
    ctx.warnings.push("written by a newer version: read-only");
  } else {
    for (let version = value.version; version < NOTE_DOC_VERSION; version += 1) {
      const step = MIGRATIONS[version];
      if (!step) return done(wrongEnvelope(ctx, input, `no migration from version ${version}`));
      doc = step(doc);
      repair(ctx, `migrated from version ${version}`);
    }
  }

  const rawContent = isRecord(doc) && Array.isArray(doc.content) ? doc.content : [];
  if (isRecord(doc) && doc.content !== undefined && !Array.isArray(doc.content)) repair(ctx, "invalid content reset");
  const content = normalizeBlocks(ctx, rawContent, null, 1);
  if (content.length === 0) {
    repair(ctx, "empty document given a paragraph");
    content.push(emptyParagraph(ctx));
  }

  const envelope: NoteDocEnvelope = { format: NOTE_DOC_FORMAT, version: NOTE_DOC_VERSION, doc: { type: "doc", content } };
  return done(envelope, !newer);
}

/** Puts back what `unsupported` wrappers hold, so content from newer builds round-trips unchanged. */
function unwrap(node: NoteNode): unknown {
  if ((node.type === "unsupported" || node.type === "unsupportedInline") && isRecord(node.attrs)) {
    const raw = node.attrs.raw;
    if (isRecord(raw) && typeof raw.type === "string") return raw;
  }
  if (!node.content) return node;
  return { ...node, content: node.content.map(unwrap) };
}

/** The stored JSON for a document. Never call it for a doc loaded with `canSave: false`. */
export function serializeNoteDoc(envelope: NoteDocEnvelope): string {
  return JSON.stringify({
    format: NOTE_DOC_FORMAT,
    version: NOTE_DOC_VERSION,
    doc: { type: "doc", content: envelope.doc.content.map(unwrap) },
  });
}

/** Every node, depth first, with the id of its nearest enclosing block ("" at the top level). */
export function* walkNoteNodes(
  nodes: readonly NoteNode[],
  blockId = "",
): Generator<{ node: NoteNode; blockId: string }> {
  for (const node of nodes) {
    const id = node.attrs?.id;
    const ownId = getNoteNodeDef(node.type)?.hasId && isBlockId(id) ? id : blockId;
    yield { node, blockId: ownId };
    if (node.content) yield* walkNoteNodes(node.content, ownId);
  }
}

/** Registered node type names, for tests and the editor schema. */
export const noteNodeTypes = () => Object.keys(NOTE_NODE_TYPES).sort();
