import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import * as workspaceService from "@/lib/services/workspace.service";
import { parseWorkspaceSceneJson, serializeWorkspaceScene } from "@/types/workspace";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireAuth();
    const { sceneJson, cameraJson } = await req.json();
    const normalizedSceneJson = serializeWorkspaceScene(
      parseWorkspaceSceneJson(sceneJson),
    );

    const snapshot = await workspaceService.saveSnapshot({
      workspaceId: params.id,
      sceneJson: normalizedSceneJson,
      cameraJson,
      createdBy: user.id,
    });

    return NextResponse.json({
      id: snapshot.id,
      version: snapshot.version,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to save snapshot" },
      { status: error.status || 500 }
    );
  }
}
