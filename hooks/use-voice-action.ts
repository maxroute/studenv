"use client";

import { useEffect, useRef } from "react";

// What "yes" does in voice mode: each card that can be saved (tasks, a plan,
// a page, a board) registers its main action under its turn's id while it is
// still unsaved. Voice mode runs the latest card's action when the student
// says yes, the same as tapping its button.

type VoiceAction = () => Promise<boolean>;

const actions = new Map<string, VoiceAction>();

/** The registered action for a turn, if it has one. */
export function voiceActionFor(turnId: string): VoiceAction | null {
  return actions.get(turnId) ?? null;
}

/** Registers `run` as the turn's "yes"; null (once saved) removes it. */
export function useVoiceAction(turnId: string, run: VoiceAction | null) {
  const latest = useRef(run);
  latest.current = run;
  const active = run !== null;
  useEffect(() => {
    if (!active) return;
    const action: VoiceAction = () => latest.current?.() ?? Promise.resolve(false);
    actions.set(turnId, action);
    return () => {
      if (actions.get(turnId) === action) actions.delete(turnId);
    };
  }, [turnId, active]);
}
