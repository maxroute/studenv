import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { MAX_AUDIO_BYTES } from "@/lib/rangan/voice";
import { apiError, apiSuccess } from "@/lib/security/headers";
import { checkRateLimit, transcribeLimiter } from "@/lib/security/rateLimit";
import { getErrorResponse, getRateLimitIdentifier } from "@/lib/security/request";
import { transcribeRecording } from "@/lib/services/voice.service";

export const dynamic = "force-dynamic";

// ─── POST /api/rangan/transcribe — a voice recording's words ───────────────
// Multipart form: `audio`, and optionally `language` (en, bn or hi) when the
// student chose or typed in one. Answers { text }, "" when nothing was said.
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth();
    await checkRateLimit(transcribeLimiter, getRateLimitIdentifier(request, user.id));
    // Refused before reading the body: the form adds a little around the audio.
    const length = Number(request.headers.get("content-length") || 0);
    if (length > MAX_AUDIO_BYTES + 64 * 1024) throw Object.assign(new Error("That recording is too long. Keep it under a minute."), { status: 413 });
    if (!request.headers.get("content-type")?.toLowerCase().startsWith("multipart/form-data")) {
      throw Object.assign(new Error("Send the recording as a form."), { status: 415 });
    }
    const form = await request.formData().catch(() => null);
    const audio = form?.get("audio");
    if (!(audio instanceof Blob)) throw Object.assign(new Error("No recording was sent."), { status: 400 });
    const language = form?.get("language");
    return apiSuccess(await transcribeRecording(audio, language === "en" || language === "bn" || language === "hi" ? language : null));
  } catch (error) {
    const err = getErrorResponse(error);
    return apiError(err.message, err.status, err.details);
  }
}
