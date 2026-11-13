import type { Prisma, PrismaClient } from "@prisma/client";
import { linkSetHash } from "@/lib/refs/extract/link-hash";
import { extractSceneRefs, toLinkRows, type LinkRow, type SourceRef } from "@/lib/refs/extract/link-rows";
import { parseRef, type Ref } from "@/lib/refs/ref-grammar";
import { refToUrl } from "@/lib/refs/ref-links";
import { classifyRef } from "@/lib/refs/ref-types";
import * as linkRepository from "@/lib/repositories/link.repository";
import { parseWorkspaceSceneJson } from "@/types/workspace";

type Db = Prisma.TransactionClient | PrismaClient;

function httpError(message: string, status: number) {
  return Object.assign(new Error(message), { status });
}


// ── writes ─────────────────────────────────────────────────────────────────

/** Note save: rewrite the note's rows in the save transaction. */
export async function replaceNoteLinks(ownerId: string, noteId: string, refs: readonly SourceRef[], db: Db) {
  await linkRepository.replaceSourceLinks(ownerId, { type: "note", id: noteId }, toLinkRows({ type: "note", id: noteId }, refs), db);
}

export type SceneLinkPlan = { rows: LinkRow[]; hash: string };

/** Computed before the snapshot transaction (pure work, no database). */
export function planSceneLinks(workspaceId: string, sceneJson: string): SceneLinkPlan {
  const scene = parseWorkspaceSceneJson(sceneJson);
  const rows = toLinkRows({ type: "workspace", id: workspaceId }, extractSceneRefs(scene.items));
  return { rows, hash: linkSetHash(rows) };
}

/**
 * Snapshot save: saves arrive about every 2 s while editing, so the rows are
 * rewritten only when the link set changed (Workspace.linkHash).
 */
export async function applySceneLinks(ownerId: string, workspaceId: string, plan: SceneLinkPlan, tx: Prisma.TransactionClient) {
  const workspace = await linkRepository.workspaceLinkHash(ownerId, workspaceId, tx);
  if (!workspace || workspace.linkHash === plan.hash) return;
  await linkRepository.replaceSourceLinks(ownerId, { type: "workspace", id: workspaceId }, plan.rows, tx);
  await linkRepository.setWorkspaceLinkHash(ownerId, workspaceId, plan.hash, tx);
}

// ── "Appears in" (§3.4) ────────────────────────────────────────────────────

export type AppearsInSource = {
  sourceType: string;
  sourceId: string;
  title: string;
  /** null for sources the app cannot open (unknown types). */
  url: string | null;
  supported: boolean;
  links: Array<{ sourceAnchor: string; kind: string; targetAnchor: string; url: string | null }>;
};

/** The caller must have access to the target; unknown types pass (rows are owner-scoped anyway). */
async function assertTargetAccess(userId: string, ref: Ref) {
  const classified = classifyRef(ref);
  if (!classified.known) return;
  if (!(await linkRepository.ownsTarget(userId, classified.def.type, ref.id))) throw httpError("Not found.", 404);
}

/** Titles per source type in one query each; soft-deleted sources are dropped. */
async function describeSources(userId: string, keys: Array<{ type: string; id: string }>) {
  const titles = new Map<string, string>();
  const idsOf = (type: string) => keys.filter((key) => key.type === type).map((key) => key.id);
  const noteIds = idsOf("note");
  if (noteIds.length) {
    for (const note of await linkRepository.activeNoteTitles(userId, noteIds)) {
      titles.set(`note:${note.id}`, note.title || "Untitled");
    }
  }
  const workspaceIds = idsOf("workspace");
  if (workspaceIds.length) {
    for (const workspace of await linkRepository.workspaceTitles(userId, workspaceIds)) {
      titles.set(`workspace:${workspace.id}`, workspace.title || "Untitled workspace");
    }
  }
  const flashcardIds = idsOf("flashcard");
  if (flashcardIds.length) {
    for (const card of await linkRepository.flashcardFronts(userId, flashcardIds)) {
      titles.set(`flashcard:${card.id}`, card.front.length > 80 ? `${card.front.slice(0, 79)}…` : card.front);
    }
  }
  return titles;
}

const SUPPORTED_SOURCE_TYPES = new Set(["note", "workspace", "flashcard"]);

/** Sources that are not reference types of their own still open somewhere. */
const SOURCE_PAGES: Record<string, string> = { flashcard: "/flashcards" };

export async function appearsIn(userId: string, refString: string): Promise<AppearsInSource[]> {
  const ref = parseRef(refString);
  if (!ref) throw httpError("Invalid reference.", 400);
  await assertTargetAccess(userId, ref);

  // A Shelf item is also reached through its media asset.
  const targets: Array<{ type: string; id: string; anchor?: string }> = [{ type: ref.type, id: ref.id, anchor: ref.anchor }];
  if (ref.type === "item") {
    const assetId = await linkRepository.assetIdOfItem(userId, ref.id);
    if (assetId) targets.push({ type: "asset", id: assetId });
  }
  if (ref.type === "note") {
    const itemId = await linkRepository.itemIdOfNote(userId, ref.id);
    if (itemId) targets.push({ type: "item", id: itemId });
  }

  const rows = await linkRepository.findLinksToTargets(userId, targets);
  const grouped = new Map<string, AppearsInSource>();
  for (const row of rows) {
    // A note never "appears in" itself.
    if (row.sourceType === ref.type && row.sourceId === ref.id) continue;
    const key = `${row.sourceType}:${row.sourceId}`;
    const sourceRef = parseRef(key);
    let entry = grouped.get(key);
    if (!entry) {
      entry = {
        sourceType: row.sourceType,
        sourceId: row.sourceId,
        title: "",
        url: (sourceRef ? refToUrl(sourceRef) : null) ?? SOURCE_PAGES[row.sourceType] ?? null,
        supported: SUPPORTED_SOURCE_TYPES.has(row.sourceType),
        links: [],
      };
      grouped.set(key, entry);
    }
    const anchored = parseRef(`${key}${row.sourceAnchor ? `#${row.sourceAnchor}` : ""}`);
    entry.links.push({ sourceAnchor: row.sourceAnchor, kind: row.kind, targetAnchor: row.targetAnchor, url: anchored ? refToUrl(anchored) : null });
  }

  const titles = await describeSources(userId, [...grouped.values()].map((entry) => ({ type: entry.sourceType, id: entry.sourceId })));
  const result: AppearsInSource[] = [];
  for (const entry of grouped.values()) {
    const title = titles.get(`${entry.sourceType}:${entry.sourceId}`);
    if (entry.supported && title === undefined) continue; // deleted or trashed source
    result.push({ ...entry, title: title ?? "Unsupported source" });
  }
  return result;
}

// ── full rebuild ───────────────────────────────────────────────────────────

/** Re-extracts every source of one owner. Idempotent. Used by scripts/rebuild-link-index.ts. */
export async function rebuildOwnerLinks(ownerId: string, extractNote: (docJson: string) => SourceRef[]) {
  let rows = 0;
  const notes = await linkRepository.ownerNoteDocs(ownerId);
  for (const note of notes) {
    const refs = extractNote(note.docJson);
    await linkRepository.transaction((tx) => replaceNoteLinks(ownerId, note.id, refs, tx));
    rows += toLinkRows({ type: "note", id: note.id }, refs).length;
  }
  const workspaces = await linkRepository.ownerLatestScenes(ownerId);
  for (const workspace of workspaces) {
    const plan = planSceneLinks(workspace.id, workspace.snapshots[0]?.sceneJson ?? "");
    await linkRepository.transaction(async (tx) => {
      await linkRepository.replaceSourceLinks(ownerId, { type: "workspace", id: workspace.id }, plan.rows, tx);
      await linkRepository.setWorkspaceLinkHash(ownerId, workspace.id, plan.hash, tx);
    });
    rows += plan.rows.length;
  }
  return { notes: notes.length, workspaces: workspaces.length, rows };
}
