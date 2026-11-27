// The desktop timer's rules, kept free of Electron so they can be tested.
// Loaded by the main process (require) and by the small window (script tag).
(function () {
  const MAX_TEXT = 200;
  const MAX_DURATION_MS = 24 * 60 * 60 * 1000;

  const isText = (value) => typeof value === "string" && value.length <= MAX_TEXT;
  const isTime = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0;

  /** Reads what the page sent. Anything unexpected is refused (null). */
  function parseTimerState(value) {
    if (typeof value !== "object" || value === null) return null;
    if (value.status === "idle") return { status: "idle" };

    const { status, sessionId, label, title } = value;
    if (!isText(sessionId) || !sessionId || !isText(label) || !isText(title)) return null;
    const base = { status, sessionId, label, title };

    if (status === "finished") return { ...base, canStartBreak: value.canStartBreak === true };

    const { durationMs } = value;
    if (!isTime(durationMs) || durationMs === 0 || durationMs > MAX_DURATION_MS) return null;
    if (status === "running") return isTime(value.endsAt) ? { ...base, durationMs, endsAt: value.endsAt } : null;
    if (status === "paused") {
      return isTime(value.remainingMs) ? { ...base, durationMs, remainingMs: value.remainingMs } : null;
    }
    return null;
  }

  function timeLeftMs(state, now) {
    if (state.status === "running") return Math.max(0, state.endsAt - now);
    if (state.status === "paused") return Math.max(0, state.remainingMs);
    return 0;
  }

  /** Rounded up like the page's own clock, so the two never differ by a second. */
  function clockText(ms) {
    const seconds = Math.max(0, Math.ceil(ms / 1000));
    return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  }

  /** The part of the ring still to go, from 1 (just started) to 0. */
  function ringLeft(state, now) {
    if (state.status !== "running" && state.status !== "paused") return 0;
    return Math.min(1, timeLeftMs(state, now) / state.durationMs);
  }

  function shouldShowMini({ state, enabled, mainFocused, hiddenSessionId, seenFinishedId }) {
    if (!enabled || mainFocused || state.status === "idle") return false;
    if (state.sessionId === hiddenSessionId) return false;
    return state.status !== "finished" || state.sessionId !== seenFinishedId;
  }

  /** Keeps a remembered position only if the window would still be on a screen. */
  function miniPosition(saved, size, workAreas, margin = 16) {
    const fits = (area) =>
      saved.x >= area.x &&
      saved.y >= area.y &&
      saved.x + size.width <= area.x + area.width &&
      saved.y + size.height <= area.y + area.height;
    if (saved && isFinite(saved.x) && isFinite(saved.y) && workAreas.some(fits)) {
      return { x: Math.round(saved.x), y: Math.round(saved.y) };
    }
    // Otherwise the top right of the first screen.
    const area = workAreas[0];
    return { x: Math.round(area.x + area.width - size.width - margin), y: Math.round(area.y + margin) };
  }

  /** The website the app opens: https, or http only on this computer. */
  function appUrl(configured) {
    const url = new URL(configured || "http://localhost:3000");
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (url.protocol === "https:" || (url.protocol === "http:" && local)) return url;
    throw new Error("The Studenv address must use https (http is only allowed on this computer).");
  }

  function sameOrigin(url, origin) {
    try {
      return new URL(url).origin === origin;
    } catch {
      return false;
    }
  }

  /** Links that may be handed to the system browser or mail app. */
  function canOpenOutside(url) {
    try {
      return ["https:", "http:", "mailto:"].includes(new URL(url).protocol);
    } catch {
      return false;
    }
  }

  const api = {
    parseTimerState,
    timeLeftMs,
    clockText,
    ringLeft,
    shouldShowMini,
    miniPosition,
    appUrl,
    sameOrigin,
    canOpenOutside,
  };
  if (typeof module === "object" && module.exports) module.exports = api;
  else window.timerLogic = api;
})();
