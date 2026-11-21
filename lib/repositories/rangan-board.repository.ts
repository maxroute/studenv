import { prisma } from "@/lib/db/prisma";
import { parseNoteDoc } from "@/lib/notes/note-format";
import { noteDocToPlainText } from "@/lib/notes/plain-text";

// Lookups for the cards on a map board Rangan creates. Every query is scoped
// to the owner: a card can only show the student's own pages and files.

/** A page's title and the start of its text, or null when it isn't the user's. */
export async function findNoteCard(ownerId: string, noteId: string): Promise<{ title: string; excerpt: string } | null> {
  const note = await prisma.note.findFirst({ where: { id: noteId, ownerId, deletedAt: null }, select: { title: true, docJson: true } });
  if (!note) return null;
  let text = "";
  try {
    text = noteDocToPlainText(parseNoteDoc(JSON.parse(note.docJson ?? "null")).envelope.doc);
  } catch {
    text = "";
  }
  return { title: note.title || "Untitled", excerpt: text.replace(/\s+/g, " ").trim().slice(0, 280) };
}

/** A PDF or video's title and kind, or null when it isn't the user's (or isn't a PDF or video). */
export async function findAssetCard(ownerId: string, assetId: string): Promise<{ title: string; kind: "pdf" | "video" } | null> {
  const asset = await prisma.mediaAsset.findFirst({ where: { id: assetId, ownerId }, select: { title: true, kind: true } });
  return asset && (asset.kind === "pdf" || asset.kind === "video") ? { title: asset.title || "Untitled", kind: asset.kind } : null;
}
