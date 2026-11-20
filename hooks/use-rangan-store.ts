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

/** What a turn asked for, so a failed one can be sent again exactly. */
export type RanganRequest =
  | { kind: "ask"; question: string; focus?: { text: string; title?: string } }
  | { kind: "summarize"; ref: string; label: string };

export type RanganTurn =
  | { id: string; role: "user"; content: string; quote?: string }
  | { id: string; role: "assistant"; content: string; citations: RanganCitationView[]; partial?: boolean }
  | { id: string; role: "error"; content: string; retry: RanganRequest | null };

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
  /** "Explain this": opens the panel and asks about text selected on a page. */
  explain: (text: string, title?: string) => Promise<void>;
  /** Opens the panel and summarizes a page (`note:<id>`) or a PDF or video (`asset:<id>`). */
  summarize: (ref: string, label: string) => Promise<void>;
  /** Sends a failed request again, in place of the failed attempt. */
  retry: (request: RanganRequest) => Promise<void>;
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

/** Errors that retrying cannot fix: the daily limit, a bad request, a missing page. */
const NOT_RETRYABLE = new Set([400, 404, 429]);

/**
 * Rangan's conversation and panel state. Kept in memory only: a reload starts
 * a fresh conversation, and nothing about it is written to the browser.
 */
export const useRanganStore = create<RanganState>((set, get) => {
  /** Sends one request and appends its answer, or an error that can be retried. */
  async function run(request: RanganRequest) {
    if (get().pending) return;
    const history = get()
      .turns.filter((turn): turn is Extract<RanganTurn, { role: "user" | "assistant" }> => turn.role !== "error")
      .slice(-HISTORY_TURNS)
      .map((turn) => ({ role: turn.role, content: turn.content.slice(0, HISTORY_CHARS) }));
    const userTurn: RanganTurn =
      request.kind === "summarize"
        ? { id: newId(), role: "user", content: request.label }
        : { id: newId(), role: "user", content: request.question, ...(request.focus ? { quote: request.focus.text } : {}) };
    set((state) => ({ pending: true, turns: [...state.turns.filter((turn) => turn.role !== "error"), userTurn] }));

    const url = request.kind === "summarize" ? "/api/rangan/summarize" : "/api/rangan/ask";
    const payload =
      request.kind === "summarize"
        ? { ref: request.ref }
        : { question: request.question, ...(history.length ? { history } : {}), ...(request.focus ? { focus: request.focus } : {}) };
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body: unknown = await response.json().catch(() => null);
      const usage = usageFrom(body);
      if (usage) set({ usage });
      if (!response.ok) {
        const retry = NOT_RETRYABLE.has(response.status) ? null : request;
        set((state) => ({ turns: [...state.turns, { id: newId(), role: "error", content: errorMessage(response.status, body), retry }] }));
        return;
      }
      const answer = body as { answer?: unknown; citations?: unknown; partial?: unknown };
      set((state) => ({
        turns: [
          ...state.turns,
          {
            id: newId(),
            role: "assistant",
            content: typeof answer.answer === "string" ? answer.answer : "",
            citations: Array.isArray(answer.citations) ? (answer.citations as RanganCitationView[]) : [],
            ...(answer.partial === true ? { partial: true } : {}),
          },
        ],
      }));
    } catch {
      set((state) => ({
        turns: [
          ...state.turns,
          { id: newId(), role: "error", content: "You seem to be offline. Check your connection and try again.", retry: request },
        ],
      }));
    } finally {
      set({ pending: false });
    }
  }

  return {
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
    ask: async (raw) => {
      const question = raw.trim();
      if (question) await run({ kind: "ask", question: question.slice(0, 2_000) });
    },
    explain: async (raw, title) => {
      const text = raw.trim().slice(0, 4_000);
      if (!text) return;
      get().openPanel();
      const page = title?.trim().slice(0, 500);
      await run({ kind: "ask", question: "Explain this", focus: page ? { text, title: page } : { text } });
    },
    summarize: async (ref, label) => {
      get().openPanel();
      await run({ kind: "summarize", ref, label });
    },
    retry: async (request) => {
      set((state) => {
        const turns = state.turns.filter((turn) => turn.role !== "error");
        return { turns: turns.at(-1)?.role === "user" ? turns.slice(0, -1) : turns };
      });
      await run(request);
    },
  };
});
