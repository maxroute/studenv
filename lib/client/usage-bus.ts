"use client";

import { usageFromBody } from "@/lib/rangan/usage";
import type { RanganUsageSummary } from "@/lib/models/rangan.model";

// Anything that spends a daily Rangan question (flashcards, quizzes, the study
// planner, the panel itself) reports the reply here, and the panel's counter
// hears it. A bus rather than an import of the panel's store, so the helpers
// that make requests don't depend on it.

type Listener = (usage: RanganUsageSummary) => void;

const listeners = new Set<Listener>();

export function onUsage(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Passes on the usage in a response body, if it carries a well-formed one. */
export function reportUsage(body: unknown): void {
  const usage = usageFromBody(body);
  if (usage) for (const listener of listeners) listener(usage);
}
