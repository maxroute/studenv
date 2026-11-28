/**
 * Group chat list logic shared by the chat page. Pure helpers, no React.
 */

/** How close to the end (in pixels) still counts as "reading the latest messages". */
export const NEAR_BOTTOM_PX = 120;

export function isNearBottom(
  box: { scrollTop: number; clientHeight: number; scrollHeight: number },
  threshold = NEAR_BOTTOM_PX,
) {
  return box.scrollHeight - box.scrollTop - box.clientHeight <= threshold;
}

/** The id the sender's page gives a message before the server has one. */
const CLIENT_MESSAGE_ID = /^[a-zA-Z0-9_-]{8,64}$/;

export function readClientMessageId(value: unknown): string | null {
  return typeof value === "string" && CLIENT_MESSAGE_ID.test(value) ? value : null;
}

/**
 * Adds a message to a chat list once. A message that is already there (it can
 * arrive both from the send request and from the live socket) is not repeated.
 */
export function appendMessageOnce<T extends { id: string }>(messages: T[], message: T): T[] {
  return messages.some((entry) => entry.id === message.id) ? messages : [...messages, message];
}

export type PendingMessageState = "sending" | "failed";

/**
 * Messages still on their way, minus the ones the server already returned.
 * A pending message is matched to the server's copy by its client id.
 */
export function unsentMessages<P extends { clientMessageId: string }>(
  pending: P[],
  delivered: Array<{ clientMessageId?: string | null }>,
): P[] {
  if (pending.length === 0) {
    return pending;
  }

  const deliveredIds = new Set(
    delivered.map((message) => message.clientMessageId).filter(Boolean),
  );
  return pending.filter((message) => !deliveredIds.has(message.clientMessageId));
}
