"use client";
import "../../app/(dashboard)/dashboard/groups/study-groups.css";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { RoomStateStore, useRoomState } from "./room-state-store";
import { FloatingControls } from "./floating-controls";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Activity,
  ArrowLeft,
  BrainCircuit,
  Check,
  Clock3,
  Coffee,
  ExternalLink,
  FileText,
  MessageSquare,
  Mic,
  MicOff,
  Pause,
  Phone,
  PhoneOff,
  Pin,
  Play,
  Monitor,
  Radio,
  RotateCcw,
  Search,
  Send,
  Shield,
  Square,
  Ticket,
  Timer,
  Users,
  Video,
  VideoOff,
  X,
  Maximize,
  Minimize,
  MoreVertical,
  Settings,
  SkipForward,
  Volume2,
  PictureInPicture,
} from "lucide-react";
import { io, type Socket } from "socket.io-client";
import { toast } from "react-hot-toast";
import {
  BUILT_IN_STUDY_ROOM_TEMPLATES,
  type StudyRoomTemplatePreset,
} from "@/lib/utils/study-room-templates";
import type {
  CollectionRecord,
  ItemRecord,
  StudyGroupRecord,
  StudyGroupMessageRecord,
  StudyRoomCollectionTakeawayRecord,
  StudyRoomPinnedCollectionRecord,
  StudyRoomPermissionsRecord,
  StudyRoomMode,
  StudyRoomPinnedResourceRecord,
  StudyRoomStatus,
  StudyRoomTemplateId,
  StudyRoomTemplateRecord,
} from "@/types";

type StudyRoomClientProps = {
  groupId: string;
};

type ApiResult<T> = {
  ok: boolean;
  data?: T;
  error?: string;
};

type StoredRoomState = {
  lastSyncedAt?: string;
};

type LiveStatus = "connecting" | "live" | "reconnecting" | "offline";
type OutcomeField = "completedThisBlock" | "carryForward" | "blockers";
type TakeawayKind = "key_idea" | "question" | "confusion";

type StudyRoomSocketTokenResponse = {
  token: string;
};
type CallSessionMode = "conference" | "stream_host" | "stream_viewer";
type ExtendedDisplayMediaStreamOptions = DisplayMediaStreamOptions & {
  selfBrowserSurface?: "include" | "exclude";
  surfaceSwitching?: "include" | "exclude";
  monitorTypeSurfaces?: "include" | "exclude";
  preferCurrentTab?: boolean;
  systemAudio?: "include" | "exclude";
};
type ScreenShareHealth = {
  readyState: MediaStreamTrackState;
  enabled: boolean;
  muted: boolean;
  width?: number;
  height?: number;
  frameRate?: number;
  displaySurface?: string;
  bytesSent?: number;
  framesEncoded?: number;
  packetsSent?: number;
  outboundReports: number;
  updatedAt: number;
};
type RoomCallParticipant = {
  socketId: string;
  userId: string;
  name: string | null;
  username: string | null;
  isInCall: boolean;
  audioEnabled: boolean;
  videoEnabled: boolean;
  sessionMode: CallSessionMode | null;
  isScreenSharing: boolean;
};
type RoomPresenceOverride = {
  userId: string;
  name: string | null;
  username: string | null;
  avatarUrl?: string | null;
  status: "active" | "focused" | "away";
  updatedAt: string;
};

const DEFAULT_FOCUS_MINUTES = 20;
const DEFAULT_BREAK_MINUTES = 5;

function playTimerSound() {
  try {
    const AudioContext =
      window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();

    // Play a gentle premium double-tone chime (E5 then A5)
    const playTone = (freq: number, start: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, start);

      gain.gain.setValueAtTime(0.35, start);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(start);
      osc.stop(start + duration);
    };

    const now = ctx.currentTime;
    playTone(659.25, now, 0.8); // E5
    playTone(880.0, now + 0.12, 1.2); // A5
  } catch (err) {
    console.error("Failed to play timer sound:", err);
  }
}

function formatTime(value: string | Date) {
  return new Intl.DateTimeFormat("en", {
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function formatRelativeTime(value: string | Date) {
  const diffMs = new Date(value).getTime() - Date.now();
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const minute = 60 * 1000;
  const hour = 60 * minute;

  if (Math.abs(diffMs) < hour) {
    return formatter.format(Math.round(diffMs / minute), "minute");
  }

  return formatter.format(Math.round(diffMs / hour), "hour");
}

function getInitials(name?: string | null, username?: string | null) {
  const source = (name || username || "Study Member").trim();
  return source
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function formatDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function getLiveTone(status: LiveStatus) {
  if (status === "live") {
    return "border-[rgba(26,158,117,0.35)] bg-[rgba(26,158,117,0.13)] text-[#1a9e75]";
  }
  if (status === "reconnecting") {
    return "border-[rgba(201,125,12,0.35)] bg-[rgba(201,125,12,0.13)] text-[#c97d0c]";
  }
  if (status === "offline") {
    return "border-[rgba(184,76,58,0.35)] bg-[rgba(184,76,58,0.13)] text-[#d48779]";
  }
  return "border-white/[0.08] bg-white/[0.03] text-[#9c9788]";
}

function formatLiveLabel(status: LiveStatus) {
  if (status === "live") {
    return "Live sync";
  }
  if (status === "reconnecting") {
    return "Reconnecting";
  }
  if (status === "offline") {
    return "Offline fallback";
  }
  return "Connecting";
}

function formatTakeawayKindLabel(kind: TakeawayKind) {
  if (kind === "key_idea") {
    return "Key idea";
  }
  if (kind === "question") {
    return "Question";
  }
  return "Confusion";
}

function formatMediaError(error: unknown) {
  if (error instanceof DOMException) {
    if (
      error.name === "NotAllowedError" ||
      error.name === "PermissionDeniedError"
    ) {
      return "Browser or OS blocked microphone/camera access for this tab. Close other apps using the device, check Brave Shields or browser privacy controls, and confirm Windows Camera and Microphone access are enabled for desktop apps and your browser.";
    }
    if (
      error.name === "NotFoundError" ||
      error.name === "DevicesNotFoundError"
    ) {
      return "No microphone or camera was found for this browser.";
    }
    if (error.name === "NotReadableError" || error.name === "TrackStartError") {
      return "Your microphone or camera is busy in another app or browser tab.";
    }
    if (error.name === "SecurityError") {
      return "This browser is blocking media access for the current page.";
    }
    return error.message || "Microphone or camera access failed.";
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Microphone or camera access failed.";
}

function getFriendlyMediaMessage(error: unknown): {
  title: string;
  hint: string;
} {
  if (error instanceof DOMException) {
    if (
      error.name === "NotAllowedError" ||
      error.name === "PermissionDeniedError"
    ) {
      return {
        title: "Camera/Microphone blocked",
        hint: "Allow permissions and reload.",
      };
    }
    if (
      error.name === "NotFoundError" ||
      error.name === "DevicesNotFoundError"
    ) {
      return {
        title: "No camera or microphone found",
        hint: "Connect a device and try again.",
      };
    }
    if (error.name === "NotReadableError" || error.name === "TrackStartError") {
      return {
        title: "Device is busy",
        hint: "Close other apps using your camera or microphone, then retry.",
      };
    }
    if (error.name === "SecurityError") {
      return {
        title: "Media access blocked",
        hint: "Your browser security settings are preventing access.",
      };
    }
  }
  return {
    title: "Could not access camera or microphone",
    hint: "Check your device connections and browser permissions.",
  };
}

async function logMediaDebugSnapshot(context: string, error: unknown) {
  const snapshot: string[] = [];
  snapshot.push(`secure=${window.isSecureContext}`);
  snapshot.push(`protocol=${window.location.protocol}`);

  if (navigator.mediaDevices?.enumerateDevices) {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const microphones = devices.filter(
        (device) => device.kind === "audioinput",
      ).length;
      const cameras = devices.filter(
        (device) => device.kind === "videoinput",
      ).length;
      snapshot.push(`audioInputs=${microphones}`);
      snapshot.push(`videoInputs=${cameras}`);
    } catch {
      snapshot.push("enumerateDevices=failed");
    }
  } else {
    snapshot.push("mediaDevices=missing");
  }

  console.error(`[StudyRoom:${context}]`, error, snapshot.join(" | "));
}

function getMediaErrorCode(error: unknown) {
  if (error instanceof DOMException) {
    return error.name || "MediaError";
  }
  if (error instanceof Error) {
    return error.name || "MediaError";
  }
  return "MediaError";
}

async function readJson<T>(response: Response) {
  try {
    const text = await response.text();
    try {
      const json = JSON.parse(text) as ApiResult<T>;
      if (!response.ok || !json.ok || json.data === undefined) {
        throw new Error(json.error || "Request failed.");
      }
      return json.data;
    } catch {
      throw new Error(
        "Unable to establish sync with server. Using offline fallback.",
      );
    }
  } catch (err: any) {
    if (
      err.message.includes("fallback") ||
      err.message.includes("Request failed")
    ) {
      throw err;
    }
    throw new Error("Server connection interrupted. Please try again.");
  }
}

function mergePresenceRecords(
  base: StudyGroupRecord["roomPresence"],
  overrides: Record<string, RoomPresenceOverride>,
) {
  const merged = new Map(base.map((entry) => [entry.userId, entry] as const));
  for (const override of Object.values(overrides)) {
    merged.set(override.userId, {
      userId: override.userId,
      name: override.name,
      username: override.username,
      avatarUrl: override.avatarUrl ?? null,
      status: override.status,
      updatedAt: override.updatedAt,
    });
  }
  return Array.from(merged.values());
}

function parseMessageContent(text: string | null) {
  if (!text) return { isQuestion: false, reply: null, cleanText: "" };
  let isQuestion = false;
  let reply: { messageId: string; authorName: string } | null = null;
  let cleanText = text;

  // Check if it's a question
  if (cleanText.startsWith("❓ [Question] ")) {
    isQuestion = true;
    cleanText = cleanText.substring("❓ [Question] ".length);
  }

  // Check if it's a reply
  const replyMatch = cleanText.match(
    /^↳ \[reply:([^:]+):([^\]]+)\] ([\s\S]*)$/,
  );
  if (replyMatch) {
    reply = {
      messageId: replyMatch[1],
      authorName: replyMatch[2],
    };
    cleanText = replyMatch[3];
  }

  // It's possible a reply itself is a question, so check again after reply strip
  if (cleanText.startsWith("❓ [Question] ")) {
    isQuestion = true;
    cleanText = cleanText.substring("❓ [Question] ".length);
  }

  return { isQuestion, reply, cleanText };
}

let sharedAudioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!sharedAudioContext) {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      sharedAudioContext = new AudioContextClass();
    }
  }
  return sharedAudioContext;
}

class SpeechDetector {
  private store: RoomStateStore;
  private activeStreams = new Map<string, {
    source: MediaStreamAudioSourceNode;
    analyser: AnalyserNode;
    stream: MediaStream;
    isSpeaking: boolean;
    currentScale: number;
    currentOpacity: number;
    silenceTimer: NodeJS.Timeout | null;
  }>();
  private animationFrameId: number | null = null;
  private lastTime: number = 0;

  constructor(store: RoomStateStore) {
    this.store = store;
  }

  updateLocalSpeechDetection(audioEnabled: boolean, stream: MediaStream | null) {
    const id = "local";
    if (!audioEnabled || !stream || stream.getAudioTracks().length === 0) {
      this.stop(id);
      return;
    }
    this.start(id, stream);
  }

  updateRemoteSpeechDetection(socketId: string, audioEnabled: boolean, stream: MediaStream | null) {
    if (!audioEnabled || !stream || stream.getAudioTracks().length === 0) {
      this.stop(socketId);
      return;
    }
    this.start(socketId, stream);
  }

  syncActiveParticipants(activeSocketIds: Set<string>) {
    for (const id of Array.from(this.activeStreams.keys())) {
      if (id !== "local" && !activeSocketIds.has(id)) {
        this.stop(id);
      }
    }
  }

  stop(id: string) {
    const active = this.activeStreams.get(id);
    if (active) {
      if (active.silenceTimer) clearTimeout(active.silenceTimer);
      try {
        active.source.disconnect();
      } catch (e) {}
      this.activeStreams.delete(id);
    }

    const micRing = document.getElementById(`mic-ring-${id}`);
    if (micRing) {
      micRing.style.transform = "scale(1)";
      micRing.style.opacity = "0";
    }

    if (this.store.get(`speaking:${id}`) !== false) {
      this.store.set(`speaking:${id}`, false);
    }

    if (this.activeStreams.size === 0 && this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  private start(id: string, stream: MediaStream) {
    const active = this.activeStreams.get(id);
    if (active) {
      if (active.stream === stream) {
        return;
      }
      this.stop(id);
    }

    const ctx = getAudioContext();
    if (!ctx) return;

    if (ctx.state === "suspended") {
      ctx.resume().catch((err) => console.error("Resuming AudioContext failed:", err));
    }

    try {
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      source.connect(analyser);

      this.activeStreams.set(id, {
        source,
        analyser,
        stream,
        isSpeaking: false,
        currentScale: 1.0,
        currentOpacity: 0.0,
        silenceTimer: null,
      });

      if (this.animationFrameId === null) {
        this.lastTime = performance.now();
        const updateLoop = (timestamp: number) => {
          this.animationFrameId = requestAnimationFrame(updateLoop);

          const elapsed = timestamp - this.lastTime;
          const fpsInterval = 1000 / 25; // Capped at 25 FPS

          if (elapsed >= fpsInterval) {
            this.lastTime = timestamp - (elapsed % fpsInterval);
            this.tick();
          }
        };
        this.animationFrameId = requestAnimationFrame(updateLoop);
      }
    } catch (err) {
      console.error(`Failed to start speaking detection for ${id}:`, err);
    }
  }

  private tick() {
    const START_THRESHOLD = 30;
    const STOP_THRESHOLD = 20;

    this.activeStreams.forEach((record, id) => {
      const analyser = record.analyser;
      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      analyser.getByteFrequencyData(dataArray);

      let sum = 0;
      for (let i = 0; i < bufferLength; i++) {
        sum += dataArray[i];
      }
      const volume = sum / bufferLength;

      // Hysteresis & Silence Handling for logical speaking state
      if (volume > START_THRESHOLD) {
        if (record.silenceTimer) {
          clearTimeout(record.silenceTimer);
          record.silenceTimer = null;
        }
        if (!record.isSpeaking) {
          record.isSpeaking = true;
          this.store.set(`speaking:${id}`, true);
        }
      } else if (volume < STOP_THRESHOLD) {
        if (record.isSpeaking && !record.silenceTimer) {
          record.silenceTimer = setTimeout(() => {
            record.isSpeaking = false;
            this.store.set(`speaking:${id}`, false);
            record.silenceTimer = null;
          }, 120); // 120ms delay for logical state
        }
      }

      // Visual feedback responds instantly when volume drops below STOP_THRESHOLD
      const isVisualSpeaking = record.isSpeaking && volume >= STOP_THRESHOLD;

      // Smooth interpolation for scale and opacity - responsive scale up (0.45), instant scale down (0.9)
      const targetScale = isVisualSpeaking ? Math.min(1 + volume / 100, 1.8) : 1.0;
      const scaleFactor = targetScale < record.currentScale ? 0.9 : 0.45;
      record.currentScale += (targetScale - record.currentScale) * scaleFactor;

      const targetOpacity = isVisualSpeaking ? 1.0 : 0.0;
      const opacityFactor = targetOpacity < record.currentOpacity ? 0.9 : 0.45;
      record.currentOpacity += (targetOpacity - record.currentOpacity) * opacityFactor;

      // Apply style directly to the DOM element
      const micRing = document.getElementById(`mic-ring-${id}`);
      if (micRing) {
        micRing.style.transform = `scale(${record.currentScale})`;
        micRing.style.opacity = record.currentOpacity.toFixed(3);
      }
    });
  }

  clear() {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    this.activeStreams.forEach((record, id) => {
      if (record.silenceTimer) clearTimeout(record.silenceTimer);
      try {
        record.source.disconnect();
      } catch (e) {}

      const micRing = document.getElementById(`mic-ring-${id}`);
      if (micRing) {
        micRing.style.transform = "scale(1)";
        micRing.style.opacity = "0";
      }
    });
    this.activeStreams.clear();
  }
}

type ParticipantMicIndicatorProps = {
  store: RoomStateStore;
  id: string;
  isMuted: boolean;
};

const ParticipantMicIndicator = React.memo(function ParticipantMicIndicator({
  store,
  id,
  isMuted,
}: ParticipantMicIndicatorProps) {
  const isSpeaking = useRoomState(store, `speaking:${id}`, false);

  const badgeClass = isMuted
    ? "muted"
    : isSpeaking
    ? "speaking"
    : "silent";

  return (
    <div className="participant-mic-indicator-container">
      {!isMuted && (
        <div
          id={`mic-ring-${id}`}
          className="participant-mic-ring"
          style={{
            transform: "scale(1)",
            opacity: 0,
          }}
        />
      )}
      <div className={`participant-mic-badge ${badgeClass}`}>
        {isMuted ? (
          <MicOff className="w-3.5 h-3.5" />
        ) : (
          <Mic className="w-3.5 h-3.5" />
        )}
      </div>
    </div>
  );
});

export default function StudyRoomClient({ groupId }: StudyRoomClientProps) {
  const router = useRouter();
  const didHydrateRef = useRef(false);
  const socketRef = useRef<Socket | null>(null);
  const liveSourceRef = useRef<EventSource | null>(null);
  const currentUserIdRef = useRef<string | null>(null);
  const syncCounterRef = useRef(0);
  const groupRef = useRef<StudyGroupRecord | null>(null);
  const refreshTimeoutRef = useRef<number | null>(null);
  const completedTimerRef = useRef<string | null>(null);
  const localVideoContainerRef = useRef<HTMLDivElement | null>(null);
  const remoteVideoContainersRef = useRef(
    new Map<string, HTMLDivElement | null>(),
  );
  const attachedVideoElementsRef = useRef(new Map<string, HTMLMediaElement>());
  const attachedVideoSignaturesRef = useRef(new Map<string, string>());
  const remoteMediaStreamsRef = useRef(new Map<string, MediaStream>());
  const localMediaStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const screenShareStatsTimerRef = useRef<number | null>(null);
  const peerConnectionsRef = useRef(new Map<string, RTCPeerConnection>());
  const pendingIceCandidatesRef = useRef(
    new Map<string, RTCIceCandidateInit[]>(),
  );
  const disconnectingCallRef = useRef(false);
  const [group, setGroup] = useState<StudyGroupRecord | null>(null);
  useEffect(() => {
    groupRef.current = group;
  }, [group]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [savingRoom, setSavingRoom] = useState(false);
  const [loadingItems, setLoadingItems] = useState(false);
  const [loadingCollections, setLoadingCollections] = useState(false);
  const [openingPinnedAction, setOpeningPinnedAction] = useState<
    "workspace" | "study" | null
  >(null);
  const [exportingTakeaways, setExportingTakeaways] = useState(false);
  const [exportingHistoryId, setExportingHistoryId] = useState<string | null>(
    null,
  );
  const [generatingRecap, setGeneratingRecap] = useState(false);
  const [quickMessage, setQuickMessage] = useState("");
  const [activityModalOpen, setActivityModalOpen] = useState(false);
  const [replyingToMessage, setReplyingToMessage] =
    useState<StudyGroupMessageRecord | null>(null);
  const [messageMode, setMessageMode] = useState<"comment" | "question">(
    "comment",
  );
  const [isEditingGoal, setIsEditingGoal] = useState(false);
  const [editedGoal, setEditedGoal] = useState("");
  const [savingGoal, setSavingGoal] = useState(false);
  const [items, setItems] = useState<ItemRecord[]>([]);
  const [collections, setCollections] = useState<CollectionRecord[]>([]);
  const [customTemplates, setCustomTemplates] = useState<
    StudyRoomTemplatePreset[]
  >([]);
  const [resourceQuery, setResourceQuery] = useState("");
  const [collectionQuery, setCollectionQuery] = useState("");
  const [taskInput, setTaskInput] = useState("");
  const [takeawayInput, setTakeawayInput] = useState("");
  const [takeawayKind, setTakeawayKind] = useState<TakeawayKind>("key_idea");
  const [itemNoteDraft, setItemNoteDraft] = useState("");
  const [outcomeInputs, setOutcomeInputs] = useState<
    Record<OutcomeField, string>
  >({
    completedThisBlock: "",
    carryForward: "",
    blockers: "",
  });
  const [selectedTemplateId, setSelectedTemplateId] =
    useState<StudyRoomTemplateId>("focus");
  const [customTemplateLabel, setCustomTemplateLabel] = useState("");
  const [customTemplateDescription, setCustomTemplateDescription] =
    useState("");
  // Event-driven High Performance Room State Store
  const store = useMemo(() => new RoomStateStore({
    timeLeft: DEFAULT_FOCUS_MINUTES * 60,
    mode: "focus",
    status: "idle",
    timerEndsAt: null,
    audioEnabled: false,
    videoEnabled: false,
    isSharingScreen: false,
    isRoomFullscreen: false,
    callJoined: false,
    callJoining: false,
    callSessionMode: null,
    streamHostUser: null,
    roomParticipants: [],
    connectedPeers: new Set(),
    timerOptionsOpen: false,
    pipActive: false,
    layoutMode: "grid",
    backgroundEffect: "none",
    selectedAudioInputId: "",
    selectedVideoInputId: "",
    selectedAudioOutputId: "",
    mediaDebugInfo: null,
    focusPrimarySource: "screen",
  }), []);

  const speechDetector = useMemo(() => new SpeechDetector(store), [store]);

  // ── Store-backed local mirrors ──────────────────────────────────────
  // These subscribe to the store so the component re-renders only when
  // the specific slice changes, while keeping variable names identical
  // for full backward-compat with the 6 000+ lines below.
  const timeLeft = 0; // Isolated from parent re-renders, read via stateRef in business logic
  const mode = useRoomState(store, "mode", "focus" as StudyRoomMode);
  const status = useRoomState(store, "status", "idle" as StudyRoomStatus);
  const audioEnabled = useRoomState(store, "audioEnabled", false);
  const videoEnabled = useRoomState(store, "videoEnabled", false);
  const isSharingScreen = useRoomState(store, "isSharingScreen", false);
  const isRoomFullscreen = useRoomState(store, "isRoomFullscreen", false);
  const callJoined = useRoomState(store, "callJoined", false);
  const callJoining = useRoomState(store, "callJoining", false);
  const callSessionMode = useRoomState(store, "callSessionMode", null as CallSessionMode | null);
  const roomParticipants = useRoomState(store, "roomParticipants", [] as any[]);
  const connectedPeers = new Set<string>(); // Read via stateRef in logic
  const timerOptionsOpen = false; // Closed by default, managed by TimerBlock component
  const focusPrimarySource = useRoomState(store, "focusPrimarySource", "screen" as "screen" | "camera");
  const mediaDebugInfo = null as any; // Isolated from parent re-renders, rendered via MediaDebugOverlay
  const pipActive = useRoomState(store, "pipActive", false);

  // ── Shim setters ── route old setXxx() calls through the store ─────
  const setTimeLeft = useCallback((v: any) => {
    const next = typeof v === "function" ? v(store.get("timeLeft")) : v;
    store.set("timeLeft", next);
  }, [store]);
  const setMode = useCallback((v: any) => {
    const next = typeof v === "function" ? v(store.get("mode")) : v;
    store.set("mode", next);
  }, [store]);
  const setStatus = useCallback((v: any) => {
    const next = typeof v === "function" ? v(store.get("status")) : v;
    store.set("status", next);
  }, [store]);
  const setAudioEnabled = useCallback((v: any) => {
    const next = typeof v === "function" ? v(store.get("audioEnabled")) : v;
    store.set("audioEnabled", next);
  }, [store]);
  const setVideoEnabled = useCallback((v: any) => {
    const next = typeof v === "function" ? v(store.get("videoEnabled")) : v;
    store.set("videoEnabled", next);
  }, [store]);
  const setIsSharingScreen = useCallback((v: any) => {
    const next = typeof v === "function" ? v(store.get("isSharingScreen")) : v;
    store.set("isSharingScreen", next);
  }, [store]);
  const setIsRoomFullscreen = useCallback((v: any) => {
    const next = typeof v === "function" ? v(store.get("isRoomFullscreen")) : v;
    store.set("isRoomFullscreen", next);
  }, [store]);
  const setCallJoined = useCallback((v: any) => {
    const next = typeof v === "function" ? v(store.get("callJoined")) : v;
    store.set("callJoined", next);
  }, [store]);
  const setCallJoining = useCallback((v: any) => {
    const next = typeof v === "function" ? v(store.get("callJoining")) : v;
    store.set("callJoining", next);
  }, [store]);
  const setCallSessionMode = useCallback((v: any) => {
    const next = typeof v === "function" ? v(store.get("callSessionMode")) : v;
    store.set("callSessionMode", next);
  }, [store]);
  const setStreamHostUser = useCallback((v: any) => {
    const next = typeof v === "function" ? v(store.get("streamHostUser")) : v;
    store.set("streamHostUser", next);
  }, [store]);
  const setRoomParticipants = useCallback((v: any) => {
    const next = typeof v === "function" ? v(store.get("roomParticipants")) : v;
    store.set("roomParticipants", next);
  }, [store]);
  const setConnectedPeers = useCallback((v: React.SetStateAction<Set<string>>) => {
    const next = typeof v === "function" ? (v as Function)(store.get("connectedPeers")) : v;
    store.set("connectedPeers", next);
  }, [store]);
  const setTimerOptionsOpen = useCallback((v: React.SetStateAction<boolean>) => {
    const next = typeof v === "function" ? (v as Function)(store.get("timerOptionsOpen")) : v;
    store.set("timerOptionsOpen", next);
  }, [store]);
  const setFocusPrimarySource = useCallback((v: React.SetStateAction<"screen" | "camera">) => {
    const next = typeof v === "function" ? (v as Function)(store.get("focusPrimarySource")) : v;
    store.set("focusPrimarySource", next);
  }, [store]);
  const setMediaDebugInfo = useCallback((v: React.SetStateAction<MediaDebugInfo | null>) => {
    const next = typeof v === "function" ? (v as Function)(store.get("mediaDebugInfo")) : v;
    store.set("mediaDebugInfo", next);
  }, [store]);

  // Keep a Ref cache for fresh closures inside business functions
  const stateRef = useRef({
    audioEnabled: false,
    videoEnabled: false,
    callJoined: false,
    callJoining: false,
    callSessionMode: null as CallSessionMode | null,
    isSharingScreen: false,
    isRoomFullscreen: false,
    streamHostUser: null as any,
    roomParticipants: [] as any[],
    connectedPeers: new Set<string>(),
    timeLeft: DEFAULT_FOCUS_MINUTES * 60,
    mode: "focus" as StudyRoomMode,
    status: "idle" as StudyRoomStatus,
    timerEndsAt: null as Date | null,
    timerOptionsOpen: false,
    focusPrimarySource: "screen" as "screen" | "camera",
  });

  useEffect(() => {
    const subs = [
      store.subscribe("audioEnabled", (v) => { stateRef.current.audioEnabled = v; }),
      store.subscribe("videoEnabled", (v) => { stateRef.current.videoEnabled = v; }),
      store.subscribe("callJoined", (v) => { stateRef.current.callJoined = v; }),
      store.subscribe("callJoining", (v) => { stateRef.current.callJoining = v; }),
      store.subscribe("callSessionMode", (v) => { stateRef.current.callSessionMode = v; }),
      store.subscribe("isSharingScreen", (v) => { stateRef.current.isSharingScreen = v; }),
      store.subscribe("isRoomFullscreen", (v) => { stateRef.current.isRoomFullscreen = v; }),
      store.subscribe("streamHostUser", (v) => { stateRef.current.streamHostUser = v; }),
      store.subscribe("roomParticipants", (v) => { stateRef.current.roomParticipants = v; }),
      store.subscribe("connectedPeers", (v) => { stateRef.current.connectedPeers = v; }),
      store.subscribe("timeLeft", (v) => { stateRef.current.timeLeft = v; }),
      store.subscribe("mode", (v) => { stateRef.current.mode = v; }),
      store.subscribe("status", (v) => { stateRef.current.status = v; }),
      store.subscribe("timerEndsAt", (v) => { stateRef.current.timerEndsAt = v; }),
      store.subscribe("timerOptionsOpen", (v) => { stateRef.current.timerOptionsOpen = v; }),
      store.subscribe("focusPrimarySource", (v) => { stateRef.current.focusPrimarySource = v; }),
    ];
    return () => subs.forEach((un) => un());
  }, [store]);

  const [focusMinutes, setFocusMinutes] = useState(DEFAULT_FOCUS_MINUTES);
  const [breakMinutes, setBreakMinutes] = useState(DEFAULT_BREAK_MINUTES);
  const [sessionPrompt, setSessionPrompt] = useState("");
  const [sessionNote, setSessionNote] = useState("");
  const [sessionOutcomes, setSessionOutcomes] = useState<
    StudyGroupRecord["roomState"]["sessionOutcomes"]
  >({
    completedThisBlock: [],
    carryForward: [],
    blockers: [],
  });
  const [tasks, setTasks] = useState<StudyGroupRecord["roomState"]["tasks"]>([]);
  const [collectionTakeaways, setCollectionTakeaways] = useState<
    StudyGroupRecord["roomState"]["collectionTakeaways"]
  >([]);
  const [itemNotes, setItemNotes] = useState<
    StudyGroupRecord["roomState"]["itemNotes"]
  >([]);
  const [activeCollectionItemId, setActiveCollectionItemId] = useState<
    string | null
  >(null);
  const [completedCollectionItemIds, setCompletedCollectionItemIds] = useState<
    string[]
  >([]);

  const [timerEndsAt, setTimerEndsAt] = useState<Date | null>(null);
  const [liveStatus, setLiveStatus] = useState<LiveStatus>("connecting");
  const [roomSocketId, setRoomSocketId] = useState<string | null>(null);
  const [roomPresenceOverrides, setRoomPresenceOverrides] = useState<
    Record<string, RoomPresenceOverride>
  >({});

  // Local-only React states (not performance-critical)
  const [screenShareHealth, setScreenShareHealth] =
    useState<ScreenShareHealth | null>(null);
  const [pipWindow, setPipWindow] = useState<Window | null>(null);
  const [currentActiveStream, setCurrentActiveStream] =
    useState<MediaStream | null>(null);
  const [workspaceTab, setWorkspaceTab] = useState<"tasks" | "notes">("tasks");
  const [isMembersOpen, setIsMembersOpen] = useState(false);
  const [windowWidth, setWindowWidth] = useState<number>(1200);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasStreamRef = useRef<MediaStream | null>(null);
  const focusContainerRef = useRef<HTMLDivElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);

  // Synchronize SpeechDetector when roomParticipants or local audio state changes
  useEffect(() => {
    // 1. Sync local participant
    speechDetector.updateLocalSpeechDetection(audioEnabled, localMediaStreamRef.current);

    // 2. Sync remote participants
    const activeParticipants = roomParticipants.filter((p: any) => p.isInCall);
    const activeSocketIds = new Set(activeParticipants.map((p: any) => p.socketId));

    // Stop speaking detection for participants who are no longer active
    speechDetector.syncActiveParticipants(activeSocketIds);

    // Start/update speaking detection for active participants
    activeParticipants.forEach((participant: any) => {
      if (participant.socketId === roomSocketId) return;
      const stream = remoteMediaStreamsRef.current.get(participant.socketId) || null;
      speechDetector.updateRemoteSpeechDetection(
        participant.socketId,
        participant.audioEnabled,
        stream
      );
    });
  }, [roomParticipants, audioEnabled, speechDetector, roomSocketId]);

  // Cleanup SpeechDetector on unmount
  useEffect(() => {
    return () => {
      speechDetector.clear();
    };
  }, [speechDetector]);

  useEffect(() => {
    const handleRoomFullscreenChange = () => {
      setIsRoomFullscreen(
        document.fullscreenElement === focusContainerRef.current,
      );
    };
    document.addEventListener("fullscreenchange", handleRoomFullscreenChange);
    return () => {
      document.removeEventListener(
        "fullscreenchange",
        handleRoomFullscreenChange,
      );
    };
  }, []);

  const toggleRoomFullscreen = useCallback(() => {
    if (!focusContainerRef.current) return;
    if (!document.fullscreenElement) {
      focusContainerRef.current.requestFullscreen().catch((err) => {
        console.error("Failed to enter room fullscreen mode", err);
      });
    } else {
      document.exitFullscreen().catch((err) => {
        console.error("Failed to exit room fullscreen mode", err);
      });
    }
  }, []);

  // Live Canvas drawing for background auto Picture-in-Picture
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const draw = () => {
      const modeVal = store.get("mode");
      const timeLeftVal = store.get("timeLeft");
      const groupVal = groupRef.current;

      // Draw dark premium background
      ctx.fillStyle = "#0d0f0b";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Header styling
      ctx.fillStyle = modeVal === "focus" ? "#c97d0c" : "#1a9e75";
      ctx.font = "bold 13px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(
        modeVal === "focus" ? "FOCUS BLOCK" : "BREAK BLOCK",
        canvas.width / 2,
        45,
      );

      // Group Title
      ctx.fillStyle = "#9c9788";
      ctx.font = "italic 11px sans-serif";
      if (groupVal?.title) {
        const displayTitle =
          groupVal.title.length > 25
            ? groupVal.title.substring(0, 22) + "..."
            : groupVal.title;
        ctx.fillText(`"${displayTitle}"`, canvas.width / 2, 70);
      } else {
        ctx.fillText("Study Session", canvas.width / 2, 70);
      }

      // Time display
      ctx.fillStyle = "#e4dfcf";
      ctx.font = "bold 44px monospace";
      ctx.fillText(formatDuration(timeLeftVal), canvas.width / 2, 130);

      // Premium border
      ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
      ctx.lineWidth = 2;
      ctx.strokeRect(5, 5, canvas.width - 10, canvas.height - 10);
    };

    // Initial draw
    draw();

    // Subscribe directly to avoid React re-renders
    const unsubTimeLeft = store.subscribe("timeLeft", draw);
    const unsubMode = store.subscribe("mode", draw);

    return () => {
      unsubTimeLeft();
      unsubMode();
    };
  }, [store]);

  // Capture canvas stream into hidden video
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      const stream = canvas.captureStream(5); // 5 FPS
      canvasStreamRef.current = stream;

      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        video.play().catch(() => { });
      }
    } catch (e) {
      console.error("Canvas stream capture failed:", e);
    }
  }, []);

  // Auto-PiP on Visibility Change
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState === "hidden" && !pipWindow) {
        const mainVideo = attachedVideoElementsRef.current.get("focus-main");
        const videoElementToPiP = mainVideo || videoRef.current;
        if (videoElementToPiP && !document.pictureInPictureElement) {
          try {
            await (videoElementToPiP as any).requestPictureInPicture();
          } catch (e) {
            console.log("Auto-PiP on visibility change blocked/failed:", e);
          }
        }
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [pipWindow]);

  const startPictureInPicture = async () => {
    if (!("documentPictureInPicture" in window)) {
      // Document PiP fallback to standard video PiP
      const mainVideo =
        attachedVideoElementsRef.current.get("focus-main") || videoRef.current;
      if (mainVideo) {
        try {
          await (mainVideo as any).requestPictureInPicture();
          toast.success("Opened standard Picture-in-Picture");
        } catch (err) {
          console.error("Video PiP failed:", err);
          toast.error("Picture-in-Picture is not supported in your browser.");
        }
      } else {
        toast.error("Picture-in-Picture is not supported in your browser.");
      }
      return;
    }

    if (pipWindow) {
      pipWindow.close();
      return;
    }

    try {
      const w = await (window as any).documentPictureInPicture.requestWindow({
        width: 380,
        height: 340,
      });

      // Copy style sheets
      Array.from(document.styleSheets).forEach((styleSheet) => {
        try {
          let cssRules = "";
          try {
            cssRules = Array.from(styleSheet.cssRules)
              .map((rule) => rule.cssText)
              .join("");
          } catch (e) {
            console.warn(
              "CORS issue accessing stylesheet rules:",
              styleSheet.href,
            );
          }

          if (cssRules) {
            const style = w.document.createElement("style");
            style.textContent = cssRules;
            w.document.head.appendChild(style);
          } else if (styleSheet.href) {
            const link = w.document.createElement("link");
            link.rel = "stylesheet";
            link.href = styleSheet.href;
            w.document.head.appendChild(link);
          }
        } catch (e) {
          console.error("Failed to copy stylesheet:", e);
        }
      });
      document.querySelectorAll("style").forEach((styleEl) => {
        try {
          w.document.head.appendChild(styleEl.cloneNode(true));
        } catch (e) {
          console.error(e);
        }
      });

      w.document.body.className =
        "bg-[#0e0e0d] text-[#ddd8cc] flex flex-col items-center justify-between h-full w-full overflow-hidden p-4 select-none";
      w.document.title = "Study Room Timer & Stream";

      w.addEventListener("pagehide", () => {
        setPipWindow(null);
      });

      setPipWindow(w);
      toast.success("Picture-in-Picture opened");
    } catch (err) {
      console.error("Failed to open Document PiP:", err);
      toast.error("Failed to open Picture-in-Picture window.");
    }
  };

  const mainVideoContainerRef = useRef<HTMLDivElement | null>(null);
  const remoteRefCallbacks = useRef<
    Map<string, (el: HTMLDivElement | null) => void>
  >(new Map());
  const [callErrorMessage, setCallErrorMessage] = useState<string | null>(null);
  const [isBraveBrowser, setIsBraveBrowser] = useState(false);
  const [braveWarningDismissed, setBraveWarningDismissed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [showMembers, setShowMembers] = useState(true);
  const [showDebug, setShowDebug] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const [noPeersTimeout, setNoPeersTimeout] = useState(false);
  const [socketConnected, setSocketConnected] = useState(false);

  const roomTemplates = useMemo(
    () => [...BUILT_IN_STUDY_ROOM_TEMPLATES, ...customTemplates],
    [customTemplates],
  );
  const groupMembers = useMemo(() => group?.members ?? [], [group?.members]);

  const isHost = useMemo(() => {
    if (!group) return false;
    const owner = groupMembers.find((m) => m.role === "owner");
    return owner?.userId === group.currentUserId;
  }, [group, groupMembers]);

  const streamHostUser = useMemo(() => {
    // 1. First try active WebRTC room participants
    const activeStreamParticipant = roomParticipants.find(
      (p) => p.sessionMode === "stream_host",
    );
    if (activeStreamParticipant) {
      return activeStreamParticipant;
    }

    // 2. Database persistent stream fallback (ignore if stale for current user)
    if (group?.roomState?.streamHostUserId) {
      if (
        group.roomState.streamHostUserId === group.currentUserId &&
        !callJoined
      ) {
        return null;
      }
      const hostMember = groupMembers.find(
        (m) => m.userId === group.roomState.streamHostUserId,
      );
      if (hostMember) {
        return {
          userId: hostMember.userId,
          name: hostMember.name,
          username: hostMember.username,
          avatarUrl: hostMember.avatarUrl,
          isInCall: true,
          sessionMode: "stream_host" as const,
          socketId: "",
          audioEnabled: true,
          videoEnabled: true,
        };
      }
    }
    return null;
  }, [group, groupMembers, roomParticipants, callJoined]);

  useEffect(() => {
    store.set("streamHostUser", streamHostUser);
  }, [store, streamHostUser]);

  const activeCallCount = useMemo(() => {
    return new Set(
      roomParticipants
        .filter(
          (participant) =>
            participant.isInCall && participant.sessionMode !== "stream_viewer",
        )
        .map((participant) => participant.userId),
    ).size;
  }, [roomParticipants]);

  const activeViewerCount = useMemo(() => {
    return new Set(
      roomParticipants
        .filter(
          (participant) =>
            participant.isInCall && participant.sessionMode === "stream_viewer",
        )
        .map((participant) => participant.userId),
    ).size;
  }, [roomParticipants]);

  const displayMembers = useMemo(() => {
    if (!group) return [];
    return groupMembers.map((member) => {
      // Find active WebRTC session info
      let participant = roomParticipants.find(
        (p) => p.userId === member.userId,
      );
      // Fallback persistent stream host mapping (ignore if stale for current user)
      const isStaleStreamHost =
        group.roomState?.streamHostUserId === group.currentUserId &&
        !callJoined;
      if (
        !participant &&
        group.roomState?.streamHostUserId === member.userId &&
        !isStaleStreamHost
      ) {
        participant = {
          userId: member.userId,
          name: member.name,
          username: member.username,
          isInCall: true,
          sessionMode: "stream_host",
          socketId: "",
          audioEnabled: true,
          videoEnabled: true,
          isScreenSharing: false,
        };
      }

      // Socket presence is the freshest signal. Persisted presence can lag behind by a refresh.
      const presence =
        roomPresenceOverrides[member.userId] ||
        group.roomPresence.find((p) => p.userId === member.userId);
      const status = participant ? "active" : (presence?.status ?? "offline");

      return {
        userId: member.userId,
        name: member.name,
        username: member.username,
        avatarUrl: member.avatarUrl,
        role: member.role,
        // WebRTC call state
        isInCall: participant?.isInCall ?? false,
        sessionMode: participant?.sessionMode ?? null,
        // Presence state
        status,
      };
    });
  }, [
    group,
    groupMembers,
    roomParticipants,
    roomPresenceOverrides,
    callJoined,
  ]);

  const roomPresenceCount = useMemo(() => {
    const connectedUsers = new Set(
      roomParticipants.map((participant) => participant.userId),
    );
    if (connectedUsers.size > 0) {
      return connectedUsers.size;
    }

    return displayMembers.filter(
      (member) =>
        member.isInCall ||
        member.status === "active" ||
        member.status === "focused",
    ).length;
  }, [displayMembers, roomParticipants]);

  useEffect(() => {
    void loadGroup();
    void loadItems();
    void loadCollections();
    void loadCustomTemplates();
  }, [groupId]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as HTMLElement;
      if (
        timerOptionsOpen &&
        !target.closest(".timer-options-dropdown") &&
        !target.closest(".timer-options-btn")
      ) {
        setTimerOptionsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [timerOptionsOpen]);

  // Self-heal stale streamHostUserId in the database on load/mount
  useEffect(() => {
    if (
      group &&
      isHost &&
      group.roomState?.streamHostUserId === group.currentUserId &&
      !callJoined &&
      !callJoining
    ) {
      console.log("[Stream] Self-healing stale streamHostUserId in DB...");
      void syncRoomState({ streamHostUserId: null }, false);
    }
  }, [group, isHost, callJoined, callJoining]);

  // Detect secure context, Brave browser, and media permissions on mount
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 1024);
      setWindowWidth(window.innerWidth);
    };

    const detectEnvironment = async () => {
      // Mobile detection
      setIsMobile(window.innerWidth < 1024);
      setWindowWidth(window.innerWidth);

      // Brave detection
      const nav = navigator as any;
      if (nav.brave && typeof nav.brave.isBrave === "function") {
        try {
          const isBrave = await nav.brave.isBrave();
          setIsBraveBrowser(isBrave);
        } catch {
          setIsBraveBrowser(false);
        }
      }

      // Media debug info
      const info: typeof mediaDebugInfo = {
        isSecureContext: window.isSecureContext,
        hasMediaDevices: !!navigator.mediaDevices,
        permissionCamera: "unknown",
        permissionMic: "unknown",
        streamActive: false,
        peerDetails: {},
        remoteVideoTrackCount: 0,
        remoteAudioTrackCount: 0,
        receiverVideoBytes: 0,
        receiverFramesDecoded: 0,
      };

      console.log("[StudyRoom] Environment Audit:", {
        isSecureContext: window.isSecureContext,
        hasMediaDevices: !!navigator.mediaDevices,
        userAgent: navigator.userAgent,
        protocol: window.location.protocol,
      });

      if (navigator.permissions) {
        try {
          const cam = await navigator.permissions.query({
            name: "camera" as PermissionName,
          });
          info.permissionCamera = cam.state;
          console.log("[StudyRoom] Camera Permission State:", cam.state);
          cam.onchange = () => {
            console.log("[StudyRoom] Camera Permission CHANGED:", cam.state);
            setMediaDebugInfo((prev) =>
              prev ? { ...prev, permissionCamera: cam.state } : null,
            );
          };
        } catch (e) {
          console.warn("[StudyRoom] Camera permission query not supported", e);
        }
        try {
          const mic = await navigator.permissions.query({
            name: "microphone" as PermissionName,
          });
          info.permissionMic = mic.state;
          console.log("[StudyRoom] Microphone Permission State:", mic.state);
          mic.onchange = () => {
            console.log(
              "[StudyRoom] Microphone Permission CHANGED:",
              mic.state,
            );
            setMediaDebugInfo((prev) =>
              prev ? { ...prev, permissionMic: mic.state } : null,
            );
          };
        } catch (e) {
          console.warn(
            "[StudyRoom] Microphone permission query not supported",
            e,
          );
        }
      }

      info.streamActive = !!(
        localMediaStreamRef.current &&
        localMediaStreamRef.current
          .getTracks()
          .some((t) => t.readyState === "live")
      );
      info.peerDetails = {};
      setMediaDebugInfo(info);
    };

    void detectEnvironment();
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  // Keep mediaDebugInfo.streamActive in sync with actual stream state
  useEffect(() => {
    const isActive = !!(
      localMediaStreamRef.current &&
      localMediaStreamRef.current
        .getTracks()
        .some((t) => t.readyState === "live")
    );
    setMediaDebugInfo((prev) =>
      prev ? { ...prev, streamActive: isActive } : null,
    );
  }, [callJoined, audioEnabled, videoEnabled]);

  useEffect(() => {
    if (!callJoined) {
      setMediaDebugInfo((prev) =>
        prev
          ? {
            ...prev,
            remoteVideoTrackCount: 0,
            remoteAudioTrackCount: 0,
            receiverVideoBytes: 0,
            receiverFramesDecoded: 0,
          }
          : prev,
      );
      return;
    }

    const updateReceiverStats = async () => {
      let remoteVideoTrackCount = 0;
      let remoteAudioTrackCount = 0;
      let receiverVideoBytes = 0;
      let receiverFramesDecoded = 0;

      for (const stream of remoteMediaStreamsRef.current.values()) {
        remoteVideoTrackCount += stream.getVideoTracks().length;
        remoteAudioTrackCount += stream.getAudioTracks().length;
      }

      for (const peerConnection of peerConnectionsRef.current.values()) {
        for (const receiver of peerConnection.getReceivers()) {
          if (
            receiver.track.kind !== "video" ||
            typeof receiver.getStats !== "function"
          ) {
            continue;
          }

          const stats = await receiver.getStats();
          stats.forEach((report) => {
            if (
              report.type === "inbound-rtp" &&
              (report.kind === "video" || report.mediaType === "video")
            ) {
              receiverVideoBytes += Number(report.bytesReceived ?? 0);
              receiverFramesDecoded += Number(report.framesDecoded ?? 0);
            }
          });
        }
      }

      setMediaDebugInfo((prev) =>
        prev
          ? {
            ...prev,
            remoteVideoTrackCount,
            remoteAudioTrackCount,
            receiverVideoBytes,
            receiverFramesDecoded,
          }
          : prev,
      );
    };

    void updateReceiverStats();
    const interval = window.setInterval(() => {
      void updateReceiverStats();
    }, 1000);

    return () => window.clearInterval(interval);
  }, [callJoined]);

  useEffect(() => {
    didHydrateRef.current = true;
  }, [groupId]);

  useEffect(() => {
    if (!group || !didHydrateRef.current) {
      return;
    }

    currentUserIdRef.current = group.currentUserId;

    const storageKey = `study-room:${groupId}`;
    const payload: StoredRoomState = { lastSyncedAt: new Date().toISOString() };
    window.localStorage.setItem(storageKey, JSON.stringify(payload));
  }, [group, groupId]);

  useEffect(() => {
    let cancelled = false;
    let fallbackSource: EventSource | null = null;

    const attachFallbackSse = () => {
      const source = new EventSource(
        `/api/study-groups/${groupId}/room/stream`,
      );
      liveSourceRef.current = source;
      fallbackSource = source;

      source.addEventListener("connected", () => {
        setLiveStatus("live");
      });

      source.addEventListener("room_update", () => {
        setLiveStatus("live");
        scheduleRefreshGroup();
      });

      source.onerror = () => {
        setLiveStatus("offline");
      };
    };

    const connectSocket = async () => {
      setLiveStatus("connecting");
      try {
        const socketToken = await readJson<StudyRoomSocketTokenResponse>(
          await fetch(`/api/study-groups/${groupId}/room/socket-token`, {
            cache: "no-store",
          }),
        );
        if (cancelled) {
          return;
        }

        const socket = io({
          path: "/api/study-room/socket/io",
          auth: { token: socketToken.token },
          query: {
            token: socketToken.token,
          },
          transports: ["polling", "websocket"],
          withCredentials: true,
          upgrade: true,
          tryAllTransports: true,
          forceNew: true,
          rememberUpgrade: false,
          reconnection: true,
          reconnectionAttempts: 8,
          timeout: 20000,
        });
        socketRef.current = socket;

        socket.on("connect", () => {
          setSocketConnected(true);
          setLiveStatus("live");
        });

        socket.on(
          "room:connected",
          (payload: { socketId: string; userId: string }) => {
            console.log(`[StudyRoom] Socket connected to room: ${groupId}`, {
              socketId: payload.socketId,
              userId: payload.userId,
            });
            setRoomSocketId(payload.socketId);
            setLiveStatus("live");
          },
        );

        socket.on(
          "room:presence-snapshot",
          (payload: {
            participants: Array<{
              userId: string;
              name: string | null;
              username: string | null;
              status: "active";
              updatedAt: string;
            }>;
          }) => {
            setRoomPresenceOverrides((current) => {
              const next = { ...current };
              for (const participant of payload.participants) {
                next[participant.userId] = participant;
              }
              return next;
            });
          },
        );

        socket.on(
          "room:update",
          (payload: {
            payloadType?: "state" | "presence";
            actorUserId?: string | null;
            updatedAt?: string | null;
          }) => {
            setLiveStatus("live");
            if (payload?.payloadType === "presence") {
              return;
            }
            if (
              payload?.actorUserId &&
              payload.actorUserId === currentUserIdRef.current
            ) {
              return;
            }
            scheduleRefreshGroup();
          },
        );

        socket.on("room:presence", (payload: RoomPresenceOverride) => {
          setLiveStatus("live");
          setRoomPresenceOverrides((current) => ({
            ...current,
            [payload.userId]: payload,
          }));
        });

        socket.on(
          "room:participants",
          (payload: { participants: RoomCallParticipant[] }) => {
            console.log(
              `[StudyRoom] Received participants snapshot. Count: ${payload.participants.length}`,
            );
            setRoomParticipants(payload.participants);
          },
        );

        socket.on("call:participant-left", (payload: { socketId: string }) => {
          removePeerConnection(payload.socketId);
        });

        socket.on(
          "webrtc:signal",
          (payload: {
            sourceSocketId: string;
            description?: RTCSessionDescriptionInit | null;
            candidate?: RTCIceCandidateInit | null;
          }) => {
            void handleIncomingSignal(payload);
          },
        );

        socket.on("disconnect", () => {
          setSocketConnected(false);
          setLiveStatus((current) =>
            current === "offline" ? "offline" : "reconnecting",
          );
        });

        socket.on("connect_error", () => {
          setSocketConnected(false);
          setLiveStatus("reconnecting");
          if (!fallbackSource) {
            attachFallbackSse();
          }
        });
      } catch {
        attachFallbackSse();
      }
    };

    void connectSocket();

    return () => {
      cancelled = true;
      if (refreshTimeoutRef.current !== null) {
        window.clearTimeout(refreshTimeoutRef.current);
        refreshTimeoutRef.current = null;
      }
      socketRef.current?.disconnect();
      socketRef.current = null;
      setSocketConnected(false);
      fallbackSource?.close();
      if (liveSourceRef.current === fallbackSource) {
        liveSourceRef.current = null;
      }
    };
  }, [groupId]);

  useEffect(() => {
    if (!group) {
      return;
    }

    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void refreshGroup(false);
      }
    }, 60000);

    return () => window.clearInterval(interval);
  }, [group?.id]);

  useEffect(() => {
    const getPresenceStatus = () =>
      document.visibilityState === "hidden"
        ? "away"
        : status === "running"
          ? "focused"
          : "active";

    const sendPresence = (announceError = false) => {
      const nextStatus = getPresenceStatus();
      const currentUserId = currentUserIdRef.current;
      if (currentUserId) {
        const member = groupRef.current?.members?.find(
          (m) => m.userId === currentUserId,
        );
        setRoomPresenceOverrides((current) => ({
          ...current,
          [currentUserId]: {
            userId: currentUserId,
            name: member?.name ?? null,
            username: member?.username ?? null,
            avatarUrl: member?.avatarUrl ?? null,
            status: nextStatus,
            updatedAt: new Date().toISOString(),
          },
        }));
      }

      void syncRoomState(
        {
          payloadType: "presence",
          presenceStatus: nextStatus,
        },
        announceError,
      );
    };

    const sendAwayKeepalive = () => {
      const currentUserId = currentUserIdRef.current;
      if (currentUserId) {
        const member = groupRef.current?.members?.find(
          (m) => m.userId === currentUserId,
        );
        setRoomPresenceOverrides((current) => ({
          ...current,
          [currentUserId]: {
            userId: currentUserId,
            name: member?.name ?? null,
            username: member?.username ?? null,
            avatarUrl: member?.avatarUrl ?? null,
            status: "away",
            updatedAt: new Date().toISOString(),
          },
        }));
      }

      void fetch(`/api/study-groups/${groupId}/room`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payloadType: "presence",
          presenceStatus: "away",
        }),
        keepalive: true,
      }).catch(() => undefined);
    };

    sendPresence();
    const interval = window.setInterval(sendPresence, 45000);
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") {
        sendAwayKeepalive();
        return;
      }
      sendPresence();
    };
    const handleFocus = () => sendPresence();
    const handleBlur = () => sendPresence();
    const handlePageHide = () => sendAwayKeepalive();

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", handleFocus);
    window.addEventListener("blur", handleBlur);
    window.addEventListener("pagehide", handlePageHide);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("pagehide", handlePageHide);
    };
  }, [groupId, status]);

  useEffect(() => {
    if (status !== "running" || !timerEndsAt) {
      return;
    }

    const timerKey = timerEndsAt.toISOString();

    const interval = window.setInterval(() => {
      const remaining = Math.max(
        0,
        Math.ceil((timerEndsAt.getTime() - Date.now()) / 1000),
      );
      setTimeLeft(remaining);
      if (remaining === 0) {
        window.clearInterval(interval);
        if (completedTimerRef.current === timerKey) {
          return;
        }
        completedTimerRef.current = timerKey;

        playTimerSound();

        if (mode === "focus") {
          const breakSeconds = breakMinutes * 60;
          const nextEndsAt = new Date(
            Date.now() + breakSeconds * 1000,
          ).toISOString();

          applyLocalRoomStatePatch({
            mode: "break",
            status: "running",
            timeLeftSeconds: breakSeconds,
            timerEndsAt: nextEndsAt,
          });

          void syncRoomState(
            {
              mode: "break",
              status: "running",
              timeLeftSeconds: breakSeconds,
              timerEndsAt: nextEndsAt,
              activityType: "status",
              activityLabel: "Completed focus block",
              activityDetail: `Automatically started ${breakMinutes} minute break.`,
            },
            false,
          );

          toast.success("Focus block complete! Starting break...");
        } else {
          const focusSeconds = focusMinutes * 60;

          applyLocalRoomStatePatch({
            mode: "focus",
            status: "idle",
            timeLeftSeconds: focusSeconds,
            timerEndsAt: null,
          });

          void syncRoomState(
            {
              mode: "focus",
              status: "idle",
              timeLeftSeconds: focusSeconds,
              timerEndsAt: null,
              activityType: "status",
              activityLabel: "Completed break block",
              activityDetail: "Ready for next focus block.",
            },
            false,
          );

          toast.success("Break complete! Ready to focus.");
        }
      }
    }, 1000);

    return () => window.clearInterval(interval);
  }, [mode, status, timerEndsAt, focusMinutes, breakMinutes]);

  useEffect(() => {
    if (!group || !group.roomState) {
      return;
    }

    const roomState = group.roomState;
    setMode(roomState.mode);
    setStatus(roomState.status);
    setFocusMinutes(roomState.focusMinutes);
    setBreakMinutes(roomState.breakMinutes);
    setSelectedTemplateId(roomState.template?.id ?? "general");
    setCustomTemplateLabel(roomState.template?.label ?? group.title);
    setCustomTemplateDescription(
      roomState.template?.description ??
      "Reusable room setup saved from this session.",
    );
    setSessionPrompt(roomState.sessionPrompt ?? "");
    setSessionNote(roomState.sessionNote ?? "");
    setSessionOutcomes(
      roomState.sessionOutcomes ?? {
        completedThisBlock: [],
        carryForward: [],
        blockers: [],
      },
    );
    setTasks(roomState.tasks ?? []);
    setCollectionTakeaways(roomState.collectionTakeaways ?? []);
    setItemNotes(roomState.itemNotes ?? []);
    setActiveCollectionItemId(roomState.activeCollectionItemId ?? null);
    setCompletedCollectionItemIds(roomState.completedCollectionItemIds ?? []);
    const nextTimerEndsAt = roomState.timerEndsAt
      ? new Date(roomState.timerEndsAt)
      : null;
    setTimerEndsAt(nextTimerEndsAt);
    if (roomState.status === "running" && nextTimerEndsAt) {
      const remaining = Math.max(
        0,
        Math.ceil((nextTimerEndsAt.getTime() - Date.now()) / 1000),
      );
      setTimeLeft(remaining);
      if (remaining > 0) {
        completedTimerRef.current = null;
      }
    } else {
      setTimeLeft(roomState.timeLeftSeconds);
      if (!nextTimerEndsAt) {
        completedTimerRef.current = null;
      }
    }
  }, [group]);

  useEffect(() => {
    syncLocalVideoTrack();
  }, [callJoined, videoEnabled]);

  useEffect(() => {
    if (!callJoined || callSessionMode !== "conference") {
      setNoPeersTimeout(false);
      return;
    }

    const timer = setTimeout(() => {
      if (connectedPeers.size === 0) {
        setNoPeersTimeout(true);
      }
    }, 5000);

    return () => clearTimeout(timer);
  }, [callJoined, connectedPeers.size, callSessionMode]);

  useEffect(() => {
    return () => {
      leaveRoomCall();
      liveSourceRef.current?.close();
      socketRef.current?.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!activityModalOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setActivityModalOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activityModalOpen]);

  useEffect(() => {
    void syncPeerConnections();
  }, [callJoined, callSessionMode, roomParticipants, roomSocketId]);

  useEffect(() => {
    if (!socketConnected || !roomSocketId || !callJoined || !callSessionMode) {
      return;
    }

    socketRef.current?.emit("call:update-session", {
      sessionMode: callSessionMode,
      audioEnabled,
      videoEnabled,
      isScreenSharing: isSharingScreen,
    });
  }, [
    audioEnabled,
    callJoined,
    callSessionMode,
    isSharingScreen,
    roomSocketId,
    socketConnected,
    videoEnabled,
  ]);

  async function loadGroup() {
    try {
      setLoading(true);
      setError(null);
      const data = await readJson<StudyGroupRecord>(
        await fetch(`/api/study-groups/${groupId}`, { cache: "no-store" }),
      );
      setGroup(data);
    } catch (loadError) {
      setError((loadError as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function refreshGroup(announceError = true) {
    const currentSyncId = syncCounterRef.current;
    try {
      const data = await readJson<StudyGroupRecord>(
        await fetch(`/api/study-groups/${groupId}`, { cache: "no-store" }),
      );

      if (currentSyncId === syncCounterRef.current) {
        setGroup(data);
      }
      setRoomPresenceOverrides({});
      setError(null);
      setLiveStatus((current) => (current === "offline" ? "offline" : "live"));
    } catch (refreshError) {
      setLiveStatus((current) =>
        current === "connecting" ? "offline" : current,
      );
      if (announceError) {
        toast.error((refreshError as Error).message);
      }
    }
  }

  function scheduleRefreshGroup(delayMs = 120) {
    if (refreshTimeoutRef.current !== null) {
      window.clearTimeout(refreshTimeoutRef.current);
    }

    refreshTimeoutRef.current = window.setTimeout(() => {
      refreshTimeoutRef.current = null;
      void refreshGroup(false);
    }, delayMs);
  }

  async function loadItems() {
    try {
      setLoadingItems(true);
      const data = await readJson<ItemRecord[]>(
        await fetch("/api/items?sort=updated", { cache: "no-store" }),
      );
      setItems(data);
    } catch (loadError) {
      toast.error((loadError as Error).message);
    } finally {
      setLoadingItems(false);
    }
  }

  async function loadCollections() {
    try {
      setLoadingCollections(true);
      const data = await readJson<CollectionRecord[]>(
        await fetch("/api/collections", { cache: "no-store" }),
      );
      setCollections(data);
    } catch (loadError) {
      toast.error((loadError as Error).message);
    } finally {
      setLoadingCollections(false);
    }
  }

  async function loadCustomTemplates() {
    try {
      const data = await readJson<StudyRoomTemplatePreset[]>(
        await fetch("/api/study-room/templates", { cache: "no-store" }),
      );
      setCustomTemplates(data);
    } catch (loadError) {
      toast.error((loadError as Error).message);
    }
  }

  function detachVideoElement(key: string) {
    const element = attachedVideoElementsRef.current.get(key);
    element?.remove();
    attachedVideoElementsRef.current.delete(key);
    attachedVideoSignaturesRef.current.delete(key);
  }

  function getStreamSignature(stream: MediaStream | null) {
    if (!stream) {
      return "no-stream";
    }

    return stream
      .getTracks()
      .map(
        (track) =>
          `${track.kind}:${track.id}:${track.readyState}:${track.enabled}:${track.muted}`,
      )
      .sort()
      .join("|");
  }

  function attachVideoElement(
    key: string,
    container: HTMLDivElement | null,
    stream: MediaStream | null,
    muted = false,
  ) {
    const existingElement = attachedVideoElementsRef.current.get(key);
    const nextSignature = getStreamSignature(stream);
    const existingSignature = attachedVideoSignaturesRef.current.get(key);

    // Prevent flicker: if we already have the correct video element attached, don't recreate it
    if (
      existingElement &&
      existingElement.srcObject === stream &&
      existingSignature === nextSignature &&
      container &&
      container.contains(existingElement)
    ) {
      if (existingElement.muted !== muted) {
        existingElement.muted = muted;
      }
      void existingElement.play().catch(() => undefined);
      return;
    }

    detachVideoElement(key);
    if (!container) {
      return;
    }

    container.replaceChildren();
    if (!stream) {
      return;
    }

    const element = document.createElement("video");
    element.autoplay = true;
    element.defaultMuted = muted;
    element.playsInline = true;
    (element as any).autoPictureInPicture = true;
    element.setAttribute("autoplay", "true");
    element.setAttribute("playsinline", "true");
    element.setAttribute("webkit-playsinline", "true");
    element.setAttribute("autopictureinpicture", "true");
    element.muted = muted;
    element.className = `h-full w-full bg-black ${key === "focus-main"
      ? "study-focus-video object-contain"
      : "study-tile-video object-cover"
      }`;
    element.style.setProperty("transform", "none", "important");
    element.style.setProperty("-webkit-transform", "none", "important");
    element.srcObject = stream;
    const replay = () => {
      void element.play().catch((error) => {
        console.warn(`[StudyRoom] Video autoplay failed for ${key}`, error);
      });
    };
    element.onloadedmetadata = replay;
    element.oncanplay = replay;
    element.onplaying = () => {
      attachedVideoSignaturesRef.current.set(key, nextSignature);
    };
    container.appendChild(element);
    attachedVideoElementsRef.current.set(key, element);
    attachedVideoSignaturesRef.current.set(key, nextSignature);
    replay();
    window.setTimeout(replay, 150);
    window.setTimeout(replay, 600);
    window.setTimeout(replay, 1400);
    console.log(`[StudyRoom] Stream attached to video element: ${key}`, {
      streamId: stream.id,
      muted,
    });
  }

  function getPeerConfig(): RTCConfiguration {
    const turnUrlsRaw = process.env.NEXT_PUBLIC_TURN_URLS ?? "";
    const turnUrls = turnUrlsRaw
      .split(/[,\s]+/)
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
    const turnUsername = process.env.NEXT_PUBLIC_TURN_USERNAME ?? "";
    const turnCredential = process.env.NEXT_PUBLIC_TURN_CREDENTIAL ?? "";
    const forceRelayOnly =
      (process.env.NEXT_PUBLIC_FORCE_RELAY_ONLY ?? "").toLowerCase() === "true";

    const iceServers: RTCIceServer[] = [
      {
        urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"],
      },
    ];

    if (turnUrls.length > 0 && turnUsername && turnCredential) {
      iceServers.push({
        urls: turnUrls,
        username: turnUsername,
        credential: turnCredential,
      });
    }

    return {
      iceServers,
      iceTransportPolicy: forceRelayOnly ? "relay" : "all",
    };
  }

  function applyMobileSafeCodecPreferences(peerConnection: RTCPeerConnection) {
    const capabilities = RTCRtpReceiver.getCapabilities?.("video");
    if (!capabilities?.codecs?.length) {
      return;
    }

    const scoreCodec = (mimeType: string) => {
      const lower = mimeType.toLowerCase();
      if (lower.includes("h264")) return 3;
      if (lower.includes("vp8")) return 2;
      if (lower.includes("vp9")) return 1;
      return 0;
    };

    const preferredCodecs = [...capabilities.codecs].sort(
      (a, b) => scoreCodec(b.mimeType) - scoreCodec(a.mimeType),
    );

    for (const transceiver of peerConnection.getTransceivers()) {
      if (
        transceiver.receiver.track.kind === "video" &&
        typeof transceiver.setCodecPreferences === "function"
      ) {
        transceiver.setCodecPreferences(preferredCodecs);
      }
    }
  }

  async function tuneScreenShareSender(sender: RTCRtpSender) {
    if (!sender.track || sender.track.kind !== "video") {
      return;
    }

    try {
      const parameters = sender.getParameters();
      parameters.encodings = parameters.encodings?.length
        ? parameters.encodings
        : [{}];
      parameters.encodings[0] = {
        ...parameters.encodings[0],
        maxBitrate: 1_500_000,
        maxFramerate: 30,
        scaleResolutionDownBy: 1,
      };
      (
        parameters as RTCRtpSendParameters & { degradationPreference?: string }
      ).degradationPreference = "maintain-framerate";
      await sender.setParameters(parameters);
    } catch (error) {
      console.warn("[ScreenShare] Could not tune sender parameters", error);
    }
  }

  function syncLocalVideoTrack() {
    const stream = localMediaStreamRef.current;
    attachVideoElement(
      "local",
      localVideoContainerRef.current,
      stream && stream.getTracks().length > 0 ? stream : null,
      true,
    );
  }

  function syncRemoteVideoTrack(userId: string) {
    attachVideoElement(
      `remote:${userId}`,
      remoteVideoContainersRef.current.get(userId) ?? null,
      remoteMediaStreamsRef.current.get(userId) ?? null,
    );
  }

  function shouldConnectToParticipant(participant: RoomCallParticipant) {
    if (
      !callJoined ||
      !callSessionMode ||
      participant.socketId === roomSocketId ||
      !participant.isInCall
    ) {
      return false;
    }

    if (callSessionMode === "conference") {
      return participant.sessionMode === "conference";
    }

    if (callSessionMode === "stream_host") {
      return participant.sessionMode === "stream_viewer";
    }

    return participant.sessionMode === "stream_host";
  }

  function shouldInitiateConnection(remoteSocketId: string) {
    if (!roomSocketId) {
      return false;
    }
    if (callSessionMode === "stream_host") {
      return true;
    }
    if (callSessionMode === "stream_viewer") {
      return false;
    }
    return roomSocketId.localeCompare(remoteSocketId) < 0;
  }

  function getOrCreateLocalStream() {
    if (!localMediaStreamRef.current) {
      localMediaStreamRef.current = new MediaStream();
    }
    return localMediaStreamRef.current;
  }

  function getPeerSenderForKind(
    peerConnection: RTCPeerConnection,
    kind: "audio" | "video",
  ) {
    return (
      peerConnection
        .getTransceivers()
        .find((transceiver) => transceiver.receiver.track.kind === kind)
        ?.sender ??
      peerConnection
        .getSenders()
        .find((sender) => sender.track?.kind === kind) ??
      null
    );
  }

  async function replacePeerSenderTrack(
    peerConnection: RTCPeerConnection,
    kind: "audio" | "video",
    track: MediaStreamTrack | null,
  ) {
    const primarySender = getPeerSenderForKind(peerConnection, kind);
    if (!primarySender) {
      return null;
    }

    await primarySender.replaceTrack(track);
    if (kind === "video" && track) {
      await tuneScreenShareSender(primarySender);
    }

    await Promise.all(
      peerConnection
        .getSenders()
        .filter(
          (sender) => sender !== primarySender && sender.track?.kind === kind,
        )
        .map((sender) => sender.replaceTrack(null).catch(() => undefined)),
    );

    return primarySender;
  }

  function updateRemoteStream(socketId: string, stream: MediaStream) {
    const nextStream = new MediaStream(stream.getTracks());
    remoteMediaStreamsRef.current.set(socketId, nextStream);
    syncRemoteVideoTrack(socketId);
    syncMainVideoTrackRef.current();

    // Trigger SpeechDetector on remote stream update
    const participant = store.get("roomParticipants")?.find((p: any) => p.socketId === socketId);
    speechDetector.updateRemoteSpeechDetection(
      socketId,
      participant ? participant.audioEnabled : false,
      nextStream
    );
  }

  function removePeerConnection(socketId: string) {
    const peerConnection = peerConnectionsRef.current.get(socketId);
    if (peerConnection) {
      peerConnection.onicecandidate = null;
      peerConnection.ontrack = null;
      peerConnection.onconnectionstatechange = null;
      peerConnection.close();
      peerConnectionsRef.current.delete(socketId);
    }
    pendingIceCandidatesRef.current.delete(socketId);

    setConnectedPeers((current) => {
      const next = new Set(current);
      next.delete(socketId);
      return next;
    });

    remoteMediaStreamsRef.current.delete(socketId);
    detachVideoElement(`remote:${socketId}`);
    syncMainVideoTrackRef.current();

    // Stop SpeechDetector for disconnected peer
    speechDetector.stop(socketId);
  }

  function resetLocalStream() {
    const stream = localMediaStreamRef.current;
    if (!stream) {
      return;
    }

    for (const track of stream.getTracks()) {
      track.stop();
    }
    localMediaStreamRef.current = null;
    detachVideoElement("local");

    // Stop SpeechDetector for local stream reset
    speechDetector.stop("local");
  }

  async function renegotiatePeer(socketId: string) {
    const peerConnection = peerConnectionsRef.current.get(socketId);
    if (!peerConnection) {
      return;
    }

    console.log(`[WebRTC] Creating OFFER for: ${socketId}`);
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    socketRef.current?.emit("webrtc:signal", {
      targetSocketId: socketId,
      description: peerConnection.localDescription,
    });
  }

  function ensurePeerConnection(socketId: string) {
    const existing = peerConnectionsRef.current.get(socketId);
    if (existing) {
      return { peerConnection: existing, isNew: false };
    }

    console.log(`[WebRTC] Creating PeerConnection for: ${socketId}`);
    const peerConnection = new RTCPeerConnection(getPeerConfig());
    const remoteStream = new MediaStream();
    updateRemoteStream(socketId, remoteStream);

    peerConnection.onicecandidate = (event) => {
      if (!event.candidate) {
        console.log(`[WebRTC] ICE gathering complete for: ${socketId}`);
        return;
      }

      console.log(`[WebRTC] Sending ICE candidate to: ${socketId}`);
      socketRef.current?.emit("webrtc:signal", {
        targetSocketId: socketId,
        candidate: event.candidate.toJSON(),
      });
    };

    peerConnection.ontrack = (event) => {
      console.log(`[WebRTC] Received REMOTE TRACK from: ${socketId}`, {
        kind: event.track.kind,
      });
      const incomingTracks = event.streams[0]?.getTracks() ?? [event.track];
      for (const track of incomingTracks) {
        if (track.kind === "video") {
          // Keep only the newest remote video track to avoid stale/black tracks on renegotiation.
          for (const existingVideoTrack of remoteStream.getVideoTracks()) {
            if (existingVideoTrack.id !== track.id) {
              remoteStream.removeTrack(existingVideoTrack);
            }
          }
        }

        const alreadyPresent = remoteStream
          .getTracks()
          .some((candidate) => candidate.id === track.id);
        if (!alreadyPresent) {
          console.log(
            `[WebRTC] Adding track to remote stream: ${track.kind} (${track.id})`,
          );
          remoteStream.addTrack(track);
        }

        if (track.kind === "video") {
          track.onunmute = () => {
            updateRemoteStream(socketId, remoteStream);
          };
          track.onmute = () => {
            updateRemoteStream(socketId, remoteStream);
          };
        }
      }
      updateRemoteStream(socketId, remoteStream);
    };

    peerConnection.onconnectionstatechange = () => {
      const state = peerConnection.connectionState;
      console.log(`[WebRTC] Connection state for ${socketId}: ${state}`);

      setMediaDebugInfo((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          peerDetails: {
            ...prev.peerDetails,
            [socketId]: {
              ...prev.peerDetails[socketId],
              connectionState: state,
              iceState: peerConnection.iceGatheringState,
            },
          },
        };
      });

      if (state === "connected") {
        setConnectedPeers((current) => new Set(current).add(socketId));
        setNoPeersTimeout(false);
      } else if (
        state === "disconnected" ||
        state === "failed" ||
        state === "closed"
      ) {
        setConnectedPeers((current) => {
          const next = new Set(current);
          next.delete(socketId);
          return next;
        });

        if (
          (state === "disconnected" || state === "failed") &&
          shouldInitiateConnection(socketId)
        ) {
          window.setTimeout(() => {
            const currentPeer = peerConnectionsRef.current.get(socketId);
            if (
              currentPeer &&
              currentPeer.connectionState !== "connected" &&
              currentPeer.signalingState === "stable"
            ) {
              console.log(`[WebRTC] Retrying negotiation for: ${socketId}`);
              void renegotiatePeer(socketId);
            }
          }, 400);
        }
      }
    };

    const direction =
      callSessionMode === "stream_host"
        ? "sendonly"
        : callSessionMode === "stream_viewer"
          ? "recvonly"
          : "sendrecv";

    peerConnection.addTransceiver("audio", { direction });
    peerConnection.addTransceiver("video", { direction });
    applyMobileSafeCodecPreferences(peerConnection);

    const localStream = localMediaStreamRef.current;
    const audioTrack = audioEnabled
      ? (localStream?.getAudioTracks()[0] ?? null)
      : null;
    const screenVideoTrack =
      screenStreamRef.current?.getVideoTracks()[0] ?? null;
    const cameraVideoTrack = videoEnabled
      ? (localStream?.getVideoTracks()[0] ?? null)
      : null;
    const videoTrack = isSharingScreen ? screenVideoTrack : cameraVideoTrack;

    void replacePeerSenderTrack(peerConnection, "audio", audioTrack);
    void replacePeerSenderTrack(peerConnection, "video", videoTrack);

    peerConnectionsRef.current.set(socketId, peerConnection);
    return { peerConnection, isNew: true };
  }

  async function syncPeerConnections() {
    if (!callJoined || !callSessionMode) {
      return;
    }

    const wantedParticipants = roomParticipants.filter(
      shouldConnectToParticipant,
    );
    const wantedSocketIds = new Set(wantedParticipants.map((p) => p.socketId));

    console.log(
      `[WebRTC] Syncing connections. Wanted: ${wantedParticipants.length}`,
      {
        wanted: wantedParticipants.map((p) => p.name || p.socketId),
      },
    );

    for (const socketId of peerConnectionsRef.current.keys()) {
      if (!wantedSocketIds.has(socketId)) {
        console.log(`[WebRTC] Removing stale connection: ${socketId}`);
        removePeerConnection(socketId);
      }
    }

    for (const socketId of wantedSocketIds) {
      const { isNew } = ensurePeerConnection(socketId);
      if (isNew) {
        const isInitiator = shouldInitiateConnection(socketId);
        console.log(
          `[WebRTC] PeerConnection sync for: ${socketId}. Initiator: ${isInitiator}`,
        );
        if (isInitiator) {
          await renegotiatePeer(socketId);
        }
      }
    }
  }

  async function handleIncomingSignal(payload: {
    sourceSocketId: string;
    description?: RTCSessionDescriptionInit | null;
    candidate?: RTCIceCandidateInit | null;
  }) {
    const { peerConnection } = ensurePeerConnection(payload.sourceSocketId);

    if (payload.description) {
      console.log(
        `[WebRTC] Received SIGNAL (${payload.description.type}) from: ${payload.sourceSocketId}`,
      );
      await peerConnection.setRemoteDescription(
        new RTCSessionDescription(payload.description),
      );
      const pendingCandidates =
        pendingIceCandidatesRef.current.get(payload.sourceSocketId) ?? [];
      if (pendingCandidates.length > 0) {
        console.log(
          `[WebRTC] Flushing ${pendingCandidates.length} queued ICE candidates for: ${payload.sourceSocketId}`,
        );
        for (const candidate of pendingCandidates) {
          try {
            await peerConnection.addIceCandidate(
              new RTCIceCandidate(candidate),
            );
          } catch (error) {
            console.warn(
              `[WebRTC] Failed to flush queued ICE candidate for: ${payload.sourceSocketId}`,
              error,
            );
          }
        }
        pendingIceCandidatesRef.current.delete(payload.sourceSocketId);
      }
      if (payload.description.type === "offer") {
        console.log(`[WebRTC] Creating ANSWER for: ${payload.sourceSocketId}`);
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        socketRef.current?.emit("webrtc:signal", {
          targetSocketId: payload.sourceSocketId,
          description: peerConnection.localDescription,
        });
      }
    }

    if (payload.candidate) {
      console.log(
        `[WebRTC] Received ICE candidate from: ${payload.sourceSocketId}`,
      );
      if (!peerConnection.remoteDescription) {
        const queue =
          pendingIceCandidatesRef.current.get(payload.sourceSocketId) ?? [];
        queue.push(payload.candidate);
        pendingIceCandidatesRef.current.set(payload.sourceSocketId, queue);
        console.log(
          `[WebRTC] Queued ICE candidate until remote description is set for: ${payload.sourceSocketId}`,
        );
        return;
      }
      try {
        await peerConnection.addIceCandidate(
          new RTCIceCandidate(payload.candidate),
        );
      } catch (error) {
        console.warn(
          `[WebRTC] Failed to add ICE candidate for: ${payload.sourceSocketId}`,
          error,
        );
      }
    }
  }

  async function ensureMediaKind(kind: "audio" | "video") {
    const stream = getOrCreateLocalStream();
    const existingTrack =
      kind === "audio"
        ? (stream.getAudioTracks()[0] ?? null)
        : (stream.getVideoTracks()[0] ?? null);
    if (existingTrack && existingTrack.readyState === "live") {
      existingTrack.enabled = true;
      if (kind === "video") {
        syncLocalVideoTrack();
      }
      return;
    }
    // If the track exists but has ended (was stopped), remove it so we get a fresh one
    if (existingTrack && existingTrack.readyState === "ended") {
      stream.removeTrack(existingTrack);
    }

    console.log(
      `[StudyRoom] Requesting media: ${kind}. Secure Context: ${window.isSecureContext}`,
    );

    try {
      const media = await navigator.mediaDevices.getUserMedia({
        audio: kind === "audio",
        video: kind === "video",
      });
      console.log(`[StudyRoom] Media SUCCESS: ${kind}`, {
        tracks: media
          .getTracks()
          .map((t) => ({ kind: t.kind, label: t.label, enabled: t.enabled })),
        streamId: media.id,
      });

      const nextTrack =
        kind === "audio"
          ? media.getAudioTracks()[0]
          : media.getVideoTracks()[0];
      if (!nextTrack) {
        throw new Error(`No ${kind} track available.`);
      }

      stream.addTrack(nextTrack);
      syncLocalVideoTrack();

      for (const socketId of peerConnectionsRef.current.keys()) {
        const { peerConnection } = ensurePeerConnection(socketId);
        await replacePeerSenderTrack(peerConnection, kind, nextTrack);
        await renegotiatePeer(socketId);
      }
    } catch (err: any) {
      console.error(`[StudyRoom] Media FAILED: ${kind}`, {
        name: err.name,
        message: err.message,
        isSecureContext: window.isSecureContext,
      });
      if (
        err.name === "NotAllowedError" ||
        err.name === "PermissionDeniedError"
      ) {
        throw new Error(
          "Camera/Microphone blocked. Allow permissions and reload.",
        );
      }
      throw err;
    }
  }

  async function tryEnableMediaKind(kind: "audio" | "video") {
    try {
      await ensureMediaKind(kind);
      return { ok: true as const, error: null };
    } catch (error: any) {
      return { ok: false as const, error };
    }
  }

  const attachLocalVideoContainer = useCallback(
    (element: HTMLDivElement | null) => {
      if (element === null) {
        localVideoContainerRef.current = null;
        detachVideoElement("local");
        return;
      }
      if (localVideoContainerRef.current === element) return;

      localVideoContainerRef.current = element;
      syncLocalVideoTrack();
    },
    [],
  );

  const attachRemoteVideoContainer = useCallback(
    (userId: string, element: HTMLDivElement | null) => {
      if (element === null) {
        remoteVideoContainersRef.current.delete(userId);
        detachVideoElement(`remote:${userId}`);
        return;
      }
      if (remoteVideoContainersRef.current.get(userId) === element) return;

      remoteVideoContainersRef.current.set(userId, element);
      syncRemoteVideoTrack(userId);
    },
    [],
  );

  const getRemoteRefCallback = useCallback(
    (socketId: string) => {
      let cb = remoteRefCallbacks.current.get(socketId);
      if (!cb) {
        cb = (element: HTMLDivElement | null) => {
          attachRemoteVideoContainer(socketId, element);
        };
        remoteRefCallbacks.current.set(socketId, cb);
      }
      return cb;
    },
    [attachRemoteVideoContainer],
  );

  function clearScreenShareHealthMonitor() {
    if (screenShareStatsTimerRef.current !== null) {
      window.clearInterval(screenShareStatsTimerRef.current);
      screenShareStatsTimerRef.current = null;
    }
    setScreenShareHealth(null);
  }

  async function updateScreenShareHealth(track: MediaStreamTrack) {
    const settings = track.getSettings();
    let bytesSent = 0;
    let framesEncoded = 0;
    let packetsSent = 0;
    let outboundReports = 0;

    for (const peerConnection of peerConnectionsRef.current.values()) {
      for (const sender of peerConnection.getSenders()) {
        if (sender.track !== track || typeof sender.getStats !== "function") {
          continue;
        }

        const stats = await sender.getStats();
        stats.forEach((report) => {
          if (
            report.type === "outbound-rtp" &&
            (report.kind === "video" || report.mediaType === "video")
          ) {
            outboundReports += 1;
            bytesSent += Number(report.bytesSent ?? 0);
            framesEncoded += Number(report.framesEncoded ?? 0);
            packetsSent += Number(report.packetsSent ?? 0);
          }
        });
      }
    }

    setScreenShareHealth({
      readyState: track.readyState,
      enabled: track.enabled,
      muted: track.muted,
      width: settings.width,
      height: settings.height,
      frameRate: settings.frameRate,
      displaySurface:
        typeof settings.displaySurface === "string"
          ? settings.displaySurface
          : undefined,
      bytesSent,
      framesEncoded,
      packetsSent,
      outboundReports,
      updatedAt: Date.now(),
    });
  }

  function startScreenShareHealthMonitor(track: MediaStreamTrack) {
    clearScreenShareHealthMonitor();
    const refresh = () => {
      void updateScreenShareHealth(track);
    };

    refresh();
    screenShareStatsTimerRef.current = window.setInterval(refresh, 1500);
  }

  async function toggleScreenShare() {
    if (isSharingScreen) {
      stopScreenShare();
    } else {
      await startScreenShare();
    }
  }

  async function startScreenShare() {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen().catch(console.error);
      }
      console.log("[ScreenShare] Requesting display media...");
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: 960, max: 1280 },
          height: { ideal: 540, max: 720 },
          frameRate: { ideal: 30, max: 30 },
        } as MediaTrackConstraints,
        audio: false,
        selfBrowserSurface: "exclude",
        surfaceSwitching: "include",
        monitorTypeSurfaces: "include",
        preferCurrentTab: false,
        systemAudio: "exclude",
      } as ExtendedDisplayMediaStreamOptions);

      const screenVideoTrack = screenStream.getVideoTracks()[0];
      if (!screenVideoTrack) {
        throw new Error("No video track found in screen stream.");
      }
      (
        screenVideoTrack as MediaStreamTrack & { contentHint?: string }
      ).contentHint = "motion";
      await screenVideoTrack
        .applyConstraints({
          frameRate: { ideal: 30, max: 30 },
          width: { ideal: 960, max: 1280 },
          height: { ideal: 540, max: 720 },
        })
        .catch((error) => {
          console.warn(
            "[ScreenShare] Could not apply smoother capture constraints",
            error,
          );
        });
      console.log(
        "[ScreenShare] Display media selected",
        screenVideoTrack.getSettings(),
      );

      screenStreamRef.current = screenStream;
      setIsSharingScreen(true);
      startScreenShareHealthMonitor(screenVideoTrack);
      socketRef.current?.emit("call:update-session", {
        sessionMode: callSessionMode,
        audioEnabled: audioEnabled,
        videoEnabled: videoEnabled,
        isScreenSharing: true,
      });

      screenVideoTrack.onmute = () => {
        void updateScreenShareHealth(screenVideoTrack);
      };
      screenVideoTrack.onunmute = () => {
        void updateScreenShareHealth(screenVideoTrack);
      };
      screenVideoTrack.onended = () => {
        console.log("[ScreenShare] Screen track ended natively.");
        stopScreenShare();
      };

      for (const [
        socketId,
        peerConnection,
      ] of peerConnectionsRef.current.entries()) {
        console.log(
          `[ScreenShare] Replacing video track on sender for peer: ${socketId}`,
        );
        await replacePeerSenderTrack(peerConnection, "video", screenVideoTrack);
        await renegotiatePeer(socketId);
      }

      attachVideoElement(
        "local",
        localVideoContainerRef.current,
        screenStream,
        true,
      );

      toast.success("Sharing screen...");
    } catch (err) {
      console.error("[ScreenShare] Failed to start screen sharing:", err);
      toast.error("Screen share canceled or failed.");
      stopScreenShare();
    }
  }

  function stopScreenShare() {
    console.log("[ScreenShare] Stopping screen share...");

    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((track) => track.stop());
      screenStreamRef.current = null;
    }
    clearScreenShareHealthMonitor();

    setIsSharingScreen(false);
    socketRef.current?.emit("call:update-session", {
      sessionMode: callSessionMode,
      audioEnabled: audioEnabled,
      videoEnabled: videoEnabled,
      isScreenSharing: false,
    });

    const cameraVideoTrack =
      localMediaStreamRef.current?.getVideoTracks()[0] ?? null;

    for (const [
      socketId,
      peerConnection,
    ] of peerConnectionsRef.current.entries()) {
      console.log(
        `[ScreenShare] Reverting to camera/null track for peer: ${socketId}`,
      );
      void replacePeerSenderTrack(
        peerConnection,
        "video",
        cameraVideoTrack && videoEnabled ? cameraVideoTrack : null,
      );
    }

    if (videoEnabled && cameraVideoTrack) {
      attachVideoElement(
        "local",
        localVideoContainerRef.current,
        localMediaStreamRef.current,
        true,
      );
    } else {
      detachVideoElement("local");
    }
  }

  const syncMainVideoTrack = useCallback(() => {
    const element = mainVideoContainerRef.current;
    if (element) {
      const remoteScreenSharer = roomParticipants.find(
        (participant) => participant.isScreenSharing,
      );
      const hasRemoteScreenShare = !!remoteScreenSharer;
      const canShowCameraSource =
        (callSessionMode !== "stream_viewer" && videoEnabled) ||
        (!hasRemoteScreenShare && !!streamHostUser);
      const canShowScreenSource = isSharingScreen || hasRemoteScreenShare;
      const shouldProtectLocalScreenPreview =
        isRoomFullscreen && isSharingScreen;

      let streamToShow: MediaStream | null = null;
      let localScreenPreviewSuppressed = false;

      if (focusPrimarySource === "camera" && canShowCameraSource) {
        if (callSessionMode !== "stream_viewer" && videoEnabled) {
          streamToShow = localMediaStreamRef.current;
        } else if (streamHostUser) {
          streamToShow =
            remoteMediaStreamsRef.current.get(streamHostUser.socketId) ?? null;
        }
      }

      if (
        !streamToShow &&
        focusPrimarySource === "screen" &&
        canShowScreenSource
      ) {
        if (isSharingScreen) {
          if (shouldProtectLocalScreenPreview) {
            localScreenPreviewSuppressed = true;
          } else {
            streamToShow = screenStreamRef.current;
          }
        } else if (remoteScreenSharer) {
          streamToShow =
            remoteMediaStreamsRef.current.get(remoteScreenSharer.socketId) ??
            null;
        }
      }

      if (!streamToShow && canShowScreenSource) {
        if (isSharingScreen) {
          if (shouldProtectLocalScreenPreview) {
            localScreenPreviewSuppressed = true;
          } else {
            streamToShow = screenStreamRef.current;
          }
        } else if (remoteScreenSharer) {
          streamToShow =
            remoteMediaStreamsRef.current.get(remoteScreenSharer.socketId) ??
            null;
        }
      }

      if (
        !streamToShow &&
        canShowCameraSource &&
        !localScreenPreviewSuppressed
      ) {
        if (callSessionMode !== "stream_viewer" && videoEnabled) {
          streamToShow = localMediaStreamRef.current;
        } else if (streamHostUser) {
          streamToShow =
            remoteMediaStreamsRef.current.get(streamHostUser.socketId) ?? null;
        }
      }

      attachVideoElement("focus-main", element, streamToShow, true);
      setCurrentActiveStream(streamToShow);
    } else {
      detachVideoElement("focus-main");
      setCurrentActiveStream(null);
    }
  }, [
    callSessionMode,
    focusPrimarySource,
    isRoomFullscreen,
    isSharingScreen,
    roomParticipants,
    streamHostUser,
    videoEnabled,
  ]);

  const syncMainVideoTrackRef = useRef(syncMainVideoTrack);

  useEffect(() => {
    syncMainVideoTrackRef.current = syncMainVideoTrack;
  }, [syncMainVideoTrack]);

  const attachMainVideoContainer = useCallback(
    (element: HTMLDivElement | null) => {
      if (mainVideoContainerRef.current === element) return;
      mainVideoContainerRef.current = element;
      if (element === null) {
        detachVideoElement("focus-main");
        return;
      }
      syncMainVideoTrackRef.current();
    },
    [],
  );

  useEffect(() => {
    syncMainVideoTrack();
  }, [syncMainVideoTrack]);

  useEffect(() => {
    const remoteScreenSharer = roomParticipants.find(
      (participant) => participant.isScreenSharing,
    );
    const hasCameraSource =
      (callSessionMode !== "stream_viewer" && videoEnabled) ||
      (!remoteScreenSharer && !!streamHostUser);
    const hasScreenSource = isSharingScreen || !!remoteScreenSharer;

    if (
      hasScreenSource &&
      focusPrimarySource !== "screen" &&
      !hasCameraSource
    ) {
      setFocusPrimarySource("screen");
      return;
    }

    if (
      hasCameraSource &&
      focusPrimarySource !== "camera" &&
      !hasScreenSource
    ) {
      setFocusPrimarySource("camera");
      return;
    }

    if (!hasCameraSource && !hasScreenSource) {
      setFocusPrimarySource("screen");
    }
  }, [
    callSessionMode,
    focusPrimarySource,
    isSharingScreen,
    roomParticipants,
    streamHostUser,
    videoEnabled,
  ]);

  function clearAllVideoElements() {
    detachVideoElement("local");
    detachVideoElement("focus-main");
    for (const userId of remoteMediaStreamsRef.current.keys()) {
      detachVideoElement(`remote:${userId}`);
    }
    remoteMediaStreamsRef.current.clear();
  }

  function resetCallState() {
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((track) => track.stop());
      screenStreamRef.current = null;
    }
    clearScreenShareHealthMonitor();
    setIsSharingScreen(false);
    setFocusPrimarySource("screen");

    for (const socketId of peerConnectionsRef.current.keys()) {
      removePeerConnection(socketId);
    }
    resetLocalStream();
    clearAllVideoElements();
    disconnectingCallRef.current = false;
    setCallJoined(false);
    setCallJoining(false);
    setCallSessionMode(null);
    setAudioEnabled(false);
    setVideoEnabled(false);
  }

  async function joinConferenceCall() {
    if (callJoined || callJoining) {
      return;
    }
    if (!socketConnected || !roomSocketId) {
      toast.error("Room connection is still starting. Try again in a moment.");
      return;
    }
    setCallJoining(true);
    setCallErrorMessage(null);
    try {
      disconnectingCallRef.current = false;
      setCallJoined(true);
      setCallSessionMode("conference");
      const preAudio = store.get("audioEnabled");
      const preVideo = store.get("videoEnabled");

      setCallErrorMessage(null);

      console.log(
        `[StudyRoom] joinConferenceCall: Explicit media request starting (preAudio: ${preAudio}, preVideo: ${preVideo})...`,
      );

      let nextAudioEnabled = false;
      let nextVideoEnabled = false;

      if (preAudio) {
        const audioAttempt = await tryEnableMediaKind("audio");
        nextAudioEnabled = audioAttempt.ok;
      }
      if (preVideo) {
        const videoAttempt = await tryEnableMediaKind("video");
        nextVideoEnabled = videoAttempt.ok;
      }

      setAudioEnabled(nextAudioEnabled);
      setVideoEnabled(nextVideoEnabled);
      syncLocalVideoTrack();
      socketRef.current?.emit("call:join", {
        sessionMode: "conference",
        audioEnabled: nextAudioEnabled,
        videoEnabled: nextVideoEnabled,
      });
      setAudioEnabled(nextAudioEnabled);
      setVideoEnabled(nextVideoEnabled);
      toast.success(
        "Joined the room call. Turn on mic or camera when you're ready.",
      );
    } catch (callError) {
      resetCallState();
      const message =
        (callError as Error).message || "Could not join the room call.";
      setCallErrorMessage(message);
      toast.error(message);
    } finally {
      setCallJoining(false);
    }
  }

  async function startRoomStream() {
    if (callJoined || callJoining) {
      return;
    }
    if (!socketConnected || !roomSocketId) {
      toast.error("Room connection is still starting. Try again in a moment.");
      return;
    }

    if (streamHostUser) {
      toast.error("Only one stream allowed at a time.");
      return;
    }

    if (!isHost) {
      toast.error("Only the host can start a stream.");
      return;
    }

    setCallJoining(true);
    setCallErrorMessage(null);
    try {
      const preAudio = store.get("audioEnabled");
      const preVideo = store.get("videoEnabled");

      let nextAudioEnabled = false;
      let nextVideoEnabled = false;

      let primaryError = null;
      let audioAttempt = { ok: false, error: null as any };
      let videoAttempt = { ok: false, error: null as any };

      if (preAudio) {
        audioAttempt = await tryEnableMediaKind("audio");
        nextAudioEnabled = audioAttempt.ok;
        if (!audioAttempt.ok) primaryError = audioAttempt.error;
      }
      if (preVideo) {
        videoAttempt = await tryEnableMediaKind("video");
        nextVideoEnabled = videoAttempt.ok;
        if (!videoAttempt.ok) primaryError = videoAttempt.error;
      }

      if ((preAudio || preVideo) && !nextAudioEnabled && !nextVideoEnabled) {
        await logMediaDebugSnapshot("startRoomStream", primaryError);
        const friendly = getFriendlyMediaMessage(primaryError);
        throw new Error(friendly.title);
      }

      setCallJoined(true);
      setCallSessionMode("stream_host");
      setAudioEnabled(nextAudioEnabled);
      setVideoEnabled(nextVideoEnabled);
      socketRef.current?.emit("call:join", {
        sessionMode: "stream_host",
        audioEnabled: nextAudioEnabled,
        videoEnabled: nextVideoEnabled,
      });

      if (group) {
        void syncRoomState(
          {
            streamHostUserId: group.currentUserId,
          },
          false,
        );
      }

      if (nextAudioEnabled && nextVideoEnabled) {
        toast.success("Live stream started for the room.");
      } else if (nextAudioEnabled) {
        await logMediaDebugSnapshot(
          "startRoomStream:video",
          videoAttempt.error,
        );
        setCallErrorMessage("Camera unavailable — streaming audio only.");
        toast.error("Camera unavailable. Streaming audio only.");
      } else {
        await logMediaDebugSnapshot(
          "startRoomStream:audio",
          audioAttempt.error,
        );
        setCallErrorMessage("Microphone unavailable — streaming video only.");
        toast.error("Microphone unavailable. Streaming video only.");
      }
    } catch (streamError) {
      resetCallState();
      await logMediaDebugSnapshot("startRoomStream:catch", streamError);
      const friendly = getFriendlyMediaMessage(streamError);
      setCallErrorMessage(`${friendly.title}. ${friendly.hint}`);
      toast.error(friendly.title);
    } finally {
      setCallJoining(false);
    }
  }

  async function watchRoomStream() {
    if (callJoined || callJoining) {
      return;
    }
    if (!socketConnected || !roomSocketId) {
      toast.error("Room connection is still starting. Try again in a moment.");
      return;
    }

    setCallJoining(true);
    setCallErrorMessage(null);
    try {
      setCallJoined(true);
      setCallSessionMode("stream_viewer");
      socketRef.current?.emit("call:join", {
        sessionMode: "stream_viewer",
        audioEnabled: false,
        videoEnabled: false,
      });
      toast.success("Joined the live stream.");
    } catch (watchError) {
      resetCallState();
      const message =
        (watchError as Error).message || "Could not join the live stream.";
      setCallErrorMessage(message);
      toast.error(message);
    } finally {
      setCallJoining(false);
    }
  }

  function leaveRoomCall() {
    if (!callJoined) {
      resetCallState();
      return;
    }

    if (callSessionMode === "stream_host") {
      void syncRoomState(
        {
          streamHostUserId: null,
        },
        false,
      );
    }

    disconnectingCallRef.current = true;
    socketRef.current?.emit("call:leave");
    resetCallState();
  }

  async function toggleAudioTrack() {
    if (callJoined && callSessionMode === "stream_viewer") {
      toast.error("You are a stream viewer.");
      return;
    }

    try {
      const nextEnabled = !audioEnabled;
      if (nextEnabled) {
        await ensureMediaKind("audio");
      } else {
        localMediaStreamRef.current?.getAudioTracks().forEach((track) => {
          track.stop();
          localMediaStreamRef.current?.removeTrack(track);
        });
      }
      setAudioEnabled(nextEnabled);
      if (callJoined) {
        socketRef.current?.emit("call:update-session", {
          sessionMode: callSessionMode,
          audioEnabled: nextEnabled,
          videoEnabled,
          isScreenSharing: isSharingScreen,
        });
      }
      if (callSessionMode === "stream_host") {
        setCallErrorMessage(null);
      }
    } catch (audioError) {
      await logMediaDebugSnapshot("toggleAudio", audioError);
      const friendly = getFriendlyMediaMessage(audioError);
      setCallErrorMessage(`${friendly.title}. ${friendly.hint}`);
      toast.error(friendly.title);
    }
  }

  async function toggleVideoTrack() {
    if (callJoined && callSessionMode === "stream_viewer") {
      toast.error("You are a stream viewer.");
      return;
    }

    try {
      const nextEnabled = !videoEnabled;
      if (nextEnabled) {
        await ensureMediaKind("video");
      } else {
        localMediaStreamRef.current?.getVideoTracks().forEach((track) => {
          track.stop();
          localMediaStreamRef.current?.removeTrack(track);
        });
        syncLocalVideoTrack();
      }
      setVideoEnabled(nextEnabled);
      if (callJoined) {
        socketRef.current?.emit("call:update-session", {
          sessionMode: callSessionMode,
          audioEnabled,
          videoEnabled: nextEnabled,
          isScreenSharing: isSharingScreen,
        });
      }
      if (callSessionMode === "stream_host") {
        setCallErrorMessage(null);
      }
    } catch (videoError) {
      await logMediaDebugSnapshot("toggleVideo", videoError);
      const friendly = getFriendlyMediaMessage(videoError);
      setCallErrorMessage(`${friendly.title}. ${friendly.hint}`);
      toast.error(friendly.title);
    }
  }

  async function syncRoomState(
    payload: {
      payloadType?: "state" | "presence";
      mode?: StudyRoomMode;
      status?: StudyRoomStatus;
      presenceStatus?: "active" | "focused" | "away";
      timeLeftSeconds?: number;
      focusMinutes?: number;
      breakMinutes?: number;
      template?: StudyRoomTemplateRecord | null;
      sessionPrompt?: string;
      sessionNote?: string;
      sessionOutcomes?: StudyGroupRecord["roomState"]["sessionOutcomes"];
      tasks?: StudyGroupRecord["roomState"]["tasks"];
      sessionHistory?: StudyGroupRecord["roomState"]["sessionHistory"];
      collectionTakeaways?: StudyRoomCollectionTakeawayRecord[];
      itemNotes?: StudyGroupRecord["roomState"]["itemNotes"];
      activeCollectionItemId?: string | null;
      completedCollectionItemIds?: string[];
      timerEndsAt?: string | null;
      pinnedResource?: StudyRoomPinnedResourceRecord | null;
      pinnedCollection?: StudyRoomPinnedCollectionRecord | null;
      activityType?: "mode" | "status" | "timer" | "note";
      activityLabel?: string;
      activityDetail?: string;
      streamHostUserId?: string | null;
    },
    announceError = true,
  ) {
    const shouldTrackSaving = payload.payloadType !== "presence";
    try {
      if (!shouldTrackSaving) {
        const response = await fetch(`/api/study-groups/${groupId}/room`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!response.ok) {
          const maybeJson = (await response
            .json()
            .catch(() => null)) as ApiResult<unknown> | null;
          throw new Error(maybeJson?.error || "Presence sync failed.");
        }
        return;
      }

      if (shouldTrackSaving) {
        setSavingRoom(true);
      }

      const currentSyncId = ++syncCounterRef.current;

      const updatedGroup = await readJson<StudyGroupRecord>(
        await fetch(`/api/study-groups/${groupId}/room`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }),
      );

      // Prevent stale concurrent responses from overwriting newer optimistic updates
      if (currentSyncId === syncCounterRef.current) {
        setGroup(updatedGroup);
      }
    } catch (syncError) {
      if (announceError) {
        toast.error((syncError as Error).message);
      }
    } finally {
      if (shouldTrackSaving) {
        setSavingRoom(false);
      }
    }
  }

  function applyLocalRoomStatePatch(payload: {
    mode?: StudyRoomMode;
    status?: StudyRoomStatus;
    timeLeftSeconds?: number;
    focusMinutes?: number;
    breakMinutes?: number;
    timerEndsAt?: string | null;
  }) {
    if (payload.mode !== undefined) {
      setMode(payload.mode);
    }
    if (payload.status !== undefined) {
      setStatus(payload.status);
    }
    if (payload.timeLeftSeconds !== undefined) {
      setTimeLeft(payload.timeLeftSeconds);
    }
    if (payload.focusMinutes !== undefined) {
      setFocusMinutes(payload.focusMinutes);
    }
    if (payload.breakMinutes !== undefined) {
      setBreakMinutes(payload.breakMinutes);
    }
    if (payload.timerEndsAt !== undefined) {
      setTimerEndsAt(
        payload.timerEndsAt ? new Date(payload.timerEndsAt) : null,
      );
    }

    setGroup((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        roomState: {
          ...current.roomState,
          mode: payload.mode ?? current.roomState.mode,
          status: payload.status ?? current.roomState.status,
          timeLeftSeconds:
            payload.timeLeftSeconds ?? current.roomState.timeLeftSeconds,
          focusMinutes: payload.focusMinutes ?? current.roomState.focusMinutes,
          breakMinutes: payload.breakMinutes ?? current.roomState.breakMinutes,
          timerEndsAt:
            payload.timerEndsAt !== undefined
              ? payload.timerEndsAt
              : current.roomState.timerEndsAt,
        },
      };
    });
  }

  function applyMode(nextMode: StudyRoomMode) {
    const nextTimeLeft =
      (nextMode === "focus" ? focusMinutes : breakMinutes) * 60;
    applyLocalRoomStatePatch({
      mode: nextMode,
      status: "idle",
      timeLeftSeconds: nextTimeLeft,
      timerEndsAt: null,
    });
    void syncRoomState({
      mode: nextMode,
      status: "idle",
      timeLeftSeconds: nextTimeLeft,
      timerEndsAt: null,
      activityType: "mode",
      activityLabel:
        nextMode === "focus"
          ? "Switched to focus mode"
          : "Switched to break mode",
      activityDetail: `Timer reset to ${formatDuration(nextTimeLeft)}.`,
    });
  }

  function updateDuration(nextMode: StudyRoomMode, minutes: number) {
    const safeMinutes = Math.max(1, minutes);
    if (nextMode === "focus") {
      applyLocalRoomStatePatch({
        focusMinutes: safeMinutes,
        timeLeftSeconds: mode === "focus" ? safeMinutes * 60 : undefined,
        status: mode === "focus" ? "idle" : undefined,
        timerEndsAt: mode === "focus" ? null : undefined,
      });
      void syncRoomState({
        focusMinutes: safeMinutes,
        timeLeftSeconds: mode === "focus" ? safeMinutes * 60 : undefined,
        status: mode === "focus" ? "idle" : undefined,
        timerEndsAt: mode === "focus" ? null : undefined,
        activityType: "timer",
        activityLabel: "Updated focus length",
        activityDetail: `${safeMinutes} minute focus blocks.`,
      });
      return;
    }

    applyLocalRoomStatePatch({
      breakMinutes: safeMinutes,
      timeLeftSeconds: mode === "break" ? safeMinutes * 60 : undefined,
      status: mode === "break" ? "idle" : undefined,
      timerEndsAt: mode === "break" ? null : undefined,
    });
    void syncRoomState({
      breakMinutes: safeMinutes,
      timeLeftSeconds: mode === "break" ? safeMinutes * 60 : undefined,
      status: mode === "break" ? "idle" : undefined,
      timerEndsAt: mode === "break" ? null : undefined,
      activityType: "timer",
      activityLabel: "Updated break length",
      activityDetail: `${safeMinutes} minute breaks.`,
    });
  }

  function resetTimer() {
    const nextTimeLeft = (mode === "focus" ? focusMinutes : breakMinutes) * 60;
    applyLocalRoomStatePatch({
      status: "idle",
      timeLeftSeconds: nextTimeLeft,
      timerEndsAt: null,
    });
    void syncRoomState({
      status: "idle",
      timeLeftSeconds: nextTimeLeft,
      timerEndsAt: null,
      activityType: "timer",
      activityLabel: "Reset the room timer",
      activityDetail: `${mode === "focus" ? "Focus" : "Break"} timer returned to the starting duration.`,
    });
  }

  function toggleTimer() {
    const currentStatus = stateRef.current.status;
    const currentTimeLeft = stateRef.current.timeLeft;
    const currentTimerEndsAt = stateRef.current.timerEndsAt;
    const currentMode = stateRef.current.mode;

    if (currentStatus === "running" && currentTimeLeft > 0) {
      const remaining = currentTimerEndsAt
        ? Math.max(0, Math.ceil((currentTimerEndsAt.getTime() - Date.now()) / 1000))
        : currentTimeLeft;
      applyLocalRoomStatePatch({
        status: "paused",
        timeLeftSeconds: remaining,
        timerEndsAt: null,
      });
      void syncRoomState({
        status: "paused",
        timeLeftSeconds: remaining,
        timerEndsAt: null,
        activityType: "status",
        activityLabel: "Paused the room timer",
        activityDetail: `${formatDuration(remaining)} remaining.`,
      });
      return;
    }

    const seconds =
      currentTimeLeft > 0
        ? currentTimeLeft
        : (currentMode === "focus" ? focusMinutes : breakMinutes) * 60;
    const nextEndsAt = new Date(Date.now() + seconds * 1000).toISOString();
    const wasPaused = currentStatus === "paused";
    applyLocalRoomStatePatch({
      status: "running",
      timeLeftSeconds: seconds,
      timerEndsAt: nextEndsAt,
    });
    void syncRoomState({
      status: "running",
      timeLeftSeconds: seconds,
      timerEndsAt: nextEndsAt,
      activityType: "status",
      activityLabel: wasPaused
        ? "Resumed the room timer"
        : "Started the room timer",
      activityDetail: `${formatDuration(seconds)} on the clock.`,
    });
  }

  function saveSessionNote() {
    void syncRoomState({
      sessionNote,
      activityType: "note",
      activityLabel: "Updated the session note",
      activityDetail: sessionNote.trim()
        ? sessionNote.trim().slice(0, 120)
        : "Cleared the shared session note.",
    });
  }

  function saveSessionPrompt() {
    void syncRoomState({
      sessionPrompt,
      activityType: "note",
      activityLabel: "Updated the study prompt",
      activityDetail: sessionPrompt.trim()
        ? sessionPrompt.trim().slice(0, 120)
        : "Cleared the shared study prompt.",
    });
  }

  function applyTemplate(templateId: StudyRoomTemplateId) {
    const template = roomTemplates.find((entry) => entry.id === templateId);
    if (!template) {
      return;
    }

    const templateCollection = template.starterCollectionId
      ? (collections.find(
        (entry) => entry.id === template.starterCollectionId,
      ) ?? null)
      : null;
    const templateItem = template.starterItemId
      ? (items.find((entry) => entry.id === template.starterItemId) ?? null)
      : null;
    const nextActiveCollectionItemId =
      templateItem && templateCollection?.itemIds.includes(templateItem.id)
        ? templateItem.id
        : (templateCollection?.itemIds[0] ?? null);

    setSelectedTemplateId(template.id);
    void syncRoomState({
      template: {
        id: template.id,
        label: template.label,
        description: template.description,
      },
      focusMinutes: template.focusMinutes,
      breakMinutes: template.breakMinutes,
      mode: "focus",
      status: "idle",
      timeLeftSeconds: template.focusMinutes * 60,
      timerEndsAt: null,
      sessionPrompt: template.prompt,
      pinnedCollection: templateCollection
        ? {
          collectionId: templateCollection.id,
          title: templateCollection.title,
          description: templateCollection.description,
          itemCount: templateCollection.itemCount,
        }
        : null,
      activeCollectionItemId: nextActiveCollectionItemId,
      completedCollectionItemIds: [],
      pinnedResource: templateItem
        ? {
          itemId: templateItem.id,
          title: templateItem.title,
          type: templateItem.type,
          url: templateItem.url,
          sourceHost: templateItem.sourceHost,
        }
        : null,
      activityType: "note",
      activityLabel: "Applied a room template",
      activityDetail: template.label,
    });
  }

  async function saveCurrentRoomAsTemplate() {
    const label = customTemplateLabel.trim();
    const description = customTemplateDescription.trim();
    if (!label || !description || !sessionPrompt.trim()) {
      toast.error(
        "Add a label, description, and study prompt before saving a custom template.",
      );
      return;
    }

    const savedTemplate: StudyRoomTemplatePreset = {
      id: `custom_${label.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`,
      label,
      description,
      focusMinutes,
      breakMinutes,
      prompt: sessionPrompt.trim(),
      starterCollectionId: pinnedCollection?.collectionId ?? null,
      starterCollectionTitle: pinnedCollection?.title ?? null,
      starterItemId: pinnedResource?.itemId ?? null,
      starterItemTitle: pinnedResource?.title ?? null,
      custom: true,
    };

    try {
      const nextTemplates = [
        savedTemplate,
        ...customTemplates.filter((entry) => entry.id !== savedTemplate.id),
      ];
      const persistedTemplates = await readJson<StudyRoomTemplatePreset[]>(
        await fetch("/api/study-room/templates", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ templates: nextTemplates }),
        }),
      );
      setCustomTemplates(persistedTemplates);
      setSelectedTemplateId(savedTemplate.id);
      toast.success("Custom room template saved to your account.");
    } catch (saveError) {
      toast.error((saveError as Error).message);
    }
  }

  function addTask() {
    const value = taskInput.trim();
    if (!value) {
      return;
    }

    const nextTasks = [
      {
        id: crypto.randomUUID(),
        text: value,
        completed: false,
        updatedAt: new Date().toISOString(),
      },
      ...tasks,
    ];

    setTaskInput("");
    void syncRoomState({
      tasks: nextTasks,
      activityType: "note",
      activityLabel: "Added a room task",
      activityDetail: value.slice(0, 120),
    });
  }

  function toggleTask(taskId: string, completed?: boolean) {
    const nextTasks = tasks.map((task) =>
      task.id === taskId
        ? {
          ...task,
          completed:
            typeof completed === "boolean" ? completed : !task.completed,
          updatedAt: new Date().toISOString(),
        }
        : task,
    );
    const toggled = nextTasks.find((task) => task.id === taskId);

    void syncRoomState({
      tasks: nextTasks,
      activityType: "note",
      activityLabel: toggled?.completed
        ? "Completed a room task"
        : "Reopened a room task",
      activityDetail: toggled?.text.slice(0, 120) ?? "",
    });
  }

  function removeTask(taskId: string) {
    const removed = tasks.find((task) => task.id === taskId);
    const nextTasks = tasks.filter((task) => task.id !== taskId);

    void syncRoomState({
      tasks: nextTasks,
      activityType: "note",
      activityLabel: "Removed a room task",
      activityDetail: removed?.text.slice(0, 120) ?? "",
    });
  }

  function pinResource(item: ItemRecord) {
    void syncRoomState({
      pinnedResource: {
        itemId: item.id,
        title: item.title,
        type: item.type,
        url: item.url,
        sourceHost: item.sourceHost,
      },
      activityType: "note",
      activityLabel: "Pinned a study resource",
      activityDetail: item.title.slice(0, 120),
    });
  }

  function clearPinnedResource() {
    void syncRoomState({
      pinnedResource: null,
      activityType: "note",
      activityLabel: "Cleared the pinned resource",
      activityDetail: "The room no longer has a pinned item.",
    });
  }

  function pinCollection(collection: CollectionRecord) {
    void syncRoomState({
      pinnedCollection: {
        collectionId: collection.id,
        title: collection.title,
        description: collection.description,
        itemCount: collection.itemCount,
      },
      activeCollectionItemId: collection.itemIds[0] ?? null,
      completedCollectionItemIds: [],
      activityType: "note",
      activityLabel: "Pinned a collection",
      activityDetail: collection.title.slice(0, 120),
    });
  }

  function clearPinnedCollection() {
    void syncRoomState({
      pinnedCollection: null,
      activeCollectionItemId: null,
      completedCollectionItemIds: [],
      activityType: "note",
      activityLabel: "Cleared the pinned collection",
      activityDetail: "The room no longer has a pinned collection.",
    });
  }

  function setCollectionFocus(
    itemId: string,
    label = "Changed the active collection item",
  ) {
    const item = pinnedCollectionItems.find((entry) => entry.id === itemId);
    void syncRoomState({
      activeCollectionItemId: itemId,
      activityType: "note",
      activityLabel: label,
      activityDetail: item?.title.slice(0, 120) ?? "",
    });
  }

  function moveCollectionFocus(direction: "next" | "previous") {
    if (!activeCollectionItem || pinnedCollectionItems.length === 0) {
      return;
    }

    const currentIndex = pinnedCollectionItems.findIndex(
      (item) => item.id === activeCollectionItem.id,
    );
    const nextIndex =
      direction === "next"
        ? Math.min(pinnedCollectionItems.length - 1, currentIndex + 1)
        : Math.max(0, currentIndex - 1);

    const target = pinnedCollectionItems[nextIndex];
    if (!target || target.id === activeCollectionItem.id) {
      return;
    }

    setCollectionFocus(
      target.id,
      direction === "next"
        ? "Moved to the next collection item"
        : "Moved to the previous collection item",
    );
  }

  function toggleCollectionCompletion(itemId: string) {
    const item = pinnedCollectionItems.find((entry) => entry.id === itemId);
    const nextCompleted = completedCollectionItemIds.includes(itemId)
      ? completedCollectionItemIds.filter((entry) => entry !== itemId)
      : [...completedCollectionItemIds, itemId];

    void syncRoomState({
      completedCollectionItemIds: nextCompleted,
      activityType: "note",
      activityLabel: nextCompleted.includes(itemId)
        ? "Marked a collection item complete"
        : "Reopened a collection item",
      activityDetail: item?.title.slice(0, 120) ?? "",
    });
  }

  function addCollectionTakeaway() {
    const value = takeawayInput.trim();
    if (!value || !activeCollectionItem) {
      return;
    }

    const nextTakeaways = [
      {
        id: crypto.randomUUID(),
        itemId: activeCollectionItem.id,
        kind: takeawayKind,
        text: value,
        authorUserId:
          group?.roomState?.updatedByUserId ||
          groupMembers[0]?.userId ||
          "member",
        authorName: null,
        authorUsername: null,
        updatedAt: new Date().toISOString(),
      },
      ...collectionTakeaways,
    ];

    setTakeawayInput("");
    void syncRoomState({
      collectionTakeaways: nextTakeaways,
      activityType: "note",
      activityLabel: `Added a ${formatTakeawayKindLabel(takeawayKind).toLowerCase()}`,
      activityDetail: value.slice(0, 120),
    });
  }

  function removeCollectionTakeaway(takeawayId: string) {
    const removed = collectionTakeaways.find(
      (entry) => entry.id === takeawayId,
    );
    const nextTakeaways = collectionTakeaways.filter(
      (entry) => entry.id !== takeawayId,
    );

    void syncRoomState({
      collectionTakeaways: nextTakeaways,
      activityType: "note",
      activityLabel: "Removed a shared takeaway",
      activityDetail: removed?.text.slice(0, 120) ?? "",
    });
  }

  function promoteTakeawayToTask(takeawayId: string) {
    const takeaway = collectionTakeaways.find(
      (entry) => entry.id === takeawayId,
    );
    if (!takeaway) {
      return;
    }

    const alreadyExists = tasks.some(
      (task) => task.text.trim() === takeaway.text.trim(),
    );
    if (alreadyExists) {
      toast("That takeaway is already in the room tasks.");
      return;
    }

    const nextTasks = [
      {
        id: crypto.randomUUID(),
        text: takeaway.text,
        completed: false,
        updatedAt: new Date().toISOString(),
      },
      ...tasks,
    ];

    void syncRoomState({
      tasks: nextTasks,
      activityType: "note",
      activityLabel: "Promoted a takeaway to a task",
      activityDetail: takeaway.text.slice(0, 120),
    });
  }

  async function exportActiveTakeawaysToSecondBrain() {
    if (!activeCollectionItem || activeItemTakeaways.length === 0) {
      return;
    }

    try {
      setExportingTakeaways(true);
      const noteLines = [
        `Study Room Export`,
        ``,
        `Item: ${activeCollectionItem.title}`,
        `Type: ${activeCollectionItem.type}`,
        pinnedCollection ? `Collection: ${pinnedCollection.title}` : null,
        sessionPrompt.trim() ? `Prompt: ${sessionPrompt.trim()}` : null,
        ``,
        `Takeaways`,
        ...activeItemTakeaways.map((takeaway, index) => {
          const author =
            takeaway.authorName || takeaway.authorUsername || "Room member";
          return `${index + 1}. ${takeaway.text} (${author})`;
        }),
        ``,
        sessionNote.trim() ? `Session note\n${sessionNote.trim()}` : null,
      ].filter((line): line is string => Boolean(line));

      const createdItem = await readJson<ItemRecord>(
        await fetch("/api/items", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "note",
            title: `${activeCollectionItem.title} - Study Room Takeaways`,
            excerpt: activeItemTakeaways[0]?.text ?? null,
            notes: noteLines.join("\n"),
            status: "reading",
          }),
        }),
      );

      toast.success("Takeaways exported to Second Brain.");
      router.push(`/shelf/${createdItem.id}`);
    } catch (exportError) {
      toast.error((exportError as Error).message);
    } finally {
      setExportingTakeaways(false);
    }
  }

  async function exportHistoryEntryToSecondBrain(
    entry: StudyGroupRecord["roomState"]["sessionHistory"][number],
  ) {
    try {
      setExportingHistoryId(entry.id);
      const noteLines = [
        "Study Room Session History",
        "",
        `Template: ${entry.templateLabel}`,
        entry.pinnedCollectionTitle
          ? `Collection: ${entry.pinnedCollectionTitle}`
          : null,
        entry.activeItemTitle ? `Active item: ${entry.activeItemTitle}` : null,
        entry.prompt ? `Prompt: ${entry.prompt}` : null,
        "",
        "Summary",
        entry.summary,
        "",
        entry.completedThisBlock.length
          ? `Completed this block\n- ${entry.completedThisBlock.join("\n- ")}`
          : null,
        entry.carryForward.length
          ? `Carry forward\n- ${entry.carryForward.join("\n- ")}`
          : null,
        entry.blockers.length
          ? `Blockers\n- ${entry.blockers.join("\n- ")}`
          : null,
      ].filter((line): line is string => Boolean(line));

      const createdItem = await readJson<ItemRecord>(
        await fetch("/api/items", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "note",
            title: `${entry.templateLabel} - Session History`,
            excerpt: entry.summary.slice(0, 280),
            notes: noteLines.join("\n"),
            status: "reading",
          }),
        }),
      );

      toast.success("Session history exported to Second Brain.");
      router.push(`/shelf/${createdItem.id}`);
    } catch (exportError) {
      toast.error((exportError as Error).message);
    } finally {
      setExportingHistoryId(null);
    }
  }

  function restoreHistoryCarryForward(
    entry: StudyGroupRecord["roomState"]["sessionHistory"][number],
  ) {
    if (entry.carryForward.length === 0) {
      toast("This session has no carry-forward tasks.");
      return;
    }

    const existingTaskTexts = new Set(
      tasks.map((task) => task.text.trim().toLowerCase()),
    );
    const restoredTasks = entry.carryForward
      .filter((text) => !existingTaskTexts.has(text.trim().toLowerCase()))
      .map((text) => ({
        id: crypto.randomUUID(),
        text,
        completed: false,
        updatedAt: new Date().toISOString(),
      }));

    if (restoredTasks.length === 0) {
      toast("Carry-forward tasks are already in the room.");
      return;
    }

    void syncRoomState({
      tasks: [...restoredTasks, ...tasks],
      activityType: "note",
      activityLabel: "Restored carry-forward tasks",
      activityDetail: `${restoredTasks.length} task${restoredTasks.length > 1 ? "s" : ""} added from session history.`,
    });
  }

  function saveActiveItemNote() {
    if (!activeCollectionItem) {
      return;
    }

    const trimmed = itemNoteDraft.trim();
    const nextItemNotes = [
      ...itemNotes.filter((entry) => entry.itemId !== activeCollectionItem.id),
      {
        itemId: activeCollectionItem.id,
        note: trimmed,
        updatedAt: new Date().toISOString(),
      },
    ].filter((entry) => entry.note.trim().length > 0);

    void syncRoomState({
      itemNotes: nextItemNotes,
      activityType: "note",
      activityLabel: trimmed
        ? "Updated the active item note"
        : "Cleared the active item note",
      activityDetail: activeCollectionItem.title.slice(0, 120),
    });
  }

  function addOutcome(field: OutcomeField) {
    const value = outcomeInputs[field].trim();
    if (!value) {
      return;
    }

    const nextOutcomes = {
      ...sessionOutcomes,
      [field]: [...sessionOutcomes[field], value],
    };
    setOutcomeInputs((current) => ({ ...current, [field]: "" }));
    void syncRoomState({
      sessionOutcomes: nextOutcomes,
      activityType: "note",
      activityLabel: "Updated session outcomes",
      activityDetail: value.slice(0, 120),
    });
  }

  function removeOutcome(field: OutcomeField, index: number) {
    const removed = sessionOutcomes[field][index];
    const nextOutcomes = {
      ...sessionOutcomes,
      [field]: sessionOutcomes[field].filter(
        (_, entryIndex) => entryIndex !== index,
      ),
    };
    void syncRoomState({
      sessionOutcomes: nextOutcomes,
      activityType: "note",
      activityLabel: "Updated session outcomes",
      activityDetail: removed?.slice(0, 120) ?? "",
    });
  }

  async function generateSessionRecap() {
    try {
      setGeneratingRecap(true);
      const recapSource = [
        `Room: ${group?.title ?? "Study room"}`,
        sessionPrompt ? `Prompt: ${sessionPrompt}` : null,
        activeCollectionItem
          ? `Active item: ${activeCollectionItem.title}`
          : null,
        pinnedCollection ? `Collection: ${pinnedCollection.title}` : null,
        tasks.length
          ? `Open tasks: ${tasks.map((task) => task.text).join("; ")}`
          : null,
        activeItemTakeaways.length
          ? `Takeaways: ${activeItemTakeaways.map((entry) => `[${formatTakeawayKindLabel(entry.kind)}] ${entry.text}`).join("; ")}`
          : null,
        sessionOutcomes.completedThisBlock.length
          ? `Completed this block: ${sessionOutcomes.completedThisBlock.join("; ")}`
          : null,
        sessionOutcomes.carryForward.length
          ? `Carry forward: ${sessionOutcomes.carryForward.join("; ")}`
          : null,
        sessionOutcomes.blockers.length
          ? `Blockers: ${sessionOutcomes.blockers.join("; ")}`
          : null,
        sessionNote ? `Session note: ${sessionNote}` : null,
      ]
        .filter((line): line is string => Boolean(line))
        .join("\n");

      let recap = "";
      const historyEntry = {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        templateId: (group?.roomState?.template?.id ??
          selectedTemplateId) as StudyRoomTemplateId,
        templateLabel:
          group?.roomState?.template?.label ??
          roomTemplates.find((entry) => entry.id === selectedTemplateId)
            ?.label ??
          "General session",
        summary: "",
        prompt: sessionPrompt.trim() || null,
        completedThisBlock: sessionOutcomes.completedThisBlock,
        carryForward: sessionOutcomes.carryForward,
        blockers: sessionOutcomes.blockers,
        activeItemTitle: activeCollectionItem?.title ?? null,
        pinnedCollectionTitle: pinnedCollection?.title ?? null,
      };
      try {
        const response = await fetch("/api/ai/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "summary",
            text: `Create a concise study room recap with: summary, wins, carry-forward tasks, blockers.\n\n${recapSource}`,
          }),
        });
        const data = (await response.json()) as {
          summary?: string;
          error?: string;
        };
        if (!response.ok || !data.summary) {
          throw new Error(data.error || "AI recap failed");
        }
        recap = data.summary;
      } catch {
        recap = [
          "Study Room Recap",
          "",
          sessionOutcomes.completedThisBlock.length
            ? `Wins: ${sessionOutcomes.completedThisBlock.join("; ")}`
            : "Wins: Progress made in the room.",
          sessionOutcomes.carryForward.length
            ? `Carry forward: ${sessionOutcomes.carryForward.join("; ")}`
            : "Carry forward: Review remaining active tasks.",
          sessionOutcomes.blockers.length
            ? `Blockers: ${sessionOutcomes.blockers.join("; ")}`
            : "Blockers: None captured.",
          activeItemTakeaways.length
            ? `Key discussion: ${activeItemTakeaways.map((entry) => entry.text).join("; ")}`
            : "Key discussion: No takeaways captured.",
        ].join("\n");
      }
      historyEntry.summary = recap;

      setSessionNote(recap);
      void syncRoomState({
        sessionNote: recap,
        sessionHistory: [
          historyEntry,
          ...(group?.roomState?.sessionHistory ?? []),
        ].slice(0, 20),
        activityType: "note",
        activityLabel: "Generated a session recap",
        activityDetail: "Room recap saved into the shared session note.",
      });
      toast.success("Session recap generated.");
    } catch (recapError) {
      toast.error((recapError as Error).message);
    } finally {
      setGeneratingRecap(false);
    }
  }

  async function handleQuickSend() {
    if (!quickMessage.trim()) {
      return;
    }

    let finalContent = quickMessage.trim();

    // Add question prefix if mode is question
    if (messageMode === "question") {
      finalContent = `❓ [Question] ${finalContent}`;
    }

    // Add reply prefix if replying to a message
    if (replyingToMessage) {
      const parentAuthor =
        replyingToMessage.authorName ||
        replyingToMessage.authorUsername ||
        "member";
      finalContent = `↳ [reply:${replyingToMessage.id}:${parentAuthor}] ${finalContent}`;
    }

    try {
      setSending(true);
      const newMessage = await readJson<StudyGroupMessageRecord>(
        await fetch(`/api/study-groups/${groupId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: finalContent }),
        }),
      );
      setGroup((current) => {
        if (!current) return null;
        return {
          ...current,
          messages: [...(current.messages || []), newMessage],
        };
      });
      setQuickMessage("");
      setReplyingToMessage(null); // Reset reply state after sending
      toast.success("Shared with the room.");
    } catch (sendError) {
      toast.error((sendError as Error).message);
    } finally {
      setSending(false);
    }
  }

  async function saveRoomGoal() {
    if (!group) return;
    try {
      setSavingGoal(true);
      const updated = await readJson<StudyGroupRecord>(
        await fetch(`/api/study-groups/${groupId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: group.title,
            description: editedGoal.trim(),
            privacy: group.privacy,
            memberLimit: group.memberLimit,
          }),
        }),
      );
      setGroup(updated);
      setIsEditingGoal(false);
      toast.success("Room goal updated.");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSavingGoal(false);
    }
  }

  async function openPinnedResourceTarget(target: "workspace" | "study") {
    if (!pinnedResource) {
      return;
    }

    try {
      setOpeningPinnedAction(target);
      const response = await fetch(
        `/api/items/${pinnedResource.itemId}/workspace`,
        {
          method: "POST",
        },
      );
      const data = (await response.json().catch(() => ({}))) as {
        workspaceId?: string;
        assetId?: string;
        error?: string;
      };

      if (!response.ok || !data.workspaceId || !data.assetId) {
        throw new Error(data.error || "Failed to open pinned resource");
      }

      if (target === "workspace") {
        router.push(`/workspaces/${data.workspaceId}?assetId=${data.assetId}`);
        return;
      }

      router.push(`/shelf/${data.assetId}`);
    } catch (openError) {
      toast.error(
        openError instanceof Error
          ? openError.message
          : "Failed to open pinned resource",
      );
    } finally {
      setOpeningPinnedAction(null);
    }
  }

  async function openItemTarget(
    item: ItemRecord,
    target: "workspace" | "study",
  ) {
    try {
      setOpeningPinnedAction(target);
      const response = await fetch(`/api/items/${item.id}/workspace`, {
        method: "POST",
      });
      const data = (await response.json().catch(() => ({}))) as {
        workspaceId?: string;
        assetId?: string;
        error?: string;
      };

      if (!response.ok || !data.workspaceId || !data.assetId) {
        throw new Error(data.error || "Failed to open study item");
      }

      if (target === "workspace") {
        router.push(`/workspaces/${data.workspaceId}?assetId=${data.assetId}`);
        return;
      }

      router.push(`/shelf/${data.assetId}`);
    } catch (openError) {
      toast.error(
        openError instanceof Error
          ? openError.message
          : "Failed to open study item",
      );
    } finally {
      setOpeningPinnedAction(null);
    }
  }

  function openPinnedCollection() {
    if (!pinnedCollection) {
      return;
    }

    router.push(`/shelf?collection=${pinnedCollection.collectionId}`);
  }

  function pinFirstCollectionItem() {
    if (!pinnedCollection) {
      return;
    }

    const candidate = items.find((item) =>
      collections
        .find((entry) => entry.id === pinnedCollection.collectionId)
        ?.itemIds.includes(item.id),
    );

    if (!candidate) {
      toast.error("No available item from this collection could be pinned.");
      return;
    }

    pinResource(candidate);
  }

  function getPresenceTone(statusValue: "active" | "focused" | "away") {
    if (statusValue === "focused") {
      return "bg-[rgba(201,125,12,0.13)] text-[#c97d0c]";
    }
    if (statusValue === "active") {
      return "bg-[rgba(26,158,117,0.13)] text-[#1a9e75]";
    }
    return "bg-white/[0.08] text-[#9c9788]";
  }

  const roomGoal =
    group?.description?.trim() ||
    "Set a clear room goal from group settings to align everyone.";
  const roomPermissions: StudyRoomPermissionsRecord | null =
    group?.roomPermissions ?? null;
  const canControlSession = roomPermissions?.canControlSession ?? false;
  const canEditResources = roomPermissions?.canEditResources ?? false;
  const canEditNotes = roomPermissions?.canEditNotes ?? false;
  const canEditTasks = roomPermissions?.canEditTasks ?? false;
  const canPostMessages = roomPermissions?.canPostMessages ?? false;
  const activeCallParticipants = roomParticipants.filter(
    (participant) => participant.isInCall,
  );
  const remoteCallParticipants = activeCallParticipants
    .filter((participant) => participant.socketId !== roomSocketId)
    .filter(
      (participant) =>
        !(streamHostUser && participant.userId === streamHostUser.userId),
    )
    .slice(0, 8);
  const lastRoomActor =
    group?.roomState?.updatedByName ||
    group?.roomState?.updatedByUsername ||
    "Someone in the room";
  const pinnedResource = group?.roomState?.pinnedResource ?? null;
  const pinnedCollection = group?.roomState?.pinnedCollection ?? null;
  const canOpenStudyView =
    pinnedResource?.type === "article" ||
    pinnedResource?.type === "pdf" ||
    pinnedResource?.type === "video";

  const toggleTimerRef = useRef<() => void>(() => { });
  useEffect(() => {
    toggleTimerRef.current = toggleTimer;
  }, [toggleTimer]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.code === "Space" || event.key === " ") {
        if (!canControlSession) return;

        const target = event.target as HTMLElement;
        if (
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable
        ) {
          return;
        }

        event.preventDefault();
        toggleTimerRef.current();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [canControlSession]);
  const filteredItems = items
    .filter((item) =>
      resourceQuery.trim()
        ? `${item.title} ${item.type} ${item.sourceHost ?? ""}`
          .toLowerCase()
          .includes(resourceQuery.trim().toLowerCase())
        : true,
    )
    .slice(0, 6);
  const filteredCollections = collections
    .filter((collection) =>
      collectionQuery.trim()
        ? `${collection.title} ${collection.description ?? ""}`
          .toLowerCase()
          .includes(collectionQuery.trim().toLowerCase())
        : true,
    )
    .slice(0, 6);
  const pinnedCollectionRecord = pinnedCollection
    ? (collections.find(
      (entry) => entry.id === pinnedCollection.collectionId,
    ) ?? null)
    : null;
  const pinnedCollectionItems = pinnedCollectionRecord
    ? pinnedCollectionRecord.itemIds
      .map((itemId) => items.find((item) => item.id === itemId) ?? null)
      .filter((item): item is ItemRecord => Boolean(item))
    : [];
  const activeCollectionItem =
    pinnedCollectionItems.find((item) => item.id === activeCollectionItemId) ??
    pinnedCollectionItems[0] ??
    null;
  const activeItemNote =
    (activeCollectionItem
      ? itemNotes.find((entry) => entry.itemId === activeCollectionItem.id)
        ?.note
      : null) ?? "";
  const roomTimeline = group?.roomTimeline || [];

  const activeItemTakeaways = activeCollectionItem
    ? collectionTakeaways.filter(
      (entry) => entry.itemId === activeCollectionItem.id,
    )
    : [];
  const completedCollectionCount = completedCollectionItemIds.filter((itemId) =>
    pinnedCollectionItems.some((item) => item.id === itemId),
  ).length;
  const mergedRoomPresence = mergePresenceRecords(
    group?.roomPresence ?? [],
    roomPresenceOverrides,
  );
  const presenceByUserId = new Map(
    mergedRoomPresence.map((entry) => [entry.userId, entry] as const),
  );
  const socketPresenceByUserId = new Map(
    roomParticipants.map((entry) => [entry.userId, entry] as const),
  );

  useEffect(() => {
    setItemNoteDraft(activeItemNote);
  }, [activeItemNote, activeCollectionItem?.id]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent | TouchEvent) {
      if (
        cardRef.current &&
        !cardRef.current.contains(event.target as Node) &&
        !(event.target as HTMLElement).closest(".room-members-mobile-pill")
      ) {
        setIsMembersOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsMembersOpen(false);
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  function renderCallSection() {
    const screenSharingParticipant = roomParticipants.find(
      (p) => p.isScreenSharing,
    );
    const activeScreenSharer =
      screenSharingParticipant ||
      (isSharingScreen
        ? {
          socketId: roomSocketId,
          userId: group?.currentUserId,
          name: "You",
          username: "You",
          isScreenSharing: true,
          audioEnabled: audioEnabled,
          videoEnabled: videoEnabled,
          isInCall: true,
          sessionMode: callSessionMode,
        }
        : null);
    const anyoneScreenSharing = !!activeScreenSharer;

    const isConferenceScreenSharing =
      callSessionMode === "conference" && anyoneScreenSharing;
    const isHostStreaming =
      callSessionMode === "stream_host" || callSessionMode === "stream_viewer";
    const isFocusMode = isConferenceScreenSharing || isHostStreaming;
    const hasCameraSource =
      (callSessionMode !== "stream_viewer" && videoEnabled) ||
      (!anyoneScreenSharing && !!streamHostUser);
    const hasScreenSource = isSharingScreen || anyoneScreenSharing;
    const availableFocusSources: Array<{
      key: "screen" | "camera";
      label: string;
      caption: string;
      icon: typeof Monitor;
    }> = [];

    if (hasScreenSource) {
      availableFocusSources.push({
        key: "screen",
        label: "Screen",
        caption: isSharingScreen
          ? "Your shared screen"
          : `${activeScreenSharer?.name || "Shared"} screen`,
        icon: Monitor,
      });
    }

    if (hasCameraSource) {
      availableFocusSources.push({
        key: "camera",
        label: "Webcam",
        caption:
          callSessionMode !== "stream_viewer"
            ? "Your live camera"
            : `${streamHostUser?.name || "Host"} camera`,
        icon: Video,
      });
    }

    const selectedFocusSource = availableFocusSources.some(
      (source) => source.key === focusPrimarySource,
    )
      ? focusPrimarySource
      : (availableFocusSources[0]?.key ?? "screen");
    const showLocalFullscreenShareGuard =
      isRoomFullscreen && isSharingScreen && selectedFocusSource === "screen";
    const screenTrackLive =
      !!screenShareHealth &&
      screenShareHealth.readyState === "live" &&
      screenShareHealth.enabled &&
      !screenShareHealth.muted;
    const screenResolution =
      screenShareHealth?.width && screenShareHealth.height
        ? `${screenShareHealth.width}x${screenShareHealth.height}`
        : "Checking";
    const screenFrameRate = screenShareHealth?.frameRate
      ? `${Math.round(screenShareHealth.frameRate)} fps`
      : "auto fps";
    const outboundStatsAvailable =
      !!screenShareHealth && screenShareHealth.outboundReports > 0;
    const outboundSending =
      outboundStatsAvailable &&
      ((screenShareHealth?.bytesSent ?? 0) > 0 ||
        (screenShareHealth?.framesEncoded ?? 0) > 0);
    const connectedPeerCount = connectedPeers.size;
    const recipientLabel =
      callSessionMode === "stream_host"
        ? `${activeViewerCount} ${activeViewerCount === 1 ? "viewer" : "viewers"}`
        : `${connectedPeerCount} ${connectedPeerCount === 1 ? "peer" : "peers"}`;

    const participantCount = 1 + remoteCallParticipants.length;

    return (
      <div className="call-section flex flex-col gap-6 shrink-0">
        <div className="r-label flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <span className="text-[14px] font-semibold text-[#e4dfcf]">
              {isFocusMode ? "Focus Mode Active" : "No Active Stream"}
            </span>
            {isMobile && (
              <button
                onClick={() => setShowDebug(!showDebug)}
                className="text-[10px] text-[var(--ink-3)] uppercase tracking-wider hover:text-[var(--ink-2)]"
              >
                {showDebug ? "Hide Debug" : "Show Debug"}
              </button>
            )}
          </div>
        </div>

        {isFocusMode ? (
          <div className="focus-container relative w-full aspect-video shrink-0 rounded-[14px] bg-[#0e0e0b] border border-white/[0.05] overflow-hidden group">
            <div className="absolute inset-0 z-0">
              <div
                key={`focus-main-${selectedFocusSource}`}
                ref={attachMainVideoContainer}
                className="w-full h-full"
              />
            </div>
            {showLocalFullscreenShareGuard ? (
              <div className="study-share-guard absolute inset-0 z-[5] flex items-center justify-center bg-black">
                <div className="flex max-w-[420px] flex-col items-center gap-3 px-6 text-center">
                  <div className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-white">
                    <Monitor className="h-5 w-5" />
                  </div>
                  <div className="text-sm font-semibold text-white">
                    You are sharing your screen
                  </div>
                  <div className="text-xs leading-relaxed text-white/55">
                    Fullscreen preview is paused locally to prevent mirror
                    feedback. Exit fullscreen to see your local preview.
                  </div>
                  <div className="mt-2 grid w-full gap-2 rounded-[10px] border border-white/10 bg-white/[0.04] p-3 text-left text-[11px] text-white/70">
                    <div className="flex items-center justify-between gap-4">
                      <span>Capture track</span>
                      <span
                        className={
                          screenTrackLive
                            ? "font-semibold text-[#48b884]"
                            : "font-semibold text-[#d48779]"
                        }
                      >
                        {screenTrackLive ? "Live" : "Checking"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span>Source</span>
                      <span className="text-white/85">
                        {screenResolution} / {screenFrameRate}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span>Recipients</span>
                      <span className="text-white/85">{recipientLabel}</span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span>Outbound WebRTC</span>
                      <span
                        className={
                          outboundSending
                            ? "font-semibold text-[#48b884]"
                            : outboundStatsAvailable
                              ? "font-semibold text-[#c97d0c]"
                              : "text-white/50"
                        }
                      >
                        {outboundSending
                          ? "Sending"
                          : outboundStatsAvailable
                            ? "Waiting"
                            : connectedPeerCount > 0
                              ? "Measuring"
                              : "No peer yet"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="absolute top-2 left-2 z-10 bg-black/60 backdrop-blur text-white text-[10px] px-2 py-1 rounded-md flex items-center gap-1.5 pointer-events-none">
              <span>
                {selectedFocusSource === "screen"
                  ? isSharingScreen
                    ? "Your Screen"
                    : `${activeScreenSharer?.name || "Shared"} Screen`
                  : callSessionMode !== "stream_viewer"
                    ? "Your Webcam"
                    : `${streamHostUser?.name || "Host"} Webcam`}
              </span>
              <span className="text-[9px] bg-[#c97d0c] text-white px-1.5 py-0.5 rounded-full uppercase tracking-wider font-semibold animate-pulse">
                Live
              </span>
            </div>

            {availableFocusSources.length > 1 ? (
              <div
                className={
                  isRoomFullscreen
                    ? "absolute inset-x-0 bottom-0 z-20 flex justify-center bg-gradient-to-t from-black/70 via-black/25 to-transparent px-3 pb-4 pt-10"
                    : "absolute bottom-3 left-3 z-20 flex max-w-[calc(100%-1.5rem)] flex-wrap gap-2"
                }
              >
                <div className="flex flex-wrap items-center gap-2 rounded-full border border-white/10 bg-black/55 p-1.5 backdrop-blur-md">
                  {availableFocusSources.map((source) => {
                    const Icon = source.icon;
                    const isActive = selectedFocusSource === source.key;
                    return (
                      <button
                        key={source.key}
                        type="button"
                        onClick={() => setFocusPrimarySource(source.key)}
                        className={`flex items-center gap-2 rounded-full px-3 py-2 text-left transition ${isActive
                          ? "bg-white text-[#11110d] shadow-[0_8px_24px_rgba(0,0,0,0.2)]"
                          : "text-white/78 hover:bg-white/10 hover:text-white"
                          }`}
                        aria-pressed={isActive}
                        title={source.caption}
                      >
                        <Icon className="h-3.5 w-3.5 shrink-0" />
                        <span className="text-[11px] font-medium">
                          {source.label}
                        </span>
                        {isRoomFullscreen ? (
                          <span
                            className={`text-[10px] ${isActive ? "text-[#4a443a]" : "text-white/55"}`}
                          >
                            {source.caption}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {/* Real-time Mic Status & Speaking Indicator for Focus Stage */}
            {selectedFocusSource === "screen" && activeScreenSharer ? (
              <ParticipantMicIndicator
                store={store}
                id={activeScreenSharer.socketId === roomSocketId ? "local" : activeScreenSharer.socketId}
                isMuted={activeScreenSharer.socketId === roomSocketId ? !audioEnabled : !activeScreenSharer.audioEnabled}
              />
            ) : selectedFocusSource === "camera" ? (
              callSessionMode !== "stream_viewer" ? (
                <ParticipantMicIndicator
                  store={store}
                  id="local"
                  isMuted={!audioEnabled}
                />
              ) : streamHostUser ? (
                <ParticipantMicIndicator
                  store={store}
                  id={streamHostUser.socketId}
                  isMuted={!streamHostUser.audioEnabled}
                />
              ) : null
            ) : null}

            <MediaDebugOverlay store={store} showDebug={showDebug} />
          </div>
        ) : (
          /* Grid Layout (Conference Mode / Equal Space) */
          <div className="video-grid" data-participants={participantCount}>
            {/* Local Video Tile */}
            <div className="video-tile group">
              <div className="you-lbl z-10">
                You ({isHost ? "Host" : "Member"})
              </div>

              <div
                ref={attachLocalVideoContainer}
                className={`video-frame w-full h-full transition-opacity duration-700 ${videoEnabled || isSharingScreen ? "opacity-100" : "opacity-0"}`}
              />
              {!(videoEnabled || isSharingScreen) && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0e0e0b] gap-2">
                  <div className="h-12 w-12 rounded-full bg-white/[0.03] flex items-center justify-center text-[16px] font-bold text-[#e4dfcf] border border-white/[0.05]">
                    {getInitials(
                      groupMembers.find(
                        (member) => member.userId === group?.currentUserId,
                      )?.name,
                      groupMembers.find(
                        (member) => member.userId === group?.currentUserId,
                      )?.username,
                    )}
                  </div>
                  <div className="text-[10px] text-[#5c5a52] uppercase tracking-widest font-medium">
                    Camera Off
                  </div>
                </div>
              )}
              {callJoined ? (
                <div className="video-status-row z-10">
                  <span
                    className={`video-status-dot ${audioEnabled || isSharingScreen ? "on" : ""}`}
                  />
                  <span className="video-status-copy">Joined Call</span>
                </div>
              ) : (
                <div className="not-joined z-10">Not participating</div>
              )}

              {/* Real-time Mic Status & Speaking Indicator */}
              <ParticipantMicIndicator
                store={store}
                id="local"
                isMuted={!audioEnabled}
              />
            </div>

            {/* Remote Video Tiles */}
            {remoteCallParticipants.map((participant) => {
              const isPeerConnected = connectedPeers.has(participant.socketId);
              return (
                <div
                  key={participant.socketId}
                  className="video-tile group"
                >
                  <div className="you-lbl flex items-center gap-1.5 z-10">
                    {participant.name || participant.username || "Member"}
                  </div>

                  <div
                    ref={getRemoteRefCallback(participant.socketId)}
                    className={`video-frame w-full h-full transition-opacity duration-700 ${participant.videoEnabled && isPeerConnected ? "opacity-100" : "opacity-0"}`}
                  />
                  {(!participant.videoEnabled || !isPeerConnected) && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0e0e0b] gap-2">
                      <div className="h-12 w-12 rounded-full bg-white/[0.03] flex items-center justify-center text-[16px] font-bold text-[#e4dfcf] border border-white/[0.05]">
                        {getInitials(participant.name, participant.username)}
                      </div>
                      <div className="text-[10px] text-[#5c5a52] uppercase tracking-widest font-medium">
                        {!isPeerConnected ? "Connecting..." : "Camera Off"}
                      </div>
                    </div>
                  )}
                  <div className="video-status-row z-10">
                    <span
                      className={`video-status-dot ${participant.audioEnabled ? "on" : ""}`}
                    />
                    <span className="video-status-copy">In Call</span>
                  </div>

                  {/* Real-time Mic Status & Speaking Indicator */}
                  <ParticipantMicIndicator
                    store={store}
                    id={participant.socketId}
                    isMuted={!participant.audioEnabled}
                  />
                </div>
              );
            })}
          </div>
        )}

        {isBraveBrowser && !braveWarningDismissed && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            {/* Popup Container */}
            <div className="relative w-full max-w-sm bg-[#1e1236] border border-[#4a2b8d]/[0.5] rounded-[16px] p-6 text-center shadow-2xl animate-in fade-in zoom-in-95 duration-200">
              {/* Close Button */}
              <button
                onClick={() => setBraveWarningDismissed(true)}
                className="absolute top-3 right-3 p-1 rounded-full text-white/40 hover:text-white/80 hover:bg-white/5 transition-colors duration-150"
                aria-label="Dismiss"
              >
                <X className="w-4 h-4" />
              </button>

              {/* Content */}
              <div className="text-[13px] text-[#d1c1ff] font-medium leading-relaxed pt-2">
                <span className="text-white text-sm block mb-1 font-semibold">
                  Brave Browser Detected
                </span>
                Brave Shields may block camera or microphone access.
                <br />
                Please disable shields for this site or use Google Chrome.
              </div>
            </div>
          </div>
        )}

        {noPeersTimeout &&
          connectedPeers.size === 0 &&
          callJoined &&
          callSessionMode === "conference" && (
            <div className="no-participants absolute -bottom-[13px] left-1/2 -translate-x-1/2 -translate-y-1/2 text-[11px] text-center text-[#c97d0c] p-3">
              No other participants joined yet. Share the code to invite others!
            </div>
          )}

        {callErrorMessage ? (
          <div className="flex flex-col items-center gap-2 p-4 rounded-xl bg-red-500/10 border border-red-500/25 text-center text-xs leading-relaxed">
            <Shield className="w-5 h-5 text-[#d48779] shrink-0" />
            <span className="text-[#e4dfcf]">{callErrorMessage}</span>
            <button
              onClick={() => {
                setCallErrorMessage(null);
              }}
              className="mt-1 px-3 py-1 rounded-md border border-amber-500/40 bg-amber-500/15 text-[#c97d0c] text-[11px] cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        ) : null}

        <div className="call-btns flex flex-col gap-2">
          {!callJoined ? (
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => void joinConferenceCall()}
                disabled={callJoining || !!streamHostUser}
                className={`call-btn join w-full flex items-center justify-center gap-2 py-2.5 ${streamHostUser ? "opacity-50 grayscale cursor-not-allowed" : ""}`}
              >
                {callJoining && callSessionMode === "conference" ? (
                  <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <Phone className="h-4 w-4" />
                )}
                <span>
                  {callJoining && callSessionMode === "conference"
                    ? "Joining..."
                    : "Join Call"}
                </span>
              </button>

              {isHost ? (
                <button
                  onClick={() => void startRoomStream()}
                  disabled={callJoining}
                  className="call-btn mute w-full flex items-center justify-center gap-2 py-2.5"
                >
                  {callJoining && callSessionMode === "stream_host" ? (
                    <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <Radio className="h-4 w-4" />
                  )}
                  <span>
                    {callJoining && callSessionMode === "stream_host"
                      ? "Starting..."
                      : "Start Stream"}
                  </span>
                </button>
              ) : streamHostUser ? (
                <button
                  onClick={() => void watchRoomStream()}
                  disabled={callJoining}
                  className="call-btn mute w-full flex items-center justify-center gap-2 py-2.5"
                >
                  {callJoining && callSessionMode === "stream_viewer" ? (
                    <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <Radio className="h-4 w-4" />
                  )}
                  <span>
                    {callJoining && callSessionMode === "stream_viewer"
                      ? "Connecting..."
                      : "Watch Stream"}
                  </span>
                </button>
              ) : (
                <div className="call-btn mute opacity-40 cursor-not-allowed flex items-center justify-center gap-1.5 text-[11px] py-2.5">
                  <Radio className="h-3.5 w-3.5 opacity-60" />
                  <span>No Stream</span>
                </div>
              )}

              {streamHostUser && !callJoined && (
                <div className="text-[10px] text-center text-[#d48779] bg-[#d48779]/[0.05] py-1 rounded col-span-2">
                  Call disabled while stream is active
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => toggleAudioTrack()}
                className={`call-btn ${audioEnabled ? "" : "mute"}`}
                disabled={callSessionMode === "stream_viewer"}
              >
                {audioEnabled ? <Mic /> : <MicOff />}
                <span>{audioEnabled ? "Mute" : "Unmute"}</span>
              </button>
              <button
                onClick={() => toggleVideoTrack()}
                className={`call-btn ${videoEnabled ? "" : "mute"}`}
                disabled={callSessionMode === "stream_viewer"}
              >
                {videoEnabled ? <Video /> : <VideoOff />}
                <span>{videoEnabled ? "Cam Off" : "Cam On"}</span>
              </button>
              {callSessionMode === "conference" ||
                callSessionMode === "stream_host" ? (
                <>
                  <button
                    onClick={() => leaveRoomCall()}
                    className="call-btn leave col-span-1"
                  >
                    <PhoneOff className="h-4 w-4" />
                    <span>
                      {callSessionMode === "stream_host"
                        ? "End Stream"
                        : "Leave Call"}
                    </span>
                  </button>
                  <button
                    onClick={() => void toggleScreenShare()}
                    className={`call-btn ${isSharingScreen ? "join font-semibold" : "mute"} col-span-1`}
                  >
                    <Monitor className="h-4 w-4" />
                    <span>
                      {isSharingScreen ? "Stop Sharing" : "Share Screen"}
                    </span>
                  </button>
                </>
              ) : (
                <button
                  onClick={() => leaveRoomCall()}
                  className="call-btn leave col-span-2"
                >
                  <PhoneOff className="h-4 w-4" />
                  <span>Leave Call</span>
                </button>
              )}
            </div>
          )}

          {callErrorMessage && (
            <button
              onClick={() => void refreshGroup(true)}
              className="w-full text-[10px] text-[#9c9788] hover:text-[#e4dfcf] flex items-center justify-center gap-1 underline"
            >
              <RotateCcw className="h-3 w-3" /> Connection failed? Click to
              retry
            </button>
          )}
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="app-page room-page">
        <div className="mx-auto flex w-full max-w-[1100px] animate-pulse flex-col gap-6 px-4 py-4 sm:px-6 lg:px-8">
          <div className="room-bar !border-0 !px-0 !pb-0">
            <div>
              <div className="mb-3 h-4 w-40 rounded bg-white/[0.05]" />
              <div className="h-9 w-72 rounded bg-white/[0.06]" />
              <div className="mt-4 flex gap-2">
                {[0, 1, 2].map((item) => (
                  <div
                    key={item}
                    className="h-7 w-24 rounded-full bg-white/[0.05]"
                  />
                ))}
              </div>
            </div>
          </div>
          <div className="grid items-start gap-6 lg:grid-cols-[1fr_320px]">
            <div className="space-y-6">
              <div className="h-64 rounded-[18px] border border-white/[0.065] bg-[#141410]" />
              <div className="grid gap-6 md:grid-cols-2">
                <div className="h-48 rounded-[18px] border border-white/[0.065] bg-[#141410]" />
                <div className="h-48 rounded-[18px] border border-white/[0.065] bg-[#141410]" />
              </div>
              <div className="h-56 rounded-[18px] border border-white/[0.065] bg-[#141410]" />
            </div>
            <aside className="hidden h-80 rounded-[18px] border border-white/[0.05] bg-[#161614] lg:block" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !group) {
    return (
      <div className="px-8 py-6">
        <div className="mx-auto max-w-3xl rounded-[18px] border border-white/[0.065] bg-[#141410] px-6 py-10 text-center">
          <div className="font-[family:var(--font-fraunces)] text-[28px] text-[#e4dfcf]">
            Study room unavailable
          </div>
          <p className="mt-3 text-[13px] leading-6 text-[#9c9788]">
            {error || "This room could not be loaded right now."}
          </p>
          <div className="mt-6 flex items-center justify-center gap-3">
            <Link
              href="/dashboard/groups"
              className="rounded-[10px] border border-white/[0.08] px-4 py-2 text-[12px] text-[#e4dfcf] transition hover:bg-white/[0.04]"
            >
              Back to groups
            </Link>
            <button
              type="button"
              onClick={() => void loadGroup()}
              className="rounded-[10px] bg-[#c97d0c] px-4 py-2 text-[12px] text-white transition hover:bg-[#b56d09]"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }



  const renderMembersCard = (isMobileStyle: boolean) => {
    return (
      <div
        ref={isMobileStyle ? cardRef : null}
        className={`study-room-members-card ${isMobileStyle ? "mobile-only" : "desktop-only"} ${isMobileStyle ? (isMembersOpen ? "open" : "") : ""
          }`}
      >
        <div className="flex items-center justify-between">
          <div className="r-label">Room Members</div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActivityModalOpen(true)}
              className="flex items-center gap-2 rounded-full bg-white/[0.06] px-3 py-1.5 text-[10px] font-medium text-[#9c9788] transition hover:bg-white/[0.1]"
            >
              <Activity className="h-3 w-3" />
              Activity
            </button>
            {isMobileStyle && (
              <button
                onClick={() => setIsMembersOpen(false)}
                className="flex items-center justify-center w-6 h-6 rounded-full hover:bg-white/[0.1] text-[#9c9788] hover:text-[#e4dfcf]"
                title="Close members"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
        {displayMembers && displayMembers.length > 0 ? (
          <div className="member-list">
            {displayMembers.map((user) => (
              <div
                key={user.userId}
                className="member-item flex items-center gap-3 py-3 border-b border-white/[0.04] last:border-0"
              >
                <div
                  className={`m-av h-8 w-8 rounded-full bg-[#1e1e1b] flex items-center justify-center text-[10px] font-bold ${user.userId === group?.currentUserId ? "ring-2 ring-[#c97d0c] ring-offset-2 ring-offset-[#0e0e0b]" : ""}`}
                >
                  {user.name?.[0] || user.username?.[0] || "?"}
                </div>
                <div className="m-info">
                  <div className="m-name text-[13px] text-[#e4dfcf]">
                    {user.name || user.username || "Room member"}
                    {user.userId === group?.currentUserId && " (You)"}
                  </div>
                  <div className="m-status text-[11px] text-[#9c9788] flex items-center gap-1.5 mt-0.5">
                    {user.sessionMode === "stream_host" && (
                      <>
                        <span className="h-1.5 w-1.5 rounded-full bg-[#c97d0c] animate-pulse" />
                        <span>Streaming</span>
                      </>
                    )}
                    {user.sessionMode === "conference" && (
                      <>
                        <span className="h-1.5 w-1.5 rounded-full bg-[#1a9e75]" />
                        <span>In Call</span>
                      </>
                    )}
                    {user.sessionMode === "stream_viewer" && (
                      <>
                        <span className="h-1.5 w-1.5 rounded-full bg-[#1a9e75]" />
                        <span>Watching</span>
                      </>
                    )}
                    {!user.sessionMode && (
                      <>
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${user.status === "focused" ||
                            user.status === "active"
                            ? "bg-[#1a9e75]"
                            : user.status === "away"
                              ? "bg-[#c97d0c]"
                              : "bg-white/[0.15]"
                            }`}
                        />
                        <span>
                          {user.status === "focused" || user.status === "active"
                            ? "Active"
                            : user.status === "away"
                              ? "Online"
                              : "Offline"}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-4 text-center text-[11px] uppercase tracking-widest text-[#5c5a52]">
            No members found
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      className={`app-page room-page study-room-redesign ${callJoined ? "in-call" : "not-in-call"} show-tab-${workspaceTab}`}
    >
      <div className="study-room-shell">
        <main className="study-room-main">
          {/* Room header */}
          <div className="room-bar !px-0 !border-0 !pb-0">
            <div>
              <div
                className="room-back"
                onClick={() => router.push("/dashboard/groups")}
              >
                <ArrowLeft className="h-3 w-3" />
                <span className="room-back-desktop">back to group chat</span>
                <span className="room-back-mobile">
                  {group.title || "Group name"}
                </span>
              </div>
              {/* <div className="room-title-line">
                <span className="room-title">
                  {group.title || "Group Name"}
                </span>
              </div> */}
              <div className="room-pills">
                <span className="pill">
                  {roomPresenceCount}{" "}
                  {roomPresenceCount === 1 ? "person" : "people"} in room
                </span>
                <span className={`pill ${activeCallCount > 0 ? "on" : ""}`}>
                  <Users className="h-3 w-3" /> {activeCallCount} in Call
                </span>
                <span className="pill amber">Code {group.inviteCode}</span>
                {streamHostUser ? (
                  <span className="pill red animate-pulse">
                    <Radio className="h-3 w-3" /> {activeViewerCount} watching{" "}
                    {streamHostUser.name || "host"}
                  </span>
                ) : null}
                {isHost && <span className="pill">Host controls</span>}
              </div>
            </div>
            <div className="room-bar-right">
              <button
                type="button"
                onClick={() => setIsMembersOpen((prev) => !prev)}
                className={`room-members-mobile-pill ${isMembersOpen ? "active" : ""}`}
              >
                Members
              </button>
            </div>
          </div>

          {/* Room body */}
          <div className="room-body grid lg:grid-cols-[1fr_280px] gap-6 items-start">
            {/* Center scrollable */}
            <div className="room-center min-w-0">
              {/* Call stage + action buttons wrapper */}
              <div
                ref={focusContainerRef}
                className="relative study-room-stage-wrapper mb-6"
              >
                <div className="study-room-call-stage">
                  {renderCallSection()}
                </div>

                <FullscreenTimerOverlay store={store} />
              </div>

              {/* Mobile Timer Card (visible only under 1023px) */}
              <div className="mobile-timer-wrapper lg:hidden">
                <TimerBlock
                  store={store}
                  canControlSession={canControlSession}
                  toggleTimer={toggleTimer}
                  resetTimer={resetTimer}
                  applyMode={applyMode}
                  updateDuration={updateDuration}
                  focusMinutes={focusMinutes}
                  breakMinutes={breakMinutes}
                />
              </div>

              {/* Workspace Tabs - Mobile/Tablet only */}
              <div
                className="mobile-tab-nav lg:hidden"
                role="tablist"
                aria-label="Workspace tabs"
              >
                <button
                  onClick={() => setWorkspaceTab("tasks")}
                  className={`mobile-tab-btn  ${workspaceTab === "tasks" ? "active" : ""}`}
                  role="tab"
                  aria-selected={workspaceTab === "tasks"}
                >
                  Goal & Tasks
                </button>
                <button
                  onClick={() => setWorkspaceTab("notes")}
                  className={`mobile-tab-btn ${workspaceTab === "notes" ? "active" : ""}`}
                  role="tab"
                  aria-selected={workspaceTab === "notes"}
                >
                  Notes & Outcomes
                </button>
                {/* <button
                  onClick={() => setWorkspaceTab("members")}
                  className={`mobile-tab-btn ${workspaceTab === "members" ? "active" : ""}`}
                  role="tab"
                  aria-selected={workspaceTab === "members"}
                >
                  Members
                </button> */}
              </div>

              {/* Room goal */}
              <div className="section-block room-goal-block mb-6">
                <div className="section-head">
                  <div className="section-label">
                    <Check />
                    Room goal
                  </div>
                  {(group?.canManage ?? false) && !isEditingGoal && (
                    <button
                      type="button"
                      className="text-[11px] font-medium text-[#9c9788] hover:text-[#e4dfcf] bg-white/[0.04] hover:bg-white/[0.1] px-2 py-0.5 rounded transition"
                      onClick={() => {
                        setEditedGoal(group?.description || "");
                        setIsEditingGoal(true);
                      }}
                    >
                      Edit
                    </button>
                  )}
                </div>
                {isEditingGoal ? (
                  <div className="mt-2 space-y-2">
                    <textarea
                      className="field-textarea w-full text-[13px]"
                      rows={2}
                      placeholder="Define a goal for the room..."
                      value={editedGoal}
                      onChange={(e) => setEditedGoal(e.target.value)}
                      disabled={savingGoal}
                    />
                    <div className="flex gap-2 justify-end">
                      <button
                        type="button"
                        className="text-[11px] px-2.5 py-1 rounded bg-white/[0.06] hover:bg-white/[0.1] transition"
                        onClick={() => setIsEditingGoal(false)}
                        disabled={savingGoal}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="text-[11px] px-2.5 py-1 rounded bg-[#c97d0c] hover:bg-[#b56d09] text-white transition font-medium"
                        onClick={() => void saveRoomGoal()}
                        disabled={savingGoal}
                      >
                        {savingGoal ? "Saving..." : "Save"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="goal-text">{roomGoal}</div>
                )}
              </div>

              {/* Study context + Session note */}
              <div className="two-col room-notes-block mb-6">
                <div className="section-block">
                  <div className="section-head">
                    <div className="section-label">
                      <MessageSquare />
                      Study context
                    </div>
                  </div>
                  <div className="section-body">
                    <textarea
                      className="field-textarea"
                      placeholder="How should the group approach this block? e.g. skim first, extract 3 ideas, then compare notes."
                      value={sessionPrompt}
                      onChange={(event) => setSessionPrompt(event.target.value)}
                      disabled={!canControlSession}
                    />
                    {canControlSession && (
                      <div className="save-row">
                        <span className="save-hint">
                          Visible to everyone in the room
                        </span>
                        <button
                          className="save-btn"
                          onClick={() => void saveSessionPrompt()}
                        >
                          Save prompt
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="section-block">
                  <div className="section-head">
                    <div className="section-label">
                      <FileText />
                      Session note
                    </div>
                  </div>
                  <div className="section-body">
                    <textarea
                      className="field-textarea"
                      placeholder="What is this room trying to finish in this block?"
                      value={sessionNote}
                      onChange={(event) => setSessionNote(event.target.value)}
                      disabled={!canEditNotes}
                    />
                    {canEditNotes && (
                      <div className="save-row">
                        <span className="save-hint">
                          Shared with the whole room
                        </span>
                        <button
                          className="save-btn"
                          onClick={() => void saveSessionNote()}
                        >
                          Save note
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Session outcomes */}
              <div className="section-block room-outcomes-block mb-6">
                <div className="section-head">
                  <div className="section-label">
                    <Check />
                    Session outcomes
                  </div>
                  {canEditNotes && (
                    <button
                      className="save-btn"
                      onClick={() => void generateSessionRecap()}
                      disabled={generatingRecap}
                    >
                      {generatingRecap ? "Generating..." : "Generate recap"}
                    </button>
                  )}
                </div>
                <div className="section-body">
                  <div className="three-col">
                    <div className="outcome-col">
                      <div className="outcome-title">Completed this block</div>
                      {canEditNotes && (
                        <div className="input-row">
                          <input
                            className="field-input"
                            placeholder="Add outcome…"
                            value={outcomeInputs.completedThisBlock}
                            onChange={(e) =>
                              setOutcomeInputs((curr) => ({
                                ...curr,
                                completedThisBlock: e.target.value,
                              }))
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter")
                                addOutcome("completedThisBlock");
                            }}
                          />
                          <button
                            className="add-btn"
                            onClick={() => addOutcome("completedThisBlock")}
                          >
                            Add
                          </button>
                        </div>
                      )}
                      {sessionOutcomes.completedThisBlock.length === 0 ? (
                        <div className="empty-chip">Nothing captured yet.</div>
                      ) : (
                        sessionOutcomes.completedThisBlock.map(
                          (outcome, idx) => (
                            <div key={idx} className="outcome-item">
                              <span className="outcome-text">{outcome}</span>
                              {canEditNotes && (
                                <button
                                  className="item-del"
                                  onClick={() =>
                                    removeOutcome("completedThisBlock", idx)
                                  }
                                >
                                  <X />
                                </button>
                              )}
                            </div>
                          ),
                        )
                      )}
                    </div>

                    <div className="outcome-col">
                      <div className="outcome-title">Carry forward</div>
                      {canEditNotes && (
                        <div className="input-row">
                          <input
                            className="field-input"
                            placeholder="Add task…"
                            value={outcomeInputs.carryForward}
                            onChange={(e) =>
                              setOutcomeInputs((curr) => ({
                                ...curr,
                                carryForward: e.target.value,
                              }))
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter") addOutcome("carryForward");
                            }}
                          />
                          <button
                            className="add-btn"
                            onClick={() => addOutcome("carryForward")}
                          >
                            Add
                          </button>
                        </div>
                      )}
                      {sessionOutcomes.carryForward.length === 0 ? (
                        <div className="empty-chip">Nothing captured yet.</div>
                      ) : (
                        sessionOutcomes.carryForward.map((outcome, idx) => (
                          <div key={idx} className="outcome-item">
                            <span className="outcome-text">{outcome}</span>
                            {canEditNotes && (
                              <button
                                className="item-del"
                                onClick={() =>
                                  removeOutcome("carryForward", idx)
                                }
                              >
                                <X />
                              </button>
                            )}
                          </div>
                        ))
                      )}
                    </div>

                    <div className="outcome-col">
                      <div className="outcome-title">Blockers</div>
                      {canEditNotes && (
                        <div className="input-row">
                          <input
                            className="field-input"
                            placeholder="Add blocker…"
                            value={outcomeInputs.blockers}
                            onChange={(e) =>
                              setOutcomeInputs((curr) => ({
                                ...curr,
                                blockers: e.target.value,
                              }))
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter") addOutcome("blockers");
                            }}
                          />
                          <button
                            className="add-btn"
                            onClick={() => addOutcome("blockers")}
                          >
                            Add
                          </button>
                        </div>
                      )}
                      {sessionOutcomes.blockers.length === 0 ? (
                        <div className="empty-chip">Nothing captured yet.</div>
                      ) : (
                        sessionOutcomes.blockers.map((outcome, idx) => (
                          <div key={idx} className="outcome-item">
                            <span className="outcome-text">{outcome}</span>
                            {canEditNotes && (
                              <button
                                className="item-del"
                                onClick={() => removeOutcome("blockers", idx)}
                              >
                                <X />
                              </button>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Room tasks */}
              <div className="section-block room-tasks-block ">
                <div className="section-head">
                  <div className="section-label">
                    <Check />
                    Room tasks
                  </div>
                </div>
                <div className="section-body">
                  {canEditTasks && (
                    <div className="input-row">
                      <input
                        className="field-input"
                        placeholder="Add the next concrete task…"
                        value={taskInput}
                        onChange={(e) => setTaskInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void addTask();
                        }}
                      />
                      <button
                        className="add-btn"
                        onClick={() => void addTask()}
                      >
                        Add
                      </button>
                    </div>
                  )}
                  {tasks.length === 0 ? (
                    <div className="empty-chip">
                      No shared tasks yet. Add the next steps this room should
                      finish.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {tasks.map((task) => (
                        <div key={task.id} className="task-item">
                          <label className="flex flex-1 items-start gap-3 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={task.completed}
                              onChange={(e) =>
                                void toggleTask(task.id, e.target.checked)
                              }
                              disabled={!canEditTasks}
                              className="mt-0.5 rounded border-white/[0.1] bg-transparent text-[var(--amber)] focus:ring-0"
                            />
                            <span
                              className={`task-text ${task.completed ? "opacity-50 line-through" : ""}`}
                            >
                              {task.text}
                            </span>
                          </label>
                          {canEditTasks && (
                            <button
                              className="item-del"
                              onClick={() => void removeTask(task.id)}
                            >
                              <X />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Mobile Members Tab Content */}
              {renderMembersCard(true)}
            </div>

            {/* Right panel - Desktop only */}
            <aside className="study-room-right !block lg:!flex">
              <div className="hidden lg:block">
                <TimerBlock
                  store={store}
                  canControlSession={canControlSession}
                  toggleTimer={toggleTimer}
                  resetTimer={resetTimer}
                  applyMode={applyMode}
                  updateDuration={updateDuration}
                  focusMinutes={focusMinutes}
                  breakMinutes={breakMinutes}
                />
              </div>
              {renderMembersCard(false)}
            </aside>
          </div>
        </main>
      </div>

      <div
        className={`mobile-members-overlay ${isMembersOpen ? "open" : ""}`}
        onClick={() => setIsMembersOpen(false)}
      />

      {activityModalOpen ? (
        <div
          className="activity-modal-overlay"
          onClick={() => setActivityModalOpen(false)}
        >
          <div
            className="activity-modal"
            role="dialog"
            aria-label="Room activity"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="activity-modal-head">
              <div>
                <div className="tl-lbl">Room Q&A & Comments</div>
                <div className="activity-modal-sub">
                  Ask questions, leave comments, and reply to members in this
                  room.
                </div>
              </div>
              <div className="activity-modal-actions">
                <button
                  type="button"
                  className="tl-sync"
                  onClick={() => void refreshGroup(false)}
                >
                  Sync now
                </button>
                <button
                  type="button"
                  className="activity-close-btn"
                  onClick={() => setActivityModalOpen(false)}
                  aria-label="Close room activity"
                >
                  <X />
                </button>
              </div>
            </div>

            <div className="activity-modal-body flex flex-col justify-between h-[420px]">
              <div className="activity-messages-list overflow-y-auto pr-1 flex-1 space-y-3 mb-4">
                {group?.messages && group.messages.length > 0 ? (
                  group.messages.map((msg) => {
                    const { isQuestion, reply, cleanText } =
                      parseMessageContent(msg.content);
                    const parentMsg = reply
                      ? group.messages.find((m) => m.id === reply.messageId)
                      : null;
                    const parentData = parentMsg
                      ? parseMessageContent(parentMsg.content)
                      : null;

                    return (
                      <div
                        key={msg.id}
                        className={`qa-comment-card p-3 rounded-lg border transition ${isQuestion
                          ? "border-[#c97d0c]/30 bg-[#c97d0c]/5 hover:bg-[#c97d0c]/8"
                          : "border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04]"
                          }`}
                      >
                        {reply && (
                          <div className="reply-quote-box mb-2 pl-3 border-l-2 border-white/20 text-[11px] text-[#9c9788] italic">
                            <div className="flex items-center gap-1.5 font-medium not-italic text-white/50 mb-0.5">
                              <span className="text-[10px]">↳</span>
                              Reply to @{reply.authorName}:
                            </div>
                            <div className="line-clamp-2">
                              {parentData
                                ? parentData.cleanText
                                : "Original message unavailable"}
                            </div>
                          </div>
                        )}

                        <div className="flex items-start justify-between gap-3">
                          <div className="flex gap-2.5">
                            <div className="h-7 w-7 rounded-full bg-[#1e1e1b] border border-white/[0.08] flex items-center justify-center text-[10px] font-bold text-[#e4dfcf] flex-shrink-0 mt-0.5">
                              {getInitials(msg.authorName, msg.authorUsername)}
                            </div>
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-[12px] font-semibold text-[#e4dfcf]">
                                  {msg.authorName ||
                                    msg.authorUsername ||
                                    "Study member"}
                                </span>
                                {isQuestion && (
                                  <span className="question-badge px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider bg-[#c97d0c]/20 text-[#c97d0c] border border-[#c97d0c]/30">
                                    Question
                                  </span>
                                )}
                                <span className="text-[9px] text-[#5c5a52]">
                                  {formatTime(msg.createdAt)}
                                </span>
                              </div>
                              <p className="text-[13px] text-[#ddd8cc] mt-1 whitespace-pre-wrap break-words">
                                {cleanText}
                              </p>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => setReplyingToMessage(msg)}
                            className="flex items-center gap-1 text-[10px] font-medium text-[#9c9788] hover:text-[#e4dfcf] bg-white/[0.04] hover:bg-white/[0.1] px-2 py-1 rounded transition"
                          >
                            Reply
                          </button>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="activity-empty text-center text-[#5c5a52] text-xs py-8">
                    No questions or comments yet. Start the conversation below!
                  </div>
                )}
              </div>

              <div className="composer-section border-t border-white/[0.08] pt-4 mt-auto">
                {replyingToMessage && (
                  <div className="replying-banner flex items-center justify-between bg-white/[0.03] border border-white/[0.06] rounded-md px-3 py-1.5 mb-3 text-[11px]">
                    <div className="text-[#9c9788] truncate mr-2">
                      <span className="text-[#ddd8cc] font-medium">
                        Replying to
                      </span>{" "}
                      @
                      {replyingToMessage.authorName ||
                        replyingToMessage.authorUsername ||
                        "member"}
                      :{" "}
                      <span className="italic">
                        "
                        {
                          parseMessageContent(replyingToMessage.content)
                            .cleanText
                        }
                        "
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setReplyingToMessage(null)}
                      className="text-[#9c9788] hover:text-[#e4dfcf] transition flex-shrink-0"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}

                <div className="flex items-center gap-2 mb-3">
                  <button
                    type="button"
                    onClick={() => setMessageMode("comment")}
                    className={`px-3 py-1 rounded-full text-[11px] font-semibold transition border ${messageMode === "comment"
                      ? "bg-white/[0.08] text-white border-white/[0.15]"
                      : "bg-transparent text-[#9c9788] border-transparent hover:text-white"
                      }`}
                  >
                    Post Comment
                  </button>
                  <button
                    type="button"
                    onClick={() => setMessageMode("question")}
                    className={`px-3 py-1 rounded-full text-[11px] font-semibold transition border flex items-center gap-1 ${messageMode === "question"
                      ? "bg-[#c97d0c]/20 text-[#c97d0c] border-[#c97d0c]/45"
                      : "bg-transparent text-[#9c9788] border-transparent hover:text-[#c97d0c]"
                      }`}
                  >
                    <span>❓</span> Ask a Question
                  </button>
                </div>

                <div className="update-row flex gap-2">
                  <input
                    className="update-input flex-1 min-w-0"
                    placeholder={
                      messageMode === "question"
                        ? "Ask a question to the room..."
                        : "Write a comment or quick message..."
                    }
                    value={quickMessage}
                    onChange={(e) => setQuickMessage(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void handleQuickSend();
                    }}
                    disabled={!canPostMessages}
                  />
                  <button
                    className={`update-send px-4 py-2 rounded-md font-semibold text-xs transition ${messageMode === "question"
                      ? "bg-[#c97d0c] hover:bg-[#b56d09] text-white disabled:bg-[#c97d0c]/50"
                      : "bg-white/[0.08] hover:bg-white/[0.15] text-[#e4dfcf] disabled:bg-white/[0.04]"
                      }`}
                    onClick={() => void handleQuickSend()}
                    disabled={
                      sending || !quickMessage.trim() || !canPostMessages
                    }
                  >
                    Send
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Hidden canvas and video for fallback and auto PiP */}
      <canvas
        ref={canvasRef}
        width={300}
        height={200}
        style={{ display: "none" }}
      />
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "1px",
          height: "1px",
          opacity: 0.001,
          pointerEvents: "none",
        }}
      />

      {pipWindow && (
        <PictureInPicturePortal pipWindow={pipWindow}>
          <PipUI
            store={store}
            group={group}
            currentActiveStream={currentActiveStream}
            canControlSession={canControlSession}
            toggleTimer={toggleTimer}
            resetTimer={resetTimer}
            toggleAudioTrack={toggleAudioTrack}
            toggleVideoTrack={toggleVideoTrack}
            onClose={() => pipWindow.close()}
          />
        </PictureInPicturePortal>
      )}

      {/* Globally mounted high-performance call control bar */}
      <FloatingControls
        store={store}
        joinConferenceCall={joinConferenceCall}
        startRoomStream={startRoomStream}
        watchRoomStream={watchRoomStream}
        leaveRoomCall={leaveRoomCall}
        toggleAudioTrack={toggleAudioTrack}
        toggleVideoTrack={toggleVideoTrack}
        toggleScreenShare={toggleScreenShare}
        toggleRoomFullscreen={toggleRoomFullscreen}
        startPictureInPicture={startPictureInPicture}
        isHost={isHost}
      />
    </div>
  );
}

function PictureInPicturePortal({
  pipWindow,
  children,
}: {
  pipWindow: Window;
  children: React.ReactNode;
}) {
  return createPortal(children, pipWindow.document.body);
}

const PipVideo = ({ stream }: { stream: MediaStream }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !stream) return;
    video.srcObject = stream;
    video.play().catch((err) => {
      console.warn("[PiP Video] Autoplay failed", err);
    });
  }, [stream]);

  return (
    <div className="w-full aspect-video relative flex-1 min-h-0 bg-black rounded-lg overflow-hidden border border-white/10 flex items-center justify-center">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="w-full h-full object-contain"
      />
    </div>
  );
};

const PipUI = ({
  store,
  group,
  currentActiveStream,
  canControlSession,
  toggleTimer,
  resetTimer,
  toggleAudioTrack,
  toggleVideoTrack,
  onClose,
}: {
  store: RoomStateStore;
  group: any;
  currentActiveStream: MediaStream | null;
  canControlSession: boolean;
  toggleTimer: () => void;
  resetTimer: () => void;
  toggleAudioTrack: () => void;
  toggleVideoTrack: () => void;
  onClose: () => void;
}) => {
  const timeLeft = useRoomState(store, "timeLeft", DEFAULT_FOCUS_MINUTES * 60);
  const mode = useRoomState(store, "mode", "focus" as StudyRoomMode);
  const status = useRoomState(store, "status", "idle" as StudyRoomStatus);
  const callJoined = useRoomState(store, "callJoined", false);
  const audioEnabled = useRoomState(store, "audioEnabled", false);
  const videoEnabled = useRoomState(store, "videoEnabled", false);
  const formatDuration = (totalSeconds: number) => {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  };

  return (
    <div className="w-full h-full flex flex-col justify-between bg-[#0e0e0d] text-[#ddd8cc] p-4 select-none font-sans">
      <div className="flex items-center justify-between border-b border-white/5 pb-2 mb-2 w-full text-left">
        <span className="text-xs font-semibold text-[#ffd000] truncate max-w-[200px]">
          {group?.title || "Study Session"}
        </span>
        <span
          className={`text-[9px] px-1.5 py-0.5 rounded font-mono uppercase font-bold ${mode === "focus"
            ? "bg-[rgba(201,125,12,0.13)] text-[#c97d0c] border border-[rgba(201,125,12,0.25)]"
            : "bg-[rgba(26,158,117,0.13)] text-[#1a9e75] border border-[rgba(26,158,117,0.25)]"
            }`}
        >
          {mode === "focus" ? "Focus" : "Break"}
        </span>
      </div>

      <div className="flex-1 w-full min-h-0 flex flex-col items-center justify-center gap-2">
        {currentActiveStream ? (
          <PipVideo stream={currentActiveStream} />
        ) : (
          <div className="flex flex-col items-center justify-center py-4 bg-[#161614] rounded-lg border border-white/5 w-full flex-1 mb-2">
            <svg
              className="h-8 w-8 text-[#c97d0c] animate-pulse mb-1"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
              <path d="M12 6v6l4 2" />
            </svg>
            <span className="text-[10px] text-[#7e7b72] uppercase tracking-wider font-semibold">
              Study Session Active
            </span>
          </div>
        )}

        <div className="flex flex-col items-center justify-center my-1">
          <span className="text-3xl font-extrabold tracking-tight font-mono text-[#e4dfcf]">
            {formatDuration(timeLeft)}
          </span>
        </div>
      </div>

      <div className="flex items-center justify-center gap-3 mt-2 border-t border-white/5 pt-2">
        {canControlSession && (
          <>
            <button
              onClick={resetTimer}
              className="p-2 rounded-full bg-white/5 hover:bg-white/10 text-[#ddd8cc] transition-all"
              title="Reset Timer"
            >
              <svg
                className="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
              </svg>
            </button>
            <button
              onClick={toggleTimer}
              className={`p-2.5 rounded-full transition-all ${status === "running" && timeLeft > 0
                ? "bg-white/10 hover:bg-white/20 text-[#e4dfcf]"
                : "bg-[#c97d0c] hover:bg-[#b56d09] text-black"
                }`}
              title={status === "running" && timeLeft > 0 ? "Pause" : "Start"}
            >
              {status === "running" && timeLeft > 0 ? (
                <svg
                  className="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <rect x="14" y="4" width="4" height="16" rx="1" />
                  <rect x="6" y="4" width="4" height="16" rx="1" />
                </svg>
              ) : (
                <svg
                  className="h-4 w-4 ml-0.5"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
              )}
            </button>
          </>
        )}

        {callJoined && (
          <>
            <button
              onClick={toggleAudioTrack}
              className={`p-2 rounded-full transition-all ${audioEnabled
                ? "bg-white/10 hover:bg-white/20 text-[#e4dfcf]"
                : "bg-red-500/25 border border-red-500/55 text-red-500 hover:bg-red-500/40"
                }`}
              title={audioEnabled ? "Mute Mic" : "Unmute Mic"}
            >
              {audioEnabled ? (
                <svg
                  className="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                  <path d="M19 10v1a7 7 0 0 1-14 0v-1" />
                  <line x1="12" x2="12" y1="19" y2="22" />
                </svg>
              ) : (
                <svg
                  className="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="2" y1="2" x2="22" y2="22" />
                  <path d="M18.89 13.19A6.95 6.95 0 0 1 12 18c-3.14 0-5.79-2.07-6.68-4.9m11.97-6.73L15.3 8.35A3 3 0 0 0 12 8a3 3 0 0 0-3 3v2.8m4 5.3v2.9M5 10v1a7 7 0 0 0 .15 1.45" />
                </svg>
              )}
            </button>
            <button
              onClick={toggleVideoTrack}
              className={`p-2 rounded-full transition-all ${videoEnabled
                ? "bg-white/10 hover:bg-white/20 text-[#e4dfcf]"
                : "bg-red-500/25 border border-red-500/55 text-red-500 hover:bg-red-500/40"
                }`}
              title={videoEnabled ? "Turn off Camera" : "Turn on Camera"}
            >
              {videoEnabled ? (
                <svg
                  className="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="m22 8-6 4 6 4V8Z" />
                  <rect width="14" height="12" x="2" y="6" rx="2" ry="2" />
                </svg>
              ) : (
                <svg
                  className="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="m2 2 20 20" />
                  <path d="M21 16V8a2 2 0 0 0-2-2h-9m-4 0H4a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-1l4 3V8l-2 1.33" />
                </svg>
              )}
            </button>
          </>
        )}
      </div>
    </div>
  );
};

const TimerBlock = React.memo(({
  store,
  canControlSession,
  toggleTimer,
  resetTimer,
  applyMode,
  updateDuration,
  focusMinutes,
  breakMinutes,
}: {
  store: RoomStateStore;
  canControlSession: boolean;
  toggleTimer: () => void;
  resetTimer: () => void;
  applyMode: (mode: StudyRoomMode) => void;
  updateDuration: (mode: StudyRoomMode, mins: number) => void;
  focusMinutes: number;
  breakMinutes: number;
}) => {
  const timeLeft = useRoomState(store, "timeLeft", DEFAULT_FOCUS_MINUTES * 60);
  const mode = useRoomState(store, "mode", "focus" as StudyRoomMode);
  const status = useRoomState(store, "status", "idle" as StudyRoomStatus);
  const timerOptionsOpen = useRoomState(store, "timerOptionsOpen", false);

  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (timerOptionsOpen && dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        store.set("timerOptionsOpen", false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [timerOptionsOpen, store]);

  return (
    <div className="timer-block">
      <div className="timer-type">
        Shared session{" "}
        <span className="timer-tag">
          {mode === "focus" ? "Focus block" : "Break block"}
        </span>
        <div
          className="relative-container-wrapper"
          style={{ position: "relative", display: "inline-block" }}
        >
          <button
            className="timer-options-btn"
            onClick={() => store.set("timerOptionsOpen", !timerOptionsOpen)}
            title="Timer Settings"
          >
            <Settings className="h-3 w-3" />
          </button>

          {timerOptionsOpen && canControlSession && (
            <div className="timer-options-dropdown" ref={dropdownRef}>
              <div className="timer-options-section">
                <div className="timer-options-label">Mode</div>
                <div className="timer-options-chips">
                  <button
                    className={`dur-chip ${mode === "focus" ? "on" : ""}`}
                    onClick={() => void applyMode("focus")}
                  >
                    Focus
                  </button>
                  <button
                    className={`dur-chip ${mode === "break" ? "on" : ""}`}
                    onClick={() => void applyMode("break")}
                  >
                    Break
                  </button>
                </div>
              </div>

              {mode === "focus" && (
                <div className="timer-options-section">
                  <div className="timer-options-label">Focus duration</div>
                  <div className="timer-options-chips">
                    {[20, 25, 45, 60].map((mins) => (
                      <button
                        key={`focus-${mins}`}
                        onClick={() => void updateDuration("focus", mins)}
                        className={`dur-chip ${focusMinutes === mins ? "on" : ""}`}
                      >
                        {mins}m
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {mode === "break" && (
                <div className="timer-options-section">
                  <div className="timer-options-label">Break duration</div>
                  <div className="timer-options-chips">
                    {[5, 10, 15].map((mins) => (
                      <button
                        key={`break-${mins}`}
                        onClick={() => void updateDuration("break", mins)}
                        className={`dur-chip ${breakMinutes === mins ? "on" : ""}`}
                      >
                        {mins}m
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="timer-face" id="timer-display">
        {formatDuration(timeLeft)}
      </div>
      {canControlSession ? (
        <div className="timer-row">
          <button
            className={`t-btn ${status === "running" && timeLeft > 0 ? "ghost" : "amber"}`}
            onClick={() => void toggleTimer()}
            title={
              status === "running" && timeLeft > 0
                ? "Pause"
                : status === "paused" && timeLeft > 0
                  ? "Resume"
                  : "Start"
            }
          >
            {status === "running" && timeLeft > 0 ? (
              <>
                <Pause /> <span className="btn-text">Pause</span>
              </>
            ) : (
              <>
                <Play />{" "}
                <span className="btn-text">
                  {status === "paused" && timeLeft > 0 ? "Resume" : "Start"}
                </span>
              </>
            )}
          </button>
          <button
            className="t-btn ghost"
            onClick={() => void resetTimer()}
            title="Reset timer"
          >
            <RotateCcw /> <span className="btn-text">Reset</span>
          </button>
        </div>
      ) : (
        <div className="timer-viewer-msg">
          Only the group host can manage the timer
        </div>
      )}
    </div>
  );
});
TimerBlock.displayName = "TimerBlock";

const FullscreenTimerOverlay = React.memo(({ store }: { store: RoomStateStore }) => {
  const isRoomFullscreen = useRoomState(store, "isRoomFullscreen", false);
  const timeLeft = useRoomState(store, "timeLeft", DEFAULT_FOCUS_MINUTES * 60);
  const mode = useRoomState(store, "mode", "focus" as StudyRoomMode);
  const status = useRoomState(store, "status", "idle" as StudyRoomStatus);

  if (!isRoomFullscreen) return null;

  return (
    <div className="fullscreen-timer-overlay">
      <div className={`status-dot ${status === "running" ? "active" : ""}`} />
      <span className="overlay-mode">
        {mode === "focus" ? "Focus" : "Break"}
      </span>
      <span className="overlay-time">
        {formatDuration(timeLeft)}
      </span>
      {status === "paused" && <span className="overlay-badge">PAUSED</span>}
      {status === "idle" && <span className="overlay-badge">READY</span>}
    </div>
  );
});
FullscreenTimerOverlay.displayName = "FullscreenTimerOverlay";

interface MediaDebugInfo {
  isSecureContext: boolean;
  hasMediaDevices: boolean;
  permissionCamera: string;
  permissionMic: string;
  streamActive: boolean;
  peerDetails: Record<string, { connectionState: string; iceState: string }>;
  remoteVideoTrackCount: number;
  remoteAudioTrackCount: number;
  receiverVideoBytes: number;
  receiverFramesDecoded: number;
}

const MediaDebugOverlay = React.memo(({ store, showDebug }: { store: RoomStateStore; showDebug: boolean }) => {
  const mediaDebugInfo = useRoomState(store, "mediaDebugInfo", null) as MediaDebugInfo | null;
  if (!showDebug || !mediaDebugInfo) return null;

  return (
    <div className="absolute left-3 top-12 z-20 max-w-[calc(100%-1.5rem)] rounded-[10px] border border-white/10 bg-black/70 px-3 py-2 text-[10px] text-white/75 backdrop-blur">
      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        <span>Remote video tracks</span>
        <span className="text-right text-white">
          {mediaDebugInfo.remoteVideoTrackCount}
        </span>
        <span>Remote audio tracks</span>
        <span className="text-right text-white">
          {mediaDebugInfo.remoteAudioTrackCount}
        </span>
        <span>Video bytes received</span>
        <span className="text-right text-white">
          {mediaDebugInfo.receiverVideoBytes}
        </span>
        <span>Frames decoded</span>
        <span className="text-right text-white">
          {mediaDebugInfo.receiverFramesDecoded}
        </span>
      </div>
    </div>
  );
});
MediaDebugOverlay.displayName = "MediaDebugOverlay";

