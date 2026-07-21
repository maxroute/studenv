import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import * as workspaceService from "@/lib/services/workspace.service";
import {
  createWorkspaceScene,
  parseWorkspaceSceneJson,
  serializeWorkspaceScene,
} from "@/types/workspace";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireAuth();
    const workspace = await workspaceService.getWorkspace(user.id, params.id);
    
    // Get the latest snapshot
    const latestSnapshot = workspace.snapshots[0];

    let normalizedSceneJson: string | null = null;

    if (latestSnapshot?.sceneJson) {
      try {
        normalizedSceneJson = serializeWorkspaceScene(
          parseWorkspaceSceneJson(latestSnapshot.sceneJson),
        );
      } catch (error) {
        console.warn(
          `Workspace ${workspace.id} snapshot normalization failed. Falling back to an empty scene.`,
          error,
        );
        normalizedSceneJson = serializeWorkspaceScene(createWorkspaceScene());
      }
    }

    return NextResponse.json({
      id: workspace.id,
      title: workspace.title,
      description: workspace.description,
      coverAssetId: workspace.coverAssetId ?? null,
      latestVersion: latestSnapshot?.version || workspace.latestVersion,
      sceneJson: normalizedSceneJson,
      cameraJson: latestSnapshot?.cameraJson || null,
      version: latestSnapshot?.version || 0,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to load workspace" },
      { status: error.status || 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireAuth();
    const body = await req.json();
    if (typeof body.title !== "string" || !body.title.trim()) {
      return NextResponse.json({ error: "Invalid title" }, { status: 400 });
    }

    const workspace = await workspaceService.renameWorkspace(
      user.id,
      params.id,
      body.title.trim(),
      {
        ip: req.headers.get("x-forwarded-for") || req.ip,
        userAgent: req.headers.get("user-agent"),
      }
    );

    return NextResponse.json({ success: true, workspace });
  } catch (error: any) {
    console.warn("Workspace API rename warning:", error);
    return NextResponse.json(
      { error: error.message || "Failed to edit workspace" },
      { status: error.status || 500 }
    );
  }
}
