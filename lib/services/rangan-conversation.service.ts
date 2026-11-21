import type { RanganConversationRecord, RanganConversationSummary, RanganTurnsInput } from "@/lib/models/rangan.model";
import * as repository from "@/lib/repositories/rangan-conversation.repository";
import { canRestore, isSavedRole } from "@/lib/rangan/conversation";

// Saved Rangan chats: list, open, rename, delete, and save turns as they come.

const notFound = () => Object.assign(new Error("That chat wasn't found."), { status: 404 });

const summary = (row: { id: string; title: string; updatedAt: Date }): RanganConversationSummary => ({
  id: row.id,
  title: row.title,
  updatedAt: row.updatedAt.toISOString(),
});

export async function listConversations(userId: string): Promise<RanganConversationSummary[]> {
  return (await repository.listConversations(userId)).map(summary);
}

export async function createConversation(userId: string, title: string): Promise<RanganConversationSummary> {
  return summary(await repository.createConversation(userId, title));
}

/** A chat with the turns that can still be shown; a damaged turn is left out, not fatal. */
export async function getConversation(userId: string, id: string): Promise<RanganConversationRecord> {
  const row = await repository.findConversation(userId, id);
  if (!row) throw notFound();
  const turns = row.turns.flatMap((turn) => {
    const data = turn.data;
    if (!isSavedRole(turn.role) || typeof data !== "object" || data === null || Array.isArray(data) || !canRestore(turn.role, data)) return [];
    return [{ clientId: turn.clientId, position: turn.position, role: turn.role, data: { ...data } }];
  });
  return { ...summary(row), turns };
}

export async function renameConversation(userId: string, id: string, title: string): Promise<void> {
  if (!(await repository.renameConversation(userId, id, title))) throw notFound();
}

export async function deleteConversation(userId: string, id: string): Promise<void> {
  if (!(await repository.deleteConversation(userId, id))) throw notFound();
}

export async function saveTurns(userId: string, id: string, input: RanganTurnsInput): Promise<void> {
  const result = await repository.saveTurns(userId, id, input.turns, input.remove ?? []);
  if (result === "missing") throw notFound();
  if (result === "full") throw Object.assign(new Error("This chat is full. Start a new chat to keep saving."), { status: 409 });
}
