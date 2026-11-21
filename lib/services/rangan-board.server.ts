import { randomUUID } from "node:crypto";
import * as boardRepository from "@/lib/repositories/rangan-board.repository";
import { createRanganBoardService } from "@/lib/services/rangan-board.service";
import * as workspaceService from "@/lib/services/workspace.service";

/** Map boards wired to the database: created like any board, with the map as its first snapshot. */
export const ranganBoards = createRanganBoardService({
  findNoteCard: boardRepository.findNoteCard,
  findAssetCard: boardRepository.findAssetCard,
  createBoard: async (ownerId, title, sceneJson) => {
    const workspace = await workspaceService.createWorkspace({ ownerId, title: title.slice(0, 200) });
    await workspaceService.saveSnapshot({ workspaceId: workspace.id, sceneJson, createdBy: ownerId });
    return workspace.id;
  },
  newId: () => `item-${randomUUID()}`,
});
