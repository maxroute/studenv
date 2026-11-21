"use client";

import { useEffect, useState } from "react";
import { AudioLines, Loader2, Mic } from "lucide-react";
import { create } from "zustand";
import { useRanganStore, type RanganTurn } from "@/hooks/use-rangan-store";
import { voiceActionFor } from "@/hooks/use-voice-action";
import { localDay, planSessions } from "@/lib/client/study-plan";
import {
  canRecord,
  closeMicrophone,
  openMicrophone,
  record,
  speak,
  stopSpeaking,
  transcribeAudio,
  unlockAudio,
  VoiceProblem,
  voiceMessage,
  type Recording,
} from "@/lib/client/voice";
import { speakable, spokenDue, voiceReply } from "@/lib/rangan/voice";

// Talking with Rangan. The mic button types what you say into the box. Voice
// mode is a conversation: Rangan listens, sends when you stop talking, reads
// the reply aloud and listens again. A card (tasks, a plan, a page, a board)
// is read briefly with a question; "yes" saves it, as its button would.

type Phase = "idle" | "listening" | "transcribing" | "thinking" | "speaking";

type VoiceState = {
  mode: "off" | "dictating" | "conversation";
  phase: Phase;
  level: number;
  problem: string | null;
};

export const useVoiceStore = create<VoiceState>(() => ({ mode: "off", phase: "idle", level: 0, problem: null }));

let stream: MediaStream | null = null;
let recording: Recording | null = null;

const setPhase = (phase: Phase) => useVoiceStore.setState({ phase, ...(phase === "listening" ? {} : { level: 0 }) });
const onLevel = (level: number) => useVoiceStore.setState({ level });
const active = (mode: VoiceState["mode"]) => useVoiceStore.getState().mode === mode;

function showProblem(error: unknown) {
  const message = error instanceof VoiceProblem ? voiceMessage(error.kind) : error instanceof Error && error.message ? error.message : voiceMessage("failed");
  useVoiceStore.setState({ problem: message });
}

/** Ends voice typing or voice mode at once: the recording is dropped and speech stops. */
export function stopVoice() {
  recording?.cancel();
  recording = null;
  stopSpeaking();
  closeMicrophone(stream);
  stream = null;
  useVoiceStore.setState({ mode: "off", phase: "idle", level: 0 });
}

/** What Rangan says for a reply, and whether it then asks "yes or no". */
function spokenTurn(turn: RanganTurn): { text: string; asks: boolean } {
  switch (turn.role) {
    case "assistant":
      return { text: speakable(turn.content) || "I don't have an answer for that.", asks: false };
    case "task": {
      const today = localDay();
      if (turn.tasks.length === 1) {
        const [task] = turn.tasks;
        return { text: `A task: ${task.title}, ${spokenDue(task.day, task.time, today)}. Should I add it to your planner?`, asks: true };
      }
      return { text: `${turn.tasks.length} tasks: ${turn.tasks.map((task) => task.title).join(", ")}. Should I add them to your planner?`, asks: true };
    }
    case "plan": {
      const sessions = planSessions(turn.plan).sessions.length;
      return { text: `A study plan: ${turn.plan.goal}, in ${sessions} session${sessions === 1 ? "" : "s"}. Should I add it to your planner?`, asks: true };
    }
    case "page":
      return { text: `I wrote a page: ${turn.draft.title}. Should I create it?`, asks: true };
    case "map":
      return { text: `I drafted a mind map: ${turn.map.draft.title}. Should I create the board?`, asks: true };
    case "edit":
    case "board-edit":
      return { text: `${speakable(turn.edit.summary, 300)} Tap Apply to make the change.`, asks: false };
    case "explore":
      return { text: "Here are some ideas to explore next. They're on screen.", asks: false };
    case "error":
      return { text: turn.content, asks: false };
    default:
      return { text: "", asks: false };
  }
}

const DONE: Partial<Record<RanganTurn["role"], string>> = {
  task: "Added to your planner.",
  plan: "Added the plan to your planner.",
  page: "Created the page.",
  map: "Created the board.",
};

/** Resolves once Rangan has finished the request in flight. */
function untilAnswered(): Promise<void> {
  if (!useRanganStore.getState().pending) return Promise.resolve();
  return new Promise((resolve) => {
    const unsubscribe = useRanganStore.subscribe((state) => {
      if (!state.pending) {
        unsubscribe();
        resolve();
      }
    });
  });
}

async function say(text: string) {
  if (!active("conversation")) return;
  setPhase("speaking");
  await speak(text);
}

/** Listens once; the words said, "" for nothing, or null when voice mode was stopped. */
async function listen(): Promise<string | null> {
  if (!stream || !active("conversation")) return null;
  setPhase("listening");
  recording = record(stream, { untilPause: true, onLevel });
  const audio = await recording.done;
  recording = null;
  if (!active("conversation")) return null;
  if (!audio) return "";
  setPhase("transcribing");
  return transcribeAudio(audio);
}

/** Voice mode: listen, send, read the reply, and again, until stopped or nobody speaks. */
async function converse(send: (text: string) => void) {
  let awaiting: RanganTurn | null = null;
  let quiet = 0;
  try {
    stream = await openMicrophone();
    while (active("conversation")) {
      const text = await listen();
      if (text === null) break;
      if (!text) {
        quiet += 1;
        if (quiet >= 2) {
          await say("I'll stop listening now. Tap Talk to start again.");
          break;
        }
        continue;
      }
      quiet = 0;
      const reply = voiceReply(text);
      if (reply === "stop") break;
      if (awaiting && (reply === "yes" || reply === "no")) {
        const turn: RanganTurn = awaiting;
        awaiting = null;
        if (reply === "no") {
          await say("Okay, I won't.");
          continue;
        }
        const run = voiceActionFor(turn.id);
        setPhase("thinking");
        const ok = run ? await run() : false;
        await say(ok ? (DONE[turn.role] ?? "Done.") : "That didn't work. It's on screen for you to try.");
        continue;
      }
      awaiting = null;
      const usage = useRanganStore.getState().usage;
      if (usage && usage.remaining <= 0) {
        await say("You've used today's questions. They come back tomorrow.");
        break;
      }
      setPhase("thinking");
      send(text);
      await untilAnswered();
      if (!active("conversation")) break;
      // The reply is what follows this question: the last turn after the newest question.
      const turns = useRanganStore.getState().turns;
      let question = turns.length - 1;
      while (question >= 0 && turns[question].role !== "user") question -= 1;
      const answer = question === -1 ? undefined : turns.slice(question + 1).at(-1);
      if (!answer) continue;
      const spoken = spokenTurn(answer);
      await say(spoken.text);
      if (spoken.asks && voiceActionFor(answer.id)) awaiting = answer;
    }
  } catch (error) {
    showProblem(error);
  } finally {
    if (active("conversation")) stopVoice();
  }
}

/** Starts voice mode from a tap (phones only allow audio from one). */
export function startConversation(send: (text: string) => void) {
  if (useVoiceStore.getState().mode !== "off") return;
  unlockAudio();
  useVoiceStore.setState({ mode: "conversation", phase: "listening", problem: null });
  void converse(send);
}

/** Voice typing: what you say is written into the box for you to check and send. */
async function dictate(onText: (text: string) => void) {
  try {
    stream = await openMicrophone();
    if (!active("dictating")) return;
    setPhase("listening");
    recording = record(stream, { untilPause: true, onLevel });
    const audio = await recording.done;
    recording = null;
    closeMicrophone(stream);
    stream = null;
    if (!active("dictating") || !audio) return;
    setPhase("transcribing");
    const text = await transcribeAudio(audio);
    if (!active("dictating")) return;
    if (text) onText(text);
    else useVoiceStore.setState({ problem: "Rangan didn't catch that. Tap the mic and try again." });
  } catch (error) {
    showProblem(error);
  } finally {
    if (active("dictating")) stopVoice();
  }
}

/** The mic button beside Send: tap to talk, tap again to finish early. */
export function RanganDictateButton({ onText, disabled }: { onText: (text: string) => void; disabled: boolean }) {
  const mode = useVoiceStore((state) => state.mode);
  const phase = useVoiceStore((state) => state.phase);
  const level = useVoiceStore((state) => state.level);
  const [supported, setSupported] = useState(false);
  useEffect(() => setSupported(canRecord()), []);
  if (!supported || mode === "conversation") return null;

  const dictating = mode === "dictating";
  const onClick = () => {
    if (dictating) {
      // Finishing early keeps what was said; while it is being written down, the tap cancels.
      if (phase === "listening") recording?.stop();
      else stopVoice();
      return;
    }
    unlockAudio();
    useVoiceStore.setState({ mode: "dictating", phase: "listening", problem: null });
    void dictate(onText);
  };

  return (
    <button
      type="button"
      className={`rangan-mic${dictating ? " on" : ""}`}
      onClick={onClick}
      disabled={disabled && !dictating}
      aria-label={dictating ? (phase === "listening" ? "Finish speaking" : "Cancel") : "Speak your question"}
      title={dictating ? "Finish" : "Speak instead of typing"}
      style={dictating && phase === "listening" ? { boxShadow: `0 0 0 ${2 + Math.round(level * 4)}px rgba(224, 80, 77, 0.3)` } : undefined}
    >
      {dictating && phase === "transcribing" ? (
        <Loader2 size={16} className="rangan-spin" />
      ) : dictating ? (
        <span className="rangan-recording" aria-hidden>
          <LevelBars level={level} />
          <span className="rangan-stop-glyph" />
        </span>
      ) : (
        <Mic size={17} />
      )}
    </button>
  );
}

/** Three bars that rise with the speaker's voice, so it's clear the mic hears them. */
function LevelBars({ level }: { level: number }) {
  return (
    <span className="rangan-level-bars">
      {[0.55, 1, 0.75].map((weight, index) => (
        <span key={index} style={{ transform: `scaleY(${0.25 + Math.min(1, level * weight * 1.6) * 0.75})` }} />
      ))}
    </span>
  );
}

const PHASE_LABEL: Record<Phase, string> = {
  idle: "",
  listening: "Listening…",
  transcribing: "Got it…",
  thinking: "Working on it…",
  speaking: "Speaking…",
};

/** "Talk" in the chips row, and the voice-mode bar that replaces the chips while it runs. */
export function RanganVoiceMode({ send, disabled }: { send: (text: string) => void; disabled: boolean }) {
  const mode = useVoiceStore((state) => state.mode);
  const phase = useVoiceStore((state) => state.phase);
  const level = useVoiceStore((state) => state.level);
  const [supported, setSupported] = useState(false);
  useEffect(() => setSupported(canRecord()), []);
  if (!supported) return null;

  if (mode !== "conversation") {
    return (
      <button type="button" className="rangan-chip" onClick={() => startConversation(send)} disabled={disabled || mode === "dictating"} title="Talk with Rangan: it listens, answers aloud and listens again">
        <AudioLines size={14} aria-hidden /> Talk
      </button>
    );
  }
  return (
    <div className="rangan-voice-bar" role="status" aria-live="polite">
      <span className={`rangan-voice-dot ${phase}`} style={phase === "listening" ? { transform: `scale(${1 + level * 0.9})` } : undefined} aria-hidden />
      <span className="rangan-voice-label">{PHASE_LABEL[phase]}</span>
      <span className="rangan-voice-hint">{phase === "listening" ? "Say “stop” to end" : ""}</span>
      <button type="button" className="rangan-chip rangan-voice-stop" onClick={stopVoice}>
        <span className="rangan-stop-glyph small" aria-hidden /> Stop
      </button>
    </div>
  );
}

/** A problem with the microphone or transcription, shown above the input until the next try. */
export function RanganVoiceProblem() {
  const problem = useVoiceStore((state) => state.problem);
  if (!problem) return null;
  return (
    <p className="rangan-voice-problem" role="alert">
      {problem}
      <button type="button" className="rangan-voice-dismiss" onClick={() => useVoiceStore.setState({ problem: null })} aria-label="Dismiss">
        ×
      </button>
    </p>
  );
}
