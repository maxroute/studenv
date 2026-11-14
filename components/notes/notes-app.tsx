"use client";

import "katex/dist/katex.min.css";
import "./notes.css";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import toast from "react-hot-toast";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import {
  Bold, ChevronDown, ChevronRight, Code, FileText, Heading1, Heading2, Heading3, Highlighter, History, Italic,
  Link2, List, ListChecks, ListOrdered, ListTree, Minus, MoreHorizontal, Plus, Quote, Sigma, SquareCode,
  Strikethrough, Table, Underline, X, Info, ChevronsDownUp, LayoutDashboard, Layers,
} from "lucide-react";
import { useNoteEditor, type LoadedNote } from "@/hooks/use-note-editor";
import { toEditorContent, fromEditorJSON } from "@/lib/notes/editor-bridge";
import { createNoteExtensions, type NoteMentionItem } from "@/lib/notes/editor-extensions";
import { parseNoteDoc } from "@/lib/notes/note-format";
import { buildNoteTree, noteAncestors, noteSubtreeIds, type NoteTreeNode } from "@/lib/notes/note-tree";
import { AppearsIn } from "@/components/refs/appears-in";
import { createMentionSuggestion } from "./mention-suggestion";

type NoteListEntry = { id: string; title: string; parentId: string | null; sortKey: string; itemId: string | null; version: number; updatedAt: string };
type Revision = { id: string; version: number; title: string; reason: string; createdAt: string };

async function api<T>(url: string, init?: RequestInit): Promise<{ ok: boolean; status: number; data?: T; error?: string }> {
  const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const json = await response.json().catch(() => null);
  return { ok: response.ok && Boolean(json?.ok), status: response.status, data: json?.data, error: json?.error };
}

const listFetcher = async (url: string) => {
  const result = await api<NoteListEntry[]>(url);
  if (!result.ok || !result.data) throw new Error(result.error ?? "Notes could not be loaded.");
  return result.data;
};

const REASON_LABELS: Record<string, string> = {
  checkpoint: "Autosaved version",
  manual: "Saved version",
  before_restore: "Before restoring",
  before_overwrite: "Before keeping my copy",
  migration: "Imported from the Shelf",
};

export function NotesApp({ noteId }: { noteId?: string }) {
  const router = useRouter();
  const { data: notes, mutate: refreshNotes, error: listError } = useSWR("/api/notes", listFetcher);
  const [treeOpen, setTreeOpen] = useState(false);

  const createNote = useCallback(
    async (parentId: string | null) => {
      const result = await api<LoadedNote>("/api/notes", { method: "POST", body: JSON.stringify({ title: "Untitled", parentId }) });
      if (!result.ok || !result.data) {
        toast.error(result.error ?? "The note could not be created.");
        return;
      }
      await refreshNotes();
      setTreeOpen(false);
      router.push(`/notes/${result.data.id}`);
    },
    [refreshNotes, router],
  );

  return (
    <div className="notes-app">
      <aside className={`notes-tree-panel${treeOpen ? " open" : ""}`} aria-label="Notes">
        <div className="notes-tree-head">
          <span className="notes-tree-title">Notes</span>
          <button type="button" className="notes-icon-btn" onClick={() => void createNote(null)} title="New note" aria-label="New note">
            <Plus size={16} />
          </button>
          <button type="button" className="notes-icon-btn notes-tree-close" onClick={() => setTreeOpen(false)} aria-label="Close page list">
            <X size={16} />
          </button>
        </div>
        {listError ? <p className="notes-muted">Notes could not be loaded.</p> : null}
        {notes ? (
          <NotesTree
            notes={notes}
            activeId={noteId}
            onCreateChild={(parentId) => void createNote(parentId)}
            onChanged={() => void refreshNotes()}
            onNavigate={() => setTreeOpen(false)}
          />
        ) : !listError ? (
          <p className="notes-muted">Loading…</p>
        ) : null}
      </aside>
      <button type="button" className={`notes-tree-backdrop${treeOpen ? " open" : ""}`} aria-label="Close page list" onClick={() => setTreeOpen(false)} />

      <main className="notes-main">
        <div className="notes-mobile-bar">
          <button type="button" className="notes-icon-btn" onClick={() => setTreeOpen(true)} aria-label="Show pages">
            <ListTree size={18} />
          </button>
        </div>
        {noteId ? (
          <NoteView key={noteId} noteId={noteId} notes={notes ?? []} onSaved={() => void refreshNotes()} />
        ) : (
          <div className="notes-empty">
            <FileText size={32} />
            <h1>Your notes</h1>
            <p className="notes-muted">Pages can hold sub-pages, link to each other with @, and keep their version history.</p>
            <button type="button" className="notes-primary-btn" onClick={() => void createNote(null)}>
              <Plus size={16} /> New note
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

// ── tree ───────────────────────────────────────────────────────────────────

function NotesTree({
  notes, activeId, onCreateChild, onChanged, onNavigate,
}: { notes: NoteListEntry[]; activeId?: string; onCreateChild: (parentId: string) => void; onChanged: () => void; onNavigate: () => void }) {
  const tree = useMemo(() => buildNoteTree(notes), [notes]);
  const activeAncestors = useMemo(() => new Set(activeId ? noteAncestors(notes, activeId).map((n) => n.id) : []), [notes, activeId]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [moving, setMoving] = useState<NoteListEntry | null>(null);
  const router = useRouter();

  const remove = async (note: NoteListEntry) => {
    const result = await api(`/api/notes/${note.id}`, { method: "DELETE" });
    if (!result.ok) {
      toast.error(result.error ?? "The note could not be deleted.");
      return;
    }
    onChanged();
    if (activeId && (activeId === note.id || noteSubtreeIds(notes, note.id).has(activeId))) router.push("/notes");
    toast((t) => (
      <span className="notes-toast">
        Moved “{note.title}” to the trash.
        <button
          type="button"
          onClick={async () => {
            toast.dismiss(t.id);
            const restored = await api(`/api/notes/${note.id}/restore`, { method: "POST" });
            if (restored.ok) onChanged();
            else toast.error("The note could not be restored.");
          }}
        >
          Undo
        </button>
      </span>
    ));
  };

  const renderNode = (node: NoteTreeNode<NoteListEntry>, depth: number) => {
    const isCollapsed = collapsed.has(node.id) && !activeAncestors.has(node.id);
    return (
      <li key={node.id}>
        <div className={`notes-tree-row${node.id === activeId ? " active" : ""}`} style={{ paddingLeft: 6 + depth * 14 }}>
          <button
            type="button"
            className="notes-tree-toggle"
            aria-label={isCollapsed ? "Expand" : "Collapse"}
            disabled={node.children.length === 0}
            onClick={() =>
              setCollapsed((current) => {
                const next = new Set(current);
                if (next.has(node.id)) next.delete(node.id);
                else next.add(node.id);
                return next;
              })
            }
          >
            {node.children.length === 0 ? <span className="notes-tree-dot" /> : isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
          </button>
          <Link href={`/notes/${node.id}`} className="notes-tree-link" onClick={onNavigate}>
            {node.title || "Untitled"}
          </Link>
          <button type="button" className="notes-tree-more" aria-label={`Actions for ${node.title}`} onClick={() => setMenuFor(menuFor === node.id ? null : node.id)}>
            <MoreHorizontal size={15} />
          </button>
          {menuFor === node.id ? (
            <div className="notes-menu" role="menu">
              <button type="button" role="menuitem" onClick={() => { setMenuFor(null); onCreateChild(node.id); }}>Add sub-page</button>
              <button type="button" role="menuitem" onClick={() => { setMenuFor(null); setMoving(node); }}>Move to…</button>
              <button type="button" role="menuitem" className="danger" onClick={() => { setMenuFor(null); void remove(node); }}>Delete</button>
            </div>
          ) : null}
        </div>
        {node.children.length > 0 && !isCollapsed ? <ul>{node.children.map((child) => renderNode(child, depth + 1))}</ul> : null}
      </li>
    );
  };

  return (
    <>
      {tree.length === 0 ? <p className="notes-muted">No notes yet.</p> : <ul className="notes-tree">{tree.map((node) => renderNode(node, 0))}</ul>}
      {moving ? <MoveDialog note={moving} notes={notes} onClose={() => setMoving(null)} onMoved={onChanged} /> : null}
    </>
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
      toast.error(result.error ?? "The note could not be moved.");
      return;
    }
    onMoved();
    onClose();
  };

  return (
    <div className="notes-dialog-backdrop" role="presentation" onClick={onClose}>
      <div className="notes-dialog" role="dialog" aria-modal="true" aria-label="Move note" onClick={(event) => event.stopPropagation()}>
        <h2>Move “{note.title}”</h2>
        <label className="notes-field">
          <span>Put it under</span>
          <select value={parentId} onChange={(event) => setParentId(event.target.value)}>
            <option value="">Top level (shown on the Shelf)</option>
            {choices.map((choice) => (
              <option key={choice.id} value={choice.id}>{choice.title || "Untitled"}</option>
            ))}
          </select>
        </label>
        <p className="notes-muted">Sub-pages are not listed on the Shelf; top-level notes are.</p>
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
  const { note, loadError, status, conflict, change, saveNow, loadLatest, keepMine, saveAsNew, markReadOnly, reload, setBaseline } = editorState;
  const baselineRef = useRef(setBaseline);
  baselineRef.current = setBaseline;
  const [title, setTitle] = useState("");
  const [readOnlyReason, setReadOnlyReason] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [addToWorkspaceOpen, setAddToWorkspaceOpen] = useState(false);
  const titleRef = useRef("");
  const notesRef = useRef<NoteListEntry[]>(notes);
  notesRef.current = notes;

  const extensions = useMemo(
    () =>
      createNoteExtensions({
        mentionSuggestion: createMentionSuggestion((): NoteMentionItem[] =>
          notesRef.current.filter((n) => n.id !== noteId).map((n) => ({ ref: `note:${n.id}`, label: n.title || "Untitled" })),
        ),
      }),
    [noteId],
  );

  const editor = useEditor(
    {
      extensions,
      immediatelyRender: false,
      editable: false,
      editorProps: { attributes: { class: "note-prose", "aria-label": "Note content" } },
      onUpdate: ({ editor: current }) => {
        if (!current.isEditable) return;
        change(titleRef.current, fromEditorJSON(current.getJSON()));
      },
    },
    [extensions],
  );

  // Load (and reload after "Load latest" or a restore) the stored content into the editor.
  const applyNote = useCallback(
    (loaded: LoadedNote, current: Editor) => {
      const parsed = parseNoteDoc(loaded.doc);
      const { content, lossless } = toEditorContent(parsed.envelope.doc, current.schema);
      current.commands.setContent(content, { emitUpdate: false });
      titleRef.current = loaded.title;
      setTitle(loaded.title);
      const reason = loaded.deletedAt
        ? "This note is in the trash. Restore it to edit."
        : !parsed.canSave || !lossless
          ? "This note uses features from a newer version of Studenv. Refresh the page to edit it."
          : null;
      setReadOnlyReason(reason);
      // No update event: switching editing on is not an edit.
      current.setEditable(reason === null, false);
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

  useEffect(() => {
    if (status === "saved") onSaved();
  }, [onSaved, status]);

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
        <Link className="notes-secondary-btn" href="/notes">Back to notes</Link>
      </div>
    );
  }

  const ancestors = noteAncestors(notes, noteId);

  return (
    <div className="note-view">
      <div className="note-topline">
        <nav className="note-breadcrumbs" aria-label="Breadcrumbs">
          <Link href="/notes">Notes</Link>
          {ancestors.map((ancestor) => (
            <span key={ancestor.id}>
              <span className="note-crumb-sep">/</span>
              <Link href={`/notes/${ancestor.id}`}>{ancestor.title || "Untitled"}</Link>
            </span>
          ))}
        </nav>
        <SaveIndicator status={status} />
        {!embedded ? (
          <button type="button" className="notes-icon-btn" onClick={() => setAddToWorkspaceOpen(true)} title="Add to workspace" aria-label="Add to workspace">
            <LayoutDashboard size={16} />
          </button>
        ) : null}
        <button type="button" className="notes-icon-btn" onClick={() => setHistoryOpen(true)} title="Version history" aria-label="Version history">
          <History size={16} />
        </button>
      </div>

      {conflict ? (
        <div className="note-banner warning" role="alert">
          <strong>This note was changed somewhere else.</strong> Your changes are kept here and not saved.
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
      {status === "error" ? <div className="note-banner warning" role="alert">Saving failed. Your changes are kept and will be retried when you keep typing. <button type="button" className="note-inline-btn" onClick={() => void saveNow()}>Retry now</button></div> : null}

      <input
        className="note-title-input"
        value={title}
        placeholder="Untitled"
        aria-label="Note title"
        readOnly={Boolean(readOnlyReason) || !note}
        maxLength={500}
        onChange={(event) => {
          setTitle(event.target.value);
          titleRef.current = event.target.value;
          if (editor && editor.isEditable) change(event.target.value, fromEditorJSON(editor.getJSON()));
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            editor?.commands.focus("start");
          }
        }}
      />

      {editor && !readOnlyReason ? <Toolbar editor={editor} noteId={noteId} /> : null}
      {!note ? <p className="notes-muted">Loading…</p> : null}
      <EditorContent editor={editor} className="note-editor" />
      {note ? <AppearsIn refString={`note:${noteId}`} className="note-appears-in" /> : null}

      {addToWorkspaceOpen ? <AddToWorkspaceDialog noteId={noteId} onClose={() => setAddToWorkspaceOpen(false)} /> : null}
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

/** "Make flashcard": the selected text (or the current block) becomes the question; the card points at the block. */
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
  const back = window.prompt(`Answer for: “${front.slice(0, 80)}”`);
  if (back === null) return;
  const result = await api("/api/flashcards", {
    method: "POST",
    body: JSON.stringify({ front, back, sourceRef: `note:${noteId}${blockId ? `#${blockId}` : ""}` }),
  });
  if (result.ok) toast.success("Flashcard added");
  else toast.error(result.error ?? "The flashcard could not be added.");
}

function Toolbar({ editor, noteId }: { editor: Editor; noteId: string }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const rerender = () => setTick((tick) => tick + 1);
    editor.on("selectionUpdate", rerender);
    editor.on("transaction", rerender);
    return () => {
      editor.off("selectionUpdate", rerender);
      editor.off("transaction", rerender);
    };
  }, [editor]);

  const chain = () => editor.chain().focus();
  const items: Array<{ label: string; icon: React.ReactNode; active?: boolean; run: () => void } | "sep"> = [
    { label: "Bold", icon: <Bold size={15} />, active: editor.isActive("bold"), run: () => chain().toggleBold().run() },
    { label: "Italic", icon: <Italic size={15} />, active: editor.isActive("italic"), run: () => chain().toggleItalic().run() },
    { label: "Underline", icon: <Underline size={15} />, active: editor.isActive("underline"), run: () => chain().toggleUnderline().run() },
    { label: "Strikethrough", icon: <Strikethrough size={15} />, active: editor.isActive("strike"), run: () => chain().toggleStrike().run() },
    { label: "Inline code", icon: <Code size={15} />, active: editor.isActive("code"), run: () => chain().toggleCode().run() },
    { label: "Highlight", icon: <Highlighter size={15} />, active: editor.isActive("highlight"), run: () => chain().toggleHighlight().run() },
    {
      label: "Link",
      icon: <Link2 size={15} />,
      active: editor.isActive("link"),
      run: () => {
        if (editor.isActive("link")) {
          chain().unsetLink().run();
          return;
        }
        const href = window.prompt("Link address (https://…)");
        if (!href) return;
        const safe = /^(https?:|mailto:)/i.test(href.trim()) ? href.trim() : `https://${href.trim()}`;
        chain().extendMarkRange("link").setLink({ href: safe }).run();
      },
    },
    "sep",
    { label: "Heading 1", icon: <Heading1 size={15} />, active: editor.isActive("heading", { level: 1 }), run: () => chain().toggleHeading({ level: 1 }).run() },
    { label: "Heading 2", icon: <Heading2 size={15} />, active: editor.isActive("heading", { level: 2 }), run: () => chain().toggleHeading({ level: 2 }).run() },
    { label: "Heading 3", icon: <Heading3 size={15} />, active: editor.isActive("heading", { level: 3 }), run: () => chain().toggleHeading({ level: 3 }).run() },
    { label: "Bullet list", icon: <List size={15} />, active: editor.isActive("bulletList"), run: () => chain().toggleBulletList().run() },
    { label: "Numbered list", icon: <ListOrdered size={15} />, active: editor.isActive("orderedList"), run: () => chain().toggleOrderedList().run() },
    { label: "Checklist", icon: <ListChecks size={15} />, active: editor.isActive("taskList"), run: () => chain().toggleTaskList().run() },
    { label: "Quote", icon: <Quote size={15} />, active: editor.isActive("blockquote"), run: () => chain().toggleBlockquote().run() },
    { label: "Code block", icon: <SquareCode size={15} />, active: editor.isActive("codeBlock"), run: () => chain().toggleCodeBlock().run() },
    "sep",
    { label: "Callout", icon: <Info size={15} />, run: () => chain().insertContent({ type: "callout", content: [{ type: "paragraph" }] }).run() },
    { label: "Toggle section", icon: <ChevronsDownUp size={15} />, run: () => chain().setDetails().run() },
    { label: "Table", icon: <Table size={15} />, run: () => chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
    {
      label: "Equation",
      icon: <Sigma size={15} />,
      run: () => {
        const latex = window.prompt("Equation (LaTeX)", "E = mc^2");
        if (latex) chain().insertBlockMath({ latex }).run();
      },
    },
    { label: "Divider", icon: <Minus size={15} />, run: () => chain().setHorizontalRule().run() },
    "sep",
    { label: "Make flashcard from selection", icon: <Layers size={15} />, run: () => void makeFlashcard(editor, noteId) },
  ];

  return (
    <div className="note-toolbar" role="toolbar" aria-label="Formatting">
      {items.map((item, index) =>
        item === "sep" ? (
          <span key={`sep-${index}`} className="note-toolbar-sep" />
        ) : (
          <button
            key={item.label}
            type="button"
            title={item.label}
            aria-label={item.label}
            aria-pressed={item.active ?? undefined}
            className={item.active ? "active" : undefined}
            // Keep the editor's selection: act on click, never move focus on press.
            onPointerDown={(event) => event.preventDefault()}
            onClick={item.run}
          >
            {item.icon}
          </button>
        ),
      )}
    </div>
  );
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
                  <div className="notes-muted">{REASON_LABELS[revision.reason] ?? revision.reason} · {new Date(revision.createdAt).toLocaleString()}</div>
                </div>
                <button
                  type="button"
                  className="notes-secondary-btn"
                  disabled={busy}
                  onClick={async () => {
                    if (!window.confirm("Restore this version? Your current text is kept in the history first.")) return;
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
      <div className="notes-dialog" role="dialog" aria-modal="true" aria-label="Add to workspace" onClick={(event) => event.stopPropagation()}>
        <div className="notes-history-head">
          <h2>Add to a workspace</h2>
          <button type="button" className="notes-icon-btn" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>
        <p className="notes-muted">The note appears as a card; opening the card edits this same note.</p>
        {error ? <p className="notes-muted">Workspaces could not be loaded.</p> : !workspaces ? <p className="notes-muted">Loading…</p> : workspaces.length === 0 ? <p className="notes-muted">You have no workspaces yet.</p> : (
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
