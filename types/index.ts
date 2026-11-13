export type Plan = "free" | "pro" | "team";
export type ItemType = "article" | "pdf" | "video" | "note";
export type ItemStatus = "unread" | "reading" | "done";
export type StudyGroupMemberRole = "owner" | "member";
export type StudyGroupPrivacy = "public" | "private";
export type StudyRoomMode = "focus" | "break";
export type StudyRoomStatus = "idle" | "running" | "paused";
export type StudyRoomPresenceStatus = "active" | "focused" | "away";
export type StudyRoomTemplateId = string;
export type DashboardNav =
  | "all"
  | "starred"
  | "recent"
  | "type:article"
  | "type:pdf"
  | "type:video"
  | "type:note"
  | "status:unread"
  | "status:reading"
  | "status:done"
  | `collection:${string}`;

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  username: string | null;
  bio: string | null;
  avatarUrl: string | null;
  plan: Plan;
  emailVerified: Date | null;
}

export interface ItemTag {
  id: string;
  name: string;
  color: string;
}

export interface ItemRecord {
  id: string;
  userId: string;
  type: ItemType;
  title: string;
  url: string | null;
  excerpt: string | null;
  notes: string | null;
  /** The Note behind a `note` item, when it has one (open it at /notes/[noteId]). */
  noteId?: string | null;
  status: ItemStatus;
  starred: boolean;
  sourceHost: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
  tags: ItemTag[];
}

export interface StudyRoomPinnedResourceRecord {
  itemId: string;
  title: string;
  type: ItemType;
  url: string | null;
  sourceHost: string | null;
}

export interface StudyRoomPinnedCollectionRecord {
  collectionId: string;
  title: string;
  description: string | null;
  itemCount: number;
}

export interface StudyRoomTaskRecord {
  id: string;
  text: string;
  completed: boolean;
  updatedAt: string | Date;
}

export interface StudyRoomCollectionTakeawayRecord {
  id: string;
  itemId: string;
  kind: "key_idea" | "question" | "confusion";
  text: string;
  authorUserId: string;
  authorName: string | null;
  authorUsername: string | null;
  updatedAt: string | Date;
}

export interface StudyRoomItemNoteRecord {
  itemId: string;
  note: string;
  updatedAt: string | Date;
}

export interface StudyRoomSessionOutcomeRecord {
  completedThisBlock: string[];
  carryForward: string[];
  blockers: string[];
}

export interface StudyRoomTemplateRecord {
  id: StudyRoomTemplateId;
  label: string;
  description: string;
}

export interface StudyRoomSessionHistoryRecord {
  id: string;
  createdAt: string | Date;
  templateId: StudyRoomTemplateId;
  templateLabel: string;
  summary: string;
  prompt: string | null;
  completedThisBlock: string[];
  carryForward: string[];
  blockers: string[];
  activeItemTitle: string | null;
  pinnedCollectionTitle: string | null;
}

export interface StudyRoomPermissionsRecord {
  canControlSession: boolean;
  canEditResources: boolean;
  canEditNotes: boolean;
  canEditTasks: boolean;
  canPostMessages: boolean;
}

export interface CollectionRecord {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  itemIds: string[];
  itemCount: number;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface ItemFilters {
  nav?: DashboardNav;
  q?: string;
  status?: ItemStatus;
  tag?: string;
  sort?: "newest" | "oldest" | "title" | "status";
  view?: "grid" | "list";
}

export interface PublicProfile {
  id: string;
  email: string;
  name: string | null;
  username: string | null;
  bio: string | null;
  avatarUrl: string | null;
  plan: Plan;
  emailVerified: boolean | string | Date | null;
}

export interface StudyGroupMemberRecord {
  userId: string;
  name: string | null;
  username: string | null;
  avatarUrl: string | null;
  role: StudyGroupMemberRole;
  joinedAt: string | Date;
}

export interface StudyGroupAttachmentRecord {
  id: string;
  url: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
}

export interface StudyGroupJoinRequestRecord {
  id: string;
  userId: string;
  name: string | null;
  username: string | null;
  avatarUrl: string | null;
  createdAt: string | Date;
}

export interface StudyGroupMessageRecord {
  id: string;
  groupId: string;
  authorId: string;
  authorName: string | null;
  authorUsername: string | null;
  authorAvatarUrl: string | null;
  content: string | null;
  attachments: StudyGroupAttachmentRecord[];
  attachmentUrl: string | null;
  attachmentName: string | null;
  attachmentMimeType: string | null;
  attachmentSizeBytes: number | null;
  createdAt: string | Date;
}

export interface StudyRoomStateRecord {
  mode: StudyRoomMode;
  status: StudyRoomStatus;
  timeLeftSeconds: number;
  focusMinutes: number;
  breakMinutes: number;
  template: StudyRoomTemplateRecord | null;
  sessionPrompt: string | null;
  sessionNote: string | null;
  sessionOutcomes: StudyRoomSessionOutcomeRecord;
  sessionHistory: StudyRoomSessionHistoryRecord[];
  tasks: StudyRoomTaskRecord[];
  collectionTakeaways: StudyRoomCollectionTakeawayRecord[];
  itemNotes: StudyRoomItemNoteRecord[];
  pinnedResource: StudyRoomPinnedResourceRecord | null;
  pinnedCollection: StudyRoomPinnedCollectionRecord | null;
  activeCollectionItemId: string | null;
  completedCollectionItemIds: string[];
  timerEndsAt: string | Date | null;
  streamHostUserId: string | null;
  updatedAt: string | Date | null;
  updatedByUserId: string | null;
  updatedByName: string | null;
  updatedByUsername: string | null;
}

export interface StudyRoomActivityRecord {
  id: string;
  type: "mode" | "status" | "timer" | "note";
  label: string;
  detail: string;
  actorUserId: string;
  actorName: string | null;
  actorUsername: string | null;
  createdAt: string | Date;
}

export interface StudyRoomPresenceRecord {
  userId: string;
  name: string | null;
  username: string | null;
  avatarUrl: string | null;
  status: StudyRoomPresenceStatus;
  updatedAt: string | Date;
}

export interface StudyRoomTimelineRecord {
  id: string;
  kind: "room_event" | "message";
  title: string;
  detail: string;
  actorUserId: string;
  actorName: string | null;
  actorUsername: string | null;
  createdAt: string | Date;
}

export interface StudyGroupRecord {
  id: string;
  ownerId: string;
  currentUserId: string;
  title: string;
  description: string | null;
  inviteCode: string;
  privacy: StudyGroupPrivacy;
  memberLimit: number | null;
  currentUserRole: StudyGroupMemberRole | null;
  canManage: boolean;
  pendingJoinRequestCount: number;
  pendingJoinRequests: StudyGroupJoinRequestRecord[];
  createdAt: string | Date;
  updatedAt: string | Date;
  members: StudyGroupMemberRecord[];
  messages: StudyGroupMessageRecord[];
  memberCount: number;
  roomState: StudyRoomStateRecord;
  roomPermissions: StudyRoomPermissionsRecord;
  roomActivity: StudyRoomActivityRecord[];
  roomPresence: StudyRoomPresenceRecord[];
  roomTimeline: StudyRoomTimelineRecord[];
}

export type StudyGroupJoinResult =
  | {
      status: "joined";
      group: StudyGroupRecord;
    }
  | {
      status: "pending";
      groupTitle: string;
      message: string;
    };
