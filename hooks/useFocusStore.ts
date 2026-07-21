"use client";

import { create } from "zustand";

// ─── Types ────────────────────────────────────────────────────
export type SessionType = "focus" | "shortBreak" | "longBreak";

export const SESSION_LABELS: Record<SessionType, string> = {
  focus: "Focus",
  shortBreak: "Short break",
  longBreak: "Long break",
};

export const DEFAULT_DURATIONS: Record<SessionType, number> = {
  focus: 25,
  shortBreak: 5,
  longBreak: 15,
};

export interface ActiveSession {
  id: string;
  type: SessionType;
  durationMs: number;
  goal: string;
  startedAt: number;
  expectedEndAt: number;
  pausedAt: number | null;
  taskId: string | null;
}

export interface CompletionEvent {
  type: SessionType;
  durationMs: number;
  goal: string;
  startedAt: string;
  timestamp: number;
  taskId: string | null;
}

// ─── Persistable subset ──────────────────────────────────────
export interface FocusTimerPersist {
  activeSession: ActiveSession | null;
  durations: Record<SessionType, number>;
  selectedType: SessionType;
  goal: string;
  sessionGoal: string;
  focusCycleCount: number;
  autoStartBreaks: boolean;
  autoStartFocus: boolean;
  taskId: string | null;
}

// ─── Store interface ─────────────────────────────────────────
export interface FocusTimerState extends FocusTimerPersist {
  displayTimeLeft: number;
  pendingCompletion: CompletionEvent | null;
  _hydrated: boolean;

  // Actions
  startTimer: () => void;
  pauseTimer: () => void;
  resumeTimer: () => void;
  toggleTimer: () => void;
  resetTimer: () => void;
  skipSession: () => void;
  switchType: (type: SessionType) => void;
  tick: () => void;
  consumeCompletion: () => void;
  setGoal: (goal: string) => void;
  setSessionGoal: (goal: string) => void;
  setDuration: (type: SessionType, minutes: number) => void;
  setAutoStartBreaks: (v: boolean) => void;
  setAutoStartFocus: (v: boolean) => void;
  setFocusCycleCount: (v: number) => void;
  setSelectedType: (type: SessionType) => void;
  setTaskId: (id: string | null) => void;
  hydrate: (state: Partial<FocusTimerPersist>) => void;
  getTimeLeft: () => number;
}

// ─── localStorage key ────────────────────────────────────────
const STORE_KEY = "studenv-focus-timer";
const LEGACY_KEY = "second-brain-focus-mode";

// ─── Persistence helpers ─────────────────────────────────────
function saveStoreState(state: FocusTimerPersist) {
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(state));
  } catch {}
}

function saveCurrentState(s: any) {
  saveStoreState({
    activeSession: s.activeSession,
    durations: s.durations,
    selectedType: s.selectedType,
    goal: s.goal,
    sessionGoal: s.sessionGoal,
    focusCycleCount: s.focusCycleCount,
    autoStartBreaks: s.autoStartBreaks,
    autoStartFocus: s.autoStartFocus,
    taskId: s.taskId,
  });
}

function loadStoreState(): Partial<FocusTimerPersist> | null {
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

function loadLegacyState(): Partial<FocusTimerPersist> | null {
  try {
    const raw = window.localStorage.getItem(LEGACY_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        durations: parsed.durations
          ? { ...DEFAULT_DURATIONS, ...parsed.durations }
          : undefined,
        selectedType: parsed.selectedType,
        goal: parsed.goal,
        focusCycleCount: parsed.focusCycleCount,
        autoStartBreaks: parsed.autoStartBreaks,
        autoStartFocus: parsed.autoStartFocus,
      };
    }
  } catch {}
  return null;
}

// ─── Compute time left from timestamps ───────────────────────
function computeTimeLeft(session: ActiveSession | null): number {
  if (!session) return 0;
  if (session.pausedAt !== null) {
    return Math.max(0, Math.ceil((session.expectedEndAt - session.pausedAt) / 1000));
  }
  return Math.max(0, Math.ceil((session.expectedEndAt - Date.now()) / 1000));
}

// ─── Store ───────────────────────────────────────────────────
export const useFocusStore = create<FocusTimerState>((set, get) => ({
  // ─── Initial state ───────────────────────────────────────
  activeSession: null,
  displayTimeLeft: DEFAULT_DURATIONS.focus * 60,
  durations: { ...DEFAULT_DURATIONS },
  selectedType: "focus",
  goal: "",
  sessionGoal: "",
  focusCycleCount: 0,
  autoStartBreaks: false,
  autoStartFocus: false,
  pendingCompletion: null,
  _hydrated: false,
  taskId: null,

  // ─── Hydrate from localStorage ───────────────────────────
  hydrate: (incoming) => {
    const state = get();
    const durations = incoming.durations ?? state.durations;
    const selectedType = incoming.selectedType ?? state.selectedType;
    const activeSession = incoming.activeSession ?? null;

    // If there is an active session, compute correct time left
    let displayTimeLeft: number;
    if (activeSession) {
      displayTimeLeft = computeTimeLeft(activeSession);
      // If session already expired, don't restore it — tick() will handle completion
      if (displayTimeLeft <= 0 && activeSession.pausedAt === null) {
        // Leave as-is; tick() on next cycle will trigger completion
        displayTimeLeft = 0;
      }
    } else {
      displayTimeLeft = durations[selectedType] * 60;
    }

    set({
      activeSession,
      displayTimeLeft,
      durations,
      selectedType,
      goal: incoming.goal ?? state.goal,
      sessionGoal: incoming.sessionGoal ?? state.sessionGoal,
      focusCycleCount: incoming.focusCycleCount ?? state.focusCycleCount,
      autoStartBreaks: incoming.autoStartBreaks ?? state.autoStartBreaks,
      autoStartFocus: incoming.autoStartFocus ?? state.autoStartFocus,
      taskId: incoming.taskId ?? state.taskId,
      _hydrated: true,
    });
  },

  // ─── Compute time left (non-reactive) ────────────────────
  getTimeLeft: () => computeTimeLeft(get().activeSession),

  // ─── Start a new session ─────────────────────────────────
  startTimer: () => {
    const { selectedType, durations, goal, taskId } = get();
    const durationMs = durations[selectedType] * 60 * 1000;
    const now = Date.now();
    const sessionGoal =
      selectedType === "focus"
        ? (goal || "").trim() || "Untitled focus block"
        : SESSION_LABELS[selectedType];

    const newSession: ActiveSession = {
      id: `${now}-${selectedType}`,
      type: selectedType,
      durationMs,
      goal: sessionGoal,
      startedAt: now,
      expectedEndAt: now + durationMs,
      pausedAt: null,
      taskId: selectedType === "focus" ? taskId : null,
    };

    set({
      activeSession: newSession,
      sessionGoal,
      displayTimeLeft: durations[selectedType] * 60,
    });

    // Persist immediately
    saveCurrentState(get());
  },

  // ─── Pause ───────────────────────────────────────────────
  pauseTimer: () => {
    const { activeSession } = get();
    if (!activeSession || activeSession.pausedAt !== null) return;

    const updated = { ...activeSession, pausedAt: Date.now() };
    set({
      activeSession: updated,
      displayTimeLeft: computeTimeLeft(updated),
    });

    saveCurrentState(get());
  },

  // ─── Resume ──────────────────────────────────────────────
  resumeTimer: () => {
    const { activeSession } = get();
    if (!activeSession || activeSession.pausedAt === null) return;

    const pauseDuration = Date.now() - activeSession.pausedAt;
    const updated: ActiveSession = {
      ...activeSession,
      expectedEndAt: activeSession.expectedEndAt + pauseDuration,
      pausedAt: null,
    };

    set({ activeSession: updated });

    saveCurrentState(get());
  },

  // ─── Toggle (convenience) ────────────────────────────────
  toggleTimer: () => {
    const { activeSession } = get();
    if (!activeSession) {
      get().startTimer();
    } else if (activeSession.pausedAt === null) {
      get().pauseTimer();
    } else {
      get().resumeTimer();
    }
  },

  // ─── Reset ───────────────────────────────────────────────
  resetTimer: () => {
    const { selectedType, durations } = get();
    set({
      activeSession: null,
      displayTimeLeft: durations[selectedType] * 60,
      sessionGoal: "",
    });

    saveCurrentState(get());
  },

  // ─── Skip to next mode ───────────────────────────────────
  skipSession: () => {
    const { selectedType, durations, focusCycleCount } = get();

    let nextType: SessionType;
    if (selectedType === "focus") {
      nextType =
        (focusCycleCount + 1) % 4 === 0 ? "longBreak" : "shortBreak";
    } else {
      nextType = "focus";
    }

    set({
      activeSession: null,
      selectedType: nextType,
      displayTimeLeft: durations[nextType] * 60,
      sessionGoal: "",
    });

    saveCurrentState(get());
  },

  // ─── Switch type (tab click) ─────────────────────────────
  switchType: (type) => {
    const { durations } = get();
    set({
      activeSession: null,
      selectedType: type,
      displayTimeLeft: durations[type] * 60,
      sessionGoal: type !== "focus" ? "" : get().sessionGoal,
    });

    saveCurrentState(get());
  },

  // ─── Tick (called every second by the manager) ───────────
  tick: () => {
    const { activeSession } = get();
    if (!activeSession) return;
    if (activeSession.pausedAt !== null) return;

    const remaining = activeSession.expectedEndAt - Date.now();

    if (remaining <= 0) {
      // ── Session complete ──────────────────────────────
      const completionEvent: CompletionEvent = {
        type: activeSession.type,
        durationMs: activeSession.durationMs,
        goal: activeSession.goal,
        startedAt: new Date(activeSession.startedAt).toISOString(),
        timestamp: Date.now(),
        taskId: activeSession.taskId,
      };

      const wasType = activeSession.type;
      const currentCycle = get().focusCycleCount;
      let nextType: SessionType;
      let nextCycle = currentCycle;

      if (wasType === "focus") {
        nextCycle = currentCycle + 1;
        nextType = nextCycle % 4 === 0 ? "longBreak" : "shortBreak";
      } else {
        nextType = "focus";
      }

      set({
        activeSession: null,
        pendingCompletion: completionEvent,
        focusCycleCount: nextCycle,
        selectedType: nextType,
        displayTimeLeft: get().durations[nextType] * 60,
        sessionGoal: "",
      });

      // Persist the transition
      saveCurrentState(get());
    } else {
      const newTimeLeft = Math.ceil(remaining / 1000);
      const current = get().displayTimeLeft;
      if (newTimeLeft !== current) {
        set({ displayTimeLeft: newTimeLeft });
      }
    }
  },

  // ─── Consume a completion event ──────────────────────────
  consumeCompletion: () => {
    set({ pendingCompletion: null });
  },

  // ─── Setters ─────────────────────────────────────────────
  setGoal: (goal) => {
    set({ goal });
    saveCurrentState(get());
  },

  setSessionGoal: (sessionGoal) => set({ sessionGoal }),

  setDuration: (type, minutes) => {
    const { selectedType, activeSession, durations: current } = get();
    const newDurations = { ...current, [type]: minutes };

    if (selectedType === type && !activeSession) {
      set({ durations: newDurations, displayTimeLeft: minutes * 60 });
    } else if (selectedType === type && activeSession) {
      // Reset the active session when duration changes for the active type
      set({
        durations: newDurations,
        activeSession: null,
        displayTimeLeft: minutes * 60,
        sessionGoal: "",
      });
    } else {
      set({ durations: newDurations });
    }

    saveCurrentState(get());
  },

  setAutoStartBreaks: (v) => {
    set({ autoStartBreaks: v });
    saveCurrentState(get());
  },

  setAutoStartFocus: (v) => {
    set({ autoStartFocus: v });
    saveCurrentState(get());
  },

  setFocusCycleCount: (v) => set({ focusCycleCount: v }),

  setSelectedType: (type) => set({ selectedType: type }),

  setTaskId: (taskId) => {
    set({ taskId });
    saveCurrentState(get());
  },
}));

// ─── Hydration initializer (call once from FocusSessionManager) ──
export function initializeFocusStore() {
  const store = useFocusStore.getState();
  if (store._hydrated) return;

  // Try new key first, then fallback to legacy key
  const saved = loadStoreState();
  if (saved) {
    store.hydrate(saved);
    return;
  }

  const legacy = loadLegacyState();
  if (legacy) {
    store.hydrate(legacy);
    return;
  }

  // No saved state — just mark as hydrated with defaults
  store.hydrate({});
}
