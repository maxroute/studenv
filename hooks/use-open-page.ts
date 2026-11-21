"use client";

import type { Editor } from "@tiptap/react";
import { create } from "zustand";
import { LOCKED_BLOCK_TYPES, type PageBlock } from "@/lib/rangan/page";

/**
 * The page open in front of the student, for Rangan: its editor, so Rangan
 * can read the page as it is right now and apply a change the student
 * approved through the editor (one undo step, normal autosave). Only an
 * editable page registers; a read-only page (trash, newer format) never does.
 */
type OpenPage = { noteId: string; title: string; editor: Editor; saveNow: () => Promise<unknown> };

type OpenPageState = {
  page: OpenPage | null;
  register: (page: OpenPage) => void;
  unregister: (noteId: string, editor: Editor) => void;
};

export const useOpenPage = create<OpenPageState>((set, get) => ({
  page: null,
  register: (page) => set({ page }),
  unregister: (noteId, editor) => {
    const current = get().page;
    if (current && current.noteId === noteId && current.editor === editor) set({ page: null });
  },
}));

/** Characters of one block sent to Rangan. */
const BLOCK_TEXT_MAX = 4_000;

/** The page's top-level blocks as Rangan sees them: type, text, and whether Rangan may rewrite them. */
export function pageBlocks(editor: Editor): PageBlock[] {
  const blocks: PageBlock[] = [];
  editor.state.doc.forEach((node) => {
    const type = node.type.name;
    const text = type === "pdfPage" ? `${String(node.attrs.title ?? "PDF")} p. ${String(node.attrs.page ?? "")}` : node.textBetween(0, node.content.size, "\n", " ");
    blocks.push({ type, text: text.slice(0, BLOCK_TEXT_MAX), locked: LOCKED_BLOCK_TYPES.has(type) });
  });
  return blocks.slice(0, 400);
}
