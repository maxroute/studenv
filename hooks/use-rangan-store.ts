"use client";

import { create } from "zustand";
import type { OpenTarget } from "@/lib/rangan/citations";
import { localDay } from "@/lib/client/study-plan";
import type { RanganUsageSummary } from "@/lib/models/rangan.model";
import { mergeUsage, pickUsage, usageFromBody } from "@/lib/rangan/usage";
import { onUsage } from "@/lib/client/usage-bus";
import { pageBlocks, pageSelection, useOpenPage } from "@/hooks/use-open-page";
import type { PageToolBlock } from "@/lib/rangan/page-ops";
import { openBoard, openBoardSummary } from "@/components/rangan/board-actions";
import type { BoardSummary } from "@/lib/workspace/board-edit";
import type { RanganBoardEdit, RanganExplore, RanganMap, RanganPageDraft, RanganPageEdit, RanganTaskReply } from "@/lib/services/rangan.service";
import { appArea, type RanganTaskDraft } from "@/lib/rangan/task";
import type { StudyPlanResult } from "@/lib/services/study.service";
import { isPlanRequest, refersToOpen } from "@/lib/study/plan-intent";
import { mutate as mutateCache } from "swr";
import { canRestore, conversationTitle, MAX_TURNS_PER_SAVE, storedTurn, type StoredTurn } from "@/lib/rangan/conversation";

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
  | { id: string; role: "edit"; edit: RanganPageEdit; planned: PageToolBlock[]; applied: boolean }
  /** A new map board Rangan drafted; `boardId` once the student created it. */
  | { id: string; role: "map"; map: RanganMap; boardId: string | null }
  /** Additions to the open board; `planned` is the board as it was when Rangan planned them. */
  | { id: string; role: "board-edit"; edit: RanganBoardEdit; planned: BoardSummary; applied: boolean }
  /** Planner tasks Rangan drafted; `saved` is how many were added to the planner. */
  | { id: string; role: "task"; tasks: RanganTaskDraft[]; saved: number | null };

type RanganState = {
  open: boolean;
  turns: RanganTurn[];
  /** The saved chat these turns belong to; null until the first answer is saved. */
  conversationId: string | null;
  /** A saved chat being opened. */
  loadingConversation: boolean;
  pending: boolean;
  usage: RanganUsageSummary | null;
  openPanel: () => void;
  close: () => void;
  toggle: () => void;
  /** Starts a new chat; the one before stays in history. */
  clear: () => void;
  /** Opens a saved chat in place of the current one. False if it couldn't be opened. */
  openConversation: (id: string) => Promise<boolean>;
  /** Deletes a saved chat; if it is the one open, a new chat starts. */
  deleteConversation: (id: string) => Promise<boolean>;
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
  /** Records that a task card's tasks, as the student left them, were added to the planner. */
  markTasksSaved: (turnId: string, tasks: RanganTaskDraft[]) => void;
  /** Records that a map draft (alone or with a page) was created as a board. */
  markBoardCreated: (turnId: string, boardId: string) => void;
};

/** Turns sent back as context, newest last; the API accepts at most 10. */
const HISTORY_TURNS = 10;
const HISTORY_CHARS = 4_000;

let nextId = 1;
/** Unique across reloads and devices, since a saved chat's turns keep their ids. */
const newId = () => `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}${nextId++}`;

/** The history list's SWR key. */
export const CONVERSATIONS_KEY = "/api/rangan/conversations";

/** Set by the store: saves the chat soon after its turns change. */
let requestSave: () => void = () => undefined;

/** Under the API's 100 KB body limit, with room for the wrapper. */
const SAVE_BODY_MAX = 90_000;

function errorMessage(status: number, body: unknown): string {
  const error = typeof body === "object" && body !== null ? (body as { error?: unknown }).error : undefined;
  if (status === 429 && typeof error === "string") return error;
  if (status === 401) return "Your session ended. Sign in again to ask Rangan.";
  if (status >= 500) return "Rangan is busy right now. Please try again in a minute.";
  return typeof error === "string" ? error : "Rangan couldn't answer that. Please try again.";
}

/** Where a refused request should go instead, when Rangan read it as something else. */
function rerouteOf(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  const details = (body as { details?: unknown }).details;
  if (typeof details !== "object" || details === null) return null;
  const reroute = (details as { reroute?: unknown }).reroute;
  return typeof reroute === "string" ? reroute : null;
}

/** True when a plan was refused because nothing about it was found in the library. */
function needsSources(body: unknown): boolean {
  if (typeof body !== "object" || body === null) return false;
  const details = (body as { details?: unknown }).details;
  return typeof details === "object" && details !== null && (details as { needSources?: unknown }).needSources === true;
}

/** The student's own day, time and time zone, so "before midnight" is their midnight. */
function localClock() {
  const now = new Date();
  let timeZone: string | undefined;
  try {
    timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone?.slice(0, 64);
  } catch {
    timeZone = undefined;
  }
  return {
    today: localDay(now),
    time: `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,
    ...(timeZone ? { timeZone } : {}),
  };
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
const NOT_RETRYABLE = new Set([400, 404, 422, 429]);

/**
 * Rangan's conversation and panel state. Each chat is saved to the student's
 * account as it goes, so it can be opened again from history on any device;
 * nothing about it is written to the browser.
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
    const selection = open ? pageSelection(open.editor) : null;

    // A plan about "this" uses the page open in front of the student.
    const openPageId = useOpenPage.getState().page?.noteId ?? null;
    const urlFor = (current: RanganRequest) =>
      current.kind === "summarize"
        ? "/api/rangan/summarize"
        : current.kind === "plan"
          ? "/api/study/plan"
          : current.kind === "explore"
            ? "/api/rangan/explore"
            : "/api/rangan/ask";
    const payloadFor = (current: RanganRequest, refs?: string[]) =>
      current.kind === "summarize"
        ? { ref: current.ref }
        : current.kind === "plan"
          ? { request: current.request, today: localDay(), ...(refs ? { refs } : {}) }
          : current.kind === "explore"
            ? (current.ref ? { ref: current.ref } : {})
            : {
                question: current.question,
                where: appArea(window.location.pathname),
                clock: localClock(),
                ...(history.length ? { history } : {}),
                ...(current.focus ? { focus: current.focus } : {}),
                ...(open && planned ? { page: { ref: `note:${open.noteId}`, title: open.title.slice(0, 500), blocks: planned, ...(selection ? { selection } : {}) } } : {}),
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
    const send = async (current: RanganRequest, refs?: string[]) => {
      const response = await fetch(urlFor(current), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payloadFor(current, refs)),
      });
      const body: unknown = await response.json().catch(() => null);
      get().applyUsage(usageFromBody(body));
      return { response, body };
    };
    /** A plan, from the open page when the request is about it, or when the library search finds nothing. */
    const sendPlan = async (current: Extract<RanganRequest, { kind: "plan" }>) => {
      const pageRefs = openPageId ? [`note:${openPageId}`] : undefined;
      const first = await send(current, pageRefs && refersToOpen(current.request) ? pageRefs : undefined);
      if (first.response.status === 404 && pageRefs && !refersToOpen(current.request) && needsSources(first.body)) return send(current, pageRefs);
      return first;
    };

    try {
      let current = request;
      let { response, body } = current.kind === "plan" ? await sendPlan(current) : await send(current);
      // Rangan read a question as a request for a study plan: the question was given back, so plan it.
      if (current.kind === "ask" && response.status === 409 && rerouteOf(body) === "plan") {
        current = { kind: "plan", request: current.question.slice(0, 500) };
        ({ response, body } = await sendPlan(current));
      }
      if (!response.ok) {
        const retry = NOT_RETRYABLE.has(response.status) ? null : current;
        const serverSays = typeof body === "object" && body !== null ? (body as { error?: unknown }).error : undefined;
        const content =
          current.kind === "plan" && (response.status === 404 || response.status === 422)
            ? typeof serverSays === "string"
              ? serverSays
              : "Rangan couldn't find notes about that in your library. Name the subject, or choose the material yourself in Planner → Plan with Rangan."
            : errorMessage(response.status, body);
        set((state) => ({ turns: [...state.turns, { id: newId(), role: "error", content, retry }] }));
        return;
      }
      if (current.kind === "explore") {
        const explore = body as RanganExplore | null;
        set((state) => ({
          turns: [
            ...state.turns,
            explore && Array.isArray(explore.gaps)
              ? { id: newId(), role: "explore", explore }
              : { id: newId(), role: "error", content: "Rangan couldn't suggest anything right now. Please try again.", retry: current },
          ],
        }));
        return;
      }
      if (current.kind === "plan") {
        const plan = (body as { data?: StudyPlanResult } | null)?.data;
        set((state) => ({
          turns: [
            ...state.turns,
            plan
              ? { id: newId(), role: "plan", plan, saved: null }
              : { id: newId(), role: "error", content: "Rangan couldn't plan that. Please try again.", retry: current },
          ],
        }));
        return;
      }
      const reply = body as { kind?: unknown } | null;
      if (reply?.kind === "page") {
        set((state) => ({ turns: [...state.turns, { id: newId(), role: "page", draft: body as RanganPageDraft, noteId: null }] }));
        return;
      }
      if (reply?.kind === "task") {
        const tasks = (body as RanganTaskReply).tasks;
        set((state) => ({ turns: [...state.turns, { id: newId(), role: "task", tasks: Array.isArray(tasks) ? tasks : [], saved: null }] }));
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

  // --- Saving the chat as it goes -------------------------------------------
  //
  // Each turn is saved once it is shown, and again when its card changes (a
  // page created, tasks added). Saves run one at a time; a new chat or an
  // opened one starts a new generation, and a save from an older one stops.

  /** What was last saved for each turn, by turn id. */
  let savedTurns = new Map<string, string>();
  let generation = 0;
  let saving: Promise<void> = Promise.resolve();
  let saveTimer: ReturnType<typeof setTimeout> | null = null;

  async function postJson(url: string, body: unknown) {
    const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = (await response.json().catch(() => null)) as { ok?: boolean; data?: { id?: unknown } } | null;
    return { ok: response.ok && json?.ok === true, data: json?.data };
  }

  /** Groups of turns that each fit in one request. A turn too big to send on its own is left unsaved. */
  function batches(turns: StoredTurn[]) {
    const groups: StoredTurn[][] = [];
    let current: StoredTurn[] = [];
    let size = 0;
    for (const turn of turns) {
      const length = JSON.stringify(turn).length;
      if (length > SAVE_BODY_MAX) continue;
      if (current.length && (size + length > SAVE_BODY_MAX || current.length === MAX_TURNS_PER_SAVE)) {
        groups.push(current);
        current = [];
        size = 0;
      }
      current.push(turn);
      size += length;
    }
    if (current.length) groups.push(current);
    return groups;
  }

  async function saveNow() {
    const mine = generation;
    const { turns } = get();
    const changed = turns.flatMap((turn, position) => {
      const stored = storedTurn(turn, position);
      if (!stored) return [];
      const text = JSON.stringify(stored.data);
      return savedTurns.get(turn.id) === text ? [] : [{ stored, text }];
    });
    const present = new Set(turns.map((turn) => turn.id));
    const removed = [...savedTurns.keys()].filter((turnId) => !present.has(turnId)).slice(0, MAX_TURNS_PER_SAVE);
    // A chat is saved once it has an answer or a card, not for a question alone.
    if ((!changed.length && !removed.length) || !turns.some((turn) => turn.role !== "user" && turn.role !== "error")) return;
    let id = get().conversationId;
    if (!id) {
      const first = turns.find((turn): turn is Extract<RanganTurn, { role: "user" }> => turn.role === "user");
      const created = await postJson(CONVERSATIONS_KEY, { title: conversationTitle(first?.content ?? "New chat") });
      if (mine !== generation || !created.ok || typeof created.data?.id !== "string") return;
      id = created.data.id;
      set({ conversationId: id });
    }
    const groups = batches(changed.map((entry) => entry.stored));
    for (const [index, group] of (groups.length ? groups : [[]]).entries()) {
      const remove = index === 0 ? removed : [];
      if (!group.length && !remove.length) continue;
      const result = await postJson(`${CONVERSATIONS_KEY}/${encodeURIComponent(id)}/turns`, { turns: group, ...(remove.length ? { remove } : {}) });
      if (mine !== generation || !result.ok) return;
      for (const turnId of remove) savedTurns.delete(turnId);
      for (const turn of group) savedTurns.set(turn.clientId, JSON.stringify(turn.data));
    }
    void mutateCache(CONVERSATIONS_KEY);
  }

  function scheduleSave() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = null;
      // Saves are best effort: a failed one is tried again with the next change.
      saving = saving.then(saveNow).catch(() => undefined);
    }, 400);
  }

  requestSave = scheduleSave;

  /** Starts a new generation: saves still running for the chat before are dropped. */
  function startChat(turns: RanganTurn[], conversationId: string | null) {
    generation += 1;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = null;
    savedTurns = new Map();
    for (const [position, turn] of turns.entries()) {
      const stored = storedTurn(turn, position);
      if (stored) savedTurns.set(turn.id, JSON.stringify(stored.data));
    }
    set({ turns, conversationId });
  }

  // One counter for everything that spends a question, in this tab and others.
  if (typeof window !== "undefined") {
    onUsage((usage) => get().applyUsage(usage));
    channelForUsage()?.addEventListener("message", (event) => get().applyUsage(event.data, false));
  }

  return {
    open: false,
    turns: [],
    conversationId: null,
    loadingConversation: false,
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
    clear: () => {
      if (get().pending) return;
      startChat([], null);
    },
    openConversation: async (id) => {
      if (get().pending || get().loadingConversation) return false;
      set({ loadingConversation: true });
      try {
        const response = await fetch(`${CONVERSATIONS_KEY}/${encodeURIComponent(id)}`, { cache: "no-store" });
        const json = (await response.json().catch(() => null)) as { ok?: boolean; data?: { id?: unknown; turns?: unknown } } | null;
        const data = json?.data;
        if (!response.ok || !json?.ok || !data || typeof data.id !== "string" || !Array.isArray(data.turns)) return false;
        const turns = data.turns.flatMap((entry: unknown): RanganTurn[] => {
          if (typeof entry !== "object" || entry === null) return [];
          const { clientId, role, data: saved } = entry as { clientId?: unknown; role?: unknown; data?: unknown };
          if (typeof clientId !== "string" || typeof role !== "string" || !canRestore(role, saved)) return [];
          // Checked by canRestore: the card has what it needs to be shown.
          return [{ ...(saved as object), id: clientId, role } as RanganTurn];
        });
        startChat(turns, data.id);
        return true;
      } catch {
        return false;
      } finally {
        set({ loadingConversation: false });
      }
    },
    deleteConversation: async (id) => {
      try {
        const response = await fetch(`${CONVERSATIONS_KEY}/${encodeURIComponent(id)}`, { method: "DELETE" });
        if (!response.ok) return false;
        if (get().conversationId === id) startChat([], null);
        void mutateCache(CONVERSATIONS_KEY);
        return true;
      } catch {
        return false;
      }
    },
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
    markTasksSaved: (turnId, tasks) =>
      set((state) => ({ turns: state.turns.map((turn) => (turn.id === turnId && turn.role === "task" ? { ...turn, tasks, saved: tasks.length } : turn)) })),
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

// Any change to the turns (a new answer, a card's page created) is saved.
if (typeof window !== "undefined") {
  useRanganStore.subscribe((state, previous) => {
    if (state.turns !== previous.turns) requestSave();
  });
}
