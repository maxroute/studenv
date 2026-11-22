"use client";

import { pageBlocks, useOpenPage } from "@/hooks/use-open-page";
import { toEditorContent } from "@/lib/notes/editor-bridge";
import { markdownToNote } from "@/lib/notes/markdown-to-note";
import { NOTE_DOC_FORMAT, NOTE_DOC_VERSION, parseNoteDoc, type NoteNode } from "@/lib/notes/note-format";
import { bottomUp, citationNodes, draftEmbeds, embedsToShelf, pageFromDraft, pageUnchanged, type PageBlock, type PageChange, type PageCitation } from "@/lib/rangan/page";
import { saveLinkToShelf } from "@/components/notes/resource-actions";
import { reportUsage } from "@/lib/client/usage-bus";

// Creating a page Rangan wrote, and applying a change Rangan suggested to the
// open page. Both happen only when the student taps the button for them.

type Result = { ok: true; noteId?: string } | { ok: false; message: string };

async function post<T>(url: string, body?: unknown): Promise<{ ok: boolean; data?: T; error?: string }> {
  try {
    const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const json = await response.json().catch(() => null);
    reportUsage(json);
    return { ok: response.ok && Boolean(json?.ok), data: json?.data, error: json?.error };
  } catch {
    return { ok: false, error: "You seem to be offline. Check your connection and try again." };
  }
}

const envelope = (blocks: NoteNode[]) => ({ format: NOTE_DOC_FORMAT, version: NOTE_DOC_VERSION, doc: { type: "doc" as const, content: blocks } });

/** Creates the page as an ordinary top-level page, through the same route as "New page". */
export async function createPageFromDraft(draft: { title: string; markdown: string; citations: readonly PageCitation[] }): Promise<Result> {
  // Videos and links shown as cards are saved to the Shelf first, as "/Link, video or PDF" does;
  // one that can't be saved is left out rather than stopping the page.
  const items = new Map<string, string>();
  for (const url of draftEmbeds(draft.markdown)) {
    const saved = await saveLinkToShelf(url);
    if (saved.ok) items.set(url, saved.itemId);
  }
  const page = pageFromDraft({ ...draft, markdown: embedsToShelf(draft.markdown, items) });
  const result = await post<{ id: string }>("/api/notes", { title: page.title, parentId: null, doc: envelope(page.blocks) });
  if (!result.ok || typeof result.data?.id !== "string") return { ok: false, message: result.error ?? "The page could not be created." };
  return { ok: true, noteId: result.data.id };
}

/** Makes flashcards from a page, as the Flashcards screen does. Uses one Rangan question. */
export async function flashcardsFromPage(noteId: string): Promise<{ ok: true; created: number } | { ok: false; message: string }> {
  const result = await post<{ created: number }>("/api/study/flashcards", { ref: `note:${noteId}` });
  if (!result.ok || typeof result.data?.created !== "number") return { ok: false, message: result.error ?? "Flashcards could not be made." };
  return { ok: true, created: result.data.created };
}

/**
 * Applies an approved change to the open page. It refuses when that page
 * isn't open or has changed where the change lands since Rangan planned
 * it. Otherwise it saves the current text as a version in History first,
 * then applies every part of the change as one editor step (one Undo).
 */
export async function applyPageEdit(edit: { pageRef: string; changes: readonly PageChange[]; citations: readonly PageCitation[] }, planned: readonly PageBlock[]): Promise<Result> {
  const open = useOpenPage.getState().page;
  if (!open || `note:${open.noteId}` !== edit.pageRef) return { ok: false, message: "Open that page to apply this change." };
  if (!open.editor.isEditable) return { ok: false, message: "This page can't be edited right now." };
  if (!pageUnchanged(planned, pageBlocks(open.editor), edit.changes)) {
    return { ok: false, message: "The page changed where this edit goes. Ask Rangan again so it works on the latest text." };
  }

  // A version to go back to, kept in the page's History.
  await open.saveNow();
  const version = await post(`/api/notes/${encodeURIComponent(open.noteId)}/revisions`);
  if (!version.ok) return { ok: false, message: version.error ?? "Your current text couldn't be saved as a version, so nothing was changed." };

  const byNumber = new Map(edit.citations.map((citation) => [citation.n, citation]));
  const { editor } = open;
  const { schema } = editor;
  const toEditorNodes = (markdown: string) => {
    // Inside a page, a "# " heading is a section heading, not the page title.
    const { blocks } = markdownToNote(markdown.replace(/^(\s*)#\s/, "$1## "), {
      citation: (n) => {
        const citation = byNumber.get(n);
        return citation ? citationNodes(citation) : null;
      },
    });
    const parsed = parseNoteDoc(JSON.stringify(envelope(blocks)));
    const { content } = toEditorContent(parsed.envelope.doc, schema);
    return (content.content ?? []).map((json) => schema.nodeFromJSON(json));
  };

  const tr = editor.state.tr;
  for (const change of bottomUp(edit.changes)) {
    const doc = tr.doc;
    const offsets: number[] = [];
    let position = 0;
    doc.forEach((child) => {
      offsets.push(position);
      position += child.nodeSize;
    });
    const endOf = (n: number) => offsets[n - 1] + doc.child(n - 1).nodeSize;
    const nodes = toEditorNodes(change.markdown);
    if (nodes.length === 0) continue;
    if (change.kind === "replace") tr.replaceWith(offsets[change.from - 1], endOf(change.to), nodes);
    else tr.insert(change.after === 0 ? 0 : endOf(change.after), nodes);
  }
  editor.view.dispatch(tr.scrollIntoView());
  return { ok: true };
}
