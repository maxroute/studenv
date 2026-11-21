import { complete } from "@/lib/ai/providers";
import { RANGAN_DAILY_LIMIT } from "@/lib/models/rangan.model";
import * as usageRepository from "@/lib/repositories/rangan-usage.repository";
import * as studyRepository from "@/lib/repositories/study.repository";
import { ranganIndex } from "@/lib/services/rangan-index.server";
import { createStudyService } from "@/lib/services/study.service";
import { pickPlanSources } from "@/lib/study/plan";

/** Flashcards and quizzes wired to the database, the daily allowance and the real model chain. */
export const study = createStudyService({
  dailyLimit: RANGAN_DAILY_LIMIT,
  now: () => new Date(),
  consumeQuestion: usageRepository.consumeQuestion,
  refundQuestion: usageRepository.refundQuestion,
  getUsedCount: usageRepository.getUsedCount,
  findSources: async (userId, query) => pickPlanSources((await ranganIndex.search(userId, query, 12)).results),
  loadSource: studyRepository.loadStudySource,
  complete,
  replaceAiCards: studyRepository.replaceAiCards,
});
