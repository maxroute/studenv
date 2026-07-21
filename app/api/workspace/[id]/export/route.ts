import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import * as exportService from "@/lib/services/export.service";
import { ExportJobType } from "@prisma/client";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireAuth();
    const { 
      sourceAssetId, 
      sourceRevisionId, 
      annotations,
      jobType = "pdf_save_back"
    } = await req.json();

    if (!sourceAssetId || !sourceRevisionId) {
      return NextResponse.json({ error: "Missing source media info" }, { status: 400 });
    }

    const job = await exportService.createExportJob({
      workspaceId: params.id,
      sourceAssetId,
      sourceRevisionId,
      jobType: jobType as ExportJobType,
      inputJson: { annotations },
      createdBy: user.id,
    });

    // In a real production app, this would be picked up by a separate worker process.
    // For this implementation, we've implemented the worker logic in lib/workers/export.worker.ts
    // but we won't auto-trigger it here to keep the API response fast.

    return NextResponse.json({ jobId: job.id, status: job.status });
  } catch (error: any) {
    console.error("Export API error", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
