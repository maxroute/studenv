import type { NextRequest } from "next/server";
import { getRequestContext } from "@/lib/security/request";
import { validateId } from "@/lib/security/validate";
import * as boardService from "@/lib/services/board.service";
import { handleNoteRequest } from "../../handle";

type RouteContext = { params: { id: string } };

/**
 * The note's own board (created on first use). `workspaceId` and `created` as
 * before, plus the board's scene and the note's card so opening it needs no
 * further requests.
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  return handleNoteRequest(request, (user) => boardService.openNoteBoardWithContent(user.id, validateId(params.id), getRequestContext(request)));
}
