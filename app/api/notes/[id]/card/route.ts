import type { NextRequest } from "next/server";
import { validateId } from "@/lib/security/validate";
import * as boardService from "@/lib/services/board.service";
import { handleNoteRequest } from "../../handle";

type RouteContext = { params: { id: string } };

/** What the page's card on a board shows (first blocks, status, tags, resources). */
export async function GET(request: NextRequest, { params }: RouteContext) {
  return handleNoteRequest(request, (user) => boardService.pageCard(user.id, validateId(params.id)));
}
