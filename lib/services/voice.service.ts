import { completeQuick } from "@/lib/ai/providers";
import { transcribe, type SpokenLanguage } from "@/lib/ai/transcribe";
import { AUDIO_EXTENSION, audioType, cleanTranscript, judgedLanguage, MAX_AUDIO_BYTES, MIN_AUDIO_BYTES, TRANSCRIPT_JUDGE, transcriptChoice } from "@/lib/rangan/voice";

// Voice typing for Rangan: a short recording in, its words out. The audio is
// only passed to the speech model and is not stored. It costs no question.

const badAudio = (message: string, status = 400) => Object.assign(new Error(message), { status });

export async function transcribeRecording(audio: Blob, language: SpokenLanguage = null): Promise<{ text: string }> {
  const type = audioType(audio.type);
  if (!type) throw badAudio("That recording type isn't supported. Please try again or type instead.", 415);
  if (audio.size > MAX_AUDIO_BYTES) throw badAudio("That recording is too long. Keep it under a minute.", 413);
  if (audio.size < MIN_AUDIO_BYTES) return { text: "" };
  const filename = `voice.${AUDIO_EXTENSION[type]}`;
  const first = await transcribe(audio, filename, language);
  if (language || (first.heard !== "hi" && first.heard !== "bn")) return { text: cleanTranscript(first.text) };
  return { text: cleanTranscript(await hindiOrBengali(audio, filename, first.heard, first.text)) };
}

/**
 * Auto heard Hindi or Bengali, which Whisper often mixes up: write the
 * recording the other way too and keep the version that is a real sentence.
 * Any failure keeps the first version.
 */
async function hindiOrBengali(audio: Blob, filename: string, heard: "hi" | "bn", text: string): Promise<string> {
  try {
    const other = await transcribe(audio, filename, heard === "hi" ? "bn" : "hi");
    if (!other.text.trim() || !text.trim()) return text || other.text;
    const [hindi, bengali] = heard === "hi" ? [text, other.text] : [other.text, text];
    const reply = await completeQuick(
      [
        { role: "system", content: TRANSCRIPT_JUDGE },
        { role: "user", content: transcriptChoice(hindi, bengali) },
      ],
      { maxTokens: 400, temperature: 0, timeoutMs: 6_000 },
    );
    const picked = judgedLanguage(reply.text);
    return picked === "hi" ? hindi : picked === "bn" ? bengali : text;
  } catch {
    return text;
  }
}
