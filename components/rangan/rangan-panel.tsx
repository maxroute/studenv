"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import { BookOpen, Compass, FileText, Globe, ListTree, Loader2, NotebookText, RotateCcw, Send, Trash2, X } from "lucide-react";
import { useNotePanelStore } from "@/hooks/use-note-panel-store";
import { useRanganStore, type RanganCitationView, type RanganTurn } from "@/hooks/use-rangan-store";
import { CITATION_HREF_PREFIX, linkCitations, type OpenTarget } from "@/lib/rangan/citations";
import { RanganLogo } from "./rangan-launcher";
import { RanganExploreCard } from "./rangan-explore-card";
import { RanganPageDraftCard, RanganPageEditCard } from "./rangan-page-card";
import { RanganPlanCard } from "./rangan-plan-card";
import { isExploreRequest } from "@/lib/rangan/discover";
import { splitBeyond } from "@/lib/rangan/trust";
import "./rangan.css";

const NotePdfViewer = dynamic(() => import("@/components/notes/note-pdf-viewer").then((mod) => mod.NotePdfViewer), {
  ssr: false,
});

const EXAMPLES = [
  "What did I write about this topic?",
  "Connect my notes on two subjects",
  "Summarize what I know so far",
  "Plan my revision for the next two weeks",
];

const SOURCE_LABEL: Record<string, string> = { note: "Page", pdf: "PDF", transcript: "Video", item: "Shelf", web: "Wikipedia" };

type PdfOpen = { assetId: string; title: string; page: number };

function SourceIcon({ type }: { type: string }) {
  if (type === "pdf") return <FileText size={14} aria-hidden />;
  if (type === "note") return <NotebookText size={14} aria-hidden />;
  if (type === "web") return <Globe size={14} aria-hidden />;
  return <BookOpen size={14} aria-hidden />;
}

function Answer({ turn, onOpen }: { turn: Extract<RanganTurn, { role: "assistant" }>; onOpen: (citation: RanganCitationView) => void }) {
  const byNumber = new Map(turn.citations.map((citation) => [citation.n, citation]));
  const numbers = turn.citations.map((citation) => citation.n);
  const { sourced, beyond } = splitBeyond(turn.content);
  const fromWeb = turn.citations.some((citation) => citation.sourceType === "web");
  const markdown = (text: string) => (
    <ReactMarkdown
      disallowedElements={["img"]}
      components={{
        a: ({ href, children }) => {
          if (href?.startsWith(CITATION_HREF_PREFIX)) {
            const citation = byNumber.get(Number(href.slice(CITATION_HREF_PREFIX.length)));
            if (!citation) return <>{children}</>;
            return (
              <button
                type="button"
                className={`rangan-cite${citation.sourceType === "web" ? " web" : ""}`}
                title={`${citation.title}${citation.heading ? ` › ${citation.heading}` : ""}`}
                onClick={() => onOpen(citation)}
                disabled={!citation.open}
              >
                {citation.n}
              </button>
            );
          }
          const safe = href && /^https?:\/\//i.test(href);
          return safe ? (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ) : (
            <>{children}</>
          );
        },
      }}
    >
      {linkCitations(text, numbers)}
    </ReactMarkdown>
  );
  return (
    <div className="rangan-answer">
      {sourced.trim() ? markdown(sourced) : null}
      {beyond ? (
        <div className="rangan-beyond" role="note">
          <div className="rangan-beyond-label">Beyond your sources · not checked, so verify this</div>
          {markdown(beyond)}
        </div>
      ) : null}
      {turn.partial ? (
        <p className="rangan-partial">This is long, so Rangan summarized evenly spaced parts of it.</p>
      ) : null}
      {turn.support && turn.support.removed > 0 ? (
        <p className="rangan-partial">
          Rangan checked its sources and took off {turn.support.removed} citation{turn.support.removed === 1 ? "" : "s"} the source didn&apos;t
          support. Treat those sentences as unchecked.
        </p>
      ) : null}
      {turn.support && !turn.support.checked ? (
        <p className="rangan-partial">Rangan couldn&apos;t double-check its citations this time. Open the sources to confirm.</p>
      ) : null}
      {turn.citations.length > 0 ? (
        <div className="rangan-sources" aria-label="Sources">
          <div className="rangan-sources-label">{fromWeb ? "Sources" : "From your library"}</div>
          {turn.citations.map((citation) => (
            <button
              key={citation.n}
              type="button"
              className="rangan-source"
              onClick={() => onOpen(citation)}
              disabled={!citation.open}
            >
              <span className="rangan-source-n">{citation.n}</span>
              <span className="rangan-source-body">
                <span className="rangan-source-title">
                  <SourceIcon type={citation.sourceType} />
                  <span className="rangan-source-name">{citation.title || "Untitled"}</span>
                  <span className="rangan-source-kind">
                    {citation.open?.kind === "pdf" ? `p. ${citation.open.page}` : SOURCE_LABEL[citation.sourceType] ?? ""}
                  </span>
                </span>
                {citation.heading && citation.open?.kind !== "pdf" ? (
                  <span className="rangan-source-heading">{citation.heading}</span>
                ) : null}
                <span className="rangan-source-snippet">{citation.snippet}</span>
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Rangan's side panel: ask about your library, get answers that cite it. */
export function RanganPanel() {
  const router = useRouter();
  const pathname = usePathname();
  const { turns, pending, usage, close, ask, retry, clear, summarize, explore } = useRanganStore();
  const boardNoteId = useNotePanelStore((state) => state.noteId);
  const [draft, setDraft] = useState("");
  const [pdf, setPdf] = useState<PdfOpen | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const onBoard = pathname?.startsWith("/workspaces/") ?? false;
  const spent = usage !== null && usage.remaining <= 0;
  // The page in front of the student: the open page, or the page in the board's side panel.
  const pageMatch = pathname?.match(/^\/notes\/([^/?#]+)/);
  const currentNoteId = pageMatch ? decodeURIComponent(pageMatch[1]) : onBoard ? boardNoteId : null;

  useEffect(() => {
    // Focus without scrolling the page; on phones this also brings up the keyboard.
    inputRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTo({ top: list.scrollHeight, behavior: "smooth" });
  }, [turns.length, pending]);

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape" && !pdf) close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close, pdf]);

  const isNarrow = () => typeof window !== "undefined" && window.matchMedia("(max-width: 639px)").matches;

  const openCitation = (citation: RanganCitationView) => {
    const target: OpenTarget | null = citation.open;
    if (!target) return;
    if (target.kind === "pdf") {
      setPdf({ assetId: target.assetId, title: citation.title, page: target.page });
      return;
    }
    if (target.kind === "note") {
      if (onBoard) {
        // Stay on the board: the note opens in the board's side panel.
        close();
        useNotePanelStore.getState().open(target.noteId);
        return;
      }
      if (isNarrow()) close();
      router.push(`/notes/${encodeURIComponent(target.noteId)}${target.blockId ? `#${target.blockId}` : ""}`);
      return;
    }
    if (target.kind === "web") {
      window.open(target.url, "_blank", "noopener,noreferrer");
      return;
    }
    const href = `/shelf/${encodeURIComponent(target.itemId)}`;
    if (onBoard) {
      window.open(href, "_blank", "noopener");
      return;
    }
    if (isNarrow()) close();
    router.push(href);
  };

  const submit = () => {
    const question = draft.trim();
    if (!question || pending || spent) return;
    setDraft("");
    // "What should I explore next?" gets a card built from the page in front of the student.
    if (isExploreRequest(question)) void explore(currentNoteId ? `note:${currentNoteId}` : undefined, question);
    else void ask(question);
  };

  const onInputKey = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  };

  let body: ReactNode;
  if (turns.length === 0 && !pending) {
    body = (
      <div className="rangan-empty">
        <RanganLogo size={64} className="rangan-empty-logo" />
        <p className="rangan-empty-title">Ask about anything in your library</p>
        <p className="rangan-empty-text">Rangan reads your pages, PDFs and videos and answers with links to where it found things.</p>
        <div className="rangan-examples">
          {EXAMPLES.map((example) => (
            <button
              key={example}
              type="button"
              className="rangan-example"
              onClick={() => {
                setDraft(example);
                inputRef.current?.focus();
              }}
            >
              {example}
            </button>
          ))}
        </div>
      </div>
    );
  } else {
    body = (
      <>
        {turns.map((turn) =>
          turn.role === "user" ? (
            <div key={turn.id} className="rangan-question">
              {turn.quote ? <blockquote className="rangan-quote">{turn.quote}</blockquote> : null}
              {turn.content}
            </div>
          ) : turn.role === "assistant" ? (
            <Answer key={turn.id} turn={turn} onOpen={openCitation} />
          ) : turn.role === "page" ? (
            <RanganPageDraftCard
              key={turn.id}
              turn={turn}
              onBoard={onBoard}
              onNavigate={() => {
                if (isNarrow() && !onBoard) close();
              }}
            />
          ) : turn.role === "edit" ? (
            <RanganPageEditCard key={turn.id} turn={turn} />
          ) : turn.role === "explore" ? (
            <RanganExploreCard
              key={turn.id}
              turn={turn}
              onOpen={(link) => openCitation({ ...link, n: 0 })}
              onAsk={(question) => void ask(question)}
              onBoard={onBoard}
              onNavigate={() => {
                if (isNarrow() && !onBoard) close();
              }}
            />
          ) : turn.role === "plan" ? (
            <RanganPlanCard
              key={turn.id}
              turn={turn}
              onNavigate={() => {
                // The planner page replaces what's in front; on phones the panel would cover it.
                if (isNarrow() || onBoard) close();
              }}
            />
          ) : (
            <div key={turn.id} className="rangan-error" role="alert">
              <span>{turn.content}</span>
              {turn.retry ? (
                <button type="button" className="rangan-retry" onClick={() => turn.retry && void retry(turn.retry)}>
                  <RotateCcw size={13} aria-hidden /> Try again
                </button>
              ) : null}
            </div>
          ),
        )}
        {pending ? (
          <div className="rangan-thinking" aria-live="polite">
            <Loader2 size={15} className="rangan-spin" aria-hidden /> Searching your library…
          </div>
        ) : null}
      </>
    );
  }

  return createPortal(
    <>
      <aside className="rangan-panel" aria-label="Rangan" data-workspace-overlay="true">
        <header className="rangan-header">
          <div className="rangan-heading">
            <RanganLogo size={28} className="rangan-header-logo" />
            <span className="rangan-name">Rangan</span>
            {usage ? (
              <span className={`rangan-usage${usage.remaining <= 3 ? " low" : ""}`} title="Resets at midnight UTC">
                {usage.remaining} of {usage.limit} left today
              </span>
            ) : null}
          </div>
          <div className="rangan-header-actions">
            {turns.length > 0 ? (
              <button type="button" className="rangan-icon-btn" onClick={clear} aria-label="New conversation" title="New conversation" disabled={pending}>
                <Trash2 size={16} />
              </button>
            ) : null}
            <button type="button" className="rangan-icon-btn" onClick={close} aria-label="Close Rangan" title="Close (Esc)">
              <X size={18} />
            </button>
          </div>
        </header>

        <div className="rangan-messages" ref={listRef}>
          {body}
        </div>

        <form
          className="rangan-compose"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          {!spent ? (
            <div className="rangan-chips">
              {currentNoteId ? (
                <button
                  type="button"
                  className="rangan-chip"
                  disabled={pending}
                  onClick={() => void summarize(`note:${currentNoteId}`, "Summarize this page")}
                >
                  <ListTree size={14} aria-hidden /> Summarize this page
                </button>
              ) : null}
              <button
                type="button"
                className="rangan-chip"
                disabled={pending}
                onClick={() => void explore(currentNoteId ? `note:${currentNoteId}` : undefined)}
                title={currentNoteId ? "From this page" : "From the page you edited last"}
              >
                <Compass size={14} aria-hidden /> What should I explore next?
              </button>
            </div>
          ) : null}
          <div className="rangan-input-row">
            <textarea
              ref={inputRef}
              className="rangan-input"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={onInputKey}
              placeholder={spent ? "You've used today's questions" : "Ask Rangan…"}
              aria-label="Ask Rangan"
              rows={1}
              maxLength={2_000}
              disabled={spent}
            />
            <button type="submit" className="rangan-send" aria-label="Send" disabled={!draft.trim() || pending || spent}>
              {pending ? <Loader2 size={16} className="rangan-spin" /> : <Send size={16} />}
            </button>
          </div>
          <p className="rangan-privacy">
            To answer, the relevant parts of your library and your question are sent to Groq or Cloudflare. When your library has
            little on a question, the question is also looked up on Wikipedia. Answers can be wrong, so check the sources.
          </p>
        </form>
      </aside>
      {pdf ? <NotePdfViewer assetId={pdf.assetId} title={pdf.title} initialPage={pdf.page} onClose={() => setPdf(null)} /> : null}
    </>,
    document.body,
  );
}
