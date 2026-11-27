"use client";

import { useEffect } from "react";
import { initializeFocusStore, useFocusStore } from "@/hooks/useFocusStore";
import { desktopTimerState, type DesktopTimerCommand, type DesktopTimerState } from "@/lib/desktop/timer-state";

/** What the desktop app's preload script offers the page. Absent in a browser. */
interface StudenvDesktop {
  sendTimer: (state: DesktopTimerState) => void;
  onCommand: (listener: (command: DesktopTimerCommand) => void) => () => void;
}

declare global {
  interface Window {
    studenvDesktop?: StudenvDesktop;
  }
}

function runCommand(command: DesktopTimerCommand) {
  const store = useFocusStore.getState();
  if (command === "pause") store.pauseTimer();
  else if (command === "resume") store.resumeTimer();
  else if (command === "startBreak" && !store.activeSession && store.selectedType !== "focus") store.startTimer();
}

/** Keeps the desktop app's small timer in step. In a browser it does nothing. */
export function useDesktopTimer() {
  useEffect(() => {
    const desktop = window.studenvDesktop;
    if (!desktop) return;

    let sent: DesktopTimerState = { status: "idle" };
    let sentAs = "";
    const send = (state: DesktopTimerState) => {
      const asText = JSON.stringify(state);
      if (asText === sentAs) return;
      sent = state;
      sentAs = asText;
      desktop.sendTimer(state);
    };

    send(desktopTimerState(useFocusStore.getState(), null, sent));
    const stopWatching = useFocusStore.subscribe((current, previous) => {
      send(desktopTimerState(current, previous, sent));
    });
    const stopListening = desktop.onCommand(runCommand);

    initializeFocusStore();
    // Boards don't load the session manager, so the end of a session is noticed here too.
    const ticking = window.setInterval(() => useFocusStore.getState().tick(), 1000);

    return () => {
      window.clearInterval(ticking);
      stopListening();
      stopWatching();
    };
  }, []);
}
