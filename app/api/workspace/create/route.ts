import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { apiError } from "@/lib/security/headers";
import { getErrorResponse } from "@/lib/security/request";
import { validateId } from "@/lib/security/validate";
import { openItemInWorkspace } from "@/lib/services/item-asset.service";

/**
 * Opens (creating if needed) the workspace for a Shelf item and redirects to it.
 * The Location is relative: under the custom server `req.url` carries the bind
 * address (0.0.0.0), which a browser cannot open.
 */
export async function GET(req: NextRequest) {
  try {
    const itemId = req.nextUrl.searchParams.get("itemId");
    if (!itemId) {
      return apiError("Missing itemId", 400);
    }
    const user = await requireAuth();
    const result = await openItemInWorkspace(validateId(itemId), user.id);
    return new NextResponse(null, {
      status: 307,
      headers: { Location: `/workspaces/${encodeURIComponent(result.workspaceId)}` },
    });
  } catch (error) {
    const err = getErrorResponse(error);
    return apiError(err.message, err.status, err.details);
  }
}
