import { prisma } from "@/lib/db/prisma";

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
  await ensureCourseNodeOwnership(userId, data.courseNodeId);
  return prisma.$transaction(async (tx) => {
    const maxOrder = await tx.task.aggregate({ where: { userId }, _max: { order: true } });
    return tx.task.create({
      data: { ...data, userId, order: (maxOrder._max.order ?? -1) + 1 },
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

  if (data.courseNodeId !== undefined) {
    await ensureCourseNodeOwnership(userId, data.courseNodeId);
  }

  const updatedStatus = data.status;
  const isCompleting = updatedStatus === "completed" && existingTask.status !== "completed";

  const updatePayload = {
    ...data,
  };

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
          courseNodeId: updatedTask.courseNodeId,
          order: nextOrder,
        },
      });
    } catch (err) {
      console.error("Failed to generate recurring task occurrence:", err);
    }
  }

  return updatedTask;
}

async function ensureCourseNodeOwnership(userId: string, courseNodeId?: string | null) {
  if (!courseNodeId) return;
  const node = await prisma.courseNode.findFirst({
    where: { id: courseNodeId, course: { userId } },
    select: { id: true },
  });
  if (!node) {
    const error = new Error("Learning node not found.");
    Object.assign(error, { status: 404 });
    throw error;
  }
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
