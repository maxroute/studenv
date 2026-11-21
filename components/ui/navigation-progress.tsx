"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { finishNavigation, isInternalNavigationClick, onNavigationChange, startNavigation } from "@/lib/client/navigation-progress";

/** Gives up after this long, so a navigation that never lands doesn't leave the bar running. */
const GIVE_UP_MS = 20_000;

/**
 * A thin bar at the top of the window from the moment a navigation starts
 * until the next page's address is in place: proof the click worked.
 */
export function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [active, setActive] = useState(false);

  useEffect(() => onNavigationChange(setActive), []);

  // The address changed: the next page is here.
  useEffect(() => {
    finishNavigation();
  }, [pathname, searchParams]);

  // Links start it themselves, before the router has done anything.
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(anchor instanceof HTMLAnchorElement)) return;
      const here = { origin: window.location.origin, pathname: window.location.pathname, search: window.location.search };
      if (isInternalNavigationClick(event, { href: anchor.href, target: anchor.target, hasDownload: anchor.hasAttribute("download") }, here)) startNavigation(anchor.href);
    };
    // Bubble phase, so handlers that cancel the click (defaultPrevented) are respected.
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  useEffect(() => {
    if (!active) return;
    const timer = window.setTimeout(finishNavigation, GIVE_UP_MS);
    return () => window.clearTimeout(timer);
  }, [active]);

  return (
    <div className={`nav-progress${active ? " active" : ""}`} role="progressbar" aria-hidden={!active} aria-label="Loading the next page">
      <div className="nav-progress-bar" />
    </div>
  );
}
