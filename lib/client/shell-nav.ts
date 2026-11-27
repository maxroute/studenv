/** The places in the app frame, shared by the desktop sidebar and the phone tab bar. */
export type ShellPlace = "home" | "library" | "planner" | "focus" | "groups";

const LIBRARY_ROOTS = ["/shelf", "/library", "/notes", "/flashcards"];

/** Where pages are listed: the Library's Pages tab. */
export const PAGES_TAB = "/shelf?tab=pages";

const within = (pathname: string, root: string) => pathname === root || pathname.startsWith(`${root}/`);

/** Which place a path belongs to; null for pages reached from the account menu. */
export function shellPlace(pathname: string | null): ShellPlace | null {
  if (!pathname) return null;
  // The profile opened from the Library is an account page, not part of the Library.
  if (within(pathname, "/shelf/profile")) return null;
  if (pathname === "/dashboard") return "home";
  if (within(pathname, "/dashboard/planner")) return "planner";
  if (within(pathname, "/dashboard/focus")) return "focus";
  if (within(pathname, "/dashboard/groups")) return "groups";
  return LIBRARY_ROOTS.some((root) => within(pathname, root)) ? "library" : null;
}

/** A study room fills the screen with call controls, so the phone bars step aside. */
export function hidesPhoneBars(pathname: string | null): boolean {
  return Boolean(pathname && within(pathname, "/dashboard/groups") && pathname.endsWith("/room"));
}

/** Minutes and seconds left in a focus session, as `18:42`. */
export function clockTime(seconds: number): string {
  const safe = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}
