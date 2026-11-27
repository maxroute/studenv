// ---------------------------------------------------------------------------
// YouTube previews under lines that mention a video or playlist
// ---------------------------------------------------------------------------
//
// A line holding a YouTube address (a link or plain text, in a paragraph or a
// list) gets a preview below it: a thumbnail first, the player only when it is
// pressed, so a page with many videos stays quick. The preview is drawn by the
// editor; it is not part of the page and is never saved. While a line shows a
// preview, its bare address (the long "https://youtube.com/…" text) is hidden;
// putting the caret on that line shows it again for editing.

import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, type EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { buildYouTubeEmbedUrl, getYouTubePlaybackSource } from "@/lib/utils/youtube";

/** At most this many previews on one page. */
export const MAX_PREVIEWS = 10;

const ADDRESS = /https?:\/\/(?:www\.|m\.)?(?:youtube\.com|youtu\.be)\/[^\s<>"')\]]+/gi;

export type YouTubePreview = { key: string; embed: string; thumbnail: string | null; playlist: boolean };

/** The first playable YouTube address among a line's links and its text, as a preview. */
export function previewFor(hrefs: readonly string[], text: string): YouTubePreview | null {
  for (const candidate of [...hrefs, ...(text.match(ADDRESS) ?? [])]) {
    const source = getYouTubePlaybackSource(candidate);
    if (!source) continue;
    const embed = buildYouTubeEmbedUrl(source, { host: "youtube-nocookie", nativeControls: true, autoplay: true });
    if (!embed) continue;
    return {
      key: `${source.videoId ?? ""}|${source.playlistId ?? ""}`,
      embed,
      thumbnail: source.videoId ? `https://i.ytimg.com/vi/${source.videoId}/hqdefault.jpg` : null,
      playlist: !source.videoId && Boolean(source.playlistId),
    };
  }
  return null;
}

/** Where a line's bare YouTube addresses are: written-out text, or a link whose words are its address. */
export function bareAddresses(line: ProseMirrorNode, start: number): Array<{ from: number; to: number }> {
  const ranges: Array<{ from: number; to: number }> = [];
  line.forEach((child, offset) => {
    if (!child.isText || !child.text) return;
    const at = start + offset;
    const link = child.marks.find((mark) => mark.type.name === "link");
    if (link) {
      if (child.text.trim() === link.attrs.href && getYouTubePlaybackSource(child.text.trim())) ranges.push({ from: at, to: at + child.text.length });
      return;
    }
    for (const match of child.text.matchAll(ADDRESS)) {
      if (getYouTubePlaybackSource(match[0])) ranges.push({ from: at + (match.index ?? 0), to: at + (match.index ?? 0) + match[0].length });
    }
  });
  return ranges;
}

/** Where previews go: right after each line (paragraph or heading) that has a YouTube address. */
export function findPreviews(doc: ProseMirrorNode): Array<{ pos: number; line: { from: number; to: number }; hidden: Array<{ from: number; to: number }>; preview: YouTubePreview }> {
  const found: Array<{ pos: number; line: { from: number; to: number }; hidden: Array<{ from: number; to: number }>; preview: YouTubePreview }> = [];
  doc.descendants((node, pos) => {
    if (found.length >= MAX_PREVIEWS) return false;
    if (node.type.name === "codeBlock") return false;
    if (!node.isTextblock) return true;
    const hrefs: string[] = [];
    node.forEach((child) => {
      const link = child.marks.find((mark) => mark.type.name === "link");
      if (typeof link?.attrs.href === "string") hrefs.push(link.attrs.href);
    });
    const preview = previewFor(hrefs, node.textContent);
    if (preview) found.push({ pos: pos + node.nodeSize, line: { from: pos, to: pos + node.nodeSize }, hidden: bareAddresses(node, pos + 1), preview });
    return false;
  });
  return found;
}

function previewElement(preview: YouTubePreview): HTMLElement {
  const box = document.createElement("div");
  box.className = "note-youtube";
  box.contentEditable = "false";
  const button = document.createElement("button");
  button.type = "button";
  button.className = "note-youtube-poster";
  button.setAttribute("aria-label", preview.playlist ? "Play the YouTube playlist" : "Play the YouTube video");
  if (preview.thumbnail) {
    const image = document.createElement("img");
    image.src = preview.thumbnail;
    image.alt = "";
    image.loading = "lazy";
    image.referrerPolicy = "no-referrer";
    button.append(image);
  } else {
    const label = document.createElement("span");
    label.className = "note-youtube-label";
    label.textContent = "YouTube playlist";
    button.append(label);
  }
  const play = document.createElement("span");
  play.className = "note-youtube-play";
  play.setAttribute("aria-hidden", "true");
  button.append(play);
  // The editor must not treat a press on the preview as a click in the text.
  button.addEventListener("mousedown", (event) => event.preventDefault());
  button.addEventListener("click", () => {
    const frame = document.createElement("iframe");
    frame.src = preview.embed;
    frame.title = preview.playlist ? "YouTube playlist" : "YouTube video";
    frame.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen";
    frame.allowFullscreen = true;
    frame.referrerPolicy = "strict-origin-when-cross-origin";
    button.replaceWith(frame);
  });
  box.append(button);
  return box;
}

const previewKey = new PluginKey<DecorationSet>("noteYouTubePreview");

function decorations(state: EditorState) {
  const { from, to } = state.selection;
  const decorations: Decoration[] = [];
  for (const { pos, line, hidden, preview } of findPreviews(state.doc)) {
    // The key keeps a playing video's element across edits elsewhere on the page.
    decorations.push(Decoration.widget(pos, () => previewElement(preview), { key: `yt:${preview.key}`, side: -1, ignoreSelection: true }));
    // Shown again while the caret or selection touches the line, so it can be edited.
    const editing = from <= line.to && to >= line.from;
    if (!editing) for (const range of hidden) decorations.push(Decoration.inline(range.from, range.to, { class: "note-youtube-address" }));
  }
  return DecorationSet.create(state.doc, decorations);
}

export const YouTubePreviews = Extension.create({
  name: "youtubePreviews",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: previewKey,
        state: {
          init: (_config, state) => decorations(state),
          apply: (tr, current, _old, state) => (tr.docChanged || tr.selectionSet ? decorations(state) : current),
        },
        props: { decorations: (state) => previewKey.getState(state) },
      }),
    ];
  },
});
