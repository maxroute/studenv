import type { NextRequest } from "next/server";
import { getRequestContext } from "@/lib/security/request";
import { validateId } from "@/lib/security/validate";
import * as boardService from "@/lib/services/board.service";
import { handleNoteRequest } from "../../handle";

type RouteContext = { params: { id: string } };

/** The note's own board (created on first use). */
export async function POST(request: NextRequest, { params }: RouteContext) {
  return handleNoteRequest(request, (user) => boardService.openNoteBoard(user.id, validateId(params.id), getRequestContext(request)));
}
