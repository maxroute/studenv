"use client";

import { useEffect, useState } from "react";
import { Mic } from "lucide-react";
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
import { isTalkLanguage, listeningLanguage, speakable, spokenDue, TALK_LANGUAGE_LABEL, TALK_LANGUAGES, voiceReply, withoutTrailingStop, type TalkLanguage } from "@/lib/rangan/voice";

// Talking with Rangan. The mic button types what you say into the box. Voice
// mode is a conversation: Rangan listens, sends when you stop talking, reads
// the reply aloud and listens again. A card (tasks, a plan, a page, a board)
// is read briefly with a question; "yes" saves it, as its button would.

type Phase = "idle" | "listening" | "transcribing" | "thinking" | "speaking";

type VoiceState = {
  mode: "off" | "conversation";
  /** What Talk listens for; "auto" follows the script the student types in. */
  language: TalkLanguage;
  phase: Phase;
  level: number;
  problem: string | null;
};

export const useVoiceStore = create<VoiceState>(() => ({ mode: "off", phase: "idle", level: 0, problem: null, language: "auto" }));

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
      const fromWeb = turn.plan.sources.some((source) => source.kind === "web") ? " Your library had nothing on it, so I used Wikipedia." : "";
      return { text: `A study plan: ${turn.plan.goal}, in ${sessions} session${sessions === 1 ? "" : "s"}.${fromWeb} Should I add it to your planner?`, asks: true };
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
  return transcribeAudio(audio, talkLanguageNow());
}

const TALK_LANGUAGE_KEY = "rangan-talk-language";

/** The student's Talk language, remembered on this device; "auto" when unset or unavailable. */
function savedTalkLanguage(): TalkLanguage {
  try {
    const saved = window.localStorage.getItem(TALK_LANGUAGE_KEY);
    return isTalkLanguage(saved) ? saved : "auto";
  } catch {
    return "auto";
  }
}

/** The language to listen in now: the student's choice, or none in Auto (the server works it out). */
function talkLanguageNow() {
  return listeningLanguage(useVoiceStore.getState().language);
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
      // "…Stop." at the end of a request: send the request, answer, then stop.
      const ending = withoutTrailingStop(text);
      const reply = ending.stop ? null : voiceReply(text);
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
      send(ending.text);
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
      if (ending.stop) break;
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
  useVoiceStore.setState({ mode: "conversation", phase: "listening", problem: null, language: savedTalkLanguage() });
  void converse(send);
}

/**
 * Talk, beside Send: one tap and Rangan listens, answers aloud and listens
 * again until stopped. Typing stays in the box; there's one way to talk.
 */
export function RanganTalkButton({ send, disabled }: { send: (text: string) => void; disabled: boolean }) {
  const mode = useVoiceStore((state) => state.mode);
  const [supported, setSupported] = useState(false);
  useEffect(() => setSupported(canRecord()), []);
  if (!supported || mode === "conversation") return null;
  return (
    <button
      type="button"
      className="rangan-mic"
      onClick={() => startConversation(send)}
      disabled={disabled}
      aria-label="Talk with Rangan"
      title="Talk: Rangan listens, answers aloud and listens again"
    >
      <Mic size={17} />
    </button>
  );
}

const PHASE_LABEL: Record<Phase, string> = {
  idle: "",
  listening: "Listening…",
  transcribing: "Got it…",
  thinking: "Working on it…",
  speaking: "Speaking…",
};

/** The bar that shows what Talk is doing (listening, thinking, speaking), with Stop. */
export function RanganVoiceBar() {
  const mode = useVoiceStore((state) => state.mode);
  const language = useVoiceStore((state) => state.language);
  const phase = useVoiceStore((state) => state.phase);
  const level = useVoiceStore((state) => state.level);
  if (mode !== "conversation") return null;
  return (
    <div className="rangan-voice-bar" role="status" aria-live="polite">
      <span className={`rangan-voice-dot ${phase}`} style={phase === "listening" ? { transform: `scale(${1 + level * 0.9})` } : undefined} aria-hidden />
      <span className="rangan-voice-label">{PHASE_LABEL[phase]}</span>
      <span className="rangan-voice-hint">{phase === "listening" ? "Pause when you're done" : ""}</span>
      <select
        className="rangan-voice-language"
        value={language}
        onChange={(event) => {
          const chosen = event.target.value;
          if (!isTalkLanguage(chosen)) return;
          useVoiceStore.setState({ language: chosen });
          try {
            window.localStorage.setItem(TALK_LANGUAGE_KEY, chosen);
          } catch {
            // Remembering the choice is a convenience; Talk works without it.
          }
        }}
        aria-label="Language you speak"
        title="The language you speak: naming it helps Rangan understand Bengali and Hindi"
      >
        {TALK_LANGUAGES.map((option) => (
          <option key={option} value={option}>
            {TALK_LANGUAGE_LABEL[option]}
          </option>
        ))}
      </select>
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
