import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { openItemInWorkspace } from "@/lib/services/item-asset.service";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const itemId = searchParams.get("itemId");

  if (!itemId) {
    return NextResponse.json({ error: "Missing itemId" }, { status: 400 });
  }

  try {
    const user = await requireAuth();

    console.log(`[Workspace API] Creating workspace for itemId: ${itemId}`);
    console.log(`[Workspace API] Running for user: ${user.id}`);

    // 1. Ensure Asset exists and Workspace is ready
    const result = await openItemInWorkspace(itemId, user.id);
    console.log(`[Workspace API] result: `, result);
    
    // 2. Redirect to the workspace
    const redirectUrl = new URL(`/workspace/${result.workspaceId}`, req.url);
    console.log(`[Workspace API] Redirecting to: ${redirectUrl.toString()}`);
    return NextResponse.redirect(redirectUrl);
  } catch (e: any) {
    console.error("[Workspace API] Workspace creation failed:", e);
    return NextResponse.json({ 
      error: "Failed to open workspace", 
      details: e.message || String(e),
      stack: e.stack
    }, { status: 500 });
  }
}
