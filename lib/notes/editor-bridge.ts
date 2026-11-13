// ---------------------------------------------------------------------------
// Stored note documents <-> editor content
// ---------------------------------------------------------------------------
//
// The editor (ProseMirror) throws on mark types it does not know and drops
// attributes its schema does not declare. Content written by a newer build can
// contain both. Rather than lose them on the next save, such a document opens
// read-only: `lossless` is false and the caller must not save it.

import type { Schema } from "@tiptap/pm/model";
import { isRecord } from "./block-registry";
import { NOTE_DOC_FORMAT, NOTE_DOC_VERSION, type NoteDoc, type NoteDocEnvelope, type NoteNode } from "./note-format";

export type EditorJSON = { type: string; attrs?: Record<string, unknown>; content?: EditorJSON[]; marks?: Array<{ type: string; attrs?: Record<string, unknown> }>; text?: string };

export type EditorContent = { content: EditorJSON; lossless: boolean };

/**
 * The document as the editor can hold it. Unknown marks and undeclared
 * attributes are left out of the editor copy and reported through `lossless`.
 */
export function toEditorContent(doc: NoteDoc, schema: Schema): EditorContent {
  let lossless = true;

  const convert = (node: NoteNode): EditorJSON | null => {
    if (node.type === "text") {
      const marks = (node.marks ?? []).flatMap((mark) => {
        const markType = schema.marks[mark.type];
        if (!markType) {
          lossless = false;
          return [];
        }
        const attrs = keepDeclared(mark.attrs, markType.spec.attrs);
        return [attrs ? { type: mark.type, attrs } : { type: mark.type }];
      });
      return { type: "text", text: node.text ?? "", ...(marks.length ? { marks } : {}) };
    }

    const nodeType = schema.nodes[node.type];
    if (!nodeType) {
      // parseNoteDoc wraps unknown types, so this only guards against a registry/schema mismatch.
      lossless = false;
      return null;
    }
    const json: EditorJSON = { type: node.type };
    const attrs = keepDeclared(node.attrs, nodeType.spec.attrs);
    if (attrs) json.attrs = attrs;
    if (node.marks?.length) {
      const marks = node.marks.filter((mark) => {
        const known = Boolean(schema.marks[mark.type]);
        if (!known) lossless = false;
        return known;
      });
      if (marks.length) json.marks = marks;
    }
    if (node.content) json.content = node.content.map(convert).filter((child): child is EditorJSON => child !== null);
    return json;
  };

  function keepDeclared(attrs: Record<string, unknown> | undefined, declared: unknown) {
    if (!attrs) return undefined;
    const allowed = isRecord(declared) ? declared : {};
    const kept: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(attrs)) {
      if (Object.hasOwn(allowed, key)) kept[key] = value;
      else if (value !== null && value !== undefined) lossless = false;
    }
    return Object.keys(kept).length ? kept : undefined;
  }

  const content = doc.content.map(convert).filter((child): child is EditorJSON => child !== null);
  return { content: { type: "doc", content }, lossless };
}

/** Wraps the editor's JSON in the stored envelope (the server normalises it again). */
export function fromEditorJSON(json: EditorJSON): NoteDocEnvelope {
  const content = Array.isArray(json.content) ? (json.content as NoteNode[]) : [];
  return { format: NOTE_DOC_FORMAT, version: NOTE_DOC_VERSION, doc: { type: "doc", content } };
}
