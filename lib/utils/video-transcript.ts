// ---------------------------------------------------------------------------
// Turning YouTube caption segments into a stored transcript
// ---------------------------------------------------------------------------
//
// Pure: no network or database. The server fetches caption segments and keeps
// the text here, so Rangan can search, cite and summarize the video.

/** Characters kept per transcript (a few hours of speech); the rest is dropped. */
export const TRANSCRIPT_MAX_CHARS = 300_000;
/** A paragraph break is added after this many characters, at a segment boundary, so long speech splits into passages. */
export const TRANSCRIPT_PARAGRAPH_CHARS = 900;

/**
 * Shorter saved "transcripts" are not real ones: older AI summary and
 * flashcard requests stored whatever text they were given (sometimes only the
 * title), and any video's captions are longer than this.
 */
export const TRANSCRIPT_MIN_CHARS = 100;

/** True when `transcript` looks like a video's real transcript. */
export const hasUsableTranscript = (transcript: string | null | undefined) =>
  (transcript?.trim().length ?? 0) >= TRANSCRIPT_MIN_CHARS;

/** Sound cues such as "[Music]" or "(applause)", which carry no meaning for study. */
const SOUND_CUE = /^[[(][^\])]{1,30}[\])]$/;

/**
 * Joins caption segments into transcript text: line breaks and repeated
 * spaces inside a segment collapsed, sound cues dropped, a paragraph break
 * about every {@link TRANSCRIPT_PARAGRAPH_CHARS} characters, and cut at
 * {@link TRANSCRIPT_MAX_CHARS}.
 */
export function transcriptTextFromSegments(segments: ReadonlyArray<{ text: string }>): string {
  const paragraphs: string[] = [];
  let current = "";
  for (const segment of segments) {
    const text = segment.text.replace(/\u0000/g, "").replace(/\s+/g, " ").trim();
    if (!text || SOUND_CUE.test(text)) continue;
    current = current ? `${current} ${text}` : text;
    if (current.length >= TRANSCRIPT_PARAGRAPH_CHARS) {
      paragraphs.push(current);
      current = "";
    }
  }
  if (current) paragraphs.push(current);
  const joined = paragraphs.join("\n\n");
  return joined.length > TRANSCRIPT_MAX_CHARS ? joined.slice(0, TRANSCRIPT_MAX_CHARS) : joined;
}

/** Why a video's captions could not be read. */
export type CaptionFailure =
  /** The video has no captions, has them turned off, or is private or removed: trying again will not help. */
  | "no_captions"
  /** YouTube refused the request (rate limit or block): it may work later. */
  | "blocked"
  /** Network error, timeout or a response we could not read: it may work later. */
  | "error";

export type CaptionResult = { ok: true; text: string } | { ok: false; reason: CaptionFailure };
