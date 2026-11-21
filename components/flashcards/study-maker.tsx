"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { Check, FileText, Layers, ListChecks, Loader2, Play, RotateCcw, StickyNote, X } from "lucide-react";
import { NotePdfViewer } from "@/components/notes/note-pdf-viewer";
import type { StudySource } from "@/lib/models/study.model";
import type { OpenTarget } from "@/lib/rangan/citations";
import type { FlashcardsResult, QuizResult, StudySourceLink } from "@/lib/services/study.service";

// "Make from library": pick a page, PDF or video, then make flashcards (added
// to the deck) or take a quiz on it. Each uses one daily Rangan question.

type Response<T> = { ok: boolean; status: number; data?: T; error?: string };

async function call<T>(url: string, init?: RequestInit): Promise<Response<T>> {
  const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const json = await response.json().catch(() => null);
  return { ok: response.ok && Boolean(json?.ok), status: response.status, data: json?.data, error: json?.error };
}

const loadSources = async (url: string) => {
  const result = await call<StudySource[]>(url);
  if (!result.ok || !result.data) throw new Error(result.error ?? "Your library could not be loaded.");
  return result.data;
};

/** What to tell the student when making cards or a quiz failed. */
function failureMessage(result: Response<unknown>) {
  if (result.status === 429 || result.status === 404 || result.status === 400) return result.error ?? "That did not work.";
  return "Rangan couldn't do that right now, so your question was given back. Please try again in a minute.";
}

const KIND_LABEL = { note: "Page", pdf: "PDF", video: "Video" } as const;

function KindIcon({ kind }: { kind: StudySource["kind"] }) {
  if (kind === "pdf") return <FileText size={16} aria-hidden />;
  if (kind === "video") return <Play size={16} aria-hidden />;
  return <StickyNote size={16} aria-hidden />;
}

export function StudyMaker({ onReview }: { onReview: () => void }) {
  const router = useRouter();
  const { data: sources, error } = useSWR("/api/study/sources", loadSources, { revalidateOnFocus: false });
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<StudySource | null>(null);
  const [busy, setBusy] = useState<"flashcards" | "quiz" | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [cards, setCards] = useState<FlashcardsResult | null>(null);
  const [quiz, setQuiz] = useState<QuizResult | null>(null);
  const [pdf, setPdf] = useState<{ assetId: string; title: string; page: number } | null>(null);

  const shown = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return (sources ?? []).filter((source) => words.every((word) => source.title.toLowerCase().includes(word))).slice(0, 60);
  }, [sources, query]);

  const make = async (what: "flashcards" | "quiz") => {
    if (!selected || busy) return;
    setBusy(what);
    setFailure(null);
    const result = await call<FlashcardsResult | QuizResult>(`/api/study/${what}`, { method: "POST", body: JSON.stringify({ ref: selected.ref }) });
    setBusy(null);
    if (!result.ok || !result.data) {
      setFailure(failureMessage(result));
      return;
    }
    if (what === "flashcards" && "cards" in result.data) setCards(result.data);
    if (what === "quiz" && "questions" in result.data) setQuiz(result.data);
  };

  const openSource = (target: OpenTarget | null, title: string) => {
    if (!target) return;
    if (target.kind === "pdf") setPdf({ assetId: target.assetId, title, page: target.page });
    else if (target.kind === "note") router.push(`/notes/${encodeURIComponent(target.noteId)}${target.blockId ? `#${target.blockId}` : ""}`);
    else if (target.kind === "web") window.open(target.url, "_blank", "noopener,noreferrer");
    else if (target.kind === "board") router.push(`/workspaces/${encodeURIComponent(target.boardId)}`);
    else router.push(`/shelf/${encodeURIComponent(target.itemId)}`);
  };

  const viewer = pdf ? <NotePdfViewer assetId={pdf.assetId} title={pdf.title} initialPage={pdf.page} onClose={() => setPdf(null)} /> : null;

  if (quiz) {
    return (
      <>
        <QuizView quiz={quiz} onOpen={(link) => openSource(link.open, quiz.title)} onClose={() => setQuiz(null)} />
        {viewer}
      </>
    );
  }

  if (cards) {
    return (
      <div className="study-result">
        <div className="study-result-head">
          <h2><Check size={18} aria-hidden /> Added {cards.created} cards from “{cards.title}”</h2>
          <p className="notes-muted">
            {cards.replaced > 0 ? `${cards.replaced} earlier AI cards you had not reviewed were replaced. ` : ""}
            {cards.partial ? "The source is long, so the cards cover evenly spaced parts of it. " : ""}
            {cards.usage.remaining} Rangan questions left today.
          </p>
        </div>
        <ul className="study-card-preview">
          {cards.cards.map((card, index) => (
            <li key={index}>
              <div className="flashcard-row-front">{card.front}</div>
              <div className="notes-muted">{card.back}</div>
              <SourceButton link={card.source} onOpen={(link) => openSource(link.open, cards.title)} />
            </li>
          ))}
        </ul>
        <div className="study-actions">
          <button type="button" className="notes-primary-btn" onClick={onReview}><Layers size={16} /> Review now</button>
          <button type="button" className="study-secondary-btn" onClick={() => setCards(null)}>Make more</button>
        </div>
        {viewer}
      </div>
    );
  }

  return (
    <div className="study-maker">
      <p className="notes-muted">
        Pick a page, PDF or video from your library. Rangan makes flashcards for your deck, or a quiz with explanations. Each uses one of your daily Rangan questions.
      </p>
      <input
        className="study-search"
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search your pages, PDFs and videos"
        aria-label="Search your library"
      />
      {error ? (
        <p className="notes-muted">Your library could not be loaded.</p>
      ) : !sources ? (
        <p className="notes-muted">Loading…</p>
      ) : sources.length === 0 ? (
        <p className="notes-muted">Nothing to study yet. Write a page, upload a PDF or add a YouTube video first.</p>
      ) : shown.length === 0 ? (
        <p className="notes-muted">Nothing matches.</p>
      ) : (
        <ul className="study-sources" role="listbox" aria-label="Library">
          {shown.map((source) => (
            <li key={source.ref}>
              <button
                type="button"
                role="option"
                aria-selected={selected?.ref === source.ref}
                className={selected?.ref === source.ref ? "selected" : ""}
                onClick={() => {
                  setSelected(source);
                  setFailure(null);
                }}
              >
                <KindIcon kind={source.kind} />
                <span className="study-source-title">{source.title}</span>
                <span className="study-source-kind">{KIND_LABEL[source.kind]}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="study-actions study-actions-sticky">
        <p className="study-selected">
          {selected ? <>Selected: <strong>{selected.title}</strong></> : <span className="notes-muted">Select something to study.</span>}
        </p>
        <button type="button" className="notes-primary-btn" disabled={!selected || busy !== null} onClick={() => void make("flashcards")}>
          {busy === "flashcards" ? <Loader2 size={16} className="note-spin" /> : <Layers size={16} />} Make flashcards
        </button>
        <button type="button" className="study-secondary-btn" disabled={!selected || busy !== null} onClick={() => void make("quiz")}>
          {busy === "quiz" ? <Loader2 size={16} className="note-spin" /> : <ListChecks size={16} />} Quiz me
        </button>
      </div>
      {busy ? <p className="notes-muted" aria-live="polite">Rangan is reading “{selected?.title}”…</p> : null}
      {failure ? <p className="study-failure" role="alert">{failure}</p> : null}
    </div>
  );
}

function SourceButton({ link, onOpen }: { link: StudySourceLink; onOpen: (link: StudySourceLink) => void }) {
  if (!link.open) return <span className="study-source-link">{link.label}</span>;
  return (
    <button type="button" className="study-source-link" onClick={() => onOpen(link)}>
      {link.label}
    </button>
  );
}

function QuizView({ quiz, onOpen, onClose }: { quiz: QuizResult; onOpen: (link: StudySourceLink) => void; onClose: () => void }) {
  const [index, setIndex] = useState(0);
  const [picks, setPicks] = useState<Array<number | null>>(() => quiz.questions.map(() => null));
  const done = index >= quiz.questions.length;
  const score = picks.reduce<number>((sum, pick, i) => sum + (pick === quiz.questions[i].answer ? 1 : 0), 0);

  if (done) {
    return (
      <div className="study-result">
        <div className="study-result-head">
          <h2>You got {score} of {quiz.questions.length}</h2>
          <p className="notes-muted">Quiz on “{quiz.title}”. {quiz.usage.remaining} Rangan questions left today.</p>
        </div>
        <ul className="study-card-preview">
          {quiz.questions.map((question, i) => (
            <li key={i}>
              <div className="flashcard-row-front">
                {picks[i] === question.answer ? <Check size={14} className="study-right" aria-label="Right" /> : <X size={14} className="study-wrong" aria-label="Wrong" />} {question.question}
              </div>
              <div className="notes-muted">Answer: {question.options[question.answer]}</div>
              <SourceButton link={question.source} onOpen={onOpen} />
            </li>
          ))}
        </ul>
        <div className="study-actions">
          <button type="button" className="notes-primary-btn" onClick={() => { setPicks(quiz.questions.map(() => null)); setIndex(0); }}>
            <RotateCcw size={16} /> Try again
          </button>
          <button type="button" className="study-secondary-btn" onClick={onClose}>Done</button>
        </div>
      </div>
    );
  }

  const question = quiz.questions[index];
  const picked = picks[index];
  return (
    <div className="study-quiz">
      <div className="study-quiz-top">
        <span className="notes-muted">Question {index + 1} of {quiz.questions.length} · {quiz.title}</span>
        <button type="button" className="notes-icon-btn" aria-label="Leave quiz" onClick={onClose}><X size={16} /></button>
      </div>
      <div className="flashcard-face">
        <div className="flashcard-front">{question.question}</div>
        <div className="study-options">
          {question.options.map((option, i) => {
            const state = picked === null ? "" : i === question.answer ? "right" : i === picked ? "wrong" : "dim";
            return (
              <button
                key={i}
                type="button"
                className={state}
                disabled={picked !== null}
                onClick={() => setPicks((current) => current.map((value, j) => (j === index ? i : value)))}
              >
                <span className="study-option-letter">{String.fromCharCode(65 + i)}</span>
                <span>{option}</span>
              </button>
            );
          })}
        </div>
        {picked !== null ? (
          <div className="study-explanation" aria-live="polite">
            <strong className={picked === question.answer ? "study-right" : "study-wrong"}>{picked === question.answer ? "Right." : "Not quite."}</strong>{" "}
            {question.explanation}
            <div><SourceButton link={question.source} onOpen={onOpen} /></div>
          </div>
        ) : null}
      </div>
      {picked !== null ? (
        <button type="button" className="notes-primary-btn flashcard-reveal" onClick={() => setIndex(index + 1)}>
          {index + 1 < quiz.questions.length ? "Next question" : "See score"}
        </button>
      ) : null}
    </div>
  );
}
