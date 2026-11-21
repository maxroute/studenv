"use client";

import { audioType, createSpeechEndDetector, MAX_RECORDING_MS } from "@/lib/rangan/voice";

// The browser side of talking with Rangan: the microphone, a recording that
// ends when the speaker stops, the words in it, and reading replies aloud.

export type VoiceError = "unsupported" | "blocked" | "no-mic" | "failed";

export class VoiceProblem extends Error {
  constructor(public kind: VoiceError) {
    super(kind);
    this.name = "VoiceProblem";
  }
}

export function voiceMessage(kind: VoiceError): string {
  switch (kind) {
    case "unsupported":
      return "Voice isn't supported in this browser. Please type instead.";
    case "blocked":
      return "Microphone access is blocked. Allow it for this site in your browser settings, then try again.";
    case "no-mic":
      return "No microphone was found.";
    default:
      return "Voice didn't work this time. Please try again or type instead.";
  }
}

let sharedContext: AudioContext | null = null;

/**
 * Phones only start audio from a tap. Called from the tap that starts voice
 * typing or voice mode: it readies the one audio context every recording
 * measures loudness with, and lets later replies be read aloud.
 */
export function unlockAudio() {
  try {
    const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AudioCtx && (!sharedContext || sharedContext.state === "closed")) sharedContext = new AudioCtx();
    void sharedContext?.resume().catch(() => undefined);
  } catch {
    sharedContext = null;
  }
  if (canSpeak()) {
    const silent = new SpeechSynthesisUtterance(" ");
    silent.volume = 0;
    window.speechSynthesis.speak(silent);
  }
}

export function canRecord(): boolean {
  return typeof window !== "undefined" && typeof MediaRecorder !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia);
}

export function canSpeak(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined";
}

/** The first recording type this browser can make that the server takes. */
function recordingType(): string | undefined {
  const preferred = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  return preferred.find((type) => MediaRecorder.isTypeSupported?.(type));
}

/** An open microphone, kept between turns in voice mode so the browser asks only once. */
export async function openMicrophone(): Promise<MediaStream> {
  if (!canRecord()) throw new VoiceProblem("unsupported");
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  } catch (error) {
    const name = error instanceof DOMException ? error.name : "";
    if (name === "NotAllowedError" || name === "SecurityError") throw new VoiceProblem("blocked");
    if (name === "NotFoundError" || name === "OverconstrainedError") throw new VoiceProblem("no-mic");
    throw new VoiceProblem("failed");
  }
}

export function closeMicrophone(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

export type Recording = {
  /** The recording so far, once stopped; null when nobody spoke (or it was cancelled). */
  done: Promise<Blob | null>;
  /** Ends the recording now and keeps it. */
  stop: () => void;
  /** Ends the recording and throws it away. */
  cancel: () => void;
};

/**
 * Records from an open microphone. With `untilPause`, it ends on its own a
 * moment after the speaker stops (or gives up if nobody speaks); otherwise it
 * runs until `stop`. `onLevel` gets the loudness, 0 to about 1, for the screen.
 */
export function record(stream: MediaStream, options: { untilPause: boolean; onLevel?: (level: number) => void }): Recording {
  const type = recordingType();
  const recorder = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
  const chunks: Blob[] = [];
  let keep = true;
  let heard = !options.untilPause;
  let frame = 0;
  let source: MediaStreamAudioSourceNode | null = null;

  const finish = () => {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    source?.disconnect();
    source = null;
    if (recorder.state !== "inactive") recorder.stop();
  };

  // Loudness from the microphone, for end-of-speech and for the level on screen.
  try {
    const context = sharedContext;
    if (context && context.state !== "closed") {
      void context.resume().catch(() => undefined);
      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      source = context.createMediaStreamSource(stream);
      source.connect(analyser);
      const samples = new Float32Array(analyser.fftSize);
      const detector = createSpeechEndDetector();
      const tick = () => {
        analyser.getFloatTimeDomainData(samples);
        let sum = 0;
        for (const value of samples) sum += value * value;
        const level = Math.sqrt(sum / samples.length);
        options.onLevel?.(Math.min(1, level * 8));
        if (options.untilPause) {
          const state = detector.sample(level, performance.now());
          if (state !== "listening") {
            heard = state === "done";
            finish();
            return;
          }
        }
        frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    }
  } catch {
    source = null;
  }
  // Without loudness (an old browser), a pause can't be heard: the longest recording still ends.
  const limit = window.setTimeout(() => {
    heard = true;
    finish();
  }, MAX_RECORDING_MS);

  const done = new Promise<Blob | null>((resolve) => {
    recorder.ondataavailable = (event) => {
      if (event.data.size) chunks.push(event.data);
    };
    recorder.onstop = () => {
      window.clearTimeout(limit);
      options.onLevel?.(0);
      resolve(keep && heard && chunks.length ? new Blob(chunks, { type: recorder.mimeType || type || "audio/webm" }) : null);
    };
    recorder.onerror = () => {
      keep = false;
      finish();
    };
  });
  recorder.start(250);

  return {
    done,
    stop: () => {
      heard = true;
      finish();
    },
    cancel: () => {
      keep = false;
      finish();
    },
  };
}

/** The words in a recording; "" when nothing was said. */
export async function transcribeAudio(audio: Blob): Promise<string> {
  const type = audioType(audio.type) ?? "audio/webm";
  const form = new FormData();
  form.append("audio", new Blob([audio], { type }), `voice.${type.split("/")[1]}`);
  const response = await fetch("/api/rangan/transcribe", { method: "POST", body: form });
  const json = (await response.json().catch(() => null)) as { ok?: boolean; data?: { text?: unknown }; error?: unknown } | null;
  if (!response.ok || !json?.ok) {
    const message = response.status === 429 && typeof json?.error === "string" ? json.error : voiceMessage("failed");
    throw Object.assign(new Error(message), { status: response.status });
  }
  return typeof json.data?.text === "string" ? json.data.text : "";
}

let currentUtterance: SpeechSynthesisUtterance | null = null;

/** Reads text aloud in the device's voice for the page's language; resolves when it ends or is stopped. */
export function speak(text: string): Promise<void> {
  if (!canSpeak() || !text.trim()) return Promise.resolve();
  stopSpeaking();
  return new Promise((resolve) => {
    const utterance = new SpeechSynthesisUtterance(text);
    const language = document.documentElement.lang || navigator.language || "en-US";
    utterance.lang = language;
    const voice = window.speechSynthesis.getVoices().find((option) => option.lang.toLowerCase().startsWith(language.slice(0, 2).toLowerCase()) && option.localService);
    if (voice) utterance.voice = voice;
    utterance.rate = 1.05;
    // Some browsers never say a long or interrupted utterance ended: a generous
    // estimate of its length ends the wait anyway, so voice mode never hangs.
    const fallback = window.setTimeout(() => end(), 4_000 + text.length * 90);
    const end = () => {
      window.clearTimeout(fallback);
      if (currentUtterance === utterance) currentUtterance = null;
      resolve();
    };
    utterance.onend = end;
    utterance.onerror = end;
    currentUtterance = utterance;
    window.speechSynthesis.speak(utterance);
  });
}

export function stopSpeaking() {
  if (!canSpeak()) return;
  currentUtterance = null;
  window.speechSynthesis.cancel();
}
