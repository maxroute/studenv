"use client";

import type { Editor } from "@tiptap/react";
import type { Mark, Node as ProseMirrorNode } from "@tiptap/pm/model";
import { create } from "zustand";
import { LOCKED_BLOCK_TYPES } from "@/lib/rangan/page";
import type { PageToolBlock } from "@/lib/rangan/page-ops";

/**
 * The page open in front of the student, for Rangan: its editor, so Rangan
 * can read the page as it is right now and apply a change the student
 * approved through the editor (one undo step, normal autosave). Only an
 * editable page registers; a read-only page (trash, newer format) never does.
 */
type OpenPage = {
  noteId: string;
  title: string;
  editor: Editor;
  saveNow: () => Promise<unknown>;
  /** Renames the page as typing in its title does. */
  rename?: (title: string) => void;
};

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
const LIST_TYPES = new Set(["bulletList", "orderedList", "taskList"]);

/**
 * A top-level block's id. Lists have no id of their own (their items do), so
 * a list is named by its first item: "list:<id>".
 */
export function blockKey(node: ProseMirrorNode, index: number): string {
  if (typeof node.attrs.id === "string" && node.attrs.id) return node.attrs.id;
  const first = node.firstChild;
  if (LIST_TYPES.has(node.type.name) && first && typeof first.attrs.id === "string" && first.attrs.id) return `list:${first.attrs.id}`;
  return `at:${index}`;
}

/** A block's plain text, the way words are found in it (textblocks joined by new lines). */
export function blockText(node: ProseMirrorNode): string {
  return node.textBetween(0, node.content.size, "\n", " ");
}

const wrap = (text: string, marks: readonly Mark[]) => {
  let out = text;
  const has = (name: string) => marks.some((mark) => mark.type.name === name);
  if (has("code")) out = `\`${out}\``;
  if (has("bold")) out = `**${out}**`;
  if (has("italic")) out = `*${out}*`;
  if (has("highlight")) out = `==${out}==`;
  if (has("strike")) out = `~~${out}~~`;
  const link = marks.find((mark) => mark.type.name === "link");
  if (link && typeof link.attrs.href === "string") out = `[${out}](${link.attrs.href})`;
  return out;
};

/** The block's text with bold, italic, highlight, strike, code and links in light Markdown, for Rangan to read. */
function markedText(node: ProseMirrorNode): string {
  const lines: string[] = [];
  node.descendants((child) => {
    if (!child.isTextblock) return true;
    let line = "";
    child.forEach((inline) => {
      if (inline.isText) line += wrap(inline.text ?? "", inline.marks);
      else if (inline.type.name === "mention") line += `@${String(inline.attrs.label ?? "page")}`;
      else line += " ";
    });
    lines.push(line);
    return false;
  });
  if (node.isTextblock) {
    let line = "";
    node.forEach((inline) => {
      line += inline.isText ? wrap(inline.text ?? "", inline.marks) : " ";
    });
    return line;
  }
  return lines.join("\n");
}

/** The page's top-level blocks as Rangan sees them: id, type, text, formatting, and whether Rangan may rewrite them. */
export function pageBlocks(editor: Editor): PageToolBlock[] {
  const blocks: PageToolBlock[] = [];
  let index = 0;
  editor.state.doc.forEach((node) => {
    const type = node.type.name;
    const text = type === "pdfPage" ? `${String(node.attrs.title ?? "PDF")} p. ${String(node.attrs.page ?? "")}` : blockText(node);
    const marked = type === "pdfPage" ? text : markedText(node);
    blocks.push({
      id: blockKey(node, index),
      type,
      text: text.slice(0, BLOCK_TEXT_MAX),
      ...(marked !== text ? { marked: marked.slice(0, BLOCK_TEXT_MAX) } : {}),
      locked: LOCKED_BLOCK_TYPES.has(type),
    });
    index += 1;
  });
  return blocks.slice(0, 400);
}

/** The text the student has selected on the page, and the block it starts in; null with no selection. */
export function pageSelection(editor: Editor): { block: string; text: string } | null {
  const { from, to, empty } = editor.state.selection;
  if (empty) return null;
  const text = editor.state.doc.textBetween(from, to, "\n", " ").trim();
  if (!text) return null;
  const $from = editor.state.doc.resolve(from);
  const top = $from.node(1);
  if (!top) return null;
  return { block: blockKey(top, $from.index(0)), text: text.slice(0, 2_000) };
}
