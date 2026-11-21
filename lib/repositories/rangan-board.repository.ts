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

type BoardCardKind = "pdf" | "video" | "audio" | "webpage";
const CARD_KINDS = new Set<string>(["pdf", "video", "audio", "webpage"]);
const isCardKind = (kind: string): kind is BoardCardKind => CARD_KINDS.has(kind);

/** A PDF, video, audio file or web page's title and kind, or null when it isn't the user's (or can't be a card). */
export async function findAssetCard(ownerId: string, assetId: string): Promise<{ title: string; kind: BoardCardKind; sourceHost?: string } | null> {
  const asset = await prisma.mediaAsset.findFirst({ where: { id: assetId, ownerId }, select: { title: true, kind: true, sourceHost: true } });
  return asset && isCardKind(asset.kind) ? { title: asset.title || "Untitled", kind: asset.kind, ...(asset.sourceHost ? { sourceHost: asset.sourceHost } : {}) } : null;
}

/** The file a Shelf item (an article, PDF or video) is stored as, as a card; null when it isn't the user's or has none. */
export async function findItemCard(ownerId: string, itemId: string): Promise<{ assetId: string; title: string; kind: BoardCardKind; sourceHost?: string } | null> {
  const asset = await prisma.mediaAsset.findFirst({ where: { itemId, ownerId }, select: { id: true, title: true, kind: true, sourceHost: true } });
  return asset && isCardKind(asset.kind) ? { assetId: asset.id, title: asset.title || "Untitled", kind: asset.kind, ...(asset.sourceHost ? { sourceHost: asset.sourceHost } : {}) } : null;
}

/** A video the user already saved at exactly this address, if any. */
export async function findSavedVideo(ownerId: string, url: string): Promise<{ id: string; title: string } | null> {
  return prisma.mediaAsset.findFirst({ where: { ownerId, sourceUrl: url, kind: "video" }, select: { id: true, title: true } });
}

/** A web page the user already saved at exactly this address, if any. */
export async function findSavedLink(ownerId: string, url: string): Promise<{ id: string; title: string; sourceHost: string | null } | null> {
  return prisma.mediaAsset.findFirst({ where: { ownerId, sourceUrl: url, kind: "webpage" }, select: { id: true, title: true, sourceHost: true } });
}
