// ---------------------------------------------------------------------------
// Talking with Rangan: what is read aloud, how a reply is heard, and when the
// speaker has finished
// ---------------------------------------------------------------------------
//
// Pure: no browser, React or network.

/** Recordings longer than this stop on their own. */
export const MAX_RECORDING_MS = 60_000;
/** Silence after speech that ends a turn in voice mode. */
export const END_OF_SPEECH_MS = 1_300;
/** With no speech at all for this long, listening gives up. */
export const NO_SPEECH_MS = 8_000;
/** Audio uploads larger than this are refused (60 s of compressed speech is far smaller). */
export const MAX_AUDIO_BYTES = 3 * 1024 * 1024;
/** Smaller than this is a click, not speech. */
export const MIN_AUDIO_BYTES = 1_000;

/** Recording types the browsers make: Chrome and Firefox WebM or Ogg, Safari MP4. */
export const AUDIO_TYPES = ["audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/wav", "audio/x-m4a", "audio/aac"] as const;

/** The base type of a recording ("audio/webm;codecs=opus" is "audio/webm"), or null if it isn't one we take. */
export function audioType(type: string): (typeof AUDIO_TYPES)[number] | null {
  const base = type.split(";")[0].trim().toLowerCase();
  return AUDIO_TYPES.find((allowed) => allowed === base) ?? null;
}

export const AUDIO_EXTENSION: Record<(typeof AUDIO_TYPES)[number], string> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "mp4",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/x-m4a": "m4a",
  "audio/aac": "aac",
};

/**
 * Phrases speech models write for silence or noise. A transcript that is only
 * one of these means nothing was said.
 */
const SILENCE_PHRASES = new Set([
  "thank you",
  "thank you.",
  "thanks for watching",
  "thanks for watching!",
  "thank you for watching",
  "you",
  "bye",
  "bye.",
  ".",
  "...",
  "[music]",
  "(music)",
  "[silence]",
  "[blank_audio]",
  "subtitles by the amara.org community",
]);

/** The transcript tidied for the input box, or "" when nothing was said. */
export function cleanTranscript(text: string): string {
  const line = text.replace(/\s+/g, " ").trim();
  if (!line || SILENCE_PHRASES.has(line.toLowerCase())) return "";
  return line.slice(0, 2_000);
}

export type VoiceReply = "yes" | "no" | "stop" | null;

const YES = /^(yes|yeah|yep|yup|sure|ok|okay|alright|please|do it|go ahead|add it|create it|make it|save it|sounds good|haan|ha|han|haa|ji|theek hai|thik hai|hya|hyan)\b/;
const NO = /^(no|nope|nah|not now|don'?t|cancel|skip|leave it|nahi|na|nehi)\b/;
const STOP = /^(stop|stop listening|exit|exit voice|end voice|that'?s all|bas|ruko|thamo)\b/;

/**
 * A short spoken reply to "Should I add it?": yes, no, or stop talking. Anything
 * longer, or anything else, is a new request (null).
 */
export function voiceReply(transcript: string): VoiceReply {
  const text = transcript
    .toLowerCase()
    .replace(/[.,!?।]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text || text.split(" ").length > 4) return null;
  if (STOP.test(text)) return "stop";
  if (NO.test(text)) return "no";
  if (YES.test(text)) return "yes";
  return null;
}

/** Markdown and citation marks taken out, for reading aloud; long answers are cut at a sentence. */
export function speakable(markdown: string, max = 600): string {
  const text = markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/^\s*\|.*\|\s*$/gm, " ")
    .replace(/\s*\[(\d{1,2})\]/g, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/[*_`>~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("? "), cut.lastIndexOf("! "));
  return `${(end > max / 3 ? cut.slice(0, end + 1) : cut).trim()} The rest is on screen.`;
}

/** "today by 11:59 pm", "on Sunday 22 November", in the reader's own words for a task's day and time. */
export function spokenDue(day: string, time: string | null, today: string, locale?: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  const tomorrow = new Date(`${today}T00:00:00Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const when =
    day === today
      ? "today"
      : day === tomorrow.toISOString().slice(0, 10)
        ? "tomorrow"
        : `on ${date.toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })}`;
  if (!time) return when;
  const [hours, minutes] = time.split(":").map(Number);
  const clock = new Date(Date.UTC(2000, 0, 1, hours, minutes)).toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit", timeZone: "UTC" });
  return `${when} by ${clock}`;
}

/**
 * Tells when a speaker has finished, from the loudness of the microphone
 * sampled over time: speech, then a pause long enough, ends the turn.
 */
export function createSpeechEndDetector(options: { threshold?: number; endAfterMs?: number; noSpeechMs?: number; maxMs?: number } = {}) {
  const threshold = options.threshold ?? 0.02;
  const endAfterMs = options.endAfterMs ?? END_OF_SPEECH_MS;
  const noSpeechMs = options.noSpeechMs ?? NO_SPEECH_MS;
  const maxMs = options.maxMs ?? MAX_RECORDING_MS;
  let startedAt: number | null = null;
  let heardSpeech = false;
  let lastSpeechAt = 0;
  return {
    /** "listening" to keep going, "done" when the turn ended, "nothing" when nobody spoke. */
    sample(level: number, now: number): "listening" | "done" | "nothing" {
      startedAt ??= now;
      if (level >= threshold) {
        heardSpeech = true;
        lastSpeechAt = now;
      }
      if (now - startedAt >= maxMs) return heardSpeech ? "done" : "nothing";
      if (!heardSpeech) return now - startedAt >= noSpeechMs ? "nothing" : "listening";
      return now - lastSpeechAt >= endAfterMs ? "done" : "listening";
    },
  };
}
