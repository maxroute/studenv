import { Prisma } from "@prisma/client";
import { INTERACTIVE_TRANSACTION_OPTIONS, prisma } from "@/lib/db/prisma";
import { MAX_SAVED_TURNS, type StoredTurn } from "@/lib/rangan/conversation";

// Saved Rangan chats. Every query is scoped to the owner: a chat that isn't
// the user's is treated as missing.

/** Chats in the history list, most recently used first. */
export const HISTORY_LIST_MAX = 50;

export async function listConversations(userId: string) {
  return prisma.ranganConversation.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    take: HISTORY_LIST_MAX,
    select: { id: true, title: true, updatedAt: true },
  });
}

export async function createConversation(userId: string, title: string) {
  return prisma.ranganConversation.create({ data: { userId, title }, select: { id: true, title: true, updatedAt: true } });
}

/** A chat and its turns in order, or null when it isn't the user's. */
export async function findConversation(userId: string, id: string) {
  return prisma.ranganConversation.findFirst({
    where: { id, userId },
    select: {
      id: true,
      title: true,
      updatedAt: true,
      turns: { orderBy: { position: "asc" }, take: MAX_SAVED_TURNS, select: { clientId: true, position: true, role: true, data: true } },
    },
  });
}

/** True when the chat was the user's and is renamed. */
export async function renameConversation(userId: string, id: string, title: string) {
  const { count } = await prisma.ranganConversation.updateMany({ where: { id, userId }, data: { title } });
  return count > 0;
}

/** True when the chat was the user's and is deleted, turns and all. */
export async function deleteConversation(userId: string, id: string) {
  const { count } = await prisma.ranganConversation.deleteMany({ where: { id, userId } });
  return count > 0;
}

export type SaveTurnsResult = "saved" | "missing" | "full";

/**
 * Adds turns to the user's chat, or saves over turns already there (matched by
 * the panel's id), removes turns the chat no longer has, and marks the chat as
 * just used. All or none.
 */
export async function saveTurns(userId: string, id: string, turns: readonly StoredTurn[], remove: readonly string[] = []): Promise<SaveTurnsResult> {
  return prisma.$transaction(async (tx) => {
    const conversation = await tx.ranganConversation.findFirst({ where: { id, userId }, select: { id: true } });
    if (!conversation) return "missing";
    if (remove.length) await tx.ranganConversationTurn.deleteMany({ where: { conversationId: id, clientId: { in: [...remove] } } });
    const existing = await tx.ranganConversationTurn.findMany({
      where: { conversationId: id, clientId: { in: turns.map((turn) => turn.clientId) } },
      select: { clientId: true },
    });
    const known = new Set(existing.map((turn) => turn.clientId));
    const added = turns.filter((turn) => !known.has(turn.clientId)).length;
    if (added > 0 && (await tx.ranganConversationTurn.count({ where: { conversationId: id } })) + added > MAX_SAVED_TURNS) return "full";
    for (const turn of turns) {
      // The turn came from a parsed JSON request body, so it is JSON already.
      const data = turn.data as Prisma.InputJsonObject;
      await tx.ranganConversationTurn.upsert({
        where: { conversationId_clientId: { conversationId: id, clientId: turn.clientId } },
        create: { conversationId: id, clientId: turn.clientId, position: turn.position, role: turn.role, data },
        update: { position: turn.position, role: turn.role, data },
      });
    }
    await tx.ranganConversation.update({ where: { id }, data: { updatedAt: new Date() } });
    return "saved";
  }, INTERACTIVE_TRANSACTION_OPTIONS);
}
