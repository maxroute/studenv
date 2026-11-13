import type { Plan, Prisma } from "@prisma/client";
import { siteConfig } from "@/config/site";
import type { CreateNoteInput, MoveNoteInput, NoteDetail, SaveNoteInput } from "@/lib/models/note.model";
import { createEmptyNoteDoc } from "@/lib/notes/note-format";
import { NoteDocError, normalizeNoteTitle, noteExcerpt, prepareNoteDoc, type PreparedNoteDoc } from "@/lib/notes/note-save";
import { revisionsToPrune, shouldCheckpoint } from "@/lib/notes/revision-policy";
import { sortKeyBetween } from "@/lib/notes/sort-key";
import { auditLog } from "@/lib/repositories/base.repository";
import * as noteRepository from "@/lib/repositories/note.repository";
import type { Db } from "@/lib/repositories/note.repository";

type RequestContext = { ip?: string | null; userAgent?: string | null };

function httpError(message: string, status: number) {
  return Object.assign(new Error(message), { status });
}

/** A save based on an older version. The client stops autosaving and offers choices. */
export class NoteConflictError extends Error {
  readonly status = 409;
  constructor(readonly currentVersion: number, readonly updatedAt: Date) {
    super("This note was changed somewhere else.");
    this.name = "NoteConflictError";
  }
}

function asHttpError(error: unknown): unknown {
  return error instanceof NoteDocError ? httpError(error.message, error.status) : error;
}

function toDetail(note: NonNullable<Awaited<ReturnType<typeof noteRepository.findById>>>): NoteDetail {
  const { docJson, ...rest } = note;
  let doc: unknown = null;
  try {
    doc = JSON.parse(docJson);
  } catch {
    // Kept as raw text; parseNoteDoc on the client shows it as an unsupported block.
    doc = docJson;
  }
  return { ...rest, doc };
}

/** Hooks other stages attach to note writes inside the same transaction (link index, Stage 6). */
export type NoteWriteHook = (input: { ownerId: string; noteId: string; prepared: PreparedNoteDoc; db: Db }) => Promise<void>;
const writeHooks: NoteWriteHook[] = [];
export function onNoteWrite(hook: NoteWriteHook) {
  writeHooks.push(hook);
}
async function runWriteHooks(ownerId: string, noteId: string, prepared: PreparedNoteDoc, db: Db) {
  for (const hook of writeHooks) await hook({ ownerId, noteId, prepared, db });
}

export async function listNotes(userId: string) {
  return noteRepository.listActive(userId);
}

export async function getNote(userId: string, id: string): Promise<NoteDetail> {
  const note = await noteRepository.findById(userId, id);
  if (!note) throw httpError("Note not found.", 404);
  return toDetail(note);
}

async function assertParent(userId: string, parentId: string | null, db: Db) {
  if (!parentId) return;
  const parent = await noteRepository.findForUpdate(userId, parentId, db);
  if (!parent) throw httpError("Parent note not found.", 404);
}

export async function createNote(
  userId: string,
  plan: Plan,
  input: CreateNoteInput,
  context?: RequestContext,
): Promise<NoteDetail> {
  const parentId = input.parentId ?? null;
  let prepared: PreparedNoteDoc;
  try {
    prepared = prepareNoteDoc(input.doc ?? createEmptyNoteDoc());
  } catch (error) {
    throw asHttpError(error);
  }
  const title = normalizeNoteTitle(input.title);

  const note = await noteRepository.transaction(async (tx) => {
    await assertParent(userId, parentId, tx);
    let itemId: string | null = null;
    // Only top-level notes get a Shelf entry (design doc §9 Q3).
    if (!parentId) {
      if (plan === "free" && (await noteRepository.countItems(userId, tx)) >= siteConfig.freeTierItemLimit) {
        throw httpError("Free tier item limit reached.", 403);
      }
      itemId = (await noteRepository.createNoteItem(userId, title, noteExcerpt(prepared.plainText), tx)).id;
    }
    const last = await noteRepository.lastSiblingKey(userId, parentId, tx);
    const created = await noteRepository.create(
      {
        ownerId: userId,
        itemId,
        parentId,
        sortKey: sortKeyBetween(last?.sortKey ?? null, null),
        title,
        docJson: prepared.docJson,
        docFormat: prepared.docFormat,
        plainText: prepared.plainText,
      },
      tx,
    );
    await runWriteHooks(userId, created.id, prepared, tx);
    return created;
  });

  await auditLog({ userId, action: "CREATE_NOTE", resource: "note", resourceId: note.id, ipAddress: context?.ip, userAgent: context?.userAgent });
  return toDetail(note);
}

/** Checkpoint when due, then apply the retention policy to this note's revisions. */
async function checkpointIfDue(
  userId: string,
  note: { id: string; lastRevisionAt: Date | null },
  saved: { version: number; title: string; docJson: string; docFormat: number },
  now: Date,
  db: Db,
) {
  if (!shouldCheckpoint(note.lastRevisionAt, now)) return;
  await noteRepository.createRevision({ noteId: note.id, ...saved, reason: "checkpoint", createdBy: userId }, db);
  await noteRepository.update(userId, note.id, { lastRevisionAt: now }, db);
  const prune = revisionsToPrune(await noteRepository.listRevisionStamps(note.id, db), now);
  if (prune.length > 0) await noteRepository.deleteRevisions(note.id, prune, db);
}

export async function saveNote(userId: string, id: string, input: SaveNoteInput): Promise<NoteDetail> {
  let prepared: PreparedNoteDoc;
  try {
    prepared = prepareNoteDoc(input.doc);
  } catch (error) {
    throw asHttpError(error);
  }
  const title = normalizeNoteTitle(input.title);
  const now = new Date();

  const saved = await noteRepository.transaction(async (tx) => {
    const current = await noteRepository.findForUpdate(userId, id, tx);
    if (!current) throw httpError("Note not found.", 404);

    let baseVersion = input.baseVersion;
    if (input.overwrite) {
      // "Keep mine": keep the server copy as a revision before replacing it.
      await noteRepository.createRevision(
        { noteId: id, version: current.version, title: current.title, docJson: current.docJson, docFormat: current.docFormat, reason: "before_overwrite", createdBy: userId },
        tx,
      );
      baseVersion = current.version;
    }

    const data: Prisma.NoteUncheckedUpdateManyInput = {
      title,
      docJson: prepared.docJson,
      docFormat: prepared.docFormat,
      plainText: prepared.plainText,
      version: { increment: 1 },
    };
    const { count } = await noteRepository.updateIfVersion(userId, id, baseVersion, data, tx);
    if (count === 0) {
      const latest = await noteRepository.versionOf(userId, id, tx);
      if (!latest || latest.deletedAt) throw httpError("Note not found.", 404);
      throw new NoteConflictError(latest.version, latest.updatedAt);
    }

    if (current.itemId) {
      await noteRepository.updateNoteItem(userId, current.itemId, { title, excerpt: noteExcerpt(prepared.plainText) }, tx);
    }
    const newVersion = baseVersion + 1;
    await checkpointIfDue(userId, current, { version: newVersion, title, docJson: prepared.docJson, docFormat: prepared.docFormat }, now, tx);
    await runWriteHooks(userId, id, prepared, tx);
    return noteRepository.findById(userId, id, tx);
  });

  if (!saved) throw httpError("Note not found.", 404);
  return toDetail(saved);
}

export async function listRevisions(userId: string, id: string) {
  await getNote(userId, id);
  return noteRepository.listRevisions(userId, id);
}

export async function getRevision(userId: string, id: string, revisionId: string) {
  const revision = await noteRepository.findRevision(userId, id, revisionId);
  if (!revision) throw httpError("Revision not found.", 404);
  const { docJson, ...rest } = revision;
  let doc: unknown = docJson;
  try {
    doc = JSON.parse(docJson);
  } catch {
    // Left as raw text, as for notes.
  }
  return { ...rest, doc };
}

/** "Save version": a manual revision of the current content, always kept. */
export async function saveVersion(userId: string, id: string) {
  return noteRepository.transaction(async (tx) => {
    const current = await noteRepository.findForUpdate(userId, id, tx);
    if (!current) throw httpError("Note not found.", 404);
    const revision = await noteRepository.createRevision(
      { noteId: id, version: current.version, title: current.title, docJson: current.docJson, docFormat: current.docFormat, reason: "manual", createdBy: userId },
      tx,
    );
    await noteRepository.update(userId, id, { lastRevisionAt: new Date() }, tx);
    return revision;
  });
}

/** Restoring creates a new version from the old content; history is never rewritten. */
export async function restoreRevision(userId: string, id: string, revisionId: string): Promise<NoteDetail> {
  const restored = await noteRepository.transaction(async (tx) => {
    const current = await noteRepository.findForUpdate(userId, id, tx);
    if (!current) throw httpError("Note not found.", 404);
    const revision = await noteRepository.findRevision(userId, id, revisionId, tx);
    if (!revision) throw httpError("Revision not found.", 404);

    let prepared: PreparedNoteDoc;
    try {
      prepared = prepareNoteDoc(JSON.parse(revision.docJson));
    } catch (error) {
      throw asHttpError(error instanceof SyntaxError ? new NoteDocError("This revision cannot be restored.", 422) : error);
    }
    await noteRepository.createRevision(
      { noteId: id, version: current.version, title: current.title, docJson: current.docJson, docFormat: current.docFormat, reason: "before_restore", createdBy: userId },
      tx,
    );
    await noteRepository.updateIfVersion(
      userId,
      id,
      current.version,
      { title: revision.title, docJson: prepared.docJson, docFormat: prepared.docFormat, plainText: prepared.plainText, version: { increment: 1 }, lastRevisionAt: new Date() },
      tx,
    );
    if (current.itemId) {
      await noteRepository.updateNoteItem(userId, current.itemId, { title: revision.title, excerpt: noteExcerpt(prepared.plainText) }, tx);
    }
    await runWriteHooks(userId, id, prepared, tx);
    return noteRepository.findById(userId, id, tx);
  });
  if (!restored) throw httpError("Note not found.", 404);
  return toDetail(restored);
}

/** Moves a note to the trash with its sub-pages. */
export async function deleteNote(userId: string, id: string, context?: RequestContext) {
  await noteRepository.transaction(async (tx) => {
    const current = await noteRepository.findForUpdate(userId, id, tx);
    if (!current) throw httpError("Note not found.", 404);
    const ids = await noteRepository.subtreeIds(userId, id, tx);
    await noteRepository.setDeletedAt(userId, ids, new Date(), tx);
  });
  await auditLog({ userId, action: "DELETE_NOTE", resource: "note", resourceId: id, ipAddress: context?.ip, userAgent: context?.userAgent });
}

/** Brings a note and its sub-pages back from the trash. A trashed parent is restored too. */
export async function restoreNote(userId: string, id: string) {
  await noteRepository.transaction(async (tx) => {
    const note = await noteRepository.findById(userId, id, tx);
    if (!note) throw httpError("Note not found.", 404);
    if (!note.deletedAt) return;
    let parentId = note.parentId;
    const ancestors: string[] = [];
    while (parentId) {
      const parent = await noteRepository.findById(userId, parentId, tx);
      if (!parent || !parent.deletedAt) break;
      ancestors.push(parent.id);
      parentId = parent.parentId;
    }
    const ids = [...ancestors, ...(await noteRepository.subtreeIds(userId, id, tx))];
    await noteRepository.setDeletedAt(userId, ids, null, tx);
  });
  return getNote(userId, id);
}

/**
 * Moves a note in the page tree. Top-level notes have a Shelf entry and
 * nested ones do not (§9 Q3): nesting a note removes its entry unless it has
 * tags or collections, in which case the move is refused (409) so nothing the
 * user organised is lost silently.
 */
export async function moveNote(userId: string, plan: Plan, id: string, input: MoveNoteInput): Promise<NoteDetail> {
  const parentId = input.parentId;
  const moved = await noteRepository.transaction(async (tx) => {
    const current = await noteRepository.findForUpdate(userId, id, tx);
    if (!current) throw httpError("Note not found.", 404);
    if (parentId) {
      await assertParent(userId, parentId, tx);
      if ((await noteRepository.subtreeIds(userId, id, tx)).includes(parentId)) {
        throw httpError("A note cannot be moved inside itself.", 422);
      }
    }

    let sortKey: string;
    if (input.afterId) {
      const after = await noteRepository.findForUpdate(userId, input.afterId, tx);
      if (!after || after.parentId !== parentId || after.id === id) throw httpError("Sibling note not found.", 404);
      const next = await noteRepository.siblingAfter(userId, parentId, after.sortKey, id, tx);
      sortKey = sortKeyBetween(after.sortKey, next?.sortKey ?? null);
    } else {
      const first = await noteRepository.firstSibling(userId, parentId, id, tx);
      sortKey = sortKeyBetween(null, first?.sortKey ?? null);
    }

    let itemId = current.itemId;
    if (parentId && itemId) {
      const organisation = await noteRepository.itemOrganisation(userId, itemId, tx);
      if (organisation && (organisation._count.itemTags > 0 || organisation._count.collectionItems > 0)) {
        throw httpError("This note has tags or collections on the Shelf. Remove them before nesting it.", 409);
      }
      await noteRepository.deleteItem(userId, itemId, tx);
      itemId = null;
    } else if (!parentId && !itemId) {
      if (plan === "free" && (await noteRepository.countItems(userId, tx)) >= siteConfig.freeTierItemLimit) {
        throw httpError("Free tier item limit reached.", 403);
      }
      const plainText = (await noteRepository.plainTextOf(userId, id, tx)) ?? "";
      itemId = (await noteRepository.createNoteItem(userId, current.title, noteExcerpt(plainText), tx)).id;
    }

    await noteRepository.update(userId, id, { parentId, sortKey, itemId }, tx);
    return noteRepository.findById(userId, id, tx);
  });
  if (!moved) throw httpError("Note not found.", 404);
  return toDetail(moved);
}
