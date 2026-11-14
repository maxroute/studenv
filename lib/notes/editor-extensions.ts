// ---------------------------------------------------------------------------
// Editor schema for notes (TipTap / ProseMirror)
// ---------------------------------------------------------------------------
//
// Every node type in `block-registry.ts` exists here with the same name, and
// every type that carries a block id gets `attrs.id` from UniqueID (split
// keeps the first half's id, paste and duplicates get new ones). A test locks
// the two together. No React here, so the schema can be built in tests.

import { mergeAttributes, Node, type AnyExtension } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { BulletList, ListItem, ListKeymap, OrderedList, TaskItem, TaskList } from "@tiptap/extension-list";
import { TableKit } from "@tiptap/extension-table";
import { Details, DetailsContent, DetailsSummary } from "@tiptap/extension-details";
import Highlight from "@tiptap/extension-highlight";
import { Mathematics } from "@tiptap/extension-mathematics";
import { UniqueID } from "@tiptap/extension-unique-id";
import Mention from "@tiptap/extension-mention";
import Link from "@tiptap/extension-link";
import { Placeholder } from "@tiptap/extensions";
import type { SuggestionOptions } from "@tiptap/suggestion";
import { parseRef } from "@/lib/refs/ref-grammar";
import { refToUrl } from "@/lib/refs/ref-links";
import { generateBlockId } from "./block-ids";
import { NOTE_NODE_TYPES } from "./block-registry";

/** Node types that carry a permanent block id, straight from the registry. */
export const ID_NODE_TYPES = Object.entries(NOTE_NODE_TYPES)
  .filter(([, def]) => def.hasId)
  .map(([type]) => type);

const hrefFor = (ref: unknown) => {
  const parsed = parseRef(ref);
  return (parsed && refToUrl(parsed)) ?? null;
};

const Callout = Node.create({
  name: "callout",
  group: "block",
  content: "block+",
  defining: true,
  addAttributes() {
    return { variant: { default: "info", parseHTML: (el) => el.getAttribute("data-variant") ?? "info" } };
  },
  parseHTML() {
    return [{ tag: "div[data-callout]" }];
  },
  renderHTML({ HTMLAttributes, node }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-callout": "", "data-variant": node.attrs.variant, class: "note-callout" }), 0];
  },
});

/** A reference shown as a card. Links only when the target has a page. */
const Embed = Node.create({
  name: "embed",
  group: "block",
  atom: true,
  addAttributes() {
    return { ref: { default: null } };
  },
  parseHTML() {
    return [{ tag: "div[data-embed]" }];
  },
  renderHTML({ node }) {
    const href = hrefFor(node.attrs.ref);
    const label = String(node.attrs.ref ?? "Missing link");
    return ["div", { "data-embed": "", class: "note-embed" }, href ? ["a", { href }, label] : ["span", {}, label]];
  },
});

const Citation = Node.create({
  name: "citation",
  group: "block",
  atom: true,
  addAttributes() {
    return { ref: { default: null }, quote: { default: "" } };
  },
  parseHTML() {
    return [{ tag: "figure[data-citation]" }];
  },
  renderHTML({ node }) {
    const href = hrefFor(node.attrs.ref);
    const source = String(node.attrs.ref ?? "Unknown source");
    return [
      "figure",
      { "data-citation": "", class: "note-citation" },
      ["blockquote", {}, String(node.attrs.quote ?? "")],
      ["figcaption", {}, href ? ["a", { href }, source] : source],
    ];
  },
});

/** Content from a newer version, kept verbatim in `raw` and never edited here. */
const Unsupported = Node.create({
  name: "unsupported",
  group: "block",
  atom: true,
  selectable: true,
  addAttributes() {
    return { raw: { default: null, rendered: false } };
  },
  renderHTML() {
    return ["div", { class: "note-unsupported", contenteditable: "false" }, "This block was made with a newer version of Studenv."];
  },
});

const UnsupportedInline = Node.create({
  name: "unsupportedInline",
  group: "inline",
  inline: true,
  atom: true,
  addAttributes() {
    return { raw: { default: null, rendered: false } };
  },
  renderHTML() {
    return ["span", { class: "note-unsupported-inline", contenteditable: "false" }, "…"];
  },
});

/** Mentions store a reference, not a bare id, so any type can be mentioned. */
const NoteMention = Mention.extend({
  addAttributes() {
    return {
      ref: { default: null, parseHTML: (el) => el.getAttribute("data-ref") },
      label: { default: "", parseHTML: (el) => el.getAttribute("data-label") ?? el.textContent ?? "" },
    };
  },
  renderHTML({ node }) {
    const href = hrefFor(node.attrs.ref);
    const attrs = { "data-type": "mention", "data-ref": node.attrs.ref, "data-label": node.attrs.label, class: "note-mention" };
    return href ? ["a", { ...attrs, href }, `@${node.attrs.label}`] : ["span", attrs, `@${node.attrs.label}`];
  },
  renderText({ node }) {
    return `@${node.attrs.label}`;
  },
});

/** Links point at a URL (`href`) or at something in Studenv (`ref`). */
const NoteLink = Link.extend({
  addAttributes() {
    return { ...this.parent?.(), ref: { default: null } };
  },
});

export type NoteMentionItem = { ref: string; label: string };

export type NoteExtensionOptions = {
  generateId?: () => string;
  placeholder?: string;
  mentionSuggestion?: Omit<SuggestionOptions<NoteMentionItem>, "editor">;
};

export function createNoteExtensions(options: NoteExtensionOptions = {}): AnyExtension[] {
  return [
    StarterKit.configure({
      link: false,
      // Ordered/bullet lists, list items and keymaps come from the list kit below.
      bulletList: false,
      orderedList: false,
      listItem: false,
      listKeymap: false,
      codeBlock: { HTMLAttributes: { class: "note-code" } },
      heading: { levels: [1, 2, 3, 4, 5, 6] },
    }),
    NoteLink.configure({ openOnClick: false, autolink: true, HTMLAttributes: { rel: "noopener noreferrer nofollow", target: null } }),
    BulletList,
    OrderedList,
    ListItem,
    ListKeymap,
    TaskList,
    TaskItem.configure({ nested: true }),
    TableKit.configure({ table: { resizable: false } }),
    Details.configure({ persist: true, HTMLAttributes: { class: "note-details" } }),
    DetailsSummary,
    DetailsContent,
    Highlight,
    Mathematics.configure({ katexOptions: { throwOnError: false } }),
    Callout,
    Embed,
    Citation,
    Unsupported,
    UnsupportedInline,
    NoteMention.configure({
      HTMLAttributes: { class: "note-mention" },
      ...(options.mentionSuggestion ? { suggestion: options.mentionSuggestion } : {}),
    }),
    UniqueID.configure({
      types: ID_NODE_TYPES,
      attributeName: "id",
      generateID: options.generateId ?? generateBlockId,
    }),
    Placeholder.configure({ placeholder: options.placeholder ?? "Write, or type @ to link a note…" }),
  ];
}
