"use client";

import { pageBlocks, useOpenPage } from "@/hooks/use-open-page";
import type { PageCitation } from "@/lib/rangan/page";
import { touchedBlocks, type PageOp, type PageToolBlock } from "@/lib/rangan/page-ops";
import { runPageOps } from "@/lib/rangan/page-ops-run";
import { saveLinkToShelf } from "@/components/notes/resource-actions";
import { reportUsage } from "@/lib/client/usage-bus";

// Applies Rangan's page tools to the open page, after the student taps
// Apply: links to embed are saved to the Shelf, the current text is saved as
// a version in History, then every step runs as one editor change (one Undo).

/** `skipped`: steps that no longer fit the page (their words or block were gone) and were left out. */
type Result = { ok: true; skipped: number } | { ok: false; message: string };

/**
 * Applies an approved plan to the open page. Refuses when that page isn't
 * open, or a block the plan reads or changes is gone or different from when
 * Rangan planned it.
 */
export async function applyPageOps(edit: { pageRef: string; ops: readonly PageOp[]; citations: readonly PageCitation[] }, planned: readonly PageToolBlock[]): Promise<Result> {
  const open = useOpenPage.getState().page;
  if (!open || `note:${open.noteId}` !== edit.pageRef) return { ok: false, message: "Open that page to apply this change." };
  const { editor } = open;
  if (!editor.isEditable) return { ok: false, message: "This page can't be edited right now." };

  const before = new Map(planned.map((block) => [block.id, block.text]));
  const now = new Map(pageBlocks(editor).map((block) => [block.id, block.text]));
  if (touchedBlocks(edit.ops).some((id) => !now.has(id) || now.get(id) !== before.get(id))) {
    return { ok: false, message: "The page changed where this edit goes. Ask Rangan again so it works on the latest text." };
  }

  // Links to embed are saved to the Shelf first, as "/Link, video or PDF" does.
  const embeds = new Map<string, string>();
  for (const op of edit.ops) {
    if (op.op !== "embed" || embeds.has(op.url)) continue;
    const saved = await saveLinkToShelf(op.url);
    if (!saved.ok) return { ok: false, message: `${saved.message} Nothing was changed.` };
    embeds.set(op.url, saved.itemId);
  }

  // A version to go back to, kept in the page's History.
  await open.saveNow();
  const version = await fetch(`/api/notes/${encodeURIComponent(open.noteId)}/revisions`, { method: "POST" })
    .then(async (response) => {
      const json = await response.json().catch(() => null);
      reportUsage(json);
      return response.ok && Boolean(json?.ok);
    })
    .catch(() => false);
  if (!version) return { ok: false, message: "Your current text couldn't be saved as a version, so nothing was changed." };

  const { tr, rename, skipped } = runPageOps(editor, edit.ops, { citations: edit.citations, embeds });
  if (tr.docChanged) editor.view.dispatch(tr.scrollIntoView());
  if (rename) open.rename?.(rename);
  if (!tr.docChanged && !rename) return { ok: false, message: "None of the steps could be applied to the page as it is now." };
  return { ok: true, skipped };
}
