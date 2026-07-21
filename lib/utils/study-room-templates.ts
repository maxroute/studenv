import type { StudyRoomTemplateId, StudyRoomTemplateRecord } from "@/types";

export type StudyRoomTemplatePreset = StudyRoomTemplateRecord & {
  focusMinutes: number;
  breakMinutes: number;
  prompt: string;
  starterCollectionId?: string | null;
  starterCollectionTitle?: string | null;
  starterItemId?: string | null;
  starterItemTitle?: string | null;
  custom?: boolean;
};

export const BUILT_IN_STUDY_ROOM_TEMPLATES: StudyRoomTemplatePreset[] = [
  {
    id: "focus",
    label: "Focus Session",
    description: "Focus on your tasks with timer and notes.",
    focusMinutes: 20,
    breakMinutes: 5,
    prompt: "Set one concrete goal, stay aligned on the active item, and leave with clear next steps.",
  },
  {
    id: "social",
    label: "Social",
    description: "Collaborate, talk, and stream with others.",
    focusMinutes: 45,
    breakMinutes: 10,
    prompt: "Social co-working session. Talk, share screens, and solve problems together.",
  },
  {
    id: "silent",
    label: "Silent study",
    description: "Quiet focus room with timer.",
    focusMinutes: 50,
    breakMinutes: 10,
    prompt: "Silent focus block. Keep mic muted and work on your own tasks.",
  },
];

export const STUDY_ROOM_TEMPLATE_STORAGE_KEY = "study-room-custom-templates";

export function sanitizeStudyRoomTemplateId(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
}

export function normalizeStudyRoomTemplate(
  input: Partial<StudyRoomTemplatePreset>,
): StudyRoomTemplatePreset | null {
  const label = input.label?.trim();
  const description = input.description?.trim();
  const prompt = input.prompt?.trim();
  if (!label || !description || !prompt) {
    return null;
  }

  const focusMinutes = Number(input.focusMinutes);
  const breakMinutes = Number(input.breakMinutes);
  if (!Number.isFinite(focusMinutes) || !Number.isFinite(breakMinutes)) {
    return null;
  }

  const candidateId = input.id?.trim() || `custom_${sanitizeStudyRoomTemplateId(label)}`;
  const id = sanitizeStudyRoomTemplateId(candidateId);
  if (!id) {
    return null;
  }

  return {
    id,
    label: label.slice(0, 80),
    description: description.slice(0, 240),
    prompt: prompt.slice(0, 600),
    focusMinutes: Math.max(1, Math.min(240, Math.round(focusMinutes))),
    breakMinutes: Math.max(1, Math.min(60, Math.round(breakMinutes))),
    starterCollectionId: input.starterCollectionId?.trim() || null,
    starterCollectionTitle: input.starterCollectionTitle?.trim() || null,
    starterItemId: input.starterItemId?.trim() || null,
    starterItemTitle: input.starterItemTitle?.trim() || null,
    custom: input.custom ?? id.startsWith("custom_"),
  };
}

export function normalizeStudyRoomTemplates(inputs: Partial<StudyRoomTemplatePreset>[]) {
  return inputs
    .map((entry) => normalizeStudyRoomTemplate(entry))
    .filter((entry): entry is StudyRoomTemplatePreset => Boolean(entry));
}

export function readSavedStudyRoomTemplates() {
  if (typeof window === "undefined") {
    return [] as StudyRoomTemplatePreset[];
  }

  try {
    const raw = window.localStorage.getItem(STUDY_ROOM_TEMPLATE_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return normalizeStudyRoomTemplates(parsed as Partial<StudyRoomTemplatePreset>[]);
  } catch {
    return [];
  }
}

export function writeSavedStudyRoomTemplates(templates: StudyRoomTemplatePreset[]) {
  if (typeof window === "undefined") {
    return;
  }

  const normalized = normalizeStudyRoomTemplates(
    templates.map((entry) => ({ ...entry, custom: true })),
  );
  window.localStorage.setItem(STUDY_ROOM_TEMPLATE_STORAGE_KEY, JSON.stringify(normalized));
}

export function upsertSavedStudyRoomTemplate(template: Partial<StudyRoomTemplatePreset>) {
  const normalized = normalizeStudyRoomTemplate({ ...template, custom: true });
  if (!normalized) {
    return null;
  }

  const current = readSavedStudyRoomTemplates();
  const next = [normalized, ...current.filter((entry) => entry.id !== normalized.id)];
  writeSavedStudyRoomTemplates(next);
  return normalized;
}

export function getBuiltInStudyRoomTemplate(templateId: StudyRoomTemplateId) {
  return BUILT_IN_STUDY_ROOM_TEMPLATES.find((entry) => entry.id === templateId) ?? null;
}
