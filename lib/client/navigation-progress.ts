"use client";

// ---------------------------------------------------------------------------
// "Your click worked": a navigation has started
// ---------------------------------------------------------------------------
//
// Pages and boards can take a few seconds when the server is cold, and the
// app router shows nothing until the next page arrives. Code that navigates
// calls `startNavigation()` (links are caught automatically); the progress
// bar in the root layout shows at once and ends when the address changes.

type Listener = (active: boolean) => void;

const listeners = new Set<Listener>();
let active = false;

export function onNavigationChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function set(next: boolean) {
  if (active === next) return;
  active = next;
  for (const listener of listeners) listener(next);
}

/** Shows the progress bar until the address changes (or `finishNavigation` is called). */
export function startNavigation(url?: string) {
  if (typeof window !== "undefined" && url) {
    // Going nowhere new (the same page) never ends with an address change.
    const target = new URL(url, window.location.href);
    if (target.origin === window.location.origin && target.pathname === window.location.pathname && target.search === window.location.search) return;
  }
  set(true);
}

export function finishNavigation() {
  set(false);
}

/** True for a plain left click on a same-site link that leaves this page. */
export function isInternalNavigationClick(
  event: Pick<MouseEvent, "button" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey" | "defaultPrevented">,
  anchor: { href: string; target: string; hasDownload: boolean },
  here: { origin: string; pathname: string; search: string },
): boolean {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  if ((anchor.target && anchor.target !== "_self") || anchor.hasDownload) return false;
  let url: URL;
  try {
    url = new URL(anchor.href);
  } catch {
    return false;
  }
  if (url.origin !== here.origin) return false;
  return url.pathname !== here.pathname || url.search !== here.search;
}
