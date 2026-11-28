/**
 * Unread messages across a student's study groups, as chat apps show them.
 * Pure helpers shared by the groups page and the navigation badges.
 */

export type GroupInboxEntry = {
  groupId: string;
  /** Messages from other people since this student last read the group. */
  unreadCount: number;
  lastMessage: {
    id: string;
    content: string | null;
    authorId: string;
    authorName: string | null;
    createdAt: string;
    attachmentCount: number;
    attachmentName: string | null;
  } | null;
};

/** The number on a badge; long counts are cut short, as chat apps do. */
export function unreadLabel(count: number): string {
  return count > 99 ? "99+" : String(count);
}

export function totalUnread(entries: readonly GroupInboxEntry[]): number {
  return entries.reduce((sum, entry) => sum + entry.unreadCount, 0);
}

/** The line under a group's name in the list. */
export function inboxPreview(message: NonNullable<GroupInboxEntry["lastMessage"]>): string {
  if (message.content) return message.content;
  if (message.attachmentCount === 1) return message.attachmentName || "Shared a file";
  if (message.attachmentCount > 1) return `Shared ${message.attachmentCount} files`;
  return "New message";
}

/** Groups with the newest message first; quiet ones keep their last update time. */
export function sortByActivity<G extends { id: string; updatedAt: string | Date }>(groups: readonly G[], entries: ReadonlyMap<string, GroupInboxEntry>): G[] {
  const time = (group: G) => new Date(entries.get(group.id)?.lastMessage?.createdAt ?? group.updatedAt).getTime();
  return [...groups].sort((first, second) => time(second) - time(first));
}

/**
 * How far a read may be recorded: the time of the newest message the student
 * saw, never later than now. Null when the value isn't a time.
 */
export function readUpTo(value: unknown, now: Date): Date | null {
  if (typeof value !== "string" || value.length > 40) return null;
  const time = new Date(value);
  if (Number.isNaN(time.getTime())) return null;
  return time > now ? now : time;
}
