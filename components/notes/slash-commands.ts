"use client";

import type { Editor, Range } from "@tiptap/core";
import type { SuggestionOptions } from "@tiptap/suggestion";
import type { SlashCommandItem } from "@/lib/notes/editor-extensions";
import { popupRenderer } from "./suggestion-popup";
import { insertEquation } from "./editor-actions";

export type SlashContext = {
  /** Creates a sub-page of this note and returns its id and title, or null. */
  createSubPage: () => Promise<{ id: string; title: string } | null>;
  /** Makes a flashcard from the current block. */
  makeFlashcard: (editor: Editor) => void;
  /** Bring resources in: pick from the Shelf, add a link, upload a file. */
  embedFromShelf?: (editor: Editor) => void;
  embedFromUrl?: (editor: Editor) => void;
  uploadFile?: (editor: Editor) => void;
};

const chainAt = (editor: Editor, range: Range) => editor.chain().focus().deleteRange(range);

export function slashCommands(context: SlashContext): SlashCommandItem[] {
  return [
    { id: "text", title: "Text", description: "Plain paragraph", keywords: ["paragraph", "p"], badge: "¶", group: "Basic blocks", run: (e, r) => chainAt(e, r).setParagraph().run() },
    { id: "h1", title: "Heading 1", description: "Big section heading", keywords: ["title", "h1", "#"], badge: "H1", group: "Basic blocks", run: (e, r) => chainAt(e, r).setHeading({ level: 1 }).run() },
    { id: "h2", title: "Heading 2", description: "Medium section heading", keywords: ["subtitle", "h2", "##"], badge: "H2", group: "Basic blocks", run: (e, r) => chainAt(e, r).setHeading({ level: 2 }).run() },
    { id: "h3", title: "Heading 3", description: "Small section heading", keywords: ["h3", "###"], badge: "H3", group: "Basic blocks", run: (e, r) => chainAt(e, r).setHeading({ level: 3 }).run() },
    { id: "bullet", title: "Bulleted list", description: "A simple list", keywords: ["ul", "unordered", "-"], badge: "•", group: "Basic blocks", run: (e, r) => chainAt(e, r).toggleBulletList().run() },
    { id: "numbered", title: "Numbered list", description: "A list with numbers", keywords: ["ol", "ordered", "1."], badge: "1.", group: "Basic blocks", run: (e, r) => chainAt(e, r).toggleOrderedList().run() },
    { id: "todo", title: "To-do list", description: "Track tasks with checkboxes", keywords: ["todo", "task", "checkbox", "check", "checklist", "[]"], badge: "☑", group: "Basic blocks", run: (e, r) => chainAt(e, r).toggleTaskList().run() },
    { id: "toggle", title: "Toggle", description: "Hide content inside a collapsible section", keywords: ["details", "collapse", "fold", "dropdown", "accordion"], badge: "▸", group: "Basic blocks", run: (e, r) => chainAt(e, r).setDetails().run() },
    { id: "quote", title: "Quote", description: "Capture a quotation", keywords: ["blockquote", ">"], badge: "❝", group: "Basic blocks", run: (e, r) => chainAt(e, r).toggleBlockquote().run() },
    { id: "callout", title: "Callout", description: "Make a page stand out", keywords: ["info", "note", "tip", "warning"], badge: "💡", group: "Basic blocks", run: (e, r) => chainAt(e, r).insertContent({ type: "callout", content: [{ type: "paragraph" }] }).run() },
    { id: "divider", title: "Divider", description: "Separate sections", keywords: ["hr", "line", "separator", "---"], badge: "—", group: "Basic blocks", run: (e, r) => chainAt(e, r).setHorizontalRule().run() },
    { id: "code", title: "Code", description: "Code block with monospace text", keywords: ["snippet", "```", "pre"], badge: "</>", group: "Advanced", run: (e, r) => chainAt(e, r).toggleCodeBlock().run() },
    { id: "table", title: "Table", description: "Rows and columns", keywords: ["grid", "columns"], badge: "▦", group: "Advanced", run: (e, r) => chainAt(e, r).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
    {
      id: "equation", title: "Equation", description: "Block equation in LaTeX", keywords: ["math", "latex", "formula", "katex"], badge: "∑", group: "Advanced",
      run: (e, r) => void insertEquation(e, "block", r),
    },
    {
      id: "inline-equation", title: "Inline equation", description: "Math inside a sentence", keywords: ["math", "latex", "inline"], badge: "x²", group: "Advanced",
      run: (e, r) => void insertEquation(e, "inline", r),
    },
    { id: "link", title: "Link to page", description: "Mention a page, resource or workspace", keywords: ["mention", "@", "page", "resource"], badge: "@", group: "Linking", run: (e, r) => chainAt(e, r).insertContent("@").run() },
    {
      id: "subpage", title: "Sub-page", description: "Create a page inside this one and link it here", keywords: ["page", "child", "nested", "new"], badge: "📄", group: "Linking",
      run: (e, r) => {
        chainAt(e, r).run();
        void context.createSubPage().then((page) => {
          if (page) e.chain().focus().insertContent([{ type: "mention", attrs: { ref: `note:${page.id}`, label: page.title } }, { type: "text", text: " " }]).run();
        });
      },
    },
    ...(context.embedFromShelf
      ? [{
          id: "shelf", title: "Shelf resource", description: "Show a PDF, video or article from your Shelf", keywords: ["pdf", "resource", "embed", "library", "shelf", "video", "article"], badge: "📚", group: "Media",
          run: (e: Editor, r: Range) => {
            chainAt(e, r).run();
            context.embedFromShelf?.(e);
          },
        }]
      : []),
    ...(context.embedFromUrl
      ? [{
          id: "url", title: "Link, video or PDF URL", description: "Paste an address; it shows here and on your Shelf", keywords: ["youtube", "video", "link", "url", "web", "bookmark", "embed", "image"], badge: "🔗", group: "Media",
          run: (e: Editor, r: Range) => {
            chainAt(e, r).run();
            context.embedFromUrl?.(e);
          },
        }]
      : []),
    ...(context.uploadFile
      ? [{
          id: "upload", title: "Upload file", description: "PDF, image, video or audio from this device", keywords: ["file", "pdf", "image", "photo", "picture", "video", "audio", "attach"], badge: "⬆", group: "Media",
          run: (e: Editor, r: Range) => {
            chainAt(e, r).run();
            context.uploadFile?.(e);
          },
        }]
      : []),
    {
      id: "flashcard", title: "Flashcard", description: "Turn this line into a flashcard", keywords: ["card", "quiz", "study", "review"], badge: "❏", group: "Study",
      run: (e, r) => {
        chainAt(e, r).run();
        context.makeFlashcard(e);
      },
    },
  ];
}

/** Lowercase letters and digits only, so "to-do", "todo" and "To Do" all match. */
const normalize = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Best matches first: title prefix, then keyword prefix, then contains. */
export function filterSlashCommands(items: readonly SlashCommandItem[], query: string): SlashCommandItem[] {
  const q = normalize(query);
  if (!q) return [...items];
  const score = (item: SlashCommandItem) => {
    const title = normalize(item.title);
    const keywords = item.keywords.map(normalize).filter(Boolean);
    if (title.startsWith(q)) return 0;
    if (keywords.some((keyword) => keyword.startsWith(q))) return 1;
    if (title.includes(q) || keywords.some((keyword) => keyword.includes(q))) return 2;
    return 3;
  };
  return items.filter((item) => score(item) < 3).sort((a, b) => score(a) - score(b));
}

export function createSlashSuggestion(getItems: () => SlashCommandItem[]): Omit<SuggestionOptions<SlashCommandItem>, "editor"> {
  return {
    items: ({ query }) => filterSlashCommands(getItems(), query),
    render: popupRenderer<SlashCommandItem>(
      (item) => ({ title: item.title, detail: item.description, badge: item.badge, group: item.group }),
      "No matching blocks",
    ),
  };
}
