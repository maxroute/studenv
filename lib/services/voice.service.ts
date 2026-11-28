import { transcribe, type SpokenLanguage } from "@/lib/ai/transcribe";
import { AUDIO_EXTENSION, audioType, cleanTranscript, MAX_AUDIO_BYTES, MIN_AUDIO_BYTES } from "@/lib/rangan/voice";

// Voice typing for Rangan: a short recording in, its words out. The audio is
// only passed to the speech model and is not stored. It costs no question.

const badAudio = (message: string, status = 400) => Object.assign(new Error(message), { status });

export async function transcribeRecording(audio: Blob, language: SpokenLanguage = null): Promise<{ text: string }> {
  const type = audioType(audio.type);
  if (!type) throw badAudio("That recording type isn't supported. Please try again or type instead.", 415);
  if (audio.size > MAX_AUDIO_BYTES) throw badAudio("That recording is too long. Keep it under a minute.", 413);
  if (audio.size < MIN_AUDIO_BYTES) return { text: "" };
  const { text } = await transcribe(audio, `voice.${AUDIO_EXTENSION[type]}`, language);
  return { text: cleanTranscript(text) };
}
