"use client";

import "katex/dist/katex.min.css";
import "./notes.css";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import toast from "react-hot-toast";
import { EditorContent, ReactNodeViewRenderer, useEditor, type Editor } from "@tiptap/react";
import { X } from "lucide-react";
import { useNoteEditor, type LoadedNote } from "@/hooks/use-note-editor";
import { toEditorContent, fromEditorJSON } from "@/lib/notes/editor-bridge";
import { createNoteExtensions, type NoteMentionItem } from "@/lib/notes/editor-extensions";
import { parseNoteDoc } from "@/lib/notes/note-format";
import { noteAncestors, noteSubtreeIds } from "@/lib/notes/note-tree";
import { AppearsIn } from "@/components/refs/appears-in";
import { RelatedInLibrary } from "@/components/rangan/related-in-library";
import { useOpenPage } from "@/hooks/use-open-page";
import { createMentionSuggestion } from "./mention-suggestion";
import { createSlashSuggestion, slashCommands } from "./slash-commands";
import { NoteBubbleMenu } from "./note-bubble-menu";
import { TableBubbleMenu } from "./table-bubble-menu";
import { LinkMenu, openLink } from "./link-menu";
import { linkTarget } from "@/lib/notes/link-target";
import { PAGES_TAB } from "@/lib/client/shell-nav";
import { editEquation, fixFormulas } from "./editor-actions";
import { askConfirm, askText } from "./note-dialogs";
import { FontMenu, TextColorMenu } from "./style-menus";
import { noteFontVariables } from "./note-fonts";
import { ResourceEmbedView } from "./resource-embed";
import { PdfPageBlockView } from "./pdf-page-block";
import { CollectionsDialog, NoteChips, NoteTopline } from "./note-header";
import { KeyboardToolbar } from "./keyboard-toolbar";
import { useRanganStore } from "@/hooks/use-rangan-store";
import { embedFromShelf, embedFromUrl, pickAndUpload, uploadIntoNote, type ShelfEntry } from "./resource-actions";

type NoteListEntry = { id: string; title: string; parentId: string | null; sortKey: string; itemId: string | null; version: number; updatedAt: string };
type Revision = { id: string; version: number; title: string; reason: string; createdAt: string };

async function api<T>(url: string, init?: RequestInit): Promise<{ ok: boolean; status: number; data?: T; error?: string }> {
  const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const json = await response.json().catch(() => null);
  return { ok: response.ok && Boolean(json?.ok), status: response.status, data: json?.data, error: json?.error };
}

/** The `/api/notes` list (shared SWR key: every user of the key must use this fetcher). */
export const notesListFetcher = async (url: string) => {
  const result = await api<NoteListEntry[]>(url);
  if (!result.ok || !result.data) throw new Error(result.error ?? "Pages could not be loaded.");
  return result.data;
};

const REASON_LABELS: Record<string, string> = {
  checkpoint: "Autosaved version",
  manual: "Saved version",
  before_restore: "Before restoring",
  before_overwrite: "Before keeping my copy",
  migration: "Imported from the Shelf",
};

/** The page at /notes/[id]. Pages are listed in the Library's Pages tab. */
export function NotesApp({ noteId }: { noteId: string }) {
  const { data: notes, mutate: refreshNotes } = useSWR("/api/notes", notesListFetcher);

  return (
    <div className="notes-app">
      <main className="notes-main">
        <NoteView key={noteId} noteId={noteId} notes={notes ?? []} onSaved={() => void refreshNotes()} />
      </main>
    </div>
  );
}

function MoveDialog({ note, notes, onClose, onMoved }: { note: NoteListEntry; notes: NoteListEntry[]; onClose: () => void; onMoved: () => void }) {
  const blocked = useMemo(() => noteSubtreeIds(notes, note.id), [notes, note.id]);
  const choices = notes.filter((candidate) => !blocked.has(candidate.id));
  const [parentId, setParentId] = useState<string>(note.parentId ?? "");
  const [busy, setBusy] = useState(false);

  const move = async () => {
    setBusy(true);
    const target = parentId || null;
    const siblings = notes.filter((n) => n.parentId === target && n.id !== note.id).sort((a, b) => (a.sortKey < b.sortKey ? -1 : 1));
    const result = await api(`/api/notes/${note.id}/move`, {
      method: "PATCH",
      body: JSON.stringify({ parentId: target, afterId: siblings.at(-1)?.id ?? null }),
    });
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error ?? "The page could not be moved.");
      return;
    }
    onMoved();
    onClose();
  };

  return (
    <div className="notes-dialog-backdrop" role="presentation" onClick={onClose}>
      <div className="notes-dialog" role="dialog" aria-modal="true" aria-label="Move page" onClick={(event) => event.stopPropagation()}>
        <h2>Move “{note.title}”</h2>
        <label className="notes-field">
          <span>Put it under</span>
          <select value={parentId} onChange={(event) => setParentId(event.target.value)}>
            <option value="">Top level</option>
            {choices.map((choice) => (
              <option key={choice.id} value={choice.id}>{choice.title || "Untitled"}</option>
            ))}
          </select>
        </label>
        <p className="notes-muted">A sub-page is listed under its parent in the Library&apos;s Pages tab.</p>
        <div className="notes-dialog-actions">
          <button type="button" className="notes-secondary-btn" onClick={onClose}>Cancel</button>
          <button type="button" className="notes-primary-btn" disabled={busy} onClick={() => void move()}>Move</button>
        </div>
      </div>
    </div>
  );
}

// ── note view ──────────────────────────────────────────────────────────────

export type { NoteListEntry };

/** One note: title, editor, conflicts, history. Used on /notes/[id] and in the workspace side panel (`embedded`). */
export function NoteView({ noteId, notes, onSaved, embedded = false }: { noteId: string; notes: NoteListEntry[]; onSaved: () => void; embedded?: boolean }) {
  const router = useRouter();
  const editorState = useNoteEditor(noteId);
  const { note, fresh, refreshError, loadError, status, conflict, change, saveNow, loadLatest, keepMine, saveAsNew, markReadOnly, reload, setBaseline } = editorState;
  const baselineRef = useRef(setBaseline);
  baselineRef.current = setBaseline;
  // From an earlier visit's copy when there is one, so the title is there at once.
  const [title, setTitle] = useState(() => note?.title ?? "");
  const [readOnlyReason, setReadOnlyReason] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [addToWorkspaceOpen, setAddToWorkspaceOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [collectionsOpen, setCollectionsOpen] = useState(false);
  const coarsePointer = useCoarsePointer();
  const titleRef = useRef(note?.title ?? "");
  const titleBoxRef = useRef<HTMLTextAreaElement>(null);
  // Read inside applyNote: an earlier copy shown while loading is never editable.
  const freshRef = useRef(fresh);
  freshRef.current = fresh;
  const notesRef = useRef<NoteListEntry[]>(notes);
  notesRef.current = notes;

  // "@" links to pages, Shelf resources and workspaces. The lists are read
  // through refs so the editor is not rebuilt when they load or change.
  const { data: shelfItems, mutate: refreshShelf } = useSWR("/api/items", (url: string) => api<ShelfEntry[]>(url).then((r) => r.data ?? []));
  const shelfRef = useRef<ShelfEntry[]>([]);
  shelfRef.current = (shelfItems ?? []).filter((item) => item.type !== "note");
  const refreshShelfRef = useRef(refreshShelf);
  refreshShelfRef.current = refreshShelf;
  const { data: workspaceList } = useSWR("/api/workspace", (url: string) => api<Array<{ id: string; title: string }>>(url).then((r) => r.data ?? []));
  const linkTargetsRef = useRef<NoteMentionItem[]>([]);
  linkTargetsRef.current = [
    ...notes.filter((n) => n.id !== noteId).map((n) => ({ ref: `note:${n.id}`, label: n.title || "Untitled", kind: "note" as const })),
    // Note items are already listed as pages.
    ...(shelfItems ?? []).filter((item) => !(item.type === "note" && item.noteId)).map((item) => ({ ref: `item:${item.id}`, label: item.title || "Untitled", kind: "resource" as const })),
    ...(workspaceList ?? []).map((workspace) => ({ ref: `workspace:${workspace.id}`, label: workspace.title || "Untitled workspace", kind: "workspace" as const })),
  ];
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;

  const extensions = useMemo(() => {
    const slashItems = slashCommands({
      createSubPage: async () => {
        const result = await api<LoadedNote>("/api/notes", { method: "POST", body: JSON.stringify({ title: "Untitled", parentId: noteId }) });
        if (!result.ok || !result.data) {
          toast.error(result.error ?? "The page could not be created.");
          return null;
        }
        onSavedRef.current();
        return { id: result.data.id, title: result.data.title };
      },
      makeFlashcard: (current) => void makeFlashcard(current, noteId),
      embedFromShelf: (current) => void embedFromShelf(current, shelfRef.current),
      embedFromUrl: (current) => void embedFromUrl(current, () => void refreshShelfRef.current()),
      uploadFile: (current) => pickAndUpload(current),
    });
    return createNoteExtensions({
      blockHandle: true,
      // Buttons, players and the ink layer inside these blocks handle their own
      // events; letting the editor see them would select and focus the note
      // (opening the phone keyboard over the page being drawn on).
      embedView: ReactNodeViewRenderer(ResourceEmbedView, { stopEvent: stopInteractiveEvent }),
      pdfPageView: ReactNodeViewRenderer(PdfPageBlockView, { stopEvent: stopInteractiveEvent }),
      mentionSuggestion: createMentionSuggestion(() => linkTargetsRef.current),
      slashSuggestion: createSlashSuggestion(() => slashItems),
      onMathClick: (node, pos, kind) => {
        const current = editorRef.current;
        if (!current?.isEditable) return;
        void editEquation(current, pos, String(node.attrs.latex ?? ""), kind);
      },
    });
  }, [noteId]);
  const editorRef = useRef<Editor | null>(null);

  const editor = useEditor(
    {
      extensions,
      immediatelyRender: false,
      editable: false,
      editorProps: {
        attributes: { class: "note-prose", "aria-label": "Page content" },
        // Files dropped or pasted into the note are uploaded and shown in place.
        handleDrop: (view, event, _slice, moved) => {
          const files = Array.from(event.dataTransfer?.files ?? []);
          const current = editorRef.current;
          if (moved || files.length === 0 || !current?.isEditable) return false;
          event.preventDefault();
          const at = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
          void uploadIntoNote(current, files, at);
          return true;
        },
        handlePaste: (_view, event) => {
          const files = Array.from(event.clipboardData?.files ?? []);
          const current = editorRef.current;
          if (files.length === 0 || !current?.isEditable) return false;
          event.preventDefault();
          void uploadIntoNote(current, files);
          return true;
        },
      },
      onUpdate: ({ editor: current }) => {
        if (!current.isEditable) return;
        change(titleRef.current, fromEditorJSON(current.getJSON()));
      },
    },
    [extensions],
  );
  editorRef.current = editor;

  // Load (and reload after "Load latest" or a restore) the stored content into the editor.
  const applyNote = useCallback(
    (loaded: LoadedNote, current: Editor) => {
      const parsed = parseNoteDoc(loaded.doc);
      const { content, lossless } = toEditorContent(parsed.envelope.doc, current.schema);
      current.commands.setContent(content, { emitUpdate: false });
      titleRef.current = loaded.title;
      setTitle(loaded.title);
      const reason = loaded.deletedAt
        ? "This page is in the trash. Restore it to edit."
        : !parsed.canSave || !lossless
          ? "This page uses features from a newer version of Studenv. Refresh the page to edit it."
          : null;
      setReadOnlyReason(reason);
      // No update event: switching editing on is not an edit. Until the server's
      // copy has arrived, what shows is the copy from an earlier visit: read-only.
      current.setEditable(reason === null && freshRef.current, false);
      // Deep links to a section (/notes/[id]#b_…) scroll to the block and mark it.
      const blockId = embedded ? null : decodeURIComponent(window.location.hash.slice(1));
      if (blockId && /^b_[A-Za-z0-9_-]{10}$/.test(blockId)) {
        // The editor's DOM is attached when EditorContent mounts, which can be
        // after the content is set; look for the block for up to ~2 s. The mark
        // is a temporary stylesheet rule: ProseMirror re-renders any node whose
        // DOM is changed from outside, so a class on the block would vanish.
        let attempts = 0;
        const mark = () => {
          const element = document.querySelector(`.note-prose [data-id="${blockId}"]`);
          if (element instanceof HTMLElement) {
            element.scrollIntoView({ block: "center" });
            const style = document.createElement("style");
            style.dataset.noteBlockTarget = blockId;
            style.textContent = `.note-prose [data-id="${blockId}"] { border-radius: 4px; box-shadow: 0 0 0 3px #f5a62366; }`;
            document.head.append(style);
            window.setTimeout(() => style.remove(), 2400);
          } else if ((attempts += 1) < 20) {
            window.setTimeout(mark, 100);
          }
        };
        // setTimeout, not requestAnimationFrame: frames do not run in a background tab.
        window.setTimeout(mark, 0);
      }
      if (reason) {
        markReadOnly();
      } else if (parsed.repaired) {
        // Persist what load repaired (new block ids, coerced attributes).
        change(loaded.title, fromEditorJSON(current.getJSON()));
      } else {
        baselineRef.current(loaded.title, fromEditorJSON(current.getJSON()));
      }
    },
    [change, embedded, markReadOnly],
  );

  const appliedVersionRef = useRef<string | null>(null);
  useEffect(() => {
    if (!editor || !note) return;
    const key = `${note.id}:${note.updatedAt}:${note.version}`;
    // Saves update the version locally; only a fresh load replaces the content.
    if (appliedVersionRef.current?.startsWith(`${note.id}:`) && status !== "idle") return;
    if (appliedVersionRef.current === key) return;
    appliedVersionRef.current = key;
    applyNote(note, editor);
  }, [applyNote, editor, note, status]);

  // The server's copy matched the one shown from the earlier visit: editing starts now.
  useEffect(() => {
    if (editor && fresh && !readOnlyReason && !editor.isEditable) editor.setEditable(true, false);
  }, [editor, fresh, readOnlyReason]);

  // A long title wraps onto more lines instead of being cut off.
  useEffect(() => {
    const box = titleBoxRef.current;
    if (!box) return;
    box.style.height = "auto";
    box.style.height = `${box.scrollHeight}px`;
  }, [title, note]);

  useEffect(() => {
    if (status === "saved") onSaved();
  }, [onSaved, status]);

  // Rangan reads and changes this page only while it is open and editable (never an earlier copy).
  useEffect(() => {
    if (!editor || !note || !fresh || readOnlyReason) return;
    const rename = (next: string) => {
      setTitle(next);
      titleRef.current = next;
      if (editor.isEditable) change(next, fromEditorJSON(editor.getJSON()));
    };
    useOpenPage.getState().register({ noteId, title: title || "Untitled", editor, saveNow, rename });
    return () => useOpenPage.getState().unregister(noteId, editor);
  }, [editor, note, fresh, readOnlyReason, noteId, title, saveNow, change]);

  // Save before leaving the page or the note.
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (status === "dirty" || status === "saving" || status === "conflict" || status === "error") {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [status]);

  useEffect(() => () => void saveNow(), [saveNow]);

  if (loadError) {
    return (
      <div className="notes-empty">
        <p>{loadError}</p>
        <div className="notes-empty-actions">
          <button type="button" className="notes-secondary-btn" onClick={() => void reload()}>Try again</button>
          <Link className="notes-secondary-btn" href={PAGES_TAB}>Back to pages</Link>
        </div>
      </div>
    );
  }

  const ancestors = noteAncestors(notes, noteId);
  const currentEntry = notes.find((entry) => entry.id === noteId) ?? null;

  return (
    <div className={`note-view ${noteFontVariables}`}>
      <NoteTopline
        noteId={noteId}
        itemId={note?.itemId ?? null}
        embedded={embedded}
        crumbs={
          <nav className="note-breadcrumbs" aria-label="Breadcrumbs">
            <Link href={PAGES_TAB}>Pages</Link>
            {ancestors.map((ancestor) => (
              <span key={ancestor.id}>
                <span className="note-crumb-sep">/</span>
                <Link href={`/notes/${ancestor.id}`}>{ancestor.title || "Untitled"}</Link>
              </span>
            ))}
          </nav>
        }
        status={<SaveIndicator status={status} />}
        actions={{
          onAddToBoard: () => setAddToWorkspaceOpen(true),
          onHistory: () => setHistoryOpen(true),
          onMove: () => setMoveOpen(true),
          onCollections: () => setCollectionsOpen(true),
          ...(editor && fresh && !readOnlyReason ? { onFixFormulas: () => fixFormulas(editor) } : {}),
          onDeleted: onSaved,
        }}
      />

      {conflict ? (
        <div className="note-banner warning" role="alert">
          <strong>This page was changed somewhere else.</strong> Your changes are kept here and not saved.
          <div className="note-banner-actions">
            <button type="button" onClick={async () => { appliedVersionRef.current = null; await loadLatest(); }}>Load latest</button>
            <button type="button" onClick={() => void keepMine()}>Keep mine</button>
            <button
              type="button"
              onClick={async () => {
                const id = await saveAsNew();
                if (id) router.push(`/notes/${id}`);
                else toast.error("The copy could not be saved.");
              }}
            >
              Save mine as a new note
            </button>
          </div>
        </div>
      ) : null}
      {readOnlyReason ? <div className="note-banner info" role="status">{readOnlyReason}{note?.deletedAt ? (
        <button type="button" className="note-inline-btn" onClick={async () => {
          const restored = await api(`/api/notes/${noteId}/restore`, { method: "POST" });
          if (restored.ok) { appliedVersionRef.current = null; await reload(); onSaved(); }
        }}>Restore</button>
      ) : null}</div> : null}
      {refreshError && note ? <div className="note-banner info" role="status">Showing your last copy of this page. {refreshError} Trying again…</div> : null}
      {status === "error" ? <div className="note-banner warning" role="alert">Saving failed. Your changes are kept here and saving is retried automatically. <button type="button" className="note-inline-btn" onClick={() => void saveNow()}>Retry now</button></div> : null}

      {note ? (
      <textarea
        ref={titleBoxRef}
        className="note-title-input"
        value={title}
        rows={1}
        placeholder="Untitled"
        aria-label="Page title"
        readOnly={Boolean(readOnlyReason) || !fresh}
        maxLength={500}
        onChange={(event) => {
          // A title is one line: pasted line breaks become spaces.
          const next = event.target.value.replace(/[\r\n]+/g, " ");
          setTitle(next);
          titleRef.current = next;
          if (editor && editor.isEditable) change(next, fromEditorJSON(editor.getJSON()));
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            editor?.commands.focus("start");
          }
        }}
      />
      ) : (
        <div className="note-skeleton" role="status" aria-label="Opening the page">
          <span className="note-skeleton-title" />
          <span />
          <span />
          <span className="note-skeleton-short" />
        </div>
      )}

      {note && !readOnlyReason ? <NoteChips noteId={noteId} itemId={note.itemId} /> : null}
      {/* Mouse: a bubble on selection. Touch: one toolbar above the keyboard (the system's own
          selection bar takes the space a bubble would use). */}
      {editor && !readOnlyReason && !coarsePointer ? <NoteBubbleMenu editor={editor} onFlashcard={() => void makeFlashcard(editor, noteId)} onAskRangan={() => askRanganAbout(editor, title)} /> : null}
      {editor && !readOnlyReason && !coarsePointer ? <TableBubbleMenu editor={editor} /> : null}
      {editor && !readOnlyReason ? <LinkMenu editor={editor} navigate={(url) => router.push(url)} /> : null}
      {editor && !readOnlyReason && coarsePointer ? (
        <KeyboardToolbar
          editor={editor}
          onFlashcard={() => void makeFlashcard(editor, noteId)}
          onAskRangan={() => askRanganAbout(editor, title)}
          onAttach={[
            { label: "Upload a file", run: (current) => pickAndUpload(current) },
            { label: "From your Shelf", run: (current) => void embedFromShelf(current, shelfRef.current) },
            { label: "Link, video or PDF address", run: (current) => void embedFromUrl(current, () => void refreshShelfRef.current()) },
          ]}
        />
      ) : null}
      <EditorContent
        editor={editor}
        className="note-editor"
        onClickCapture={(event) => {
          // A click on a link places the caret (its menu offers Open). Ctrl/⌘-click opens it at
          // once, and on a page that can't be edited a plain click does.
          const anchor = event.target instanceof Element ? event.target.closest(".note-prose a") : null;
          if (!anchor || !editor || (editor.isEditable && !event.metaKey && !event.ctrlKey)) return;
          const target = linkTarget({ href: anchor.getAttribute("href"), ref: null });
          if (!target) return;
          event.preventDefault();
          event.stopPropagation();
          openLink(target, (url) => router.push(url));
        }}
      />
      {note ? <AppearsIn refString={`note:${noteId}`} className="note-appears-in" /> : null}
      {note ? <RelatedInLibrary noteId={noteId} title={title} embedded={embedded} /> : null}

      {addToWorkspaceOpen ? <AddToWorkspaceDialog noteId={noteId} onClose={() => setAddToWorkspaceOpen(false)} /> : null}
      {moveOpen && currentEntry ? <MoveDialog note={currentEntry} notes={notes} onClose={() => setMoveOpen(false)} onMoved={onSaved} /> : null}
      {collectionsOpen && note?.itemId ? <CollectionsDialog itemId={note.itemId} onClose={() => setCollectionsOpen(false)} /> : null}
      {historyOpen ? (
        <HistoryPanel
          noteId={noteId}
          onClose={() => setHistoryOpen(false)}
          onRestored={async () => {
            appliedVersionRef.current = null;
            await reload();
            onSaved();
          }}
          beforeAction={saveNow}
        />
      ) : null}
    </div>
  );
}

function SaveIndicator({ status }: { status: string }) {
  const label =
    status === "saving" ? "Saving…"
      : status === "dirty" ? "Unsaved changes"
        : status === "saved" ? "Saved"
          : status === "conflict" ? "Not saved"
            : status === "error" ? "Not saved"
              : status === "readonly" ? "Read-only"
                : "";
  return <span className={`note-save-status ${status}`} aria-live="polite">{label}</span>;
}

/** True on touch-first devices (phones, tablets): they get the keyboard toolbar instead of the bubble. */
function useCoarsePointer() {
  const [coarse, setCoarse] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(pointer: coarse)");
    const update = () => setCoarse(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return coarse;
}

/** Events from a block's own controls (marked `data-note-interactive`) are not editor input. */
function stopInteractiveEvent({ event }: { event: Event }) {
  return event.target instanceof Element && event.target.closest("[data-note-interactive]") !== null;
}

/** "Make flashcard": the selected text (or the current block) becomes the question; the card points at the block. */
/** "Explain this": hands the selected text, and the page it is on, to Rangan. */
function askRanganAbout(editor: Editor, title: string) {
  const { from, to } = editor.state.selection;
  const text = editor.state.doc.textBetween(from, to, " ").trim();
  if (!text) {
    toast.error("Select some text for Rangan to explain.");
    return;
  }
  void useRanganStore.getState().explain(text, title);
}

async function makeFlashcard(editor: Editor, noteId: string) {
  const { state } = editor;
  const { from, to, $from } = state.selection;
  let blockId: string | null = null;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const id = $from.node(depth).attrs.id;
    if (typeof id === "string" && /^b_[A-Za-z0-9_-]{10}$/.test(id)) {
      blockId = id;
      break;
    }
  }
  const selected = state.doc.textBetween(from, to, " ").trim();
  const front = (selected || $from.parent.textContent).trim().slice(0, 2000);
  if (!front) {
    toast.error("Select some text for the question first.");
    return;
  }
  const back = await askText({
    title: "New flashcard",
    label: `Answer for: “${front.slice(0, 80)}${front.length > 80 ? "…" : ""}”`,
    confirmText: "Add flashcard",
    multiline: true,
    validate: (value) => (value.trim() ? null : "Type the answer."),
  });
  if (back === null) return;
  const result = await api("/api/flashcards", {
    method: "POST",
    body: JSON.stringify({ front, back, sourceRef: `note:${noteId}${blockId ? `#${blockId}` : ""}` }),
  });
  if (result.ok) toast.success("Flashcard added");
  else toast.error(result.error ?? "The flashcard could not be added.");
}

function HistoryPanel({
  noteId, onClose, onRestored, beforeAction,
}: { noteId: string; onClose: () => void; onRestored: () => Promise<void>; beforeAction: () => Promise<void> }) {
  const { data: revisions, mutate } = useSWR(`/api/notes/${noteId}/revisions`, async (url: string) => {
    const result = await api<Revision[]>(url);
    if (!result.ok || !result.data) throw new Error(result.error ?? "History could not be loaded.");
    return result.data;
  });
  const [busy, setBusy] = useState(false);

  return (
    <div className="notes-dialog-backdrop" role="presentation" onClick={onClose}>
      <div className="notes-dialog notes-history" role="dialog" aria-modal="true" aria-label="Version history" onClick={(event) => event.stopPropagation()}>
        <div className="notes-history-head">
          <h2>Version history</h2>
          <button type="button" className="notes-icon-btn" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>
        <button
          type="button"
          className="notes-secondary-btn"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await beforeAction();
            const result = await api(`/api/notes/${noteId}/revisions`, { method: "POST" });
            setBusy(false);
            if (result.ok) {
              toast.success("Version saved");
              void mutate();
            } else toast.error(result.error ?? "The version could not be saved.");
          }}
        >
          Save this version
        </button>
        {!revisions ? <p className="notes-muted">Loading…</p> : revisions.length === 0 ? <p className="notes-muted">No earlier versions yet. Versions are kept automatically every 10 minutes while you write.</p> : (
          <ul className="notes-history-list">
            {revisions.map((revision) => (
              <li key={revision.id}>
                <div>
                  <div className="notes-history-title">{revision.title || "Untitled"}</div>
                  <div className="notes-muted">{REASON_LABELS[revision.reason] ?? revision.reason} · {new Date(revision.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short", hour12: true })}</div>
                </div>
                <button
                  type="button"
                  className="notes-secondary-btn"
                  disabled={busy}
                  onClick={async () => {
                    const ok = await askConfirm({ title: "Restore this version?", message: "Your current text is kept in the history first.", confirmText: "Restore" });
                    if (!ok) return;
                    setBusy(true);
                    await beforeAction();
                    const result = await api(`/api/notes/${noteId}/revisions/${revision.id}/restore`, { method: "POST" });
                    setBusy(false);
                    if (!result.ok) {
                      toast.error(result.error ?? "The version could not be restored.");
                      return;
                    }
                    toast.success("Version restored");
                    await onRestored();
                    onClose();
                  }}
                >
                  Restore
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function AddToWorkspaceDialog({ noteId, onClose }: { noteId: string; onClose: () => void }) {
  const router = useRouter();
  const { data: workspaces, error } = useSWR("/api/workspace", async (url: string) => {
    const result = await api<Array<{ id: string; title: string }>>(url);
    if (!result.ok || !result.data) throw new Error(result.error ?? "Workspaces could not be loaded.");
    return result.data;
  });
  return (
    <div className="notes-dialog-backdrop" role="presentation" onClick={onClose}>
      <div className="notes-dialog" role="dialog" aria-modal="true" aria-label="Add to a board" onClick={(event) => event.stopPropagation()}>
        <div className="notes-history-head">
          <h2>Add to a board</h2>
          <button type="button" className="notes-icon-btn" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>
        <p className="notes-muted">The page appears as a card on the board, and its PDFs, videos and links appear in the board’s vault. Opening the card edits this same page.</p>
        {error ? <p className="notes-muted">Workspaces could not be loaded.</p> : !workspaces ? <p className="notes-muted">Loading…</p> : workspaces.length === 0 ? <p className="notes-muted">You have no boards yet. Open this page’s board from the page menu to create one.</p> : (
          <ul className="notes-history-list">
            {workspaces.map((workspace) => (
              <li key={workspace.id}>
                <div className="notes-history-title">{workspace.title || "Untitled workspace"}</div>
                <button type="button" className="notes-secondary-btn" onClick={() => router.push(`/workspaces/${workspace.id}?addNote=${encodeURIComponent(noteId)}`)}>
                  Add here
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
