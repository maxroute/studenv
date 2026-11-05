import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { getWorkspaceNodeText, parseWorkspaceSceneJson } from "@/types/workspace";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get("q");

  if (!query) {
    return NextResponse.json({ results: [] });
  }

  try {
    const user = await requireAuth();
    const workspace = await prisma.workspace.findUnique({
      where: { id: params.id },
      select: {
        ownerId: true,
      },
    });

    if (!workspace || workspace.ownerId !== user.id) {
      return NextResponse.json({ results: [] });
    }

    const lastSnapshot = await prisma.workspaceSnapshot.findFirst({
      where: { workspaceId: params.id },
      orderBy: { version: "desc" },
      select: { sceneJson: true },
    });

    if (!lastSnapshot) {
      return NextResponse.json({ results: [] });
    }

    const scene = parseWorkspaceSceneJson(lastSnapshot.sceneJson);

    const results = [];

    for (const item of scene.items) {
      const textContent = getWorkspaceNodeText(item);
      if (textContent && textContent.toLowerCase().includes(query.toLowerCase())) {
        results.push({
          itemId: item.id,
          type: item.type,
          preview: textContent.slice(0, 100),
        });
        continue;
      }

      if (item.type === "pdf-fragment" || item.type === "pdf-page") {
        if (!item.props.revisionId) {
          continue;
        }

        const manifest = await prisma.assetPageManifest.findFirst({
          where: {
            assetRevisionId: item.props.revisionId,
            pageNumber: item.props.pageNumber,
            searchText: {
              contains: query,
              mode: "insensitive",
            },
          },
        });

        if (manifest) {
          results.push({
            itemId: item.id,
            type: item.type,
            preview: manifest.searchText?.substring(0, 100),
          });
        }
      }
    }

    return NextResponse.json({ results });
  } catch (error: any) {
    console.error("Search API error", error);
    return NextResponse.json({ error: "Workspace search is temporarily unavailable. Please try again." }, { status: 500 });
  }
}
