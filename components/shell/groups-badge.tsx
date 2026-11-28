"use client";

import { useGroupInbox } from "@/hooks/useGroupInbox";
import { totalUnread, unreadLabel } from "@/lib/study-groups/inbox";

/** Away from the Groups page, new messages are checked for less often. */
const NAV_REFRESH_MS = 45_000;

/** The unread count on the Groups button; nothing when all is read. */
export function GroupsBadge() {
  const { inbox } = useGroupInbox(NAV_REFRESH_MS);
  const count = totalUnread(inbox ?? []);
  if (count === 0) return null;
  return (
    <span className="shell-badge" aria-label={`${count} unread group messages`}>
      {unreadLabel(count)}
    </span>
  );
}
