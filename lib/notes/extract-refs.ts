// ---------------------------------------------------------------------------
// References a note makes: mentions, links, citations and embeds
// ---------------------------------------------------------------------------
//
// Feeds the link index. Each reference is tagged with the id of the block it
// sits in (`sourceAnchor`). References of types this build does not know are
// included as they are, so they become queryable once their type ships.

import { parseRef, formatRef, type Ref } from "@/lib/refs/ref-grammar";
import type { LinkKind } from "@/lib/refs/link-kinds";
import { walkNoteNodes, type NoteDoc } from "./note-format";

export type NoteRef = { ref: Ref; kind: LinkKind; sourceAnchor: string };

/** Unique by reference, kind and block, in document order. */
export function extractNoteRefs(doc: NoteDoc): NoteRef[] {
  const found: NoteRef[] = [];
  const seen = new Set<string>();
  const add = (value: unknown, kind: LinkKind, sourceAnchor: string) => {
    const ref = parseRef(value);
    if (!ref) return;
    const key = `${formatRef(ref)} ${kind} ${sourceAnchor}`;
    if (seen.has(key)) return;
    seen.add(key);
    found.push({ ref, kind, sourceAnchor });
  };

  for (const { node, blockId } of walkNoteNodes(doc.content)) {
    switch (node.type) {
      case "mention":
        add(node.attrs?.ref, "mention", blockId);
        break;
      case "citation":
        add(node.attrs?.ref, "citation", blockId);
        break;
      case "embed":
        add(node.attrs?.ref, "embed", blockId);
        break;
      case "pdfPage":
        // A pinned page belongs to its PDF: the note uses that file.
        if (typeof node.attrs?.assetId === "string") add(`asset:${node.attrs.assetId}#page${Math.max(1, Math.floor(Number(node.attrs.page)) || 1)}`, "embed", blockId);
        break;
      default:
        break;
    }
    for (const mark of node.marks ?? []) {
      if (mark.type === "link") add(mark.attrs?.ref, "link", blockId);
    }
  }
  return found;
}
