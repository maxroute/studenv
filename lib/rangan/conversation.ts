// ---------------------------------------------------------------------------
// Saved Rangan chats: what is stored for a turn, and what can be shown again
// ---------------------------------------------------------------------------
//
// Pure: no database or React.
//
// A turn is saved as the panel shows it (a question, an answer, or a card such
// as a page draft or planner tasks), one row each. A saved turn is read back
// only if it still has the shape its card needs, so an old or damaged row is
// left out instead of breaking the panel.

/** Turns that are saved. Errors are not: they are only for the moment. */
export const SAVED_TURN_ROLES = ["user", "assistant", "plan", "explore", "page", "edit", "map", "board-edit", "task"] as const;
export type SavedTurnRole = (typeof SAVED_TURN_ROLES)[number];

export const TURN_ID = /^[A-Za-z0-9_-]{1,64}$/;
/** Turns kept in one chat; past this, the chat is not saved further. */
export const MAX_SAVED_TURNS = 400;
/** Turns sent in one save. */
export const MAX_TURNS_PER_SAVE = 20;
export const CONVERSATION_TITLE_MAX = 200;

export type StoredTurn = { clientId: string; position: number; role: SavedTurnRole; data: Record<string, unknown> };

export function isSavedRole(role: unknown): role is SavedTurnRole {
  return typeof role === "string" && (SAVED_TURN_ROLES as readonly string[]).includes(role);
}

/** A chat's title: its first question, on one line, cut at a word. */
export function conversationTitle(question: string): string {
  const line = question.replace(/\s+/g, " ").trim();
  if (line.length <= 80) return line || "New chat";
  const cut = line.slice(0, 80);
  const space = cut.lastIndexOf(" ");
  return `${(space > 40 ? cut.slice(0, space) : cut).trim()}…`;
}

/** What is saved for a turn: everything but its id and role, which have their own columns. */
export function storedTurn(turn: { id: string; role: string } & Record<string, unknown>, position: number): StoredTurn | null {
  if (!isSavedRole(turn.role) || !TURN_ID.test(turn.id)) return null;
  const { id, role, ...data } = turn;
  return { clientId: id, position, role, data };
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const isString = (value: unknown): value is string => typeof value === "string";
const isArray = Array.isArray;
const isCount = (value: unknown) => value === null || (typeof value === "number" && Number.isInteger(value) && value >= 0);

/** True when a saved turn still has what its card needs to be shown. */
export function canRestore(role: string, data: unknown): boolean {
  if (!isObject(data)) return false;
  switch (role) {
    case "user":
      return isString(data.content) && (data.quote === undefined || isString(data.quote));
    case "assistant":
      return isString(data.content) && isArray(data.citations);
    case "plan":
      return isObject(data.plan) && isString(data.plan.goal) && isArray(data.plan.topics) && isArray(data.plan.sources) && isObject(data.plan.settings) && isCount(data.saved);
    case "explore":
      return isObject(data.explore) && isArray(data.explore.gaps);
    case "page":
      return isObject(data.draft) && isString(data.draft.title) && isString(data.draft.markdown) && isArray(data.draft.outline) && isArray(data.draft.citations) && (data.noteId === null || isString(data.noteId));
    case "edit":
      return isObject(data.edit) && isString(data.edit.pageRef) && isArray(data.edit.changes) && isArray(data.planned) && typeof data.applied === "boolean";
    case "map":
      return isObject(data.map) && isObject(data.map.draft) && isArray(data.map.outline) && (data.boardId === null || isString(data.boardId));
    case "board-edit":
      return isObject(data.edit) && isString(data.edit.boardRef) && isArray(data.edit.changes) && isObject(data.planned) && isArray(data.planned.elements) && typeof data.applied === "boolean";
    case "task":
      return (
        isArray(data.tasks) &&
        data.tasks.every((task) => isObject(task) && isString(task.title) && isString(task.day) && (task.time === null || isString(task.time)) && isString(task.priority) && isString(task.category)) &&
        isCount(data.saved)
      );
    default:
      return false;
  }
}
