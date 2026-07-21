import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth.config";
import * as itemAssetService from "@/lib/services/item-asset.service";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { workspaceId, assetId } = await itemAssetService.openItemInWorkspace(
      params.id,
      session.user.id
    );

    return NextResponse.json({ workspaceId, assetId });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to open item in workspace" },
      { status: 500 }
    );
  }
}
