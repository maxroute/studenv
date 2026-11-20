"use client";

import { create } from "zustand";
import type { OpenTarget } from "@/lib/rangan/citations";
import type { RanganUsageSummary } from "@/lib/models/rangan.model";

export type RanganCitationView = {
  n: number;
  ref: string;
  sourceType: string;
  title: string;
  heading: string;
  snippet: string;
  open: OpenTarget | null;
};

export type RanganTurn =
  | { id: string; role: "user"; content: string }
  | { id: string; role: "assistant"; content: string; citations: RanganCitationView[] }
  | { id: string; role: "error"; content: string; retryQuestion: string | null };

type RanganState = {
  open: boolean;
  turns: RanganTurn[];
  pending: boolean;
  usage: RanganUsageSummary | null;
  openPanel: () => void;
  close: () => void;
  toggle: () => void;
  clear: () => void;
  refreshUsage: () => Promise<void>;
  ask: (question: string) => Promise<void>;
  /** Asks the last failed question again, in place of the failed attempt. */
  retry: (question: string) => Promise<void>;
};

/** Turns sent back as context, newest last; the API accepts at most 10. */
const HISTORY_TURNS = 10;
const HISTORY_CHARS = 4_000;

let nextId = 1;
const newId = () => `t${nextId++}`;

function errorMessage(status: number, body: unknown): string {
  const error = typeof body === "object" && body !== null ? (body as { error?: unknown }).error : undefined;
  if (status === 429 && typeof error === "string") return error;
  if (status === 401) return "Your session ended. Sign in again to ask Rangan.";
  if (status >= 500) return "Rangan is busy right now. Please try again in a minute.";
  return typeof error === "string" ? error : "Rangan couldn't answer that. Please try again.";
}

function usageFrom(body: unknown): RanganUsageSummary | null {
  if (typeof body !== "object" || body === null) return null;
  const direct = (body as { usage?: unknown }).usage;
  const nested = (body as { details?: { usage?: unknown } }).details?.usage;
  const usage = direct ?? nested;
  return typeof usage === "object" && usage !== null && typeof (usage as RanganUsageSummary).remaining === "number"
    ? (usage as RanganUsageSummary)
    : null;
}

/**
 * Rangan's conversation and panel state. Kept in memory only: a reload starts
 * a fresh conversation, and nothing about it is written to the browser.
 */
export const useRanganStore = create<RanganState>((set, get) => ({
  open: false,
  turns: [],
  pending: false,
  usage: null,
  openPanel: () => {
    set({ open: true });
    void get().refreshUsage();
  },
  close: () => set({ open: false }),
  toggle: () => (get().open ? get().close() : get().openPanel()),
  clear: () => set({ turns: [] }),
  refreshUsage: async () => {
    try {
      const response = await fetch("/api/rangan/usage", { cache: "no-store" });
      const usage = usageFrom(await response.json().catch(() => null));
      if (response.ok && usage) set({ usage });
    } catch {
      // The count is a hint; the server enforces the allowance either way.
    }
  },
  retry: async (question) => {
    set((state) => {
      const turns = state.turns.filter((turn) => turn.role !== "error");
      const last = turns.at(-1);
      return { turns: last?.role === "user" && last.content === question ? turns.slice(0, -1) : turns };
    });
    await get().ask(question);
  },
  ask: async (raw) => {
    const question = raw.trim();
    if (!question || get().pending) return;
    const history = get()
      .turns.filter((turn): turn is Extract<RanganTurn, { role: "user" | "assistant" }> => turn.role !== "error")
      .slice(-HISTORY_TURNS)
      .map((turn) => ({ role: turn.role, content: turn.content.slice(0, HISTORY_CHARS) }));
    set((state) => ({
      pending: true,
      turns: [...state.turns.filter((turn) => turn.role !== "error"), { id: newId(), role: "user", content: question }],
    }));
    try {
      const response = await fetch("/api/rangan/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(history.length ? { question: question.slice(0, 2_000), history } : { question: question.slice(0, 2_000) }),
      });
      const body: unknown = await response.json().catch(() => null);
      const usage = usageFrom(body);
      if (usage) set({ usage });
      if (!response.ok) {
        set((state) => ({
          turns: [
            ...state.turns,
            { id: newId(), role: "error", content: errorMessage(response.status, body), retryQuestion: response.status === 429 ? null : question },
          ],
        }));
        return;
      }
      const answer = body as { answer?: unknown; citations?: unknown };
      set((state) => ({
        turns: [
          ...state.turns,
          {
            id: newId(),
            role: "assistant",
            content: typeof answer.answer === "string" ? answer.answer : "",
            citations: Array.isArray(answer.citations) ? (answer.citations as RanganCitationView[]) : [],
          },
        ],
      }));
    } catch {
      set((state) => ({
        turns: [...state.turns, { id: newId(), role: "error", content: "You seem to be offline. Check your connection and try again.", retryQuestion: question }],
      }));
    } finally {
      set({ pending: false });
    }
  },
}));
