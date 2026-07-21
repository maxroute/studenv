import { prisma } from "@/lib/db/prisma";
import { ExportJobType, ExportJobStatus } from "@prisma/client";

export async function createExportJob(payload: {
  workspaceId: string;
  sourceAssetId: string;
  sourceRevisionId: string;
  jobType: ExportJobType;
  inputJson: any;
  createdBy: string;
}) {
  return prisma.exportJob.create({
    data: {
      ...payload,
      inputJson: JSON.stringify(payload.inputJson),
      status: "queued" as ExportJobStatus,
    },
  });
}

export async function getExportJob(id: string) {
  return prisma.exportJob.findUnique({
    where: { id },
    include: {
       asset: true,
       workspace: true,
       sourceRevision: true,
       targetRevision: true,
    }
  });
}

export async function updateJobStatus(
  id: string, 
  status: ExportJobStatus, 
  result?: { outputJson?: any; errorMessage?: string; targetRevisionId?: string }
) {
  return prisma.exportJob.update({
    where: { id },
    data: {
      status,
      outputJson: result?.outputJson ? JSON.stringify(result.outputJson) : undefined,
      errorMessage: result?.errorMessage,
      targetRevisionId: result?.targetRevisionId,
    },
  });
}

export async function listRecentJobs(workspaceId: string) {
  return prisma.exportJob.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
}
