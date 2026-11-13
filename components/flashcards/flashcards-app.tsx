"use client";

import "@/components/notes/notes.css";
import "./flashcards.css";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import toast from "react-hot-toast";
import { Layers, Pencil, Plus, Trash2 } from "lucide-react";

type Card = {
  id: string;
  front: string;
  back: string;
  origin: "ai_generated" | "manual" | "note_block";
  sourceRef: string | null;
  reviews?: Array<{ state: string; due: string; reps: number; lapses: number }>;
};

async function api<T>(url: string, init?: RequestInit): Promise<{ ok: boolean; data?: T; error?: string }> {
  const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const json = await response.json().catch(() => null);
  return { ok: response.ok && Boolean(json?.ok), data: json?.data, error: json?.error };
}

const fetcher = async <T,>(url: string) => {
  const result = await api<T>(url);
  if (!result.ok || result.data === undefined) throw new Error(result.error ?? "Could not load flashcards.");
  return result.data;
};

const RATINGS = [
  { rating: 1, label: "Again", hint: "Forgot" },
  { rating: 2, label: "Hard", hint: "Barely" },
  { rating: 3, label: "Good", hint: "Recalled" },
  { rating: 4, label: "Easy", hint: "Instantly" },
] as const;

function sourceLink(sourceRef: string | null) {
  if (!sourceRef) return null;
  const note = /^note:([^#]+)(#(.+))?$/.exec(sourceRef);
  if (note) return { href: `/notes/${note[1]}${note[3] ? `#${note[3]}` : ""}`, label: "From a note" };
  if (sourceRef.startsWith("asset:")) return { href: null, label: "From a resource" };
  return null;
}

export function FlashcardsApp() {
  const [tab, setTab] = useState<"review" | "all">("review");
  return (
    <div className="flashcards-app">
      <div className="flashcards-head">
        <h1><Layers size={20} /> Flashcards</h1>
        <div className="flashcards-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === "review"} className={tab === "review" ? "active" : ""} onClick={() => setTab("review")}>Review</button>
          <button type="button" role="tab" aria-selected={tab === "all"} className={tab === "all" ? "active" : ""} onClick={() => setTab("all")}>All cards</button>
        </div>
      </div>
      {tab === "review" ? <ReviewQueue /> : <CardList />}
    </div>
  );
}

function ReviewQueue() {
  const { data, mutate, error } = useSWR("/api/flashcards/due", fetcher<{ cards: Card[]; total: number }>);
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);
  const shownAt = useRef(Date.now());
  const card = data?.cards[0];

  useEffect(() => {
    setRevealed(false);
    shownAt.current = Date.now();
  }, [card?.id]);

  if (error) return <p className="notes-muted">Flashcards could not be loaded.</p>;
  if (!data) return <p className="notes-muted">Loading…</p>;
  if (!card) {
    return (
      <div className="notes-empty">
        <h2>All caught up</h2>
        <p className="notes-muted">No cards are due. Add cards from the All cards tab or from a note (select text, then the flashcard button).</p>
      </div>
    );
  }

  const answer = async (rating: 1 | 2 | 3 | 4) => {
    setBusy(true);
    const result = await api(`/api/flashcards/${card.id}/review`, {
      method: "POST",
      body: JSON.stringify({ rating, elapsedMs: Math.min(Date.now() - shownAt.current, 86_400_000) }),
    });
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error ?? "The answer could not be saved.");
      return;
    }
    await mutate();
  };

  const source = sourceLink(card.sourceRef);
  return (
    <div className="flashcard-review">
      <p className="notes-muted">{data.total} due</p>
      <div className="flashcard-face" aria-live="polite">
        <div className="flashcard-front">{card.front}</div>
        {revealed ? <div className="flashcard-back">{card.back || <span className="notes-muted">No answer written</span>}</div> : null}
        {source ? (source.href ? <Link className="flashcard-source" href={source.href}>{source.label}</Link> : <span className="flashcard-source">{source.label}</span>) : null}
      </div>
      {revealed ? (
        <div className="flashcard-ratings">
          {RATINGS.map((item) => (
            <button key={item.rating} type="button" disabled={busy} onClick={() => void answer(item.rating)} className={`rating-${item.rating}`}>
              <strong>{item.label}</strong>
              <span>{item.hint}</span>
            </button>
          ))}
        </div>
      ) : (
        <button type="button" className="notes-primary-btn flashcard-reveal" onClick={() => setRevealed(true)}>Show answer</button>
      )}
    </div>
  );
}

function CardList() {
  const { data: cards, mutate, error } = useSWR("/api/flashcards", fetcher<Card[]>);
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [editing, setEditing] = useState<string | null>(null);

  const create = async () => {
    if (!front.trim()) return;
    const result = await api("/api/flashcards", { method: "POST", body: JSON.stringify({ front, back }) });
    if (!result.ok) {
      toast.error(result.error ?? "The card could not be saved.");
      return;
    }
    setFront("");
    setBack("");
    await mutate();
  };

  return (
    <div className="flashcard-list">
      <form
        className="flashcard-new"
        onSubmit={(event) => {
          event.preventDefault();
          void create();
        }}
      >
        <input value={front} onChange={(event) => setFront(event.target.value)} placeholder="Question (front)" aria-label="Question" maxLength={2000} />
        <input value={back} onChange={(event) => setBack(event.target.value)} placeholder="Answer (back)" aria-label="Answer" maxLength={4000} />
        <button type="submit" className="notes-primary-btn" disabled={!front.trim()}><Plus size={16} /> Add card</button>
      </form>
      {error ? <p className="notes-muted">Flashcards could not be loaded.</p> : !cards ? <p className="notes-muted">Loading…</p> : cards.length === 0 ? <p className="notes-muted">No cards yet.</p> : (
        <ul>
          {cards.map((card) => (
            <li key={card.id}>
              {editing === card.id ? (
                <EditCard card={card} onDone={async () => { setEditing(null); await mutate(); }} />
              ) : (
                <>
                  <div className="flashcard-row-text">
                    <div className="flashcard-row-front">{card.front}</div>
                    <div className="notes-muted">{card.back}</div>
                    <div className="flashcard-row-meta">
                      {card.origin === "ai_generated" ? "AI" : card.origin === "note_block" ? "Note" : "Manual"}
                      {card.reviews?.[0] ? ` · due ${new Date(card.reviews[0].due).toLocaleDateString()}` : " · new"}
                    </div>
                  </div>
                  <button type="button" className="notes-icon-btn" aria-label="Edit card" onClick={() => setEditing(card.id)}><Pencil size={15} /></button>
                  <button
                    type="button"
                    className="notes-icon-btn"
                    aria-label="Delete card"
                    onClick={async () => {
                      if (!window.confirm("Delete this card?")) return;
                      const result = await api(`/api/flashcards/${card.id}`, { method: "DELETE" });
                      if (!result.ok) toast.error(result.error ?? "The card could not be deleted.");
                      await mutate();
                    }}
                  >
                    <Trash2 size={15} />
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EditCard({ card, onDone }: { card: Card; onDone: () => Promise<void> }) {
  const [front, setFront] = useState(card.front);
  const [back, setBack] = useState(card.back);
  return (
    <form
      className="flashcard-new"
      onSubmit={async (event) => {
        event.preventDefault();
        const result = await api(`/api/flashcards/${card.id}`, { method: "PATCH", body: JSON.stringify({ front, back }) });
        if (!result.ok) toast.error(result.error ?? "The card could not be saved.");
        await onDone();
      }}
    >
      <input value={front} onChange={(event) => setFront(event.target.value)} aria-label="Question" maxLength={2000} />
      <input value={back} onChange={(event) => setBack(event.target.value)} aria-label="Answer" maxLength={4000} />
      <button type="submit" className="notes-primary-btn" disabled={!front.trim()}>Save</button>
    </form>
  );
}
