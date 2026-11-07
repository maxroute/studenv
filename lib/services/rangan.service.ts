import { prisma } from "@/lib/db/prisma";
import { generateFlashcards, isAiConfigured, chatWithDocument } from "@/lib/services/ai.service";
import * as learningRepository from "@/lib/repositories/learning.repository";
import type { RanganActionInput } from "@/lib/models/learning.model";
import type { Plan } from "@/types";
import * as learningService from "@/lib/services/learning.service";
import * as plannerService from "@/lib/services/planner.service";

function requestError(message: string, status: number) {
  return Object.assign(new Error(message), { status });
}

async function getLearningContext(userId: string, courseNodeId?: string | null, courseId?: string | null) {
  if (!courseNodeId && courseId) {
    const course = await prisma.course.findFirst({
      where: { id: courseId, userId },
      select: { title: true, providerName: true },
    });
    if (!course) throw requestError("Course not found.", 404);
    return `Course: ${course.title} (${course.providerName})\nNo specific subject, topic, or lecture was selected. Use the student's prompt and this course context.`;
  }
  if (!courseNodeId) return "No course node was selected. Use only the student's prompt.";
  const node = await learningRepository.findOwnedNode(userId, courseNodeId);
  if (!node) throw requestError("Learning node not found.", 404);
  if (courseId && courseId !== node.courseId) throw requestError("Selected course and learning node do not match.", 400);

  const parentParts: string[] = [node.title];
  let parentId = node.parentId;
  while (parentId) {
    const parent = await prisma.courseNode.findFirst({
      where: { id: parentId, courseId: node.courseId, course: { userId } },
      select: { id: true, title: true, parentId: true },
    });
    if (!parent) break;
    parentParts.unshift(parent.title);
    parentId = parent.parentId;
  }

  const savedText = node.items
    .map((item) => [item.title, item.excerpt, item.notes].filter(Boolean).join("\n"))
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 30000);

  return [
    `Course: ${node.course.title} (${node.course.providerName})`,
    `Learning path: ${parentParts.join(" / ")}`,
    savedText ? `Student's linked Shelf materials:\n${savedText}` : "No Shelf materials are linked to this learning node.",
  ].join("\n\n");
}

export async function performRanganAction(userId: string, plan: Plan, input: RanganActionInput) {
  if (input.action === "save_to_shelf") {
    const item = await learningService.saveGeneratedMaterial(userId, plan, input);
    return { action: input.action, saved: true, item };
  }

  if (input.action === "create_revision_task") {
    const task = await plannerService.createTask(userId, {
      title: input.title,
      description: "Revision task created with Rangan.",
      priority: "medium",
      status: "pending",
      category: "revision",
      dueDate: input.dueDate ? new Date(input.dueDate) : null,
      estimatedDuration: 20,
      notificationEnabled: false,
      repeat: "none",
      courseNodeId: input.courseNodeId ?? null,
      notes: "Created from the selected Studenv learning material.",
    });
    return { action: input.action, created: true, task };
  }

  if (!isAiConfigured()) {
    throw requestError("Rangan is unavailable because Gemini is not configured.", 503);
  }

  const context = await getLearningContext(userId, input.courseNodeId, input.courseId);
  if (input.action === "flashcards") {
    const rawCards = await generateFlashcards(`${context}\n\nCreate flashcards for: ${input.prompt}`);
    const cards = Array.isArray(rawCards)
      ? rawCards.filter((card) => typeof card?.front === "string" && typeof card?.back === "string" && card.front.trim() && card.back.trim()).slice(0, 20)
      : [];
    if (!cards.length) throw requestError("Rangan could not create flashcards. Please try a more specific prompt.", 502);
    const content = cards.map((card, index) => `## Card ${index + 1}\n**Q:** ${card.front.trim()}\n\n**A:** ${card.back.trim()}`).join("\n\n");
    return { action: input.action, title: `Flashcards: ${input.prompt}`, content, flashcards: cards };
  }

  const instruction = input.action === "notes"
    ? `Create clear, structured revision notes in Markdown for this topic: ${input.prompt}. Include headings, key definitions, equations where relevant, and a short recap.`
    : input.action === "research"
      ? `Research this learning concept for a student: ${input.prompt}. Give a concise overview, explain important subtopics and common misconceptions, then suggest three useful follow-up questions. Use only the supplied Studenv context and your general knowledge; do not claim to browse or verify current sources.`
      : `Explain this topic clearly for a student preparing for an exam: ${input.prompt}. Start with an intuitive explanation, then give a worked example and a short recap.`;
  const content = (await chatWithDocument(context, instruction)).trim();
  if (!content) throw requestError("Rangan returned an empty response. Please try again.", 502);
  return {
    action: input.action,
    title: input.action === "notes" ? `Study notes: ${input.prompt}` : input.action === "research" ? `Research: ${input.prompt}` : `Explanation: ${input.prompt}`,
    content,
  };
}
