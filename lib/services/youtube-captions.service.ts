// Reading YouTube captions on the server. Kept apart from ai-ingest.service,
// whose pdf-parse import cannot be bundled into every route.

import {
  YoutubeTranscript,
  YoutubeTranscriptDisabledError,
  YoutubeTranscriptNotAvailableError,
  YoutubeTranscriptNotAvailableLanguageError,
  YoutubeTranscriptTooManyRequestError,
  YoutubeTranscriptVideoUnavailableError,
} from 'youtube-transcript';
import { transcriptTextFromSegments, type CaptionResult } from '@/lib/utils/video-transcript';

/** Time allowed for each request to YouTube. */
const CAPTION_REQUEST_TIMEOUT_MS = 8_000;
/** Caption language tried first; otherwise the video's first caption track. */
const PREFERRED_CAPTION_LANGUAGE = 'en';

const fetchWithTimeout: typeof fetch = (input, init) =>
  fetch(input, { ...init, signal: AbortSignal.timeout(CAPTION_REQUEST_TIMEOUT_MS) });

/**
 * Reads a YouTube video's captions as transcript text: English captions when
 * the video has them, otherwise its first caption track (usually the spoken
 * language). Never throws; a failure says whether retrying can help.
 */
export async function fetchYouTubeCaptionText(videoId: string): Promise<CaptionResult> {
  try {
    let segments;
    try {
      segments = await YoutubeTranscript.fetchTranscript(videoId, { lang: PREFERRED_CAPTION_LANGUAGE, fetch: fetchWithTimeout });
    } catch (error) {
      if (!(error instanceof YoutubeTranscriptNotAvailableLanguageError)) throw error;
      segments = await YoutubeTranscript.fetchTranscript(videoId, { fetch: fetchWithTimeout });
    }
    const text = transcriptTextFromSegments(segments);
    return text ? { ok: true, text } : { ok: false, reason: 'no_captions' };
  } catch (error) {
    if (
      error instanceof YoutubeTranscriptDisabledError ||
      error instanceof YoutubeTranscriptNotAvailableError ||
      error instanceof YoutubeTranscriptVideoUnavailableError
    ) {
      return { ok: false, reason: 'no_captions' };
    }
    if (error instanceof YoutubeTranscriptTooManyRequestError) return { ok: false, reason: 'blocked' };
    return { ok: false, reason: 'error' };
  }
}
