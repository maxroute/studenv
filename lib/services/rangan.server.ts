import { complete, completeQuick } from "@/lib/ai/providers";
import { RANGAN_DAILY_LIMIT } from "@/lib/models/rangan.model";
import * as indexRepository from "@/lib/repositories/rangan-index.repository";
import * as usageRepository from "@/lib/repositories/rangan-usage.repository";
import * as workspaceRepository from "@/lib/repositories/workspace.repository";
import { ranganIndex } from "@/lib/services/rangan-index.server";
import { createRanganService } from "@/lib/services/rangan.service";
import { findCommonsImage } from "@/lib/web/wikimedia-images";
import { searchWikipedia, wikiLanguage } from "@/lib/web/wikipedia";
import { findYouTubeVideo } from "@/lib/web/youtube-search";

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
  completeQuick,
  findImage: (query) => findCommonsImage(query),
  findVideo: (query, subject) => findYouTubeVideo(query, subject, { apiKey: process.env.YOUTUBE_API_KEY, language: wikiLanguage(subject) }),
  ownsBoard: async (userId, boardId) => Boolean(await workspaceRepository.findWorkspaceById(boardId, userId)),
  searchWeb: async (query) =>
    (await searchWikipedia(query, { limit: 2 })).map((article) => ({
      ref: article.url,
      sourceType: "web",
      title: article.title,
      heading: "Wikipedia",
      snippet: article.extract.slice(0, 220),
      content: article.extract,
      open: { kind: "web" as const, url: article.url },
    })),
});
