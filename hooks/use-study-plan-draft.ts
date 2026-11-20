"use client";

import { create } from "zustand";
import type { StudyPlanResult } from "@/lib/services/study.service";

/**
 * A plan made in the Rangan chat, handed to the Planner's "Plan with Rangan"
 * dialog when the student chooses to adjust it there. Memory only.
 */
type StudyPlanDraftState = {
  draft: StudyPlanResult | null;
  setDraft: (plan: StudyPlanResult) => void;
  take: () => StudyPlanResult | null;
};

export const useStudyPlanDraft = create<StudyPlanDraftState>((set, get) => ({
  draft: null,
  setDraft: (plan) => set({ draft: plan }),
  take: () => {
    const draft = get().draft;
    if (draft) set({ draft: null });
    return draft;
  },
}));
