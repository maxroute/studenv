// ---------------------------------------------------------------------------
// Checking a note document before it is stored
// ---------------------------------------------------------------------------
//
// Structure is validated and normalised with the repair rules; text is never
// sanitised here (markup-looking text is just text, design doc §1.7).

import { extractNoteRefs, type NoteRef } from "./extract-refs";
import { NOTE_DOC_MAX_BYTES, NOTE_DOC_VERSION, parseNoteDoc, serializeNoteDoc } from "./note-format";
import { noteDocToPlainText } from "./plain-text";

export const NOTE_REFS_MAX = 2000;
export const NOTE_TITLE_MAX = 500;
export const NOTE_EXCERPT_LENGTH = 500;

export type PreparedNoteDoc = {
  docJson: string;
  docFormat: number;
  plainText: string;
  refs: NoteRef[];
};

export class NoteDocError extends Error {
  constructor(message: string, readonly status: 413 | 422) {
    super(message);
    this.name = "NoteDocError";
  }
}

/** Validates and normalises a document sent by a client. Throws NoteDocError. */
export function prepareNoteDoc(doc: unknown): PreparedNoteDoc {
  const parsed = parseNoteDoc(doc);
  if (parsed.warnings.some((warning) => warning.startsWith("unrecognised") || warning.startsWith("unreadable"))) {
    throw new NoteDocError("The note content is not a valid note document.", 422);
  }
  if (!parsed.canSave) {
    throw new NoteDocError("This note was written by a newer version of Studenv. Refresh to keep editing.", 422);
  }

  const docJson = serializeNoteDoc(parsed.envelope);
  if (new TextEncoder().encode(docJson).length > NOTE_DOC_MAX_BYTES) {
    throw new NoteDocError("The note is too large to save.", 413);
  }
  const refs = extractNoteRefs(parsed.envelope.doc);
  if (refs.length > NOTE_REFS_MAX) {
    throw new NoteDocError(`A note can hold at most ${NOTE_REFS_MAX} links.`, 422);
  }
  return { docJson, docFormat: NOTE_DOC_VERSION, plainText: noteDocToPlainText(parsed.envelope.doc), refs };
}

/** Title as stored: trimmed, one line, length-capped, "Untitled" when empty. */
export function normalizeNoteTitle(title: unknown): string {
  const text = typeof title === "string" ? title.replace(/\s+/g, " ").trim() : "";
  return text ? text.slice(0, NOTE_TITLE_MAX) : "Untitled";
}

export function noteExcerpt(plainText: string): string {
  const oneLine = plainText.replace(/\s+/g, " ").trim();
  return oneLine.length > NOTE_EXCERPT_LENGTH ? `${oneLine.slice(0, NOTE_EXCERPT_LENGTH - 1)}…` : oneLine;
}
