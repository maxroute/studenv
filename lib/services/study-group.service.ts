import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getDownloadUrl, uploadBuffer } from "@/lib/storage/s3";
import {
  publishStudyGroupMessage,
  publishStudyGroupUpdate,
} from "@/lib/services/study-group-events";
import {
  publishStudyRoomEvent,
  publishStudyRoomPresenceEvent,
} from "@/lib/services/study-room-events";
import {
  BUILT_IN_STUDY_ROOM_TEMPLATES,
  getBuiltInStudyRoomTemplate,
  type StudyRoomTemplatePreset,
} from "@/lib/utils/study-room-templates";
import type {
  CreateStudyGroupInput,
  CreateStudyGroupMessageInput,
  JoinStudyGroupInput,
  ManageStudyGroupJoinRequestInput,
  UpdateStudyGroupInput,
  UpdateStudyRoomStateInput,
} from "@/lib/models/study-group.model";
import type { StudyGroupJoinResult, StudyGroupRecord } from "@/types";

const DEFAULT_ROOM_FOCUS_MINUTES = 20;
const DEFAULT_ROOM_BREAK_MINUTES = 5;
const DEFAULT_ROOM_MODE = "focus";
const DEFAULT_ROOM_STATUS = "idle";
const ROOM_STATE_PREFIX = "__study_room_state__:";
const DEFAULT_ROOM_TEMPLATE = BUILT_IN_STUDY_ROOM_TEMPLATES[0];

type ParsedRoomStatePayload = {
  payloadType?: "state" | "presence";
  mode?: "focus" | "break";
  status?: "idle" | "running" | "paused";
  presenceStatus?: "active" | "focused" | "away";
  timeLeftSeconds?: number;
  focusMinutes?: number;
  breakMinutes?: number;
  streamHostUserId?: string | null;
  template?: {
    id: string;
    label: string;
    description: string;
  } | null;
  sessionPrompt?: string | null;
  sessionNote?: string | null;
  sessionOutcomes?: {
    completedThisBlock: string[];
    carryForward: string[];
    blockers: string[];
  };
  tasks?: Array<{
    id: string;
    text: string;
    completed: boolean;
    updatedAt: string;
  }>;
  sessionHistory?: Array<{
    id: string;
    createdAt: string;
    templateId: string;
    templateLabel: string;
    summary: string;
    prompt: string | null;
    completedThisBlock: string[];
    carryForward: string[];
    blockers: string[];
    activeItemTitle: string | null;
    pinnedCollectionTitle: string | null;
  }>;
  collectionTakeaways?: Array<{
    id: string;
    itemId: string;
    kind: "key_idea" | "question" | "confusion";
    text: string;
    authorUserId: string;
    authorName: string | null;
    authorUsername: string | null;
    updatedAt: string;
  }>;
  itemNotes?: Array<{
    itemId: string;
    note: string;
    updatedAt: string;
  }>;
  timerEndsAt?: string | null;
  updatedAt?: string | null;
  updatedByUserId?: string | null;
  updatedByName?: string | null;
  updatedByUsername?: string | null;
  activityType?: "mode" | "status" | "timer" | "note";
  activityLabel?: string | null;
  activityDetail?: string | null;
  pinnedResource?: {
    itemId: string;
    title: string;
    type: "article" | "pdf" | "video" | "note";
    url: string | null;
    sourceHost: string | null;
  } | null;
  pinnedCollection?: {
    collectionId: string;
    title: string;
    description: string | null;
    itemCount: number;
  } | null;
  activeCollectionItemId?: string | null;
  completedCollectionItemIds?: string[];
};

function resolveRoomTemplate(
  roomSetup?: CreateStudyGroupInput["roomSetup"],
): StudyRoomTemplatePreset {
  if (roomSetup?.template) {
    return {
      ...roomSetup.template,
      starterCollectionId:
        roomSetup.starterCollectionId ?? roomSetup.template.starterCollectionId ?? null,
      starterItemId: roomSetup.starterItemId ?? roomSetup.template.starterItemId ?? null,
    };
  }

  return getBuiltInStudyRoomTemplate(roomSetup?.templateId ?? "focus") ?? DEFAULT_ROOM_TEMPLATE;
}

const ROOM_PRESENCE_ACTIVE_WINDOW_MS = 3 * 60 * 1000;
const ROOM_MESSAGE_WINDOW = 240;
const ROOM_OWNER_CONTROL_FIELDS = [
  "mode",
  "status",
  "timeLeftSeconds",
  "focusMinutes",
  "breakMinutes",
  "timerEndsAt",
  "pinnedResource",
  "pinnedCollection",
  "activeCollectionItemId",
  "completedCollectionItemIds",
] as const;

function isRoomStateMessage(content: string | null) {
  return Boolean(content?.startsWith(ROOM_STATE_PREFIX));
}

function parseRoomStateMessage(content: string | null): ParsedRoomStatePayload | null {
  if (!isRoomStateMessage(content)) {
    return null;
  }

  try {
    return JSON.parse(content!.slice(ROOM_STATE_PREFIX.length)) as ParsedRoomStatePayload;
  } catch {
    return null;
  }
}

function sortMessagesChronologically<T extends { createdAt: Date }>(messages: T[]) {
  return [...messages].sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());
}

function sortMessagesReverseChronologically<T extends { createdAt: Date }>(messages: T[]) {
  return [...messages].sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
}

function normalizeRoomState(group: {
  messages: Array<{
    content: string | null;
    createdAt: Date;
    authorId: string;
    author: { name: string | null; username: string | null };
  }>;
}) {
  const latestRoomState = sortMessagesReverseChronologically(group.messages)
    .map((message) => parseRoomStateMessage(message.content))
    .filter((message) => !message || message.payloadType !== "presence")
    .find((message): message is ParsedRoomStatePayload => Boolean(message));

  const focusMinutes = latestRoomState?.focusMinutes ?? DEFAULT_ROOM_FOCUS_MINUTES;
  const breakMinutes = latestRoomState?.breakMinutes ?? DEFAULT_ROOM_BREAK_MINUTES;
  const mode = latestRoomState?.mode ?? DEFAULT_ROOM_MODE;
  const fallbackSeconds =
    mode === "focus" ? focusMinutes * 60 : breakMinutes * 60;

  return {
    mode,
    status: latestRoomState?.status ?? DEFAULT_ROOM_STATUS,
    timeLeftSeconds: latestRoomState?.timeLeftSeconds ?? fallbackSeconds,
    focusMinutes,
    breakMinutes,
    template: latestRoomState?.template ?? null,
    sessionPrompt: latestRoomState?.sessionPrompt ?? null,
    sessionNote: latestRoomState?.sessionNote ?? null,
    sessionOutcomes: latestRoomState?.sessionOutcomes ?? {
      completedThisBlock: [],
      carryForward: [],
      blockers: [],
    },
    tasks: latestRoomState?.tasks ?? [],
    sessionHistory: latestRoomState?.sessionHistory ?? [],
    collectionTakeaways: latestRoomState?.collectionTakeaways ?? [],
    itemNotes: latestRoomState?.itemNotes ?? [],
    pinnedResource: latestRoomState?.pinnedResource ?? null,
    pinnedCollection: latestRoomState?.pinnedCollection ?? null,
    activeCollectionItemId: latestRoomState?.activeCollectionItemId ?? null,
    completedCollectionItemIds: latestRoomState?.completedCollectionItemIds ?? [],
    timerEndsAt: latestRoomState?.timerEndsAt ? new Date(latestRoomState.timerEndsAt) : null,
    streamHostUserId: latestRoomState?.streamHostUserId ?? null,
    updatedAt: latestRoomState?.updatedAt ? new Date(latestRoomState.updatedAt) : null,
    updatedByUserId: latestRoomState?.updatedByUserId ?? null,
    updatedByName: latestRoomState?.updatedByName ?? null,
    updatedByUsername: latestRoomState?.updatedByUsername ?? null,
  };
}

function getRoomActivity(group: GroupWithRelations) {
  return sortMessagesReverseChronologically(group.messages)
    .filter((message) => isRoomStateMessage(message.content))
    .map((message) => {
      const parsed = parseRoomStateMessage(message.content);
      if (!parsed || parsed.payloadType === "presence" || !parsed.activityType || !parsed.activityLabel) {
        return null;
      }

      return {
        id: message.id,
        type: parsed.activityType,
        label: parsed.activityLabel,
        detail: parsed.activityDetail ?? "",
        actorUserId: message.authorId,
        actorName: message.author.name,
        actorUsername: message.author.username,
        createdAt: message.createdAt,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
    .slice(0, 8);
}

function getRoomPresence(group: GroupWithRelations) {
  const latestByUser = new Map<string, {
    userId: string;
    name: string | null;
    username: string | null;
    avatarUrl: string | null;
    status: "active" | "focused" | "away";
    updatedAt: Date;
  }>();

  for (const message of sortMessagesReverseChronologically(group.messages)) {
    const parsed = parseRoomStateMessage(message.content);
    if (!parsed || parsed.payloadType !== "presence" || !parsed.presenceStatus) {
      continue;
    }

    if (latestByUser.has(message.authorId)) {
      continue;
    }

    latestByUser.set(message.authorId, {
      userId: message.authorId,
      name: message.author.name,
      username: message.author.username,
      avatarUrl: message.author.avatarUrl,
      status: parsed.presenceStatus,
      updatedAt: message.createdAt,
    });
  }

  for (const message of sortMessagesReverseChronologically(group.messages)) {
    if (isRoomStateMessage(message.content) || latestByUser.has(message.authorId)) {
      continue;
    }

    latestByUser.set(message.authorId, {
      userId: message.authorId,
      name: message.author.name,
      username: message.author.username,
      avatarUrl: message.author.avatarUrl,
      status: "active",
      updatedAt: message.createdAt,
    });
  }

  const now = Date.now();
  return Array.from(latestByUser.values())
    .filter((entry) => now - entry.updatedAt.getTime() <= ROOM_PRESENCE_ACTIVE_WINDOW_MS)
    .sort((a, b) => {
      const statusRank = { focused: 0, active: 1, away: 2 } as const;
      if (statusRank[a.status] !== statusRank[b.status]) {
        return statusRank[a.status] - statusRank[b.status];
      }
      return b.updatedAt.getTime() - a.updatedAt.getTime();
    });
}

function getRoomTimeline(group: GroupWithRelations) {
  const activityEntries = getRoomActivity(group).map((entry) => ({
    id: `event-${entry.id}`,
    kind: "room_event" as const,
    title: entry.label,
    detail: entry.detail,
    actorUserId: entry.actorUserId,
    actorName: entry.actorName,
    actorUsername: entry.actorUsername,
    createdAt: entry.createdAt,
  }));

  const messageEntries = sortMessagesChronologically(group.messages)
    .filter((message) => !isRoomStateMessage(message.content))
    .map((message) => ({
      id: `message-${message.id}`,
      kind: "message" as const,
      title: message.content || (message.attachments.length > 0 ? "Shared files" : "Shared an update"),
      detail:
        message.attachments.length > 0
          ? `${message.attachments.length} attachment${message.attachments.length > 1 ? "s" : ""}`
          : "",
      actorUserId: message.authorId,
      actorName: message.author.name,
      actorUsername: message.author.username,
      createdAt: message.createdAt,
    }));

  return [...activityEntries, ...messageEntries]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 12);
}

const groupInclude = Prisma.validator<Prisma.StudyGroupInclude>()({
  members: {
    include: {
      user: {
        select: {
          id: true,
          name: true,
          username: true,
          avatarUrl: true,
        },
      },
    },
    orderBy: [{ role: "asc" }, { joinedAt: "asc" }],
  },
  joinRequests: {
    where: { status: "pending" },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          username: true,
          avatarUrl: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  },
  messages: {
    include: {
      author: {
        select: {
          id: true,
          name: true,
          username: true,
          avatarUrl: true,
        },
      },
      attachments: {
        orderBy: { sortOrder: "asc" },
      },
    },
    orderBy: [{ createdAt: "desc" as const }, { id: "desc" as const }],
    take: ROOM_MESSAGE_WINDOW,
  },
});

const groupListInclude = Prisma.validator<Prisma.StudyGroupInclude>()({
  members: {
    include: {
      user: {
        select: {
          id: true,
          name: true,
          username: true,
          avatarUrl: true,
        },
      },
    },
    orderBy: [{ role: "asc" }, { joinedAt: "asc" }],
  },
  joinRequests: {
    where: { status: "pending" },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          username: true,
          avatarUrl: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  },
  messages: {
    include: {
      author: {
        select: {
          id: true,
          name: true,
          username: true,
          avatarUrl: true,
        },
      },
      attachments: {
        orderBy: { sortOrder: "asc" },
      },
    },
    orderBy: [{ createdAt: "desc" as const }, { id: "desc" as const }],
    take: 24,
  },
});

type GroupWithRelations = Prisma.StudyGroupGetPayload<{
  include: typeof groupInclude;
}>;

async function toStudyGroupRecord(group: GroupWithRelations, viewerUserId: string): Promise<StudyGroupRecord> {
  const currentMember = group.members.find((member) => member.userId === viewerUserId) ?? null;
  const canManage = group.ownerId === viewerUserId;
  const roomPermissions = {
    canControlSession: currentMember?.role === "owner",
    canEditResources: currentMember?.role === "owner",
    canEditNotes: Boolean(currentMember),
    canEditTasks: Boolean(currentMember),
    canPostMessages: Boolean(currentMember),
  };
  const visibleJoinRequests = canManage ? group.joinRequests : [];
  return {
    id: group.id,
    ownerId: group.ownerId,
    currentUserId: viewerUserId,
    title: group.title,
    description: group.description,
    inviteCode: group.inviteCode,
    privacy: group.privacy,
    memberLimit: group.memberLimit,
    currentUserRole: currentMember?.role ?? null,
    canManage,
    pendingJoinRequestCount: visibleJoinRequests.length,
    pendingJoinRequests: visibleJoinRequests.map((request) => ({
      id: request.id,
      userId: request.userId,
      name: request.user.name,
      username: request.user.username,
      avatarUrl: request.user.avatarUrl,
      createdAt: request.createdAt,
    })),
    createdAt: group.createdAt,
    updatedAt: group.updatedAt,
    members: group.members.map((member) => ({
      userId: member.userId,
      name: member.user.name,
      username: member.user.username,
      avatarUrl: member.user.avatarUrl,
      role: member.role,
      joinedAt: member.joinedAt,
    })),
    messages: await Promise.all(
      sortMessagesChronologically(group.messages)
        .filter((message) => !isRoomStateMessage(message.content))
        .map(async (message) => {
        const attachments = await Promise.all(
          message.attachments.map(async (attachment) => ({
            id: attachment.id,
            url: await getDownloadUrl(attachment.storageKey),
            name: attachment.name,
            mimeType: attachment.mimeType,
            sizeBytes: attachment.sizeBytes,
          })),
        );
        const firstAttachment = attachments[0] ?? null;

        return {
          id: message.id,
          groupId: message.groupId,
          authorId: message.authorId,
          authorName: message.author.name,
          authorUsername: message.author.username,
          authorAvatarUrl: message.author.avatarUrl,
          content: message.content,
          attachments,
          attachmentUrl: firstAttachment?.url ?? null,
          attachmentName: firstAttachment?.name ?? null,
          attachmentMimeType: firstAttachment?.mimeType ?? null,
          attachmentSizeBytes: firstAttachment?.sizeBytes ?? null,
          createdAt: message.createdAt,
        };
      }),
    ),
    roomState: normalizeRoomState(group),
    roomPermissions,
    roomActivity: getRoomActivity(group),
    roomPresence: getRoomPresence(group),
    roomTimeline: getRoomTimeline(group),
    memberCount: group.members.length,
  };
}

async function toStudyGroupMessageRecord(message: {
  id: string;
  groupId: string;
  authorId: string;
  content: string | null;
  createdAt: Date;
  author: {
    id: string;
    name: string | null;
    username: string | null;
    avatarUrl: string | null;
  };
  attachments: Array<{
    id: string;
    storageKey: string;
    name: string;
    mimeType: string;
    sizeBytes: number;
  }>;
}) {
  const attachments = await Promise.all(
    message.attachments.map(async (attachment) => ({
      id: attachment.id,
      url: await getDownloadUrl(attachment.storageKey),
      name: attachment.name,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.sizeBytes,
    })),
  );
  const firstAttachment = attachments[0] ?? null;

  return {
    id: message.id,
    groupId: message.groupId,
    authorId: message.authorId,
    authorName: message.author.name,
    authorUsername: message.author.username,
    authorAvatarUrl: message.author.avatarUrl,
    content: message.content,
    attachments,
    attachmentUrl: firstAttachment?.url ?? null,
    attachmentName: firstAttachment?.name ?? null,
    attachmentMimeType: firstAttachment?.mimeType ?? null,
    attachmentSizeBytes: firstAttachment?.sizeBytes ?? null,
    createdAt: message.createdAt,
  };
}

function createAttachmentStorageKey(groupId: string, fileName: string) {
  const safeName = fileName
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .slice(-120);
  return `study-groups/${groupId}/${Date.now()}-${randomUUID()}-${safeName}`;
}

async function generateInviteCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

  for (let attempt = 0; attempt < 10; attempt += 1) {
    let code = "";
    for (let i = 0; i < 8; i += 1) {
      code += alphabet[Math.floor(Math.random() * alphabet.length)];
    }

    const existing = await prisma.studyGroup.findUnique({
      where: { inviteCode: code },
      select: { id: true },
    });

    if (!existing) {
      return code;
    }
  }

  throw new Error("Could not create a unique invite code.");
}

async function assertMembership(userId: string, groupId: string) {
  const member = await prisma.studyGroupMember.findUnique({
    where: {
      groupId_userId: {
        groupId,
        userId,
      },
    },
  });

  if (!member) {
    const error = new Error("You are not a member of this study group.");
    Object.assign(error, { status: 403 });
    throw error;
  }

  return member;
}

async function assertOwner(userId: string, groupId: string) {
  const member = await assertMembership(userId, groupId);
  if (member.role !== "owner") {
    const error = new Error("Only the group owner can manage this study group.");
    Object.assign(error, { status: 403 });
    throw error;
  }

  return member;
}

async function assertRoomEditPermission(
  userId: string,
  groupId: string,
  input: UpdateStudyRoomStateInput,
) {
  const member = await assertMembership(userId, groupId);

  const needsOwnerControl = ROOM_OWNER_CONTROL_FIELDS.some((field) => field in input);
  if (needsOwnerControl && member.role !== "owner") {
    const error = new Error("Only the room owner can control the shared timer and pinned resources.");
    Object.assign(error, { status: 403 });
    throw error;
  }

  const noteOrTaskUpdate =
    "sessionPrompt" in input ||
    "sessionNote" in input ||
    "sessionOutcomes" in input ||
    "tasks" in input ||
    "sessionHistory" in input ||
    "collectionTakeaways" in input ||
    "itemNotes" in input;
  if (noteOrTaskUpdate && !member) {
    const error = new Error("Only room members can update shared room notes or tasks.");
    Object.assign(error, { status: 403 });
    throw error;
  }

  return member;
}

async function assertCapacity(groupId: string, memberLimit: number | null) {
  if (!memberLimit) {
    return;
  }

  const memberCount = await prisma.studyGroupMember.count({
    where: { groupId },
  });

  if (memberCount >= memberLimit) {
    const error = new Error("This study group has reached its member limit.");
    Object.assign(error, { status: 400 });
    throw error;
  }
}

export async function listStudyGroups(userId: string) {
  const groups = await prisma.studyGroup.findMany({
    where: {
      members: {
        some: { userId },
      },
    },
    include: groupListInclude,
    orderBy: { updatedAt: "desc" },
  });

  return Promise.all(groups.map((group) => toStudyGroupRecord(group, userId)));
}

export async function getStudyGroup(userId: string, groupId: string) {
  await assertMembership(userId, groupId);

  const group = await prisma.studyGroup.findUnique({
    where: { id: groupId },
    include: groupInclude,
  });

  if (!group) {
    const error = new Error("Study group not found.");
    Object.assign(error, { status: 404 });
    throw error;
  }

  return toStudyGroupRecord(group, userId);
}

export async function createStudyGroup(userId: string, input: CreateStudyGroupInput) {
  const inviteCode = await generateInviteCode();
  const roomSetup = input.roomSetup;
  const template = resolveRoomTemplate(roomSetup);

  const starterCollectionId = roomSetup?.starterCollectionId ?? template.starterCollectionId ?? null;
  const starterItemIdOverride = roomSetup?.starterItemId ?? template.starterItemId ?? null;

  const starterCollection = starterCollectionId
    ? await prisma.collection.findFirst({
        where: {
          id: starterCollectionId,
          userId,
        },
        include: {
          collectionItems: {
            select: { itemId: true },
          },
        },
      })
    : null;

  const starterItemIdFromCollection = starterCollection?.collectionItems[0]?.itemId ?? null;
  const starterItemId = starterItemIdOverride ?? starterItemIdFromCollection;
  const starterItem = starterItemId
    ? await prisma.item.findFirst({
        where: {
          id: starterItemId,
          userId,
        },
        select: {
          id: true,
          title: true,
          type: true,
          url: true,
          sourceHost: true,
        },
      })
    : null;

  const group = await prisma.studyGroup.create({
    data: {
      ownerId: userId,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      inviteCode,
      members: {
        create: {
          userId,
          role: "owner",
        },
      },
    },
    include: groupInclude,
  });

  await prisma.studyGroupMessage.create({
    data: {
      groupId: group.id,
      authorId: userId,
      content: `${ROOM_STATE_PREFIX}${JSON.stringify({
        payloadType: "state",
        mode: DEFAULT_ROOM_MODE,
        status: DEFAULT_ROOM_STATUS,
        timeLeftSeconds: template.focusMinutes * 60,
        focusMinutes: template.focusMinutes,
        breakMinutes: template.breakMinutes,
        template: {
          id: template.id,
          label: template.label,
          description: template.description,
        },
        sessionPrompt: template.prompt,
        sessionNote: null,
        sessionOutcomes: {
          completedThisBlock: [],
          carryForward: [],
          blockers: [],
        },
        tasks: [],
        sessionHistory: [],
        collectionTakeaways: [],
        itemNotes: [],
        pinnedCollection: starterCollection
          ? {
              collectionId: starterCollection.id,
              title: starterCollection.title,
              description: starterCollection.description,
              itemCount: starterCollection.collectionItems.length,
            }
          : null,
        activeCollectionItemId: starterItemIdFromCollection,
        completedCollectionItemIds: [],
        pinnedResource: starterItem
          ? {
              itemId: starterItem.id,
              title: starterItem.title,
              type: starterItem.type,
              url: starterItem.url,
              sourceHost: starterItem.sourceHost,
            }
          : null,
        timerEndsAt: null,
        updatedAt: new Date().toISOString(),
        updatedByUserId: userId,
        updatedByName: group.members[0]?.user.name ?? null,
        updatedByUsername: group.members[0]?.user.username ?? null,
        activityType: "note",
        activityLabel: "Initialized room setup",
        activityDetail: `${template.label}${starterCollection ? ` · ${starterCollection.title}` : ""}`,
      })}`,
    },
  });

  publishStudyRoomEvent(group.id);
  publishStudyGroupUpdate(group.id);

  return getStudyGroup(userId, group.id);
}

export async function joinStudyGroup(userId: string, input: JoinStudyGroupInput): Promise<StudyGroupJoinResult> {
  const inviteCode = input.inviteCode.trim().toUpperCase();
  const group = await prisma.studyGroup.findUnique({
    where: { inviteCode },
    select: {
      id: true,
      title: true,
      privacy: true,
      memberLimit: true,
      members: {
        where: { userId },
        select: { userId: true },
      },
      joinRequests: {
        where: { userId },
        select: { id: true, status: true },
      },
    },
  });

  if (!group) {
    const error = new Error("That invite code does not match any study group.");
    Object.assign(error, { status: 404 });
    throw error;
  }

  if (group.members.length > 0) {
    return {
      status: "joined",
      group: await getStudyGroup(userId, group.id),
    };
  }

  if (group.privacy === "public") {
    await assertCapacity(group.id, group.memberLimit);
    await prisma.studyGroupMember.upsert({
      where: {
        groupId_userId: {
          groupId: group.id,
          userId,
        },
      },
      update: {},
      create: {
        groupId: group.id,
        userId,
        role: "member",
      },
    });

    await prisma.studyGroupJoinRequest.deleteMany({
      where: {
        groupId: group.id,
        userId,
      },
    });

    return {
      status: "joined",
      group: await getStudyGroup(userId, group.id),
    };
  }

  const existingRequest = group.joinRequests[0] ?? null;
  if (existingRequest?.status === "pending") {
    return {
      status: "pending",
      groupTitle: group.title,
      message: "Your join request is still waiting for the owner to approve it.",
    };
  }

  await prisma.studyGroupJoinRequest.upsert({
    where: {
      groupId_userId: {
        groupId: group.id,
        userId,
      },
    },
    update: {
      status: "pending",
    },
    create: {
      groupId: group.id,
      userId,
      status: "pending",
    },
  });

  return {
    status: "pending",
    groupTitle: group.title,
    message: "Your join request has been sent to the group owner.",
  };
}

export async function listStudyGroupMessages(userId: string, groupId: string) {
  const group = await getStudyGroup(userId, groupId);
  return group.messages;
}

export async function updateStudyGroup(userId: string, groupId: string, input: UpdateStudyGroupInput) {
  await assertOwner(userId, groupId);

  if (input.memberLimit) {
    const currentMemberCount = await prisma.studyGroupMember.count({
      where: { groupId },
    });

    if (input.memberLimit < currentMemberCount) {
      const error = new Error("Member limit cannot be lower than the current member count.");
      Object.assign(error, { status: 400 });
      throw error;
    }
  }

  const data: Prisma.StudyGroupUpdateInput = {
    title: input.title.trim(),
    description: input.description?.trim() || null,
    privacy: input.privacy,
    memberLimit: input.memberLimit ?? null,
  };

  if (input.refreshInviteCode) {
    data.inviteCode = await generateInviteCode();
  }

  await prisma.studyGroup.update({
    where: { id: groupId },
    data,
  });

  publishStudyRoomEvent(groupId);
  publishStudyGroupUpdate(groupId);
  return getStudyGroup(userId, groupId);
}

export async function updateStudyGroupRoomState(
  userId: string,
  groupId: string,
  input: UpdateStudyRoomStateInput,
) {
  await assertRoomEditPermission(userId, groupId, input);

  const existing = await prisma.studyGroup.findUnique({
    where: { id: groupId },
    include: {
      members: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              username: true,
              avatarUrl: true,
            },
          },
        },
      },
      messages: {
        select: {
          content: true,
          createdAt: true,
          authorId: true,
          author: {
            select: {
              name: true,
              username: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: ROOM_MESSAGE_WINDOW,
      },
    },
  });

  if (!existing) {
    const error = new Error("Study group not found.");
    Object.assign(error, { status: 404 });
    throw error;
  }

  const normalized = normalizeRoomState(existing);
  const nextMode = input.mode ?? normalized.mode;
  const nextStatus = input.status ?? normalized.status;
  const nextFocusMinutes = input.focusMinutes ?? normalized.focusMinutes;
  const nextBreakMinutes = input.breakMinutes ?? normalized.breakMinutes;
  const nextTimeLeft =
    input.timeLeftSeconds ??
    (input.mode !== undefined || input.focusMinutes !== undefined || input.breakMinutes !== undefined
      ? nextMode === "focus"
        ? nextFocusMinutes * 60
        : nextBreakMinutes * 60
      : normalized.timeLeftSeconds);
  const nextUpdatedAt = new Date().toISOString();
  const actor = existing.members.find((member) => member.userId === userId)?.user ?? null;
  const payloadType = input.payloadType ?? "state";

  if (payloadType !== "presence") {
    await prisma.studyGroupMessage.create({
      data: {
        groupId,
        authorId: userId,
        content: `${ROOM_STATE_PREFIX}${JSON.stringify({
          payloadType,
          mode: nextMode,
          status: nextStatus,
          presenceStatus: input.presenceStatus ?? null,
          timeLeftSeconds: nextTimeLeft,
          focusMinutes: nextFocusMinutes,
          breakMinutes: nextBreakMinutes,
          template:
            input.template !== undefined
              ? input.template
              : normalized.template,
          sessionPrompt:
            input.sessionPrompt !== undefined
              ? input.sessionPrompt.trim() || null
              : normalized.sessionPrompt,
          sessionNote:
            input.sessionNote !== undefined
              ? input.sessionNote.trim() || null
              : normalized.sessionNote,
          sessionOutcomes:
            input.sessionOutcomes !== undefined
              ? input.sessionOutcomes
              : normalized.sessionOutcomes,
          tasks:
            input.tasks !== undefined
              ? input.tasks
              : normalized.tasks,
          sessionHistory:
            input.sessionHistory !== undefined
              ? input.sessionHistory
              : normalized.sessionHistory,
          collectionTakeaways:
            input.collectionTakeaways !== undefined
              ? input.collectionTakeaways.map((takeaway) => ({
                  ...takeaway,
                  authorUserId:
                    takeaway.authorName === null && takeaway.authorUsername === null
                      ? userId
                      : takeaway.authorUserId,
                  authorName: takeaway.authorName ?? actor?.name ?? null,
                  authorUsername: takeaway.authorUsername ?? actor?.username ?? null,
                }))
              : normalized.collectionTakeaways,
          itemNotes:
            input.itemNotes !== undefined
              ? input.itemNotes
              : normalized.itemNotes,
          timerEndsAt:
            input.timerEndsAt !== undefined
              ? input.timerEndsAt
              : nextStatus === "running"
                ? normalized.timerEndsAt?.toISOString() ?? null
                : null,
          streamHostUserId:
            input.streamHostUserId !== undefined
              ? input.streamHostUserId
              : normalized.streamHostUserId,
          updatedAt: nextUpdatedAt,
          updatedByUserId: userId,
          updatedByName: actor?.name ?? null,
          updatedByUsername: actor?.username ?? null,
          activityType: input.activityType ?? null,
          activityLabel: input.activityLabel?.trim() || null,
          activityDetail: input.activityDetail?.trim() || null,
          pinnedResource:
            input.pinnedResource !== undefined
              ? input.pinnedResource
              : normalized.pinnedResource,
          pinnedCollection:
            input.pinnedCollection !== undefined
              ? input.pinnedCollection
              : normalized.pinnedCollection,
          activeCollectionItemId:
            input.activeCollectionItemId !== undefined
              ? input.activeCollectionItemId
              : normalized.activeCollectionItemId,
          completedCollectionItemIds:
            input.completedCollectionItemIds !== undefined
              ? input.completedCollectionItemIds
              : normalized.completedCollectionItemIds,
        })}`,
      },
    });
  }

  await prisma.studyGroup.update({
    where: { id: groupId },
    data: { updatedAt: new Date() },
  });

  if (payloadType === "presence" && input.presenceStatus) {
    publishStudyRoomPresenceEvent({
      groupId,
      userId,
      name: actor?.name ?? null,
      username: actor?.username ?? null,
      avatarUrl: actor?.avatarUrl ?? null,
      status: input.presenceStatus,
      updatedAt: nextUpdatedAt,
    });
  } else {
    publishStudyRoomEvent(groupId, {
      payloadType,
      actorUserId: userId,
      updatedAt: nextUpdatedAt,
    });
    publishStudyGroupUpdate(groupId);
  }

  return getStudyGroup(userId, groupId);
}

export async function removeStudyGroupMember(userId: string, groupId: string, memberUserId: string) {
  await assertOwner(userId, groupId);

  const group = await prisma.studyGroup.findUnique({
    where: { id: groupId },
    select: { ownerId: true },
  });

  if (!group) {
    const error = new Error("Study group not found.");
    Object.assign(error, { status: 404 });
    throw error;
  }

  if (group.ownerId === memberUserId) {
    const error = new Error("The owner cannot be removed from the group.");
    Object.assign(error, { status: 400 });
    throw error;
  }

  await prisma.studyGroupMember.delete({
    where: {
      groupId_userId: {
        groupId,
        userId: memberUserId,
      },
    },
  });

  await prisma.studyGroupJoinRequest.deleteMany({
    where: {
      groupId,
      userId: memberUserId,
    },
  });

  publishStudyRoomEvent(groupId);
  publishStudyGroupUpdate(groupId);
  return getStudyGroup(userId, groupId);
}

export async function manageStudyGroupJoinRequest(
  userId: string,
  groupId: string,
  requestId: string,
  input: ManageStudyGroupJoinRequestInput,
) {
  await assertOwner(userId, groupId);

  const request = await prisma.studyGroupJoinRequest.findFirst({
    where: {
      id: requestId,
      groupId,
      status: "pending",
    },
    select: {
      id: true,
      userId: true,
      group: {
        select: {
          memberLimit: true,
        },
      },
    },
  });

  if (!request) {
    const error = new Error("Join request not found.");
    Object.assign(error, { status: 404 });
    throw error;
  }

  if (input.action === "approve") {
    await assertCapacity(groupId, request.group.memberLimit);
    await prisma.studyGroupMember.upsert({
      where: {
        groupId_userId: {
          groupId,
          userId: request.userId,
        },
      },
      update: {},
      create: {
        groupId,
        userId: request.userId,
        role: "member",
      },
    });
    await prisma.studyGroupJoinRequest.delete({
      where: { id: request.id },
    });
  } else {
    await prisma.studyGroupJoinRequest.update({
      where: { id: request.id },
      data: { status: "rejected" },
    });
  }

  publishStudyRoomEvent(groupId);
  publishStudyGroupUpdate(groupId);
  return getStudyGroup(userId, groupId);
}

export async function createStudyGroupMessage(
  userId: string,
  groupId: string,
  input: CreateStudyGroupMessageInput,
  attachments?: Array<{
    name: string;
    mimeType: string;
    sizeBytes: number;
    buffer: Buffer;
  }>,
) {
  await assertMembership(userId, groupId);

  const trimmedContent = input.content?.trim() || null;

  if (!trimmedContent && (!attachments || attachments.length === 0)) {
    const error = new Error("Add a message or attach a file before sending.");
    Object.assign(error, { status: 400 });
    throw error;
  }

  const uploadedAttachments =
    attachments && attachments.length > 0
      ? await Promise.all(
          attachments.map(async (attachment, index) => {
            const storageKey = createAttachmentStorageKey(groupId, attachment.name);
            await uploadBuffer(storageKey, attachment.buffer, attachment.mimeType);

            return {
              storageKey,
              name: attachment.name,
              mimeType: attachment.mimeType,
              sizeBytes: attachment.sizeBytes,
              sortOrder: index,
            };
          }),
        )
      : [];

  const createdMessage = await prisma.studyGroupMessage.create({
    data: {
      groupId,
      authorId: userId,
      content: trimmedContent,
      attachments: uploadedAttachments.length
        ? {
            create: uploadedAttachments,
          }
        : undefined,
    },
    include: {
      author: {
        select: {
          id: true,
          name: true,
          username: true,
          avatarUrl: true,
        },
      },
      attachments: {
        orderBy: { sortOrder: "asc" },
      },
    },
  });

  await prisma.studyGroup.update({
    where: { id: groupId },
    data: { updatedAt: new Date() },
  });

  publishStudyRoomEvent(groupId);
  publishStudyGroupUpdate(groupId);
  const messageRecord = await toStudyGroupMessageRecord(createdMessage);
  publishStudyGroupMessage(groupId, messageRecord);
  return messageRecord;
}
