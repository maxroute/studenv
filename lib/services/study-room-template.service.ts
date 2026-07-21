import { prisma } from "@/lib/db/prisma";
import type { SaveStudyRoomTemplatesInput } from "@/lib/models/study-group.model";
import {
  normalizeStudyRoomTemplates,
  type StudyRoomTemplatePreset,
} from "@/lib/utils/study-room-templates";

const STUDY_ROOM_TEMPLATES_ACTION = "study_room_templates_saved";
const STUDY_ROOM_TEMPLATES_RESOURCE = "study_room_templates";

function parseTemplatesMetadata(raw: string | null) {
  if (!raw) {
    return [] as StudyRoomTemplatePreset[];
  }

  try {
    const parsed = JSON.parse(raw) as { templates?: Partial<StudyRoomTemplatePreset>[] };
    return normalizeStudyRoomTemplates(parsed.templates ?? []).map((entry) => ({
      ...entry,
      custom: true,
    }));
  } catch {
    return [];
  }
}

export async function listStudyRoomTemplates(userId: string) {
  const latest = await prisma.auditLog.findFirst({
    where: {
      userId,
      action: STUDY_ROOM_TEMPLATES_ACTION,
      resource: STUDY_ROOM_TEMPLATES_RESOURCE,
    },
    orderBy: {
      createdAt: "desc",
    },
    select: {
      metadata: true,
    },
  });

  return parseTemplatesMetadata(latest?.metadata ?? null);
}

export async function saveStudyRoomTemplates(
  userId: string,
  input: SaveStudyRoomTemplatesInput,
) {
  const templates = normalizeStudyRoomTemplates(input.templates).map((entry) => ({
    ...entry,
    custom: true,
  }));

  await prisma.auditLog.create({
    data: {
      userId,
      action: STUDY_ROOM_TEMPLATES_ACTION,
      resource: STUDY_ROOM_TEMPLATES_RESOURCE,
      metadata: JSON.stringify({ templates }),
    },
  });

  return templates;
}
