import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import * as workspaceService from "@/lib/services/workspace.service";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireAuth();
    const workspace = await workspaceService.getWorkspace(user.id, params.id);
    return NextResponse.json(workspaceService.workspaceLoadPayload(workspace));
  } catch (error: any) {
    return NextResponse.json(
      { error: "Workspace could not be loaded. Please try again shortly." },
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
      { error: "Workspace could not be updated. Please try again shortly." },
      { status: error.status || 500 }
    );
  }
}
