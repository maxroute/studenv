"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { ArrowLeft, FileText, Layers, ListChecks, Loader2, Play, StickyNote } from "lucide-react";
import { QuizView } from "@/components/flashcards/study-maker";
import { reportUsage } from "@/lib/client/usage-bus";
import type { StudySource } from "@/lib/models/study.model";
import type { OpenTarget } from "@/lib/rangan/citations";
import type { FlashcardsResult, QuizResult, StudySourceLink } from "@/lib/services/study.service";
// The quiz is the Flashcards page's own, with its styles (scoped to .study-* classes).
import "@/components/flashcards/flashcards.css";

// Rangan's study tools inside the panel: summarize, a quiz or flashcards for
// the open page, or for something picked from the library. Each uses one of
// the day's questions; a quiz is taken right here, cards go to the deck.

export type StudyAction = "summarize" | "quiz" | "flashcards";

export const STUDY_ACTION_LABEL: Record<StudyAction, string> = { summarize: "Summarize", quiz: "Quiz me", flashcards: "Flashcards" };

type Reply<T> = { ok: boolean; status: number; data?: T; error?: string };

async function post<T>(url: string, body: unknown): Promise<Reply<T>> {
  try {
    const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = await response.json().catch(() => null);
    reportUsage(json);
    return { ok: response.ok && Boolean(json?.ok), status: response.status, data: json?.data, error: json?.error };
  } catch {
    return { ok: false, status: 0, error: "You seem to be offline. Check your connection and try again." };
  }
}

const loadSources = async (url: string): Promise<StudySource[]> => {
  const response = await fetch(url);
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.ok) throw new Error(json?.error ?? "Your library could not be loaded.");
  return json.data;
};

function KindIcon({ kind }: { kind: StudySource["kind"] }) {
  if (kind === "pdf") return <FileText size={15} aria-hidden />;
  if (kind === "video") return <Play size={15} aria-hidden />;
  return <StickyNote size={15} aria-hidden />;
}

/** Choose a page, PDF or video from the library for a study tool. */
export function RanganSourcePicker({ action, onPick, onBack }: { action: StudyAction; onPick: (source: StudySource) => void; onBack: () => void }) {
  const { data: sources, error, isLoading } = useSWR("/api/study/sources", loadSources, { revalidateOnFocus: false });
  const [query, setQuery] = useState("");
  const shown = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return (sources ?? []).filter((source) => words.every((word) => source.title.toLowerCase().includes(word))).slice(0, 50);
  }, [sources, query]);

  return (
    <div className="rangan-study">
      <div className="rangan-study-head">
        <button type="button" className="rangan-icon-btn" onClick={onBack} aria-label="Back to the chat">
          <ArrowLeft size={16} />
        </button>
        <span>{STUDY_ACTION_LABEL[action]}: pick from your library</span>
      </div>
      <input
        className="rangan-study-search"
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search pages, PDFs and videos"
        aria-label="Search your library"
      />
      {isLoading ? (
        <p className="rangan-study-note">
          <Loader2 size={14} className="rangan-spin" aria-hidden /> Loading your library…
        </p>
      ) : error ? (
        <p className="rangan-study-note" role="alert">{error instanceof Error ? error.message : "Your library could not be loaded."}</p>
      ) : shown.length === 0 ? (
        <p className="rangan-study-note">{sources?.length ? "Nothing matches that." : "Add a page, PDF or video to your library first."}</p>
      ) : (
        <ul className="rangan-study-sources">
          {shown.map((source) => (
            <li key={source.ref}>
              <button type="button" onClick={() => onPick(source)}>
                <KindIcon kind={source.kind} />
                <span>{source.title || "Untitled"}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * One request per tap, kept by its id: React runs effects twice in
 * development, and each request spends one of the day's questions.
 */
const requests = new Map<string, Promise<Reply<QuizResult | FlashcardsResult>>>();

/** A quiz to take or flashcards made, for one source; runs once when shown. */
export function RanganStudyResult({
  runId,
  action,
  source,
  onDone,
  onOpenPdf,
}: {
  /** A new id for each tap: the same id never asks twice. */
  runId: string;
  action: Exclude<StudyAction, "summarize">;
  source: { ref: string; title: string };
  onDone: () => void;
  onOpenPdf: (pdf: { assetId: string; title: string; page: number }) => void;
}) {
  const router = useRouter();
  const [quiz, setQuiz] = useState<QuizResult | null>(null);
  const [cards, setCards] = useState<FlashcardsResult | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let request = requests.get(runId);
    if (!request) {
      request = post<QuizResult | FlashcardsResult>(`/api/study/${action}`, { ref: source.ref });
      requests.set(runId, request);
    }
    void request.then((result) => {
      if (cancelled) return;
      if (!result.ok || !result.data) {
        setFailure(
          result.status === 429 || result.status === 400 || result.status === 404
            ? result.error ?? "That didn't work."
            : "Rangan couldn't do that right now, so your question was given back. Please try again in a minute.",
        );
        return;
      }
      if ("questions" in result.data) setQuiz(result.data);
      else setCards(result.data);
    });
    return () => {
      cancelled = true;
    };
  }, [runId, action, source.ref]);

  const open = (link: StudySourceLink) => {
    const target: OpenTarget | null = link.open;
    if (!target) return;
    if (target.kind === "pdf") onOpenPdf({ assetId: target.assetId, title: source.title, page: target.page });
    else if (target.kind === "note") router.push(`/notes/${encodeURIComponent(target.noteId)}${target.blockId ? `#${target.blockId}` : ""}`);
    else if (target.kind === "web") window.open(target.url, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="rangan-study">
      <div className="rangan-study-head">
        <button type="button" className="rangan-icon-btn" onClick={onDone} aria-label="Back to the chat">
          <ArrowLeft size={16} />
        </button>
        <span>
          {action === "quiz" ? <ListChecks size={15} aria-hidden /> : <Layers size={15} aria-hidden />} {STUDY_ACTION_LABEL[action]} · {source.title || "Untitled"}
        </span>
      </div>
      {failure ? (
        <p className="rangan-study-note" role="alert">{failure}</p>
      ) : quiz ? (
        <QuizView quiz={quiz} onOpen={open} onClose={onDone} />
      ) : cards ? (
        <div className="rangan-study-cards">
          <p>
            <strong>{cards.created} new card{cards.created === 1 ? "" : "s"}</strong> added to your deck{cards.partial ? " (from the first part of a long source)" : ""}.
          </p>
          <ul>
            {cards.cards.slice(0, 6).map((card, index) => (
              <li key={index}>
                <span className="rangan-study-front">{card.front}</span>
                <span className="rangan-study-back">{card.back}</span>
              </li>
            ))}
          </ul>
          <div className="rangan-study-actions">
            <button type="button" className="rangan-plan-add" onClick={() => router.push("/flashcards")}>
              Review now
            </button>
            <button type="button" className="rangan-chip" onClick={onDone}>
              Back to chat
            </button>
          </div>
        </div>
      ) : (
        <p className="rangan-study-note" aria-live="polite">
          <Loader2 size={14} className="rangan-spin" aria-hidden /> {action === "quiz" ? "Writing your quiz…" : "Making your flashcards…"}
        </p>
      )}
    </div>
  );
}
