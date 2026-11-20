import { complete } from "@/lib/ai/providers";
import { RANGAN_DAILY_LIMIT } from "@/lib/models/rangan.model";
import * as indexRepository from "@/lib/repositories/rangan-index.repository";
import * as usageRepository from "@/lib/repositories/rangan-usage.repository";
import { ranganIndex } from "@/lib/services/rangan-index.server";
import { createRanganService } from "@/lib/services/rangan.service";

/** Rangan wired to the database and the real model chain. */
export const rangan = createRanganService({
  dailyLimit: RANGAN_DAILY_LIMIT,
  now: () => new Date(),
  getUsedCount: usageRepository.getUsedCount,
  consumeQuestion: usageRepository.consumeQuestion,
  refundQuestion: usageRepository.refundQuestion,
  complete,
  searchLibrary: async (userId, query, limit) => (await ranganIndex.search(userId, query, limit)).results,
  loadSource: (userId, type, id) => ranganIndex.loadSource(userId, type, id),
  recentNoteIds: indexRepository.recentNoteIds,
});
