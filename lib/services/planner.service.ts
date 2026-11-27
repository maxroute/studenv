import { prisma } from "@/lib/db/prisma";
import type { CreateTaskInput, RescheduleInput } from "@/lib/models/planner.model";
import { nextMissedDays, studentToday } from "@/lib/planner/missed-days";
import { ValidationHttpError } from "@/lib/security/validate";

function requireToday(sent: string | undefined): Date {
  const today = studentToday(sent, new Date());
  if (!today) throw new ValidationHttpError("Check your device's date and try again.", 400);
  return today;
}

function calculateNextDueDate(currentDate: Date, repeat: string): Date {
  const next = new Date(currentDate);
  switch (repeat) {
    case "daily":
      next.setDate(next.getDate() + 1);
      break;
    case "weekdays":
      // Add days until we hit a weekday (Mon-Fri)
      do {
        next.setDate(next.getDate() + 1);
      } while (next.getDay() === 0 || next.getDay() === 6); // 0 is Sunday, 6 is Saturday
      break;
    case "weekly":
      next.setDate(next.getDate() + 7);
      break;
    case "monthly":
      next.setMonth(next.getMonth() + 1);
      break;
    case "custom":
    default:
      // Custom defaults to +7 days (weekly)
      next.setDate(next.getDate() + 7);
      break;
  }
  return next;
}

export async function listTasks(userId: string) {
  return await prisma.task.findMany({
    where: { userId },
    orderBy: [
      { order: "asc" },
      { createdAt: "desc" },
    ],
  });
}

export async function createTask(userId: string, data: any) {
  return prisma.$transaction(async (tx) => {
    const maxOrder = await tx.task.aggregate({ where: { userId }, _max: { order: true } });
    return tx.task.create({
      data: { ...data, userId, order: (maxOrder._max.order ?? -1) + 1 },
    });
  });
}

/** Adds tasks in the given order after the user's existing ones, all or none. */
export async function createTasks(userId: string, tasks: CreateTaskInput[]) {
  return prisma.$transaction(async (tx) => {
    const maxOrder = await tx.task.aggregate({ where: { userId }, _max: { order: true } });
    const first = (maxOrder._max.order ?? -1) + 1;
    return tx.task.createManyAndReturn({
      data: tasks.map((task, index) => ({ ...task, userId, order: first + index })),
    });
  });
}

export async function updateTask(userId: string, taskId: string, data: any) {
  const existingTask = await prisma.task.findUnique({
    where: { id: taskId },
  });

  if (!existingTask || existingTask.userId !== userId) {
    throw new Error("Task not found or unauthorized");
  }

  const updatedStatus = data.status;
  const isCompleting = updatedStatus === "completed" && existingTask.status !== "completed";

  // `today` only tells which days have passed for this student; it is not a task field.
  const { today: sentToday, ...updatePayload } = data;
  if (updatePayload.dueDate !== undefined) {
    updatePayload.missedDueDates = nextMissedDays({
      missed: existingTask.missedDueDates,
      status: existingTask.status,
      nextStatus: updatedStatus,
      from: existingTask.dueDate,
      to: updatePayload.dueDate,
      today: requireToday(sentToday),
    });
  }

  if (isCompleting) {
    updatePayload.completedAt = new Date();
  } else if (updatedStatus && updatedStatus !== "completed") {
    updatePayload.completedAt = null;
  }

  const updatedTask = await prisma.task.update({
    where: { id: taskId },
    data: updatePayload,
  });

  // Recurring task generation logic
  if (isCompleting && updatedTask.repeat !== "none") {
    try {
      const nextDueDate = calculateNextDueDate(updatedTask.dueDate || new Date(), updatedTask.repeat);

      const maxOrderTask = await prisma.task.findFirst({
        where: { userId: userId },
        orderBy: { order: "desc" },
        select: { order: true },
      });
      const nextOrder = maxOrderTask ? maxOrderTask.order + 1 : 0;

      await prisma.task.create({
        data: {
          userId: userId,
          title: updatedTask.title,
          description: updatedTask.description,
          priority: updatedTask.priority,
          status: "pending",
          category: updatedTask.category,
          dueDate: nextDueDate,
          dueTime: updatedTask.dueTime,
          estimatedDuration: updatedTask.estimatedDuration,
          trackedDuration: 0,
          notificationEnabled: updatedTask.notificationEnabled,
          repeat: updatedTask.repeat,
          color: updatedTask.color,
          icon: updatedTask.icon,
          notes: updatedTask.notes,
          order: nextOrder,
        },
      });
    } catch (err) {
      console.error("Failed to generate recurring task occurrence:", err);
    }
  }

  return updatedTask;
}

export async function deleteTask(userId: string, taskId: string) {
  const existingTask = await prisma.task.findUnique({
    where: { id: taskId },
  });

  if (!existingTask || existingTask.userId !== userId) {
    throw new Error("Task not found or unauthorized");
  }

  return await prisma.task.delete({
    where: { id: taskId },
  });
}

export async function reorderTasks(userId: string, taskIds: string[]) {
  if (new Set(taskIds).size !== taskIds.length) throw new Error("Task order contains duplicate ids");
  const ownedTaskCount = await prisma.task.count({ where: { userId, id: { in: taskIds } } });
  if (ownedTaskCount !== taskIds.length) throw new Error("One or more tasks were not found or unauthorized");

  const updates = taskIds.map((id, index) => {
    return prisma.task.updateMany({
      where: { id, userId },
      data: { order: index },
    });
  });
  await prisma.$transaction(updates);
  return { success: true };
}

/** Gives several of the user's tasks new dates, all or none, remembering the days they were missed on. */
export async function rescheduleTasks(userId: string, changes: RescheduleInput["changes"], sentToday?: string) {
  const ids = changes.map((change) => change.id);
  if (new Set(ids).size !== ids.length) throw new Error("A task is listed twice");
  const today = requireToday(sentToday);
  const owned = await prisma.task.findMany({
    where: { userId, id: { in: ids } },
    select: { id: true, status: true, dueDate: true, missedDueDates: true },
  });
  if (owned.length !== ids.length) throw new Error("One or more tasks were not found or unauthorized");
  const before = new Map(owned.map((task) => [task.id, task]));

  await prisma.$transaction(
    changes.map((change) => {
      const task = before.get(change.id)!;
      const dueDate = change.dueDate ? new Date(change.dueDate) : null;
      const missedDueDates = nextMissedDays({ missed: task.missedDueDates, status: task.status, from: task.dueDate, to: dueDate, today });
      return prisma.task.updateMany({
        where: { id: change.id, userId },
        data: { dueDate, dueTime: change.dueTime, missedDueDates },
      });
    }),
  );
  return { updated: ids.length };
}

/** The user's completed focus sessions that started in `[from, to)`, for the study calendar. */
export async function listFocusHistory(userId: string, from: Date, to: Date) {
  return prisma.focusSession.findMany({
    where: { userId, type: "focus", status: "completed", startedAt: { gte: from, lt: to } },
    select: { startedAt: true, durationMs: true },
    orderBy: { startedAt: "asc" },
    take: 5000,
  });
}
