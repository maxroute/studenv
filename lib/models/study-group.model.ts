import { z } from "zod";

const studyRoomTemplatePresetSchema = z.object({
  id: z.string().trim().min(1).max(64),
  label: z.string().trim().min(1).max(80),
  description: z.string().trim().min(1).max(240),
  focusMinutes: z.number().int().min(1).max(240),
  breakMinutes: z.number().int().min(1).max(60),
  prompt: z.string().trim().min(1).max(600),
  starterCollectionId: z.string().trim().min(1).max(64).nullable().optional(),
  starterCollectionTitle: z.string().trim().max(160).nullable().optional(),
  starterItemId: z.string().trim().min(1).max(64).nullable().optional(),
  starterItemTitle: z.string().trim().max(500).nullable().optional(),
  custom: z.boolean().optional(),
});

export const createStudyGroupSchema = z.object({
  title: z.string().trim().min(2).max(160),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
  roomSetup: z
    .object({
      templateId: z.string().trim().min(1).max(64).optional(),
      template: studyRoomTemplatePresetSchema.optional(),
      starterCollectionId: z.string().trim().min(1).max(64).nullable().optional(),
      starterItemId: z.string().trim().min(1).max(64).nullable().optional(),
    })
    .optional(),
});

export const saveStudyRoomTemplatesSchema = z.object({
  templates: z.array(studyRoomTemplatePresetSchema).max(50),
});

export const joinStudyGroupSchema = z.object({
  inviteCode: z.string().trim().min(4).max(12),
});

export const createStudyGroupMessageSchema = z.object({
  content: z.string().trim().max(4000).optional().or(z.literal("")),
});

export const updateStudyGroupSchema = z.object({
  title: z.string().trim().min(2).max(160),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
  privacy: z.enum(["public", "private"]),
  memberLimit: z.number().int().min(2).max(500).nullable().optional(),
  refreshInviteCode: z.boolean().optional(),
});

export const updateStudyRoomStateSchema = z.object({
  payloadType: z.enum(["state", "presence"]).optional(),
  mode: z.enum(["focus", "break"]).optional(),
  status: z.enum(["idle", "running", "paused"]).optional(),
  presenceStatus: z.enum(["active", "focused", "away"]).optional(),
  timeLeftSeconds: z.number().int().min(0).max(24 * 60 * 60).optional(),
  focusMinutes: z.number().int().min(1).max(240).optional(),
  breakMinutes: z.number().int().min(1).max(60).optional(),
  streamHostUserId: z.string().trim().min(1).max(64).nullable().optional(),
  template: z
    .object({
      id: z.string().trim().min(1).max(64),
      label: z.string().trim().min(1).max(80),
      description: z.string().trim().min(1).max(240),
    })
    .nullable()
    .optional(),
  sessionPrompt: z.string().trim().max(600).optional().or(z.literal("")),
  sessionNote: z.string().trim().max(2000).optional().or(z.literal("")),
  sessionOutcomes: z
    .object({
      completedThisBlock: z.array(z.string().trim().min(1).max(240)).max(50),
      carryForward: z.array(z.string().trim().min(1).max(240)).max(50),
      blockers: z.array(z.string().trim().min(1).max(240)).max(50),
    })
    .optional(),
  tasks: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(64),
        text: z.string().trim().min(1).max(240),
        completed: z.boolean(),
        updatedAt: z.string().datetime(),
      }),
    )
    .max(50)
    .optional(),
  sessionHistory: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(64),
        createdAt: z.string().datetime(),
        templateId: z.string().trim().min(1).max(64),
        templateLabel: z.string().trim().min(1).max(80),
        summary: z.string().trim().min(1).max(12000),
        prompt: z.string().trim().max(600).nullable(),
        completedThisBlock: z.array(z.string().trim().min(1).max(240)).max(50),
        carryForward: z.array(z.string().trim().min(1).max(240)).max(50),
        blockers: z.array(z.string().trim().min(1).max(240)).max(50),
        activeItemTitle: z.string().trim().max(500).nullable(),
        pinnedCollectionTitle: z.string().trim().max(160).nullable(),
      }),
    )
    .max(50)
    .optional(),
  collectionTakeaways: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(64),
        itemId: z.string().trim().min(1).max(64),
        kind: z.enum(["key_idea", "question", "confusion"]),
        text: z.string().trim().min(1).max(500),
        authorUserId: z.string().trim().min(1).max(64),
        authorName: z.string().trim().max(160).nullable(),
        authorUsername: z.string().trim().max(160).nullable(),
        updatedAt: z.string().datetime(),
      }),
    )
    .max(200)
    .optional(),
  itemNotes: z
    .array(
      z.object({
        itemId: z.string().trim().min(1).max(64),
        note: z.string().trim().max(5000),
        updatedAt: z.string().datetime(),
      }),
    )
    .max(200)
    .optional(),
  activeCollectionItemId: z.string().trim().min(1).max(64).nullable().optional(),
  completedCollectionItemIds: z.array(z.string().trim().min(1).max(64)).max(1000).optional(),
  timerEndsAt: z.string().datetime().nullable().optional(),
  activityType: z.enum(["mode", "status", "timer", "note"]).optional(),
  activityLabel: z.string().trim().min(1).max(120).optional(),
  activityDetail: z.string().trim().max(240).optional().or(z.literal("")),
  pinnedResource: z
    .object({
      itemId: z.string().trim().min(1).max(64),
      title: z.string().trim().min(1).max(500),
      type: z.enum(["article", "pdf", "video", "note"]),
      url: z.string().trim().max(2000).nullable(),
      sourceHost: z.string().trim().max(255).nullable(),
    })
    .nullable()
    .optional(),
  pinnedCollection: z
    .object({
      collectionId: z.string().trim().min(1).max(64),
      title: z.string().trim().min(1).max(160),
      description: z.string().trim().max(2000).nullable(),
      itemCount: z.number().int().min(0).max(10000),
    })
    .nullable()
    .optional(),
});

export const manageStudyGroupJoinRequestSchema = z.object({
  action: z.enum(["approve", "reject"]),
});

export type CreateStudyGroupInput = z.infer<typeof createStudyGroupSchema>;
export type JoinStudyGroupInput = z.infer<typeof joinStudyGroupSchema>;
export type CreateStudyGroupMessageInput = z.infer<typeof createStudyGroupMessageSchema>;
export type UpdateStudyGroupInput = z.infer<typeof updateStudyGroupSchema>;
export type UpdateStudyRoomStateInput = z.infer<typeof updateStudyRoomStateSchema>;
export type SaveStudyRoomTemplatesInput = z.infer<typeof saveStudyRoomTemplatesSchema>;
export type ManageStudyGroupJoinRequestInput = z.infer<typeof manageStudyGroupJoinRequestSchema>;
