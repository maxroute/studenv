"use client";

import { create } from "zustand";
import type { OpenTarget } from "@/lib/rangan/citations";
import { localDay } from "@/lib/client/study-plan";
import type { RanganUsageSummary } from "@/lib/models/rangan.model";
import { mergeUsage, pickUsage, usageFromBody } from "@/lib/rangan/usage";
import { onUsage } from "@/lib/client/usage-bus";
import { pageBlocks, useOpenPage } from "@/hooks/use-open-page";
import type { PageBlock } from "@/lib/rangan/page";
import { openBoard, openBoardSummary } from "@/components/rangan/board-actions";
import type { BoardSummary } from "@/lib/workspace/board-edit";
import type { RanganBoardEdit, RanganExplore, RanganMap, RanganPageDraft, RanganPageEdit } from "@/lib/services/rangan.service";
import type { StudyPlanResult } from "@/lib/services/study.service";
import { isPlanRequest } from "@/lib/study/plan-intent";

export type RanganCitationView = {
  n: number;
  ref: string;
  sourceType: string;
  title: string;
  heading: string;
  snippet: string;
  open: OpenTarget | null;
  /** Where it came from: what was open, the library, or the web; absent on older answers. */
  origin?: "open" | "library" | "web";
};

/** A lesson video from an answer, kept only when it has a real YouTube id. */
function videoFrom(value: unknown): { video?: { videoId: string; title: string; channel: string } } {
  if (!value || typeof value !== "object") return {};
  const { videoId, title, channel } = value as Record<string, unknown>;
  return typeof videoId === "string" && /^[A-Za-z0-9_-]{11}$/.test(videoId) && typeof title === "string"
    ? { video: { videoId, title: title.slice(0, 200), channel: typeof channel === "string" ? channel.slice(0, 120) : "" } }
    : {};
}

/** What a turn asked for, so a failed one can be sent again exactly. */
export type RanganRequest =
  | { kind: "ask"; question: string; focus?: { text: string; title?: string } }
  | { kind: "summarize"; ref: string; label: string }
  | { kind: "plan"; request: string }
  /** "What should I explore next?" from a page (`note:<id>`), or from the latest page when none is open. */
  | { kind: "explore"; ref?: string; label: string };

export type RanganTurn =
  | { id: string; role: "user"; content: string; quote?: string }
  | {
      id: string;
      role: "assistant";
      content: string;
      citations: RanganCitationView[];
      partial?: boolean;
      /** The check of cited sentences against their sources; absent on answers from before it existed. */
      support?: { checked: boolean; removed: number };
      /** A lesson video offered when the answer reached beyond the library. */
      video?: { videoId: string; title: string; channel: string };
    }
  | { id: string; role: "error"; content: string; retry: RanganRequest | null }
  /** A study plan shown as a card; `saved` is how many sessions were added to the planner. */
  | { id: string; role: "plan"; plan: StudyPlanResult; saved: number | null }
  /** Gaps, connections and next questions, shown as a card. */
  | { id: string; role: "explore"; explore: RanganExplore }
  /** A new page Rangan wrote; `noteId` once the student created it. */
  | { id: string; role: "page"; draft: RanganPageDraft; noteId: string | null; boardId?: string | null }
  /** A change to the open page; `planned` is the page as it was when Rangan planned it. */
  | { id: string; role: "edit"; edit: RanganPageEdit; planned: PageBlock[]; applied: boolean }
  /** A new map board Rangan drafted; `boardId` once the student created it. */
  | { id: string; role: "map"; map: RanganMap; boardId: string | null }
  /** Additions to the open board; `planned` is the board as it was when Rangan planned them. */
  | { id: string; role: "board-edit"; edit: RanganBoardEdit; planned: BoardSummary; applied: boolean };

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
  /**
   * Shows a usage summary if it is newer than the one shown. Replies can
   * arrive late or out of order, so an older count never replaces a newer one.
   * `broadcast: false` is for a count that came from another tab.
   */
  applyUsage: (incoming: unknown, broadcast?: boolean) => void;
  ask: (question: string) => Promise<void>;
  /** "Explain this": opens the panel and asks about text selected on a page. */
  explain: (text: string, title?: string) => Promise<void>;
  /** Opens the panel and summarizes a page (`note:<id>`) or a PDF or video (`asset:<id>`). */
  summarize: (ref: string, label: string) => Promise<void>;
  /** Sends a failed request again, in place of the failed attempt. */
  retry: (request: RanganRequest) => Promise<void>;
  /** Opens the panel and suggests what to explore next from a page (`note:<id>`), or from the latest page. */
  explore: (ref?: string, label?: string) => Promise<void>;
  /** Records that a plan card's sessions were added to the planner. */
  markPlanSaved: (turnId: string, count: number) => void;
  /** Records that a page draft was created as a page. */
  markPageCreated: (turnId: string, noteId: string) => void;
  /** Records that a page edit or board edit was applied. */
  markEditApplied: (turnId: string) => void;
  /** Records that a map draft (alone or with a page) was created as a board. */
  markBoardCreated: (turnId: string, boardId: string) => void;
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

const USAGE_CHANNEL = "studenv:rangan-usage";
let usageChannel: BroadcastChannel | null = null;

/** Other tabs of this browser hear a new count at once, with no request to the server. */
function channelForUsage(): BroadcastChannel | null {
  if (typeof BroadcastChannel === "undefined") return null;
  try {
    usageChannel ??= new BroadcastChannel(USAGE_CHANNEL);
    return usageChannel;
  } catch {
    return null;
  }
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
      .turns.filter((turn): turn is Extract<RanganTurn, { role: "user" | "assistant" }> => turn.role === "user" || turn.role === "assistant")
      .slice(-HISTORY_TURNS)
      .map((turn) => ({ role: turn.role, content: turn.content.slice(0, HISTORY_CHARS) }));
    const userTurn: RanganTurn =
      request.kind === "summarize"
        ? { id: newId(), role: "user", content: request.label }
        : request.kind === "plan"
          ? { id: newId(), role: "user", content: request.request }
          : request.kind === "explore"
            ? { id: newId(), role: "user", content: request.label }
            : { id: newId(), role: "user", content: request.question, ...(request.focus ? { quote: request.focus.text } : {}) };
    set((state) => ({ pending: true, turns: [...state.turns.filter((turn) => turn.role !== "error"), userTurn] }));

    // The open board or page as it is right now, so Rangan can add to it or change it when asked.
    const board = request.kind === "ask" && !request.focus ? openBoard() : null;
    const boardPlanned = board ? openBoardSummary() : null;
    const open = request.kind === "ask" && !request.focus && !board ? useOpenPage.getState().page : null;
    const planned = open ? pageBlocks(open.editor) : null;

    const url =
      request.kind === "summarize"
        ? "/api/rangan/summarize"
        : request.kind === "plan"
          ? "/api/study/plan"
          : request.kind === "explore"
            ? "/api/rangan/explore"
            : "/api/rangan/ask";
    const payload =
      request.kind === "summarize"
        ? { ref: request.ref }
        : request.kind === "plan"
          ? { request: request.request, today: localDay() }
          : request.kind === "explore"
            ? (request.ref ? { ref: request.ref } : {})
            : {
                question: request.question,
                ...(history.length ? { history } : {}),
                ...(request.focus ? { focus: request.focus } : {}),
                ...(open && planned ? { page: { ref: `note:${open.noteId}`, title: open.title.slice(0, 500), blocks: planned } } : {}),
                ...(board && boardPlanned
                  ? {
                      board: {
                        ref: `workspace:${board.id}`,
                        title: board.title.slice(0, 500),
                        elements: boardPlanned.elements.map(({ key, type, text, selected, locked }) => ({ key, type: type.slice(0, 40), text: text.slice(0, 400), selected, locked })),
                        edges: boardPlanned.edges.slice(0, 400).map((edge) => ({ ...edge, label: edge.label.slice(0, 60) })),
                      },
                    }
                  : {}),
              };
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body: unknown = await response.json().catch(() => null);
      get().applyUsage(usageFromBody(body));
      if (!response.ok) {
        const retry = NOT_RETRYABLE.has(response.status) ? null : request;
        const content =
          request.kind === "plan" && response.status === 404
            ? "Rangan couldn't find notes about that in your library. Name the subject, or choose the material yourself in Planner → Plan with Rangan."
            : errorMessage(response.status, body);
        set((state) => ({ turns: [...state.turns, { id: newId(), role: "error", content, retry }] }));
        return;
      }
      if (request.kind === "explore") {
        const explore = body as RanganExplore | null;
        set((state) => ({
          turns: [
            ...state.turns,
            explore && Array.isArray(explore.gaps)
              ? { id: newId(), role: "explore", explore }
              : { id: newId(), role: "error", content: "Rangan couldn't suggest anything right now. Please try again.", retry: request },
          ],
        }));
        return;
      }
      if (request.kind === "plan") {
        const plan = (body as { data?: StudyPlanResult } | null)?.data;
        set((state) => ({
          turns: [
            ...state.turns,
            plan
              ? { id: newId(), role: "plan", plan, saved: null }
              : { id: newId(), role: "error", content: "Rangan couldn't plan that. Please try again.", retry: request },
          ],
        }));
        return;
      }
      const reply = body as { kind?: unknown } | null;
      if (reply?.kind === "page") {
        set((state) => ({ turns: [...state.turns, { id: newId(), role: "page", draft: body as RanganPageDraft, noteId: null }] }));
        return;
      }
      if (reply?.kind === "map") {
        set((state) => ({ turns: [...state.turns, { id: newId(), role: "map", map: (body as { map: RanganMap }).map, boardId: null }] }));
        return;
      }
      if (reply?.kind === "board-edit") {
        set((state) => ({ turns: [...state.turns, { id: newId(), role: "board-edit", edit: body as RanganBoardEdit, planned: boardPlanned ?? { elements: [], edges: [] }, applied: false }] }));
        return;
      }
      if (reply?.kind === "edit") {
        set((state) => ({ turns: [...state.turns, { id: newId(), role: "edit", edit: body as RanganPageEdit, planned: planned ?? [], applied: false }] }));
        return;
      }
      const answer = body as { answer?: unknown; citations?: unknown; partial?: unknown; support?: unknown; video?: unknown };
      const support = answer.support as { checked?: unknown; removed?: unknown } | undefined;
      set((state) => ({
        turns: [
          ...state.turns,
          {
            id: newId(),
            role: "assistant",
            content: typeof answer.answer === "string" ? answer.answer : "",
            citations: Array.isArray(answer.citations) ? (answer.citations as RanganCitationView[]) : [],
            ...(answer.partial === true ? { partial: true } : {}),
            ...(support && typeof support.checked === "boolean" && typeof support.removed === "number"
              ? { support: { checked: support.checked, removed: support.removed } }
              : {}),
            ...videoFrom(answer.video),
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

  // One counter for everything that spends a question, in this tab and others.
  if (typeof window !== "undefined") {
    onUsage((usage) => get().applyUsage(usage));
    channelForUsage()?.addEventListener("message", (event) => get().applyUsage(event.data, false));
  }

  return {
    open: false,
    turns: [],
    pending: false,
    usage: null,
    applyUsage: (incoming, broadcast = true) => {
      const usage = pickUsage(incoming);
      if (!usage) return;
      const current = get().usage;
      // The same count again (a tab hearing its own echo) changes nothing and is not passed on.
      if (current && current.asOf === usage.asOf && current.used === usage.used && current.resetAt === usage.resetAt) return;
      const next = mergeUsage(current, usage);
      if (next === current) return;
      set({ usage: next });
      if (broadcast) channelForUsage()?.postMessage(next);
    },
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
        const usage = usageFromBody(await response.json().catch(() => null));
        if (response.ok && usage) get().applyUsage(usage);
      } catch {
        // The count is a hint; the server enforces the allowance either way.
      }
    },
    ask: async (raw) => {
      const question = raw.trim();
      if (!question) return;
      // "Plan my biology test for Dec 4": answered with a plan card instead of text.
      if (isPlanRequest(question)) await run({ kind: "plan", request: question.slice(0, 500) });
      else await run({ kind: "ask", question: question.slice(0, 2_000) });
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
    explore: async (ref, label) => {
      get().openPanel();
      await run({ kind: "explore", ...(ref ? { ref } : {}), label: label?.trim().slice(0, 300) || "What should I explore next?" });
    },
    markPageCreated: (turnId, noteId) =>
      set((state) => ({ turns: state.turns.map((turn) => (turn.id === turnId && turn.role === "page" ? { ...turn, noteId } : turn)) })),
    markEditApplied: (turnId) =>
      set((state) => ({ turns: state.turns.map((turn) => (turn.id === turnId && (turn.role === "edit" || turn.role === "board-edit") ? { ...turn, applied: true } : turn)) })),
    markBoardCreated: (turnId, boardId) =>
      set((state) => ({
        turns: state.turns.map((turn) =>
          turn.id !== turnId ? turn : turn.role === "map" ? { ...turn, boardId } : turn.role === "page" ? { ...turn, boardId } : turn,
        ),
      })),
    markPlanSaved: (turnId, count) =>
      set((state) => ({ turns: state.turns.map((turn) => (turn.id === turnId && turn.role === "plan" ? { ...turn, saved: count } : turn)) })),
    retry: async (request) => {
      set((state) => {
        const turns = state.turns.filter((turn) => turn.role !== "error");
        return { turns: turns.at(-1)?.role === "user" ? turns.slice(0, -1) : turns };
      });
      await run(request);
    },
  };
});
