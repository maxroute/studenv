"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Compass, FilePlus2, Loader2, MessageCircleQuestion, Sparkles } from "lucide-react";
import { toast } from "react-hot-toast";
import { useNotePanelStore } from "@/hooks/use-note-panel-store";
import type { RanganTurn } from "@/hooks/use-rangan-store";
import type { RanganPassageLink } from "@/lib/services/rangan.service";

/** Where a passage is, in a few words: "Textbook, p. 4" or "Cell biology". */
function linkLabel(link: RanganPassageLink) {
  const place = link.open?.kind === "pdf" ? `p. ${link.open.page}` : "";
  return [link.title || "Untitled", place].filter(Boolean).join(", ");
}

type Props = {
  turn: Extract<RanganTurn, { role: "explore" }>;
  onOpen: (link: RanganPassageLink) => void;
  onAsk: (question: string) => void;
  /** True on a board, where a new page opens in the board's side panel. */
  onBoard: boolean;
  onNavigate: () => void;
};

/** "What should I explore next?": gaps checked against the library, connections, and questions to ask. */
export function RanganExploreCard({ turn, onOpen, onAsk, onBoard, onNavigate }: Props) {
  const router = useRouter();
  const { explore } = turn;
  const [creating, setCreating] = useState<string | null>(null);
  const [created, setCreated] = useState<Record<string, string>>({});
  const pageId = explore.pageRef.startsWith("note:") ? explore.pageRef.slice(5) : null;

  /** A new page for a gap, under the page explored from. */
  const makePage = async (concept: string) => {
    if (creating) return;
    setCreating(concept);
    try {
      const response = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: concept, parentId: pageId }),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok || typeof json?.data?.id !== "string") throw new Error(json?.error ?? "The page could not be created.");
      setCreated((current) => ({ ...current, [concept]: json.data.id }));
      toast.success(`Made a page for "${concept}"${explore.title ? ` under "${explore.title}"` : ""}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The page could not be created.");
    } finally {
      setCreating(null);
    }
  };

  const openPage = (id: string) => {
    if (onBoard) {
      useNotePanelStore.getState().open(id);
      onNavigate();
      return;
    }
    onNavigate();
    router.push(`/notes/${encodeURIComponent(id)}`);
  };

  return (
    <div className="rangan-plan rangan-explore">
      <div className="rangan-plan-head">
        <Compass size={16} aria-hidden />
        <span className="rangan-plan-goal">Explore from “{explore.title || "Untitled"}”</span>
      </div>

      {explore.gaps.length > 0 ? (
        <section className="rangan-explore-section" aria-label="Worth learning next">
          <h4 className="rangan-explore-label">Worth learning next</h4>
          <ul className="rangan-explore-list">
            {explore.gaps.map((gap) => (
              <li key={gap.concept} className="rangan-explore-item">
                <span className="rangan-explore-concept">{gap.concept}</span>
                {gap.why ? <span className="rangan-plan-meta">{gap.why}</span> : null}
                {gap.covered ? (
                  <button type="button" className="rangan-explore-where" onClick={() => gap.covered && onOpen(gap.covered)}>
                    <Check size={13} aria-hidden /> In your library: {linkLabel(gap.covered)}
                  </button>
                ) : (
                  <span className="rangan-explore-missing">Not in your library yet</span>
                )}
                <span className="rangan-explore-actions">
                  <button type="button" className="rangan-chip" onClick={() => onAsk(`Explain ${gap.concept}`)}>
                    <Sparkles size={13} aria-hidden /> Explain
                  </button>
                  {!gap.covered ? (
                    created[gap.concept] ? (
                      <button type="button" className="rangan-chip" onClick={() => openPage(created[gap.concept])}>
                        Open new page
                      </button>
                    ) : (
                      <button type="button" className="rangan-chip" onClick={() => void makePage(gap.concept)} disabled={creating !== null}>
                        {creating === gap.concept ? <Loader2 size={13} className="rangan-spin" aria-hidden /> : <FilePlus2 size={13} aria-hidden />} Make a page
                      </button>
                    )
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {explore.connect.length > 0 ? (
        <section className="rangan-explore-section" aria-label="Connects to">
          <h4 className="rangan-explore-label">Connects to</h4>
          <ul className="rangan-explore-list">
            {explore.connect.map((link) => (
              <li key={link.ref} className="rangan-explore-item">
                <button type="button" className="rangan-explore-where" onClick={() => onOpen(link)} disabled={!link.open}>
                  {linkLabel(link)}
                </button>
                {link.why ? <span className="rangan-plan-meta">{link.why}</span> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {explore.questions.length > 0 ? (
        <section className="rangan-explore-section" aria-label="Ask next">
          <h4 className="rangan-explore-label">Ask next</h4>
          <div className="rangan-explore-questions">
            {explore.questions.map((question) => (
              <button key={question} type="button" className="rangan-example" onClick={() => onAsk(question)}>
                <MessageCircleQuestion size={14} aria-hidden /> {question}
              </button>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
