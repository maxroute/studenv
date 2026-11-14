"use client";

import type { Editor } from "@tiptap/core";
import toast from "react-hot-toast";
import { uploadWorkspaceAsset } from "@/lib/utils/multipart-upload";
import { inferUploadAssetKind } from "@/lib/utils/media-assets";
import { inferItemTypeFromUrl } from "@/lib/utils/item-type";
import { isYouTubeUrl } from "@/lib/utils/youtube";
import { askText, normalizeWebAddress, pickOne } from "./note-dialogs";

export type ShelfEntry = { id: string; title: string; type: string; url?: string | null; noteId?: string | null };

const TYPE_BADGES: Record<string, string> = { pdf: "📄", video: "▶", article: "🔗", note: "📝" };

/** Inserts a resource card for `ref` at `at` (default: the cursor), followed by an empty line. */
export function insertEmbed(editor: Editor, ref: string, at?: number) {
  const content = [{ type: "embed", attrs: { ref } }, { type: "paragraph" }];
  if (at === undefined) editor.chain().focus().insertContent(content).run();
  else editor.chain().focus().insertContentAt(at, content).run();
}

/** "/Shelf resource": pick something from the Shelf and show it in the note. */
export async function embedFromShelf(editor: Editor, items: readonly ShelfEntry[]) {
  const at = editor.state.selection.from;
  const choice = await pickOne({
    title: "Add from your Shelf",
    placeholder: "Search PDFs, videos, articles…",
    emptyText: items.length ? "Nothing matches." : "Your Shelf is empty. Add a link or upload a file instead.",
    entries: items.map((item) => ({ value: item.id, title: item.title || "Untitled", detail: item.type.toUpperCase(), badge: TYPE_BADGES[item.type] ?? "•" })),
  });
  if (!choice) return;
  insertEmbed(editor, `item:${choice}`, at);
}

function titleForUrl(url: URL) {
  if (isYouTubeUrl(url.href)) return "YouTube video";
  const file = decodeURIComponent(url.pathname.split("/").filter(Boolean).at(-1) ?? "");
  if (/\.[a-z0-9]{2,5}$/i.test(file)) return file.slice(0, 200);
  return url.hostname.replace(/^www\./, "");
}

/** "/Link, video or image": saves the address to the Shelf and shows it in the note. */
export async function embedFromUrl(editor: Editor, onCreated?: () => void) {
  const at = editor.state.selection.from;
  const address = await askText({
    title: "Add a link, video or PDF",
    label: "Web address",
    placeholder: "https://…",
    confirmText: "Add",
    validate: (value) => (normalizeWebAddress(value) ? null : "Enter a web address, like youtube.com/watch?v=…"),
  });
  const href = address ? normalizeWebAddress(address) : null;
  if (!href || href.startsWith("mailto:")) return;
  const url = new URL(href);
  const type = inferItemTypeFromUrl(href) ?? "article";
  const response = await fetch("/api/items", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: type === "note" ? "article" : type, title: titleForUrl(url), url: href }),
  });
  const json = await response.json().catch(() => null);
  const item = Array.isArray(json?.data) ? json.data[0] : json?.data;
  if (!response.ok || typeof item?.id !== "string") {
    toast.error(typeof json?.error === "string" ? json.error : "The link could not be added.");
    return;
  }
  onCreated?.();
  insertEmbed(editor, `item:${item.id}`, at);
}

/** Uploads files (PDF, image, video, audio) and shows each in the note at `at`. */
export async function uploadIntoNote(editor: Editor, files: readonly File[], at?: number) {
  let position = at;
  for (const file of files) {
    if (!inferUploadAssetKind(file.type, file.name)) {
      toast.error(`${file.name}: only PDFs, images, video and audio can be added.`);
      continue;
    }
    const toastId = toast.loading(`Uploading ${file.name}…`);
    try {
      const uploaded = await uploadWorkspaceAsset(file);
      toast.success(`${file.name} added`, { id: toastId });
      insertEmbed(editor, `asset:${uploaded.assetId}`, position);
      position = undefined;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `${file.name} could not be uploaded.`, { id: toastId });
    }
  }
}

/** "/Upload file": opens the file picker. */
export function pickAndUpload(editor: Editor) {
  const at = editor.state.selection.from;
  const input = document.createElement("input");
  input.type = "file";
  input.multiple = true;
  input.accept = "application/pdf,image/*,video/*,audio/*,.pdf";
  input.addEventListener("change", () => {
    const files = Array.from(input.files ?? []);
    if (files.length) void uploadIntoNote(editor, files, at);
  });
  input.click();
}
