// The app shell's rules, kept free of Electron so they can be tested.
const logic = require("./timer-logic");

const ALLOWED_FOR_STUDENV = new Set(["media", "notifications", "clipboard-sanitized-write", "clipboard-read"]);

/** Full screen is fine for any page in the window (video players); the rest is Studenv's alone. */
function mayUse(permission, url, appOrigin) {
  return permission === "fullscreen" || (ALLOWED_FOR_STUDENV.has(permission) && logic.sameOrigin(url, appOrigin));
}

/** Sites see an ordinary Chrome that says it is Studenv, with no framework names. */
function userAgent(fallback, version) {
  const plain = fallback.replace(/ (?:Electron|Studenv|studenv-desktop)\/\S+/gi, "");
  return `${plain} StudenvDesktop/${version}`;
}

const DEFAULT_SIZE = { width: 1280, height: 820 };
const MIN_SIZE = { width: 380, height: 560 };

/** The last size and place, if that place is still on a screen. */
function windowBounds(saved, workAreas) {
  const area = workAreas[0];
  const fallback = {
    width: Math.min(DEFAULT_SIZE.width, area.width),
    height: Math.min(DEFAULT_SIZE.height, area.height),
    maximized: false,
  };
  if (!saved || ![saved.x, saved.y, saved.width, saved.height].every(Number.isFinite)) return fallback;
  if (saved.width < MIN_SIZE.width || saved.height < MIN_SIZE.height) return fallback;
  // Enough of the title bar must be reachable to drag the window back.
  const reachable = workAreas.some(
    (a) => saved.x + saved.width > a.x + 80 && saved.x < a.x + a.width - 80 && saved.y >= a.y - 8 && saved.y < a.y + a.height - 40,
  );
  if (!reachable) return fallback;
  const { x, y, width, height } = saved;
  return { x, y, width, height, maximized: saved.maximized === true };
}

module.exports = { MIN_SIZE, mayUse, userAgent, windowBounds };
