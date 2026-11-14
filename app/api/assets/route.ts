import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/auth/session";
import { apiError, apiSuccess } from "@/lib/security/headers";
import { getErrorResponse } from "@/lib/security/request";

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();
    
    const assets = await prisma.mediaAsset.findMany({
      where: {
        ownerId: user.id,
        // Notes are pages, not files. Older builds wrapped a note's Shelf entry
        // in a "web page" asset when it was opened in a workspace; hide those.
        NOT: { item: { is: { type: "note" } } },
      },
      orderBy: {
        updatedAt: "desc",
      },
    });

    return apiSuccess(assets);
  } catch (error) {
    const err = getErrorResponse(error);
    return apiError(err.message, err.status, err.details);
  }
}
