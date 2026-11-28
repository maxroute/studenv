"use client";

import { useState, type FormEvent } from "react";
import useSWR from "swr";
import { Check, Loader2, MessageSquare, Pencil, Plus, Trash2, X } from "lucide-react";
import { apiFetcher } from "@/lib/client/fetcher";
import { CONVERSATIONS_KEY, useRanganStore } from "@/hooks/use-rangan-store";
import type { RanganConversationSummary } from "@/lib/models/rangan.model";

/** "Today 9:40 pm", "Yesterday", "Mon, 16 Nov" in the reader's own time. */
function whenLabel(iso: string) {
  const date = new Date(iso);
  const now = new Date();
  const days = Math.round((new Date(now.toDateString()).getTime() - new Date(date.toDateString()).getTime()) / 86_400_000);
  if (days === 0) return date.toLocaleTimeString(undefined, { hour: "numeric", hour12: true, minute: "2-digit" });
  if (days === 1) return "Yesterday";
  return date.toLocaleDateString(undefined, { weekday: days < 7 ? "short" : undefined, month: "short", day: "numeric" });
}

/**
 * Saved chats, newest first: open one to carry on, rename it, or delete it.
 * Chats are kept with the account, so they are here on every device.
 */
export function RanganHistory({ onDone }: { onDone: () => void }) {
  const { data, error, isLoading, mutate } = useSWR<RanganConversationSummary[]>(CONVERSATIONS_KEY, apiFetcher, { revalidateOnMount: true });
  const conversationId = useRanganStore((state) => state.conversationId);
  const openConversation = useRanganStore((state) => state.openConversation);
  const deleteConversation = useRanganStore((state) => state.deleteConversation);
  const clear = useRanganStore((state) => state.clear);
  const pending = useRanganStore((state) => state.pending);
  const [busy, setBusy] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; title: string } | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const open = async (id: string) => {
    if (busy || pending) return;
    if (id === conversationId) return onDone();
    setBusy(id);
    setFailure(null);
    const opened = await openConversation(id);
    setBusy(null);
    if (opened) onDone();
    else setFailure("That chat couldn't be opened. Please try again.");
  };

  const remove = async (id: string) => {
    setBusy(id);
    setFailure(null);
    const removed = await deleteConversation(id);
    setBusy(null);
    setConfirming(null);
    if (!removed) setFailure("That chat couldn't be deleted. Please try again.");
  };

  const rename = async (event: FormEvent) => {
    event.preventDefault();
    if (!renaming) return;
    const title = renaming.title.replace(/\s+/g, " ").trim().slice(0, 200);
    if (!title) return;
    setBusy(renaming.id);
    setFailure(null);
    try {
      await apiFetcher(`${CONVERSATIONS_KEY}/${encodeURIComponent(renaming.id)}`, { method: "PATCH", body: JSON.stringify({ title }) });
      await mutate((current) => current?.map((chat) => (chat.id === renaming.id ? { ...chat, title } : chat)), { revalidate: false });
      setRenaming(null);
    } catch {
      setFailure("That chat couldn't be renamed. Please try again.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="rangan-history">
      <div className="rangan-history-head">
        <span className="rangan-history-title">Your chats</span>
        <button
          type="button"
          className="rangan-chip"
          disabled={pending}
          onClick={() => {
            clear();
            onDone();
          }}
        >
          <Plus size={14} aria-hidden /> New chat
        </button>
      </div>

      {failure ? (
        <p className="rangan-plan-note" role="alert">
          {failure}
        </p>
      ) : null}

      {!data && !error ? (
        <div className="rangan-history-state" aria-busy={isLoading}>
          <Loader2 size={15} className="rangan-spin" aria-hidden /> Loading your chats…
        </div>
      ) : !data ? (
        <div className="rangan-history-state" role="status">
          Your chats couldn&apos;t load.
          <button type="button" className="rangan-chip" onClick={() => void mutate()}>
            Retry
          </button>
        </div>
      ) : data.length === 0 ? (
        <p className="rangan-history-state">No saved chats yet. Each chat is saved here once Rangan answers.</p>
      ) : (
        <ul className="rangan-history-list">
          {data.map((chat) => (
            <li key={chat.id} className={`rangan-history-row${chat.id === conversationId ? " current" : ""}`}>
              {renaming?.id === chat.id ? (
                <form className="rangan-history-rename" onSubmit={rename}>
                  <input
                    value={renaming.title}
                    maxLength={200}
                    aria-label="Chat name"
                    autoFocus
                    onChange={(event) => setRenaming({ id: chat.id, title: event.target.value })}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        event.stopPropagation();
                        setRenaming(null);
                      }
                    }}
                  />
                  <button type="submit" className="rangan-icon-btn" aria-label="Save name" disabled={busy === chat.id || !renaming.title.trim()}>
                    <Check size={16} />
                  </button>
                  <button type="button" className="rangan-icon-btn" aria-label="Cancel" onClick={() => setRenaming(null)}>
                    <X size={16} />
                  </button>
                </form>
              ) : confirming === chat.id ? (
                <div className="rangan-history-confirm">
                  <span>Delete this chat? This can&apos;t be undone.</span>
                  <button type="button" className="rangan-chip danger" disabled={busy === chat.id} onClick={() => void remove(chat.id)}>
                    {busy === chat.id ? <Loader2 size={14} className="rangan-spin" aria-hidden /> : <Trash2 size={14} aria-hidden />} Delete
                  </button>
                  <button type="button" className="rangan-chip" onClick={() => setConfirming(null)}>
                    Keep
                  </button>
                </div>
              ) : (
                <>
                  <button type="button" className="rangan-history-open" onClick={() => void open(chat.id)} disabled={Boolean(busy) || pending}>
                    {busy === chat.id ? <Loader2 size={15} className="rangan-spin" aria-hidden /> : <MessageSquare size={15} aria-hidden />}
                    <span className="rangan-history-name">{chat.title}</span>
                    <span className="rangan-history-when">{chat.id === conversationId ? "Open now" : whenLabel(chat.updatedAt)}</span>
                  </button>
                  <button type="button" className="rangan-icon-btn" aria-label={`Rename ${chat.title}`} title="Rename" onClick={() => setRenaming({ id: chat.id, title: chat.title })}>
                    <Pencil size={14} />
                  </button>
                  <button type="button" className="rangan-icon-btn" aria-label={`Delete ${chat.title}`} title="Delete" onClick={() => setConfirming(chat.id)}>
                    <Trash2 size={14} />
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
