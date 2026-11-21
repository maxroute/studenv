import { randomUUID } from "node:crypto";
import * as boardRepository from "@/lib/repositories/rangan-board.repository";
import * as assetService from "@/lib/services/asset.service";
import { createRanganBoardService } from "@/lib/services/rangan-board.service";
import { ensureVideoTranscript } from "@/lib/services/video-transcript.server";
import * as workspaceService from "@/lib/services/workspace.service";
import { youTubeWatchUrl } from "@/lib/web/youtube-search";

/** Map boards wired to the database: created like any board, with the map as its first snapshot. */
export const ranganBoards = createRanganBoardService({
  findNoteCard: boardRepository.findNoteCard,
  findAssetCard: boardRepository.findAssetCard,
  findItemCard: boardRepository.findItemCard,
  saveLink: async (ownerId, link) => {
    const host = new URL(link.url).hostname;
    const saved = await boardRepository.findSavedLink(ownerId, link.url);
    if (saved) return { assetId: saved.id, title: saved.title || link.title, sourceHost: saved.sourceHost ?? host };
    const asset = await assetService.createAsset({
      ownerId,
      kind: "webpage",
      origin: "external_url",
      title: link.title.slice(0, 500),
      mimeType: "text/html",
      sourceUrl: link.url,
      sourceHost: host,
    });
    return { assetId: asset.id, title: asset.title, sourceHost: host };
  },
  saveVideo: async (ownerId, video) => {
    const url = youTubeWatchUrl(video.videoId);
    const saved = await boardRepository.findSavedVideo(ownerId, url);
    const asset = saved ?? (await assetService.createAsset({ ownerId, kind: "video", origin: "external_url", title: video.title.slice(0, 500), mimeType: "text/html", sourceUrl: url, sourceHost: "www.youtube.com" }));
    // The transcript lets Rangan search and cite the video later; the board doesn't wait for it.
    void ensureVideoTranscript(ownerId, asset.id).catch(() => undefined);
    return { assetId: asset.id, title: asset.title || video.title };
  },
  createBoard: async (ownerId, title, sceneJson) => {
    const workspace = await workspaceService.createWorkspace({ ownerId, title: title.slice(0, 200) });
    await workspaceService.saveSnapshot({ workspaceId: workspace.id, sceneJson, createdBy: ownerId });
    return workspace.id;
  },
  newId: () => `item-${randomUUID()}`,
});
