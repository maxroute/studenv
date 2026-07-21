import { prisma } from "@/lib/db/prisma";
import { JobType, JobStatus } from "@prisma/client";

export async function queueJob(type: JobType, payload: any) {
  return prisma.backgroundJob.create({
    data: {
      type,
      payloadJson: JSON.stringify(payload),
      status: "queued",
    },
  });
}

export async function getNextJob() {
  return prisma.backgroundJob.findFirst({
    where: { status: "queued" },
    orderBy: { createdAt: "asc" },
  });
}

export async function startJob(id: string) {
  return prisma.backgroundJob.update({
    where: { id },
    data: {
      status: "processing",
      startedAt: new Date(),
    },
  });
}

export async function completeJob(id: string, result: any) {
  return prisma.backgroundJob.update({
    where: { id },
    data: {
      status: "done",
      resultJson: JSON.stringify(result),
      finishedAt: new Date(),
    },
  });
}

export async function failJob(id: string, error: string) {
  const job = await prisma.backgroundJob.findUnique({ where: { id } });
  if (!job) return null;

  const canRetry = job.retryCount < job.maxRetries;

  return prisma.backgroundJob.update({
    where: { id },
    data: {
      status: canRetry ? "queued" : "failed",
      errorMessage: error,
      retryCount: { increment: 1 },
      finishedAt: canRetry ? null : new Date(),
    },
  });
}

export async function getJobStatus(id: string) {
  return prisma.backgroundJob.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      resultJson: true,
      errorMessage: true,
    },
  });
}
