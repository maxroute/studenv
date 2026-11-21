"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import { Check, ChevronDown, ChevronUp, FilePlus2, Layers, Loader2, PencilLine, Undo2 } from "lucide-react";
import { toast } from "react-hot-toast";
import { useNotePanelStore } from "@/hooks/use-note-panel-store";
import { useVoiceAction } from "@/hooks/use-voice-action";
import { useRanganStore, type RanganTurn } from "@/hooks/use-rangan-store";
import { citationLabel, type PageChange } from "@/lib/rangan/page";
import { applyPageEdit, createPageFromDraft, flashcardsFromPage } from "./page-actions";
import { CreateBoardButton, MapOutline } from "./rangan-map-card";

/**
 * The Markdown as a preview shows it: citation marks dropped (the sources are
 * listed under it) and callout markers as words, as the page will show them
 * as callouts.
 */
const withoutMarks = (markdown: string) =>
  markdown
    .replace(/\s*\[\d{1,2}\]/g, "")
    .replace(/\[!(?:warning|mistake|caution|important)\]\s*/gi, "⚠️ ")
    .replace(/\[!(?:tip|note|info)\]\s*/gi, "💡 ");

function Sources({ citations }: { citations: ReadonlyArray<Parameters<typeof citationLabel>[0] & { n: number; sourceType: string }> }) {
  if (citations.length === 0) return <p className="rangan-plan-meta">No sources found: written from general knowledge, so check it.</p>;
  return (
    <p className="rangan-plan-meta">
      From {citations.map((citation) => `${citationLabel(citation)}${citation.sourceType === "web" ? " (Wikipedia)" : ""}`).join(" · ")}
    </p>
  );
}

function SupportNote({ support }: { support: { checked: boolean; removed: number } }) {
  if (!support.checked) return <p className="rangan-plan-note">Rangan couldn&apos;t double-check its citations this time.</p>;
  if (support.removed > 0) {
    return (
      <p className="rangan-plan-note">
        Rangan checked its sources and took off {support.removed} citation{support.removed === 1 ? "" : "s"} the source didn&apos;t support.
      </p>
    );
  }
  return null;
}

/** A new page Rangan wrote: preview, then create it as an ordinary page. */
export function RanganPageDraftCard({ turn, onBoard, onNavigate }: { turn: Extract<RanganTurn, { role: "page" }>; onBoard: boolean; onNavigate: () => void }) {
  const router = useRouter();
  const markPageCreated = useRanganStore((state) => state.markPageCreated);
  const { draft } = turn;
  const [busy, setBusy] = useState<"create" | "cards" | null>(null);
  const [showAll, setShowAll] = useState(false);

  const create = async () => {
    if (busy) return false;
    setBusy("create");
    const result = await createPageFromDraft(draft);
    setBusy(null);
    if (!result.ok || !result.noteId) {
      toast.error(result.ok ? "The page could not be created." : result.message);
      return false;
    }
    markPageCreated(turn.id, result.noteId);
    toast.success(`Created "${draft.title}".`);
    return true;
  };
  useVoiceAction(turn.id, turn.noteId ? null : create);

  const open = (noteId: string) => {
    if (onBoard) useNotePanelStore.getState().open(noteId);
    else router.push(`/notes/${encodeURIComponent(noteId)}`);
    onNavigate();
  };

  const makeCards = async (noteId: string) => {
    if (busy) return;
    setBusy("cards");
    const result = await flashcardsFromPage(noteId);
    setBusy(null);
    if (result.ok) toast.success(`Added ${result.created} flashcards. Review them in Flashcards.`);
    else toast.error(result.message);
  };

  return (
    <div className="rangan-plan rangan-page">
      <div className="rangan-plan-head">
        <FilePlus2 size={16} aria-hidden />
        <span className="rangan-plan-goal">{draft.title}</span>
      </div>
      <p className="rangan-plan-meta">A new page written by Rangan. Nothing is saved until you create it.</p>
      {draft.outline.length ? (
        <ol className="rangan-page-outline">
          {draft.outline.map((heading, index) => (
            <li key={`${heading}-${index}`}>{heading}</li>
          ))}
        </ol>
      ) : null}
      <button type="button" className="rangan-page-toggle" onClick={() => setShowAll((value) => !value)} aria-expanded={showAll}>
        {showAll ? <ChevronUp size={14} aria-hidden /> : <ChevronDown size={14} aria-hidden />} {showAll ? "Hide the page" : "Read the whole page"}
      </button>
      {showAll ? (
        <div className="rangan-answer rangan-page-preview">
          <ReactMarkdown disallowedElements={["img", "a"]} unwrapDisallowed>
            {withoutMarks(draft.markdown)}
          </ReactMarkdown>
        </div>
      ) : null}
      <Sources citations={draft.citations} />
      <SupportNote support={draft.support} />
      {draft.map ? (
        <div className="rangan-page-map">
          <p className="rangan-plan-meta">And a mind map for a board{turn.noteId ? ", linked to this page" : ""}:</p>
          <MapOutline map={draft.map} />
          <div className="rangan-plan-actions">
            <CreateBoardButton turnId={turn.id} map={draft.map} boardId={turn.boardId ?? null} pageNoteId={turn.noteId} onNavigate={onNavigate} />
          </div>
        </div>
      ) : null}
      <div className="rangan-plan-actions">
        {turn.noteId ? (
          <>
            <span className="rangan-plan-saved">
              <Check size={15} aria-hidden /> Page created
            </span>
            <button type="button" className="rangan-chip" onClick={() => turn.noteId && open(turn.noteId)}>
              Open page
            </button>
            <button type="button" className="rangan-chip" onClick={() => turn.noteId && void makeCards(turn.noteId)} disabled={busy !== null} title="Uses one Rangan question">
              {busy === "cards" ? <Loader2 size={13} className="rangan-spin" aria-hidden /> : <Layers size={13} aria-hidden />} Make flashcards
            </button>
          </>
        ) : (
          <button type="button" className="rangan-plan-add" onClick={create} disabled={busy !== null}>
            {busy === "create" ? <Loader2 size={15} className="rangan-spin" aria-hidden /> : <FilePlus2 size={15} aria-hidden />} Create page
          </button>
        )}
      </div>
    </div>
  );
}

/** "Add after “Drivers are small pieces…”": where a change goes, by the text the student sees. */
function changeLabel(change: PageChange, planned: readonly { text: string }[]) {
  const quote = (n: number) => {
    const text = (planned[n - 1]?.text ?? "").replace(/\s+/g, " ").trim();
    return text ? `“${text.length > 40 ? `${text.slice(0, 40).trimEnd()}…` : text}”` : `block ${n}`;
  };
  if (change.kind === "insert") return change.after === 0 ? "Add at the top" : `Add after ${quote(change.after)}`;
  return change.from === change.to ? "Replace" : `Replace ${change.to - change.from + 1} blocks`;
}

/** A change to the open page: what goes and what comes, then Apply. */
export function RanganPageEditCard({ turn }: { turn: Extract<RanganTurn, { role: "edit" }> }) {
  const markEditApplied = useRanganStore((state) => state.markEditApplied);
  const { edit, planned } = turn;
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const apply = async () => {
    if (busy) return;
    setBusy(true);
    setProblem(null);
    const result = await applyPageEdit(edit, planned);
    setBusy(false);
    if (!result.ok) {
      setProblem(result.message);
      return;
    }
    markEditApplied(turn.id);
    toast.success("Change applied. Your earlier text is saved in History.");
  };

  return (
    <div className="rangan-plan rangan-page">
      <div className="rangan-plan-head">
        <PencilLine size={16} aria-hidden />
        <span className="rangan-plan-goal">Suggested change</span>
      </div>
      <p className="rangan-plan-meta">{edit.summary}</p>
      <ol className="rangan-edit-list">
        {edit.changes.map((change, index) => (
          <li key={index} className="rangan-edit">
            <span className="rangan-edit-label">{changeLabel(change, planned)}</span>
            {change.kind === "replace" ? (
              <div className="rangan-edit-old" aria-label="Removed">
                {planned.slice(change.from - 1, change.to).map((block, offset) => (
                  <p key={offset}>{block.text || "(empty)"}</p>
                ))}
              </div>
            ) : null}
            <div className="rangan-edit-new rangan-answer" aria-label="Added">
              <ReactMarkdown disallowedElements={["img", "a"]} unwrapDisallowed>
                {withoutMarks(change.markdown)}
              </ReactMarkdown>
            </div>
          </li>
        ))}
      </ol>
      <Sources citations={edit.citations} />
      <SupportNote support={edit.support} />
      {problem ? (
        <p className="rangan-plan-note" role="alert">
          {problem}
        </p>
      ) : null}
      <div className="rangan-plan-actions">
        {turn.applied ? (
          <span className="rangan-plan-saved">
            <Undo2 size={15} aria-hidden /> Applied. Undo it with Ctrl/⌘ Z, or restore the earlier version from History.
          </span>
        ) : (
          <button type="button" className="rangan-plan-add" onClick={apply} disabled={busy}>
            {busy ? <Loader2 size={15} className="rangan-spin" aria-hidden /> : <Check size={15} aria-hidden />} Apply to the page
          </button>
        )}
      </div>
    </div>
  );
}
