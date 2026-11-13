// ---------------------------------------------------------------------------
// Converting plain-text Item.notes into a note document (design doc §1.6)
// ---------------------------------------------------------------------------
//
// Blank lines separate blocks. Within a block:
// - lines starting with "- " or "* " become a bullet list,
// - lines starting with "1. " (any number) become an ordered list,
// - a line starting with "#".."######" and a space becomes a heading,
// - anything else is a paragraph, single line breaks become hard breaks.
// No other markdown is guessed. Text is kept verbatim (no sanitising).

import { generateBlockId } from "./block-ids";
import { NOTE_DOC_FORMAT, NOTE_DOC_VERSION, type NoteDocEnvelope, type NoteNode } from "./note-format";

const BULLET = /^[-*] (.*)$/;
const ORDERED = /^(\d{1,9})\. (.*)$/;
const HEADING = /^(#{1,6}) (.*)$/;

function textNodes(text: string): NoteNode[] {
  return text ? [{ type: "text", text }] : [];
}

function linesToInline(lines: string[]): NoteNode[] {
  const content: NoteNode[] = [];
  lines.forEach((line, index) => {
    if (index > 0) content.push({ type: "hardBreak" });
    content.push(...textNodes(line));
  });
  return content;
}

export function textToNoteDoc(text: string | null | undefined, generateId: () => string = generateBlockId): NoteDocEnvelope {
  const blocks: NoteNode[] = [];
  const paragraph = (lines: string[]): NoteNode => {
    const content = linesToInline(lines);
    return content.length ? { type: "paragraph", attrs: { id: generateId() }, content } : { type: "paragraph", attrs: { id: generateId() } };
  };
  const listItem = (line: string): NoteNode => ({ type: "listItem", attrs: { id: generateId() }, content: [paragraph([line])] });

  const normalized = (text ?? "").replace(/\r\n?/g, "\n");
  for (const chunk of normalized.split(/\n[ \t]*\n/)) {
    const lines = chunk.split("\n").filter((line, index, all) => !(line.trim() === "" && (index === 0 || index === all.length - 1)));
    if (lines.length === 0) continue;

    let run: string[] = [];
    const flushParagraph = () => {
      if (run.length) blocks.push(paragraph(run));
      run = [];
    };

    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      const heading = HEADING.exec(line);
      if (heading) {
        flushParagraph();
        blocks.push({ type: "heading", attrs: { id: generateId(), level: heading[1].length }, content: textNodes(heading[2]) });
        continue;
      }
      if (BULLET.test(line) || ORDERED.test(line)) {
        flushParagraph();
        const ordered = ORDERED.test(line);
        const pattern = ordered ? ORDERED : BULLET;
        const items: NoteNode[] = [];
        const start = ordered ? Number(ORDERED.exec(line)?.[1] ?? 1) : 1;
        while (i < lines.length && pattern.test(lines[i])) {
          const match = pattern.exec(lines[i]);
          items.push(listItem((ordered ? match?.[2] : match?.[1]) ?? ""));
          i += 1;
        }
        i -= 1;
        blocks.push(ordered ? { type: "orderedList", attrs: { start: start >= 1 ? start : 1 }, content: items } : { type: "bulletList", content: items });
        continue;
      }
      run.push(line);
    }
    flushParagraph();
  }

  if (blocks.length === 0) blocks.push({ type: "paragraph", attrs: { id: generateId() } });
  return { format: NOTE_DOC_FORMAT, version: NOTE_DOC_VERSION, doc: { type: "doc", content: blocks } };
}
