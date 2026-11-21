import * as shelfFilesRepository from "@/lib/repositories/shelf-files.repository";
import * as itemService from "@/lib/services/item.service";
import { createShelfFilesService } from "@/lib/services/shelf-files.service";

/** Shelf and vault as one library, wired to the database. */
export const shelfFiles = createShelfFilesService({
  listFilesWithoutItem: shelfFilesRepository.listFilesWithoutItem,
  findOwnedFile: shelfFilesRepository.findOwnedFile,
  createItem: (ownerId, plan, input) => itemService.createItem(ownerId, plan, input),
  linkFileToItem: shelfFilesRepository.linkFileToItem,
  deleteItem: async (ownerId, itemId) => {
    await itemService.deleteItem(ownerId, itemId);
  },
});
