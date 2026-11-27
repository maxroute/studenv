"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** While set on the page, the app frame hides itself (components/shell/shell.css). */
const ZEN_CLASS = "focus-zen";

/**
 * Zen mode: nothing but the timer, filling the screen. The app frame is hidden,
 * and the browser goes full screen where it can (iPhone Safari cannot, so there
 * the timer fills the page). Escape, or leaving full screen, ends it.
 */
export function useZenMode() {
  const [zen, setZen] = useState(false);
  // Only leave a full screen that zen mode itself opened.
  const openedFullscreen = useRef(false);

  const leaveFullscreen = useCallback(() => {
    if (!openedFullscreen.current) return;
    openedFullscreen.current = false;
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
  }, []);

  // Full screen may only be asked for from the press itself.
  const toggle = useCallback(() => {
    if (zen) {
      leaveFullscreen();
      setZen(false);
      return;
    }
    setZen(true);
    const page = document.documentElement;
    if (!document.fullscreenElement && typeof page.requestFullscreen === "function") {
      page.requestFullscreen().then(
        () => {
          openedFullscreen.current = true;
        },
        () => undefined,
      );
    }
  }, [zen, leaveFullscreen]);

  useEffect(() => {
    if (!zen) return;
    document.documentElement.classList.add(ZEN_CLASS);
    const onFullscreenChange = () => {
      if (!document.fullscreenElement && openedFullscreen.current) {
        openedFullscreen.current = false;
        setZen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        leaveFullscreen();
        setZen(false);
      }
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.documentElement.classList.remove(ZEN_CLASS);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [zen, leaveFullscreen]);

  // Leaving the Focus page ends the full screen too.
  useEffect(() => leaveFullscreen, [leaveFullscreen]);

  return { zen, toggle };
}
