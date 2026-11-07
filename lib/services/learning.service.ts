import { prisma } from "@/lib/db/prisma";
import type {
  CreateCourseResourceInput,
  CreateCourseInput,
  CreateCourseNodeInput,
  SaveCourseNotesInput,
  UpdateCourseInput,
  UpdateCourseNodeInput,
} from "@/lib/models/learning.model";
import { sanitizeUrl } from "@/lib/security/sanitize";
import * as learningRepository from "@/lib/repositories/learning.repository";
import { siteConfig } from "@/config/site";
import { auditLog } from "@/lib/repositories/base.repository";
import * as itemRepository from "@/lib/repositories/item.repository";
import type { Plan } from "@/types";

function requestError(message: string, status: number) {
  return Object.assign(new Error(message), { status });
}

function normalizeLearningUrl(value: string | null | undefined) {
  try {
    const safeUrl = sanitizeUrl(value);
    if (!safeUrl) throw new Error("Missing URL");
    return safeUrl;
  } catch {
    throw requestError("Enter a valid public HTTP or HTTPS URL.", 400);
  }
}

export async function listCourses(userId: string) {
  return learningRepository.listCourses(userId);
}

export async function listRanganContexts(userId: string) {
  return prisma.course.findMany({
    where: { userId },
    orderBy: [{ title: "asc" }],
    select: {
      id: true,
      title: true,
      providerName: true,
      nodes: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        select: { id: true, parentId: true, type: true, title: true },
      },
    },
  });
}

export async function createCourse(userId: string, input: CreateCourseInput) {
  const courseUrl = normalizeLearningUrl(input.courseUrl);
  return prisma.course.create({
    data: { ...input, courseUrl, userId },
  });
}

export async function getCourse(userId: string, courseId: string) {
  const course = await learningRepository.getCourse(userId, courseId);
  if (!course) throw requestError("Course not found.", 404);
  return course;
}

export async function getStudyNode(userId: string, nodeId: string) {
  const node = await learningRepository.findOwnedNode(userId, nodeId);
  if (!node) throw requestError("Learning node not found.", 404);
  return node;
}

export async function updateCourse(
  userId: string,
  courseId: string,
  input: UpdateCourseInput,
) {
  const ownedCourse = await learningRepository.findOwnedCourse(userId, courseId);
  if (!ownedCourse) throw requestError("Course not found.", 404);
  const courseUrl =
    input.courseUrl === undefined ? undefined : normalizeLearningUrl(input.courseUrl);
  return prisma.course.update({
    where: { id: courseId },
    data: { ...input, ...(input.courseUrl !== undefined ? { courseUrl } : {}) },
  });
}

export async function deleteCourse(userId: string, courseId: string) {
  const result = await prisma.course.deleteMany({ where: { id: courseId, userId } });
  if (!result.count) throw requestError("Course not found.", 404);
  return { id: courseId };
}

export async function listCourseNodes(userId: string, courseId: string) {
  const course = await learningRepository.findOwnedCourse(userId, courseId);
  if (!course) throw requestError("Course not found.", 404);
  return learningRepository.listCourseNodes(courseId);
}

export async function createCourseNode(
  userId: string,
  courseId: string,
  input: CreateCourseNodeInput,
) {
  const course = await learningRepository.findOwnedCourse(userId, courseId);
  if (!course) throw requestError("Course not found.", 404);

  if (input.parentId) {
    const parent = await learningRepository.findNodeInCourse(courseId, input.parentId);
    if (!parent) throw requestError("Parent learning node not found in this course.", 404);
  }

  const courseNodes = await learningRepository.listCourseNodes(courseId);
  const siblings = courseNodes.filter((node) => node.parentId === (input.parentId ?? null));
  const originalUrl =
    input.originalUrl === undefined || input.originalUrl === null
      ? null
      : normalizeLearningUrl(input.originalUrl);

  return prisma.courseNode.create({
    data: {
      ...input,
      courseId,
      parentId: input.parentId ?? null,
      originalUrl,
      sortOrder: input.sortOrder ?? siblings.reduce((max, node) => Math.max(max, node.sortOrder), -1) + 1,
    },
  });
}

export async function updateCourseNode(
  userId: string,
  nodeId: string,
  input: UpdateCourseNodeInput,
) {
  const node = await learningRepository.findOwnedNode(userId, nodeId);
  if (!node) throw requestError("Learning node not found.", 404);

  if (input.parentId !== undefined) {
    if (input.parentId === nodeId) throw requestError("A node cannot be its own parent.", 400);
    if (input.parentId) {
      const parent = await learningRepository.findNodeInCourse(node.courseId, input.parentId);
      if (!parent) throw requestError("Parent learning node not found in this course.", 404);

      let cursor: typeof parent | null = parent;
      while (cursor) {
        if (cursor.id === nodeId) throw requestError("Moving this node would create a cycle.", 400);
        cursor = cursor.parentId
          ? await learningRepository.findNodeInCourse(node.courseId, cursor.parentId)
          : null;
      }
    }
  }

  const originalUrl =
    input.originalUrl === undefined
      ? undefined
      : input.originalUrl === null
        ? null
        : sanitizeUrl(input.originalUrl);

  return prisma.courseNode.update({
    where: { id: nodeId },
    data: {
      ...input,
      ...(input.originalUrl !== undefined ? { originalUrl } : {}),
    },
  });
}

export async function deleteCourseNode(userId: string, nodeId: string) {
  const node = await learningRepository.findOwnedNode(userId, nodeId);
  if (!node) throw requestError("Learning node not found.", 404);
  await prisma.courseNode.delete({ where: { id: nodeId } });
  return { id: nodeId };
}

export async function attachItemToNode(userId: string, nodeId: string, itemId: string) {
  const node = await learningRepository.findOwnedNode(userId, nodeId);
  if (!node) throw requestError("Learning node not found.", 404);
  const item = await prisma.item.findFirst({ where: { id: itemId, userId }, select: { id: true } });
  if (!item) throw requestError("Shelf item not found.", 404);

  return prisma.item.update({
    where: { id: itemId },
    data: { courseNodeId: nodeId },
    select: { id: true, title: true, type: true, courseNodeId: true },
  });
}

export async function detachItemFromNode(userId: string, nodeId: string, itemId: string) {
  const node = await learningRepository.findOwnedNode(userId, nodeId);
  if (!node) throw requestError("Learning node not found.", 404);
  const result = await prisma.item.updateMany({
    where: { id: itemId, userId, courseNodeId: nodeId },
    data: { courseNodeId: null },
  });
  if (!result.count) throw requestError("Linked Shelf item not found.", 404);
  return { itemId };
}

export async function saveCourseNotes(
  userId: string,
  plan: Plan,
  nodeId: string,
  input: SaveCourseNotesInput,
) {
  const node = await learningRepository.findOwnedNode(userId, nodeId);
  if (!node) throw requestError("Learning node not found.", 404);

  const title = `Lecture notes — ${node.title}`;
  const existing = await prisma.item.findFirst({
    where: { userId, courseNodeId: nodeId, type: "note", title },
    select: { id: true },
  });
  const excerpt = input.content.slice(0, 5000);

  if (existing) {
    const item = await prisma.item.update({
      where: { id: existing.id },
      data: { notes: input.content, excerpt },
      select: { id: true, title: true, type: true, courseNodeId: true, updatedAt: true },
    });
    await auditLog({ userId, action: "UPDATE_ITEM", resource: "item", resourceId: item.id });
    return { ...item, saved: true };
  }

  if (!input.content.trim()) return { id: null, title, saved: false };
  await enforceShelfItemLimit(userId, plan);
  const item = await prisma.item.create({
    data: {
      userId,
      courseNodeId: nodeId,
      type: "note",
      title,
      notes: input.content,
      excerpt,
    },
    select: { id: true, title: true, type: true, courseNodeId: true, updatedAt: true },
  });
  await auditLog({ userId, action: "CREATE_ITEM", resource: "item", resourceId: item.id });
  return { ...item, saved: true };
}

async function enforceShelfItemLimit(userId: string, plan: Plan) {
  if (plan !== "free") return;
  const count = await itemRepository.countByUserId(userId);
  if (count >= siteConfig.freeTierItemLimit) {
    throw requestError("Free tier item limit reached.", 403);
  }
}

export async function createCourseResource(
  userId: string,
  plan: Plan,
  nodeId: string,
  input: CreateCourseResourceInput,
) {
  const node = await learningRepository.findOwnedNode(userId, nodeId);
  if (!node) throw requestError("Learning node not found.", 404);
  const url = normalizeLearningUrl(input.url);
  await enforceShelfItemLimit(userId, plan);

  const parsedUrl = new URL(url);
  const type = parsedUrl.pathname.toLowerCase().endsWith(".pdf") ? "pdf" : "article";
  const item = await prisma.item.create({
    data: {
      userId,
      courseNodeId: nodeId,
      type,
      title: input.title,
      url,
      sourceHost: parsedUrl.hostname,
    },
    select: { id: true, title: true, type: true, url: true, sourceHost: true, courseNodeId: true, createdAt: true },
  });
  await auditLog({ userId, action: "CREATE_ITEM", resource: "item", resourceId: item.id });
  return item;
}

export async function saveGeneratedMaterial(
  userId: string,
  plan: Plan,
  input: { title: string; content: string; courseNodeId?: string | null },
) {
  if (input.courseNodeId) {
    const node = await learningRepository.findOwnedNode(userId, input.courseNodeId);
    if (!node) throw requestError("Learning node not found.", 404);
  }
  await enforceShelfItemLimit(userId, plan);
  const item = await prisma.item.create({
    data: {
      userId,
      courseNodeId: input.courseNodeId ?? null,
      type: "note",
      title: input.title,
      notes: input.content,
      excerpt: input.content.slice(0, 5000),
    },
    select: { id: true, title: true, type: true, courseNodeId: true, createdAt: true },
  });
  await auditLog({
    userId,
    action: "CREATE_ITEM",
    resource: "item",
    resourceId: item.id,
    metadata: { source: "rangan", title: item.title },
  });
  return item;
}

export async function getCourseProgress(userId: string, courseId: string) {
  const course = await learningRepository.findOwnedCourse(userId, courseId);
  if (!course) throw requestError("Course not found.", 404);

  const nodes = await learningRepository.listCourseNodes(courseId);
  const nodeIds = nodes.map((node) => node.id);
  if (!nodeIds.length) {
    return { courseId, focusSessions: 0, focusMinutes: 0, completedTasks: 0, savedItems: 0 };
  }

  const [sessions, tasks, savedItems] = await Promise.all([
    prisma.focusSession.findMany({
      where: { userId, courseNodeId: { in: nodeIds }, type: "focus", status: { in: ["completed", "interrupted"] } },
      select: { courseNodeId: true, durationMs: true, status: true },
    }),
    prisma.task.findMany({ where: { userId, courseNodeId: { in: nodeIds }, status: "completed" }, select: { id: true } }),
    prisma.item.count({ where: { userId, courseNodeId: { in: nodeIds } } }),
  ]);

  return {
    courseId,
    focusSessions: sessions.length,
    focusMinutes: Math.round(sessions.reduce((sum, session) => sum + session.durationMs, 0) / 60000),
    completedTasks: tasks.length,
    savedItems,
  };
}

export async function getLearningProgress(userId: string) {
  const [courses, sessions, completedTasks, savedMaterials] = await Promise.all([
    prisma.course.count({ where: { userId } }),
    prisma.focusSession.aggregate({
      where: { userId, type: "focus", status: { in: ["completed", "interrupted"] }, courseNodeId: { not: null } },
      _count: { _all: true },
      _sum: { durationMs: true },
    }),
    prisma.task.count({ where: { userId, courseNodeId: { not: null }, status: "completed" } }),
    prisma.item.count({ where: { userId, courseNodeId: { not: null } } }),
  ]);

  return {
    courses,
    focusSessions: sessions._count._all,
    focusMinutes: Math.round((sessions._sum.durationMs ?? 0) / 60000),
    completedTasks,
    savedMaterials,
    trackingNote: "Study time comes from focus sessions explicitly recorded in Studenv. Provider video watch-time is not available.",
  };
}
