"use client";

import { ChangeEvent, useEffect, useRef, useState, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  CheckCircle2,
  Clock3,
  Expand,
  Flame,
  Pause,
  Play,
  RotateCcw,
  SkipForward,
  Sparkles,
  Waves,
  Maximize2,
  Minimize2,
  Volume2,
  Activity,
  Compass,
  SlidersHorizontal,
  X,
  PictureInPicture,
  Pencil,
  Check,
} from "lucide-react";
import { toast } from "react-hot-toast";
import useSWR, { mutate } from "swr";
import { useFocusStore } from "@/hooks/useFocusStore";
import { flushPendingSessions } from "@/lib/client/focus-persist";

const fetcher = async (url: string) => {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    return null;
  }
};

type SessionType = "focus" | "shortBreak" | "longBreak";
type AmbientTrack = "Rain" | "White Noise" | "Custom";

type SessionLogEntry = {
  id: string;
  type: SessionType;
  label: string;
  minutes: number;
  completedAt: string;
  goal: string;
};

type DailyStat = {
  startedFocus: number;
  completedFocus: number;
  completedBreaks: number;
  focusMinutes: number;
  breakMinutes: number;
};

type FocusState = {
  durations: Record<SessionType, number>;
  selectedType: SessionType;
  goal: string;
  logs: SessionLogEntry[];
  dailyStats: Record<string, DailyStat>;
  focusCycleCount: number;
  ambientEnabled: boolean;
  ambientTrack: AmbientTrack;
  customAmbientName: string;
  autoStartBreaks: boolean;
  autoStartFocus: boolean;
  fullscreenReminder: boolean;
};

const STORAGE_KEY = "second-brain-focus-mode";
const MIGRATION_KEY = "second-brain-analytics-migrated";
const PENDING_SESSIONS_KEY = "second-brain-pending-sessions";
const AMBIENT_DB_NAME = "second-brain-audio";
const AMBIENT_STORE_NAME = "ambient-files";
const CUSTOM_AMBIENT_ID = "focus-custom-ambient";
const RING_CIRCUMFERENCE = 2 * Math.PI * 96;

// Server persistence moved to @/lib/client/focus-persist.ts

async function triggerMigration(logs: SessionLogEntry[]) {
  if (typeof window === "undefined") return;
  if (window.localStorage.getItem(MIGRATION_KEY)) return;
  if (!logs || logs.length === 0) {
    window.localStorage.setItem(MIGRATION_KEY, "true");
    return;
  }

  try {
    const res = await fetch("/api/focus-sessions/migrate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ logs }),
    });
    if (res.ok) {
      window.localStorage.setItem(MIGRATION_KEY, "true");
      console.log("Analytics migration complete.");
    }
  } catch (err) {
    console.error("Analytics migration failed:", err);
  }
}

const SESSION_LABELS: Record<SessionType, string> = {
  focus: "Focus",
  shortBreak: "Short break",
  longBreak: "Long break",
};

const DEFAULT_DURATIONS: Record<SessionType, number> = {
  focus: 25,
  shortBreak: 5,
  longBreak: 15,
};

const FOCUS_PRESETS = [20, 25, 45, 60];
const SHORT_BREAK_PRESETS = [5, 10, 15];
const LONG_BREAK_PRESETS = [10, 15, 20];
const AMBIENT_TRACKS: AmbientTrack[] = ["Rain", "White Noise"];
const MAX_CUSTOM_AMBIENT_BYTES = 15_000_000;

const MODE_COLORS: Record<
  SessionType,
  {
    ring: string;
    badge: string;
    badgeBg: string;
    modeBg: string;
    button: string;
    selectedPill: string;
  }
> = {
  focus: {
    ring: "#c97d0c",
    badge: "#c97d0c",
    badgeBg: "rgba(201,125,12,0.13)",
    modeBg: "rgba(201,125,12,0.13)",
    button: "#c97d0c",
    selectedPill: "border-[#c97d0c] bg-[rgba(201,125,12,0.13)] text-[#c97d0c]",
  },
  shortBreak: {
    ring: "#1a9e75",
    badge: "#1a9e75",
    badgeBg: "rgba(26,158,117,0.13)",
    modeBg: "rgba(26,158,117,0.13)",
    button: "#1a9e75",
    selectedPill: "border-[#1a9e75] bg-[rgba(26,158,117,0.13)] text-[#1a9e75]",
  },
  longBreak: {
    ring: "#8878d4",
    badge: "#8878d4",
    badgeBg: "rgba(136,120,212,0.13)",
    modeBg: "rgba(136,120,212,0.13)",
    button: "#8878d4",
    selectedPill: "border-[#8878d4] bg-[rgba(136,120,212,0.13)] text-[#8878d4]",
  },
};

function getTodayKey() {
  return new Date().toLocaleDateString("en-CA");
}

function formatMinutes(minutes: number) {
  if (minutes < 60) {
    return `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

function getDayLabel(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

// Streak is now calculated server-side via analytics.service.ts

export default function FocusPage() {
  const audioContextRef = useRef<AudioContext | null>(null);
  const ambientCleanupRef = useRef<(() => void) | null>(null);
  const customAmbientAudioRef = useRef<HTMLAudioElement | null>(null);
  const endAlertCleanupRef = useRef<(() => void) | null>(null);
  const customAmbientInputRef = useRef<HTMLInputElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasStreamRef = useRef<MediaStream | null>(null);

  const [hydrated, setHydrated] = useState(false);
  const [pipWindow, setPipWindow] = useState<Window | null>(null);
  // ─── Timer state from global store (survives navigation) ──
  const activeSession = useFocusStore((s) => s.activeSession);
  const selectedType = useFocusStore((s) => s.selectedType);
  const durations = useFocusStore((s) => s.durations);
  const timeLeft = useFocusStore((s) => s.displayTimeLeft);
  const goal = useFocusStore((s) => s.goal);
  const setGoal = useFocusStore((s) => s.setGoal);
  const sessionGoal = useFocusStore((s) => s.sessionGoal);
  const focusCycleCount = useFocusStore((s) => s.focusCycleCount);
  const taskId = useFocusStore((s) => s.taskId);
  const setTaskId = useFocusStore((s) => s.setTaskId);
  
  // Fetch tasks for linking
  const { data: tasksData } = useSWR<any>("/api/planner/tasks", fetcher);
  const plannerTasks = tasksData?.ok ? (tasksData.data as any[]) : [];
  const activeTasks = plannerTasks.filter((t) => t.status !== "completed");

  const isActive = activeSession !== null && activeSession.pausedAt === null;
  const hasActiveSession = activeSession !== null;

  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingGoalValue, setEditingGoalValue] = useState("");

  async function handleUpdateGoal(id: string, newGoal: string) {
    try {
      const res = await fetch("/api/focus-sessions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, goal: newGoal }),
      });
      if (!res.ok) throw new Error();
      toast.success("Goal updated successfully.");
      setEditingSessionId(null);
      void mutate("/api/analytics");
      void mutate("/api/dashboard");
    } catch {
      toast.error("Failed to update session goal.");
    }
  }
  const [ambientEnabled, setAmbientEnabled] = useState(false);
  const [ambientTrack, setAmbientTrack] = useState<AmbientTrack>("Rain");
  const [customAmbientSrc, setCustomAmbientSrc] = useState("");
  const [customAmbientName, setCustomAmbientName] = useState("");
  const [activeTab, setActiveTab] = useState<"session" | "sounds" | "stats">("session");
  const [isZenMode, setIsZenMode] = useState(false);
  const [sidePanelOpen, setSidePanelOpen] = useState(false);
  const autoStartBreaks = useFocusStore((s) => s.autoStartBreaks);
  const setAutoStartBreaks = useFocusStore((s) => s.setAutoStartBreaks);
  const autoStartFocus = useFocusStore((s) => s.autoStartFocus);
  const setAutoStartFocus = useFocusStore((s) => s.setAutoStartFocus);
  const [fullscreenReminder, setFullscreenReminder] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [historyPage, setHistoryPage] = useState(0);

  const { data: paginatedSessionsData } = useSWR(
    isHistoryOpen ? `/api/focus-sessions?limit=10&offset=${historyPage * 10}` : null,
    fetcher,
    { revalidateOnFocus: true }
  );

  useEffect(() => {
    let cancelled = false;

    async function restoreState() {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        let parsedLogs: SessionLogEntry[] = [];
        if (raw) {
          const parsed = JSON.parse(raw) as any;
          parsedLogs = parsed.logs ?? [];

          if (!cancelled) {
            setAmbientEnabled(parsed.ambientEnabled ?? false);
            setAmbientTrack(parsed.ambientTrack ?? "Rain");
            setCustomAmbientName(parsed.customAmbientName ?? "");
            setFullscreenReminder(parsed.fullscreenReminder ?? false);
          }
        }

        const storedBlob = await getStoredAmbientBlob();
        if (!cancelled && storedBlob) {
          setCustomAmbientSrc(URL.createObjectURL(storedBlob));
        }

        // One-time migration of existing localStorage sessions to the database
        if (!cancelled && parsedLogs.length > 0) {
          void triggerMigration(parsedLogs);
          // Also flush any sessions that failed to persist earlier
          void flushPendingSessions();
        }
      } catch {
        toast.error("Could not restore your last focus setup.");
      } finally {
        if (!cancelled) {
          setHydrated(true);
        }
      }
    }

    void restoreState();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    const payload = {
      ambientEnabled,
      ambientTrack,
      customAmbientName,
      fullscreenReminder,
    };

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }, [
    ambientEnabled,
    ambientTrack,
    customAmbientName,
    fullscreenReminder,
    hydrated,
  ]);

  useEffect(() => {
    if (isZenMode) {
      setSidePanelOpen(false);
    }
  }, [isZenMode]);

  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setSidePanelOpen(false);
      }
    }

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, []);



  useEffect(() => {
    if (!fullscreenReminder || !isActive) {
      return;
    }

    if (document.fullscreenElement) {
      return;
    }

    toast("Tip: switch to full screen for a cleaner focus session.", {
      icon: "□",
      style: { background: "#222219", color: "#f4efe3" },
    });
  }, [fullscreenReminder, isActive]);

  useEffect(() => {
    return () => {
      if (customAmbientSrc) {
        URL.revokeObjectURL(customAmbientSrc);
      }
    };
  }, [customAmbientSrc]);

  // Live Canvas drawing for background auto Picture-in-Picture
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Draw dark premium background
    ctx.fillStyle = "#0e0e0d";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Header styling
    ctx.fillStyle = selectedType === "focus" ? "#c97d0c" : (selectedType === "shortBreak" ? "#1a9e75" : "#8878d4");
    ctx.font = "bold 13px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(selectedType === "focus" ? "FOCUS BLOCK" : (selectedType === "shortBreak" ? "SHORT BREAK" : "LONG BREAK"), canvas.width / 2, 45);

    // Render Intention/Goal if focus mode
    ctx.fillStyle = "#9c9788";
    ctx.font = "italic 11px sans-serif";
    if (selectedType === "focus" && (sessionGoal || goal)) {
      const displayGoal = (sessionGoal || goal).length > 25 ? (sessionGoal || goal).substring(0, 22) + "..." : (sessionGoal || goal);
      ctx.fillText(`"${displayGoal}"`, canvas.width / 2, 70);
    } else {
      ctx.fillText("Second Brain Session", canvas.width / 2, 70);
    }

    // Time display
    ctx.fillStyle = "#e4dfcf";
    ctx.font = "bold 44px monospace";
    const minStr = String(Math.floor(timeLeft / 60)).padStart(2, "0");
    const secStr = String(timeLeft % 60).padStart(2, "0");
    ctx.fillText(`${minStr}:${secStr}`, canvas.width / 2, 130);

    // Premium border
    ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
    ctx.lineWidth = 2;
    ctx.strokeRect(5, 5, canvas.width - 10, canvas.height - 10);
  }, [timeLeft, selectedType, goal, sessionGoal]);

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
        video.play().catch(() => {});
      }
    } catch (e) {
      console.error("Canvas stream capture failed:", e);
    }
  }, []);

  // Auto-PiP on Visibility Change
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState === "hidden" && isActive && !pipWindow) {
        const video = videoRef.current;
        if (video && !document.pictureInPictureElement) {
          try {
            await video.requestPictureInPicture();
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
  }, [isActive, pipWindow]);

  useEffect(() => {
    async function syncAmbient() {
      if (customAmbientAudioRef.current) {
        customAmbientAudioRef.current.pause();
      }

      if (!ambientEnabled) {
        ambientCleanupRef.current?.();
        ambientCleanupRef.current = null;
        return;
      }

      if (ambientTrack === "Custom") {
        ambientCleanupRef.current?.();
        ambientCleanupRef.current = null;

        if (!customAmbientSrc) {
          return;
        }

        const audio =
          customAmbientAudioRef.current ?? new Audio(customAmbientSrc);
        customAmbientAudioRef.current = audio;
        audio.src = customAmbientSrc;
        audio.loop = true;
        audio.volume = 0.65;

        try {
          await audio.play();
        } catch {
          toast.error("Click the custom sound button again to enable playback.");
        }
        return;
      }

      const AmbientAudioContext =
        window.AudioContext ||
        (window as typeof window & { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;

      if (!AmbientAudioContext) {
        toast.error("Ambient audio is not supported in this browser.");
        return;
      }

      const context =
        audioContextRef.current ?? new AmbientAudioContext();
      audioContextRef.current = context;

      if (context.state === "suspended") {
        try {
          await context.resume();
        } catch {
          toast.error("Click a sound button again to enable audio.");
          return;
        }
      }

      ambientCleanupRef.current?.();
      ambientCleanupRef.current = createAmbientSound(context, ambientTrack);
    }

    void syncAmbient();
  }, [ambientEnabled, ambientTrack, customAmbientSrc]);

  useEffect(() => {
    return () => {
      endAlertCleanupRef.current?.();
      endAlertCleanupRef.current = null;
      if (customAmbientAudioRef.current) {
        customAmbientAudioRef.current.pause();
        customAmbientAudioRef.current = null;
      }
      ambientCleanupRef.current?.();
      ambientCleanupRef.current = null;
      if (audioContextRef.current) {
        void audioContextRef.current.close();
        audioContextRef.current = null;
      }
    };
  }, []);



  function switchSession(type: SessionType) {
    stopEndAlert(endAlertCleanupRef);
    useFocusStore.getState().switchType(type);
  }

  async function handleCustomAmbientUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (!file.type.startsWith("audio/")) {
      toast.error("Please choose an audio file.");
      event.target.value = "";
      return;
    }

    if (file.size > MAX_CUSTOM_AMBIENT_BYTES) {
      toast.error("Keep the ambient file under 15 MB for local saving.");
      event.target.value = "";
      return;
    }

    try {
      await saveStoredAmbientBlob(file);
      setCustomAmbientSrc((current) => {
        if (current) {
          URL.revokeObjectURL(current);
        }
        return URL.createObjectURL(file);
      });
      setCustomAmbientName(file.name);
      setAmbientTrack("Custom");
      setAmbientEnabled(true);
      toast.success("Custom ambient sound added.");
    } catch {
      toast.error("Could not load that audio file.");
    } finally {
      event.target.value = "";
    }
  }

  function clearCustomAmbient() {
    if (ambientTrack === "Custom") {
      setAmbientEnabled(false);
      if (customAmbientAudioRef.current) {
        customAmbientAudioRef.current.pause();
      }
    }
    void deleteStoredAmbientBlob();
    setCustomAmbientSrc((current) => {
      if (current) {
        URL.revokeObjectURL(current);
      }
      return "";
    });
    setCustomAmbientName("");
    if (ambientTrack === "Custom") {
      setAmbientTrack("Rain");
    }
  }

  function updateDuration(type: SessionType, minutes: number) {
    stopEndAlert(endAlertCleanupRef);
    useFocusStore.getState().setDuration(type, minutes);
  }

  function toggleTimer() {
    stopEndAlert(endAlertCleanupRef);
    useFocusStore.getState().toggleTimer();
  }

  function resetTimer() {
    stopEndAlert(endAlertCleanupRef);
    useFocusStore.getState().resetTimer();
  }

  function skipSession() {
    stopEndAlert(endAlertCleanupRef);
    useFocusStore.getState().skipSession();
  }

  const startPictureInPicture = async () => {
    if (!("documentPictureInPicture" in window)) {
      // Document PiP fallback to standard canvas-video PiP
      const video = videoRef.current;
      if (video) {
        try {
          await video.requestPictureInPicture();
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
        height: 280,
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
            console.warn("CORS issue accessing stylesheet rules:", styleSheet.href);
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

      w.document.body.className = "bg-[#0e0e0d] text-[#ddd8cc] flex flex-col items-center justify-between h-full w-full overflow-hidden p-4 select-none";
      w.document.title = "Focus Timer";

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

  const { data: analyticsData } = useSWR("/api/analytics", fetcher, {
    revalidateOnFocus: true,
    revalidateOnReconnect: true,
  });

  const activeMode = MODE_COLORS[selectedType];
  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const totalSeconds = durations[selectedType] * 60;
  const progress = totalSeconds === 0 ? 0 : timeLeft / totalSeconds;

  const today = useMemo(() => {
    if (analyticsData?.stats) {
      const stats = analyticsData.stats;
      return {
        startedFocus: stats.todayFocusSessions,
        completedFocus: stats.todayFocusSessions,
        completedBreaks: stats.todayBreakSessions,
        focusMinutes: Math.round(stats.todayFocusMs / 60000),
        breakMinutes: Math.round(stats.todayBreakMs / 60000),
      };
    }
    return {
      startedFocus: 0,
      completedFocus: 0,
      completedBreaks: 0,
      focusMinutes: 0,
      breakMinutes: 0,
    };
  }, [analyticsData]);

  const completionRate = analyticsData?.stats?.completionRate ?? 0;

  const streak = analyticsData?.stats?.currentStreak ?? 0;

  const displayLogs = useMemo(() => {
    if (analyticsData?.recentSessions) {
      return analyticsData.recentSessions.map((s: any) => ({
        id: s.id,
        type: s.type as SessionType,
        label: SESSION_LABELS[s.type as SessionType] || s.type,
        minutes: Math.round(s.durationMs / 60000),
        completedAt: s.createdAt,
        goal: s.goal || (SESSION_LABELS[s.type as SessionType] || s.type),
      }));
    }
    return [];
  }, [analyticsData]);

  const nextBreak = (focusCycleCount + 1) % 4 === 0 ? "Long break" : "Short break";
  const contextLabel =
    selectedType === "focus"
      ? "Session intention"
      : selectedType === "shortBreak"
        ? "Break guidance"
        : "Reset note";
  const contextCopy =
    selectedType === "focus"
      ? goal.trim() || "Define one clear outcome before you press start."
      : selectedType === "shortBreak"
        ? "Keep this one light. Stand up, breathe, and avoid opening a new task."
        : "Use the longer break to step away fully so the next cycle feels fresh.";

  return (
    <div className="flex h-full min-h-full w-full overflow-hidden bg-[#0d0d0a] text-[#e4dfcf]">
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes breathing-glow-${selectedType} {
          0%, 100% {
            transform: scale(1);
            filter: drop-shadow(0 0 12px ${activeMode.ring}25);
          }
          50% {
            transform: scale(1.015);
            filter: drop-shadow(0 0 32px ${activeMode.ring}75);
          }
        }
        .timer-active-${selectedType} {
          animation: breathing-glow-${selectedType} 4.5s ease-in-out infinite;
        }
        @keyframes pulse-soft {
          0%, 100% { opacity: 0.65; }
          50% { opacity: 1; }
        }
        .text-pulse-soft {
          animation: pulse-soft 2.5s ease-in-out infinite;
        }
        .glass-panel {
          background: rgba(20, 20, 16, 0.75);
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
        }
      `}} />

      <div className="relative flex h-full min-h-full w-full flex-1 flex-col overflow-hidden lg:flex-row">
        {/* Dynamic Background Glow */}
        <div className="absolute inset-0 -z-10 flex items-center justify-center filter blur-[100px] opacity-[0.12] pointer-events-none transition-all duration-1000">
          <div 
            className="h-[300px] w-[300px] rounded-full transition-all duration-1000"
            style={{ 
              background: activeMode.ring,
              transform: isActive ? "scale(1.2)" : "scale(1)"
            }}
          />
        </div>

        <div 
          className="absolute top-6 z-10 hidden transition-all duration-500 lg:flex"
          style={{ right: isZenMode ? "1.5rem" : "26rem" }}
        >
          <button
            onClick={() => setIsZenMode(!isZenMode)}
            className="flex items-center gap-1.5 rounded-full border border-white/[0.07] bg-[#161612]/60 px-3.5 py-2 text-[11px] font-medium tracking-[0.06em] text-[#9c9788] backdrop-blur-md transition-all duration-300 hover:border-white/[0.18] hover:bg-[#161612]/90 hover:text-[#e4dfcf]"
            aria-label={isZenMode ? "Exit Zen Mode" : "Enter Zen Mode"}
          >
            {isZenMode ? (
              <>
                <Minimize2 className="h-3.5 w-3.5 text-[#c97d0c]" />
                Exit Zen
              </>
            ) : (
              <>
                <Maximize2 className="h-3.5 w-3.5" />
                Zen Mode
              </>
            )}
          </button>
        </div>

        <button
          onClick={() => setSidePanelOpen(true)}
          className={`focus-panel-trigger absolute right-6 top-6 z-10 h-[36px] items-center justify-center gap-2 rounded-full border border-white/[0.07] bg-[#161612]/60 px-3.5 text-[11px] font-medium tracking-[0.06em] text-[#9c9788] backdrop-blur-md transition-all duration-300 hover:border-white/[0.18] hover:bg-[#161612]/90 hover:text-[#e4dfcf] lg:hidden ${
            isZenMode ? "hidden" : "flex"
          }`}
          aria-label="Open focus panel"
          title="Focus panel"
        >
          <SlidersHorizontal className="h-4 w-4" />
          <span className="focus-action-label">Panel</span>
        </button>

        <button
          onClick={() => setIsZenMode(!isZenMode)}
          className="focus-mobile-zen absolute bottom-6 right-6 z-10 flex items-center gap-1.5 rounded-full border border-white/[0.07] bg-[#161612]/60 px-3.5 py-2 text-[11px] font-medium tracking-[0.06em] text-[#9c9788] backdrop-blur-md transition-all duration-300 hover:border-white/[0.18] hover:bg-[#161612]/90 hover:text-[#e4dfcf] lg:hidden"
          aria-label={isZenMode ? "Exit Zen Mode" : "Enter Zen Mode"}
          title={isZenMode ? "Exit Zen Mode" : "Zen Mode"}
        >
          {isZenMode ? (
            <>
              <Minimize2 className="h-3.5 w-3.5 text-[#c97d0c]" />
              <span className="focus-action-label">Exit Zen</span>
            </>
          ) : (
            <>
              <Maximize2 className="h-3.5 w-3.5" />
              <span className="focus-action-label">Zen Mode</span>
            </>
          )}
        </button>

        {/* Left Area: Timer Canvas */}
        <div className="focus-timer-canvas relative flex flex-1 flex-col items-center justify-center min-h-0 overflow-hidden px-6 py-8 transition-all duration-500">
          {/* Top Badge: Fades out in Zen Mode */}
          <div 
            className={`focus-session-badge mb-6 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-[#5c5a52] transition-all duration-500 ${
              isZenMode ? "opacity-0 -translate-y-4" : "opacity-100"
            }`}
          >
            <span
              className="h-2 w-2 rounded-full"
              style={{
                background: "#1a9e75",
                boxShadow: "0 0 8px 1px rgba(26,158,117,0.4)",
              }}
            />
            Session #{today.completedFocus + today.completedBreaks + 1} today
          </div>

          {/* Mode Selector Pill: Fades out in Zen Mode */}
          <div 
            className={`focus-mode-selector mb-10 flex w-full max-w-[380px] overflow-hidden rounded-full border border-white/[0.06] bg-[#1b1b16]/75 p-[3px] backdrop-blur-sm transition-all duration-500 ${
              isZenMode ? "opacity-0 -translate-y-4 pointer-events-none" : "opacity-100"
            }`}
          >
            {(["focus", "shortBreak", "longBreak"] as SessionType[]).map((type) => (
              <button
                key={type}
                onClick={() => switchSession(type)}
                className={`flex-1 rounded-full py-2 text-[11.5px] font-medium transition-all duration-300 ${
                  selectedType === type
                    ? "bg-[#141410] text-[#e4dfcf] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.035),0_2px_8px_rgba(0,0,0,0.4)]"
                    : "text-[#888375] hover:text-[#e4dfcf]"
                }`}
              >
                {SESSION_LABELS[type]}
              </button>
            ))}
          </div>

          {/* Timer SVG Ring */}
          <div 
            className={`focus-timer-ring relative mb-8 h-[240px] w-[240px] transition-all duration-500 ${
              isActive ? `timer-active-${selectedType}` : ""
            }`}
          >
            <svg viewBox="0 0 220 220" className="h-full w-full -rotate-90">
              <circle
                cx="110"
                cy="110"
                r="96"
                fill="none"
                stroke="rgba(255,255,255,0.03)"
                strokeWidth="5"
              />
              <circle
                cx="110"
                cy="110"
                r="96"
                fill="none"
                stroke={activeMode.ring}
                strokeWidth="5"
                strokeDasharray={RING_CIRCUMFERENCE}
                strokeDashoffset={RING_CIRCUMFERENCE * (1 - progress)}
                strokeLinecap="round"
                style={{ transition: "stroke-dashoffset 0.3s ease-out" }}
                opacity="0.9"
              />
            </svg>

            {/* Timer Core Text */}
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              <div className="mb-0.5 text-[9.5px] font-semibold uppercase tracking-[0.12em] text-[#5c5a52]">
                {selectedType === "focus" ? "Work / Focus" : SESSION_LABELS[selectedType]}
              </div>
              <div className="focus-timer-time font-[family:var(--font-fraunces)] text-[56px] font-normal leading-none tracking-tight text-[#e4dfcf]">
                {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
              </div>
              <div className="mt-2 text-[10.5px] font-medium text-[#5c5a52]">
                {durations[selectedType]} min
              </div>
            </div>
          </div>

          {/* Timer Controls */}
          <div className="focus-timer-controls flex items-center gap-5">
            <button
              onClick={resetTimer}
              className="flex h-[40px] w-[40px] items-center justify-center rounded-full border border-white/[0.08] bg-[#161612]/40 text-[#9c9788] backdrop-blur-sm transition-all duration-200 hover:border-white/[0.18] hover:bg-white/[0.04] hover:text-[#e4dfcf] active:scale-95"
              title="Reset session"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
            <button
              onClick={toggleTimer}
              className="flex h-[62px] w-[62px] items-center justify-center rounded-full text-white shadow-lg transition-all duration-300 hover:scale-105 active:scale-95"
              style={{ 
                background: activeMode.button,
                boxShadow: `0 4px 20px ${activeMode.ring}33`
              }}
              title={isActive ? "Pause Timer" : "Start Timer"}
            >
              {isActive ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6 ml-0.5" />}
            </button>
            <button
              onClick={skipSession}
              className="flex h-[40px] w-[40px] items-center justify-center rounded-full border border-white/[0.08] bg-[#161612]/40 text-[#9c9788] backdrop-blur-sm transition-all duration-200 hover:border-white/[0.18] hover:bg-white/[0.04] hover:text-[#e4dfcf] active:scale-95"
              title="Skip session"
            >
              <SkipForward className="h-4 w-4" />
            </button>
            <button
              onClick={() => void startPictureInPicture()}
              className="flex h-[40px] w-[40px] items-center justify-center rounded-full border border-white/[0.08] bg-[#161612]/40 text-[#9c9788] backdrop-blur-sm transition-all duration-200 hover:border-white/[0.18] hover:bg-white/[0.04] hover:text-[#e4dfcf] active:scale-95"
              title="Picture in Picture"
            >
              <PictureInPicture className="h-4 w-4" />
            </button>
          </div>

          {/* Minimal Current Goal Info below Controls - Zen or Active */}
          {(sessionGoal || goal) && selectedType === "focus" && (
            <div className="mt-9 flex max-w-[280px] flex-col items-center text-center">
              <span className="text-[10px] uppercase tracking-[0.08em] text-[#5c5a52] font-semibold mb-1">Focusing on</span>
              <p className="text-[12.5px] italic text-[#9c9788] truncate w-full text-pulse-soft">
                "{sessionGoal || goal}"
              </p>
            </div>
          )}

        </div>

        <button
          aria-label="Close focus panel"
          className={`focus-side-backdrop ${sidePanelOpen ? "open" : ""}`}
          type="button"
          onClick={() => setSidePanelOpen(false)}
        />

        {/* Right Glassmorphic Tabbed Side Panel */}
        <aside 
          className={`focus-side-panel glass-panel flex-shrink-0 flex flex-col border-t lg:border-t-0 border-white/[0.065] transition-all duration-500 ease-in-out ${
            isZenMode 
              ? "w-0 opacity-0 pointer-events-none overflow-hidden px-0 py-0 border-l-0" 
              : "w-full lg:w-[350px] opacity-100 border-l border-white/[0.065]"
          } ${sidePanelOpen ? "focus-side-open" : ""}`}
        >
          {/* Main Sidebar Header & Tabs */}
          <div className="px-5 pt-5 pb-3">
            <div className="mb-3 flex items-center justify-between lg:hidden">
              <div className="text-[10px] font-bold uppercase tracking-[0.11em] text-[#5c5a52]">
                Focus panel
              </div>
              <button
                aria-label="Close focus panel"
                className="flex h-[34px] w-[34px] items-center justify-center rounded-[9px] border border-white/[0.07] bg-[#161612]/70 text-[#9c9788] transition hover:border-white/[0.18] hover:text-[#e4dfcf]"
                type="button"
                onClick={() => setSidePanelOpen(false)}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {/* Tab buttons */}
            <div className="flex overflow-hidden rounded-[9px] border border-white/[0.06] bg-[#1b1b16]/90 p-[3px] backdrop-blur-sm">
              {(["session", "sounds", "stats"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`flex-1 rounded-[7px] py-2 text-[12px] font-semibold transition-all duration-300 ${
                    activeTab === tab
                      ? "bg-[#141410] text-[#e4dfcf] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.035)]"
                      : "text-[#888375] hover:text-[#e4dfcf]"
                  }`}
                >
                  {tab === "session" ? (
                    <span className="flex items-center justify-center gap-1.5">
                      <Compass className="h-3.5 w-3.5" />
                      Session
                    </span>
                  ) : tab === "sounds" ? (
                    <span className="flex items-center justify-center gap-1.5">
                      <Waves className="h-3.5 w-3.5" />
                      Sounds
                    </span>
                  ) : (
                    <span className="flex items-center justify-center gap-1.5">
                      <Activity className="h-3.5 w-3.5" />
                      Stats
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Tabs Content - Scrollable to prevent any truncation */}
          <div className="flex-1 overflow-y-auto px-5 pb-6 pt-2 space-y-5 custom-scrollbar min-h-0">
            
            {/* TAB 1: SESSION TARGETS */}
            {activeTab === "session" && (
              <div className="space-y-5 animate-fade-in">
                {/* Planner Task Selector */}
                {selectedType === "focus" && (
                  <div className="space-y-2">
                    <div className="text-[10px] font-bold uppercase tracking-[0.09em] text-[#5c5a52]">
                      Link Planner Task
                    </div>
                    <div className="relative">
                      <select
                        value={taskId || ""}
                        onChange={(e) => {
                          const val = e.target.value || null;
                          setTaskId(val);
                          if (val) {
                            const task = activeTasks.find((t: any) => t.id === val);
                            if (task) {
                              setGoal(task.title);
                            }
                          }
                        }}
                        disabled={hasActiveSession}
                        className="w-full appearance-none rounded-[10px] border border-white/[0.06] bg-[#1b1b16]/80 px-3.5 py-2.5 text-[12.5px] text-[#e4dfcf] focus:border-[rgba(201,125,12,0.35)] focus:outline-none transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <option value="">None / General Focus</option>
                        {activeTasks.map((t: any) => (
                          <option key={t.id} value={t.id}>
                            [{t.category}] {t.title}
                          </option>
                        ))}
                      </select>
                      <div className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[#9c9788] text-[9px]">▼</div>
                    </div>
                  </div>
                )}

                {/* Focus goal input card */}
                <div className="space-y-2">
                  <div className="text-[10px] font-bold uppercase tracking-[0.09em] text-[#5c5a52]">
                    Focus Goal
                  </div>
                  <textarea
                    value={goal}
                    onChange={(event) => setGoal(event.target.value)}
                    rows={2}
                    placeholder="What are you focusing on?"
                    className="w-full min-h-0 rounded-[10px] border border-white/[0.06] bg-[#1b1b16]/80 px-3 py-2.5 text-[12.5px] leading-5 text-[#e4dfcf] placeholder:text-[#5c5a52] focus:border-[rgba(201,125,12,0.35)] focus:ring-0 focus:shadow-none focus:outline-none transition duration-200"
                  />
                </div>

                {/* Mode Intention Card */}
                <div className="rounded-[10px] border border-white/[0.06] bg-[#1b1b16]/40 px-4 py-3.5 backdrop-blur-sm">
                  <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.09em] text-[#5c5a52]">
                    {contextLabel}
                  </div>
                  <div className="text-[12px] leading-5 text-[#9c9788]">{contextCopy}</div>
                </div>

                {/* Session Presets selector (Depends on selected mode) */}
                {selectedType === "focus" && (
                  <div className="space-y-2">
                    <div className="text-[10px] font-bold uppercase tracking-[0.09em] text-[#5c5a52]">
                      Duration presets
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {FOCUS_PRESETS.map((preset) => (
                        <button
                          key={preset}
                          onClick={() => updateDuration("focus", preset)}
                          className={`rounded-[8px] border px-2 py-2 text-[12px] font-medium transition-all duration-300 ${
                            durations.focus === preset
                              ? MODE_COLORS.focus.selectedPill
                              : "border-white/[0.06] bg-[#1b1b16]/80 text-[#9c9788] hover:border-white/[0.12] hover:text-[#e4dfcf]"
                          }`}
                        >
                          {preset} min
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {selectedType === "shortBreak" && (
                  <div className="space-y-2">
                    <div className="text-[10px] font-bold uppercase tracking-[0.09em] text-[#5c5a52]">
                      Short Break presets
                    </div>
                    <div className="grid grid-cols-3 gap-1.5">
                      {SHORT_BREAK_PRESETS.map((preset) => (
                        <button
                          key={`short-${preset}`}
                          onClick={() => updateDuration("shortBreak", preset)}
                          className={`rounded-[8px] border px-2 py-2 text-[11.5px] font-medium transition-all duration-300 ${
                            durations.shortBreak === preset
                              ? MODE_COLORS.shortBreak.selectedPill
                              : "border-white/[0.06] bg-[#1b1b16]/80 text-[#9c9788] hover:border-white/[0.12] hover:text-[#e4dfcf]"
                          }`}
                        >
                          {preset}m
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {selectedType === "longBreak" && (
                  <div className="space-y-2">
                    <div className="text-[10px] font-bold uppercase tracking-[0.09em] text-[#5c5a52]">
                      Long Break presets
                    </div>
                    <div className="grid grid-cols-3 gap-1.5">
                      {LONG_BREAK_PRESETS.map((preset) => (
                        <button
                          key={`long-${preset}`}
                          onClick={() => updateDuration("longBreak", preset)}
                          className={`rounded-[8px] border px-2 py-2 text-[11.5px] font-medium transition-all duration-300 ${
                            durations.longBreak === preset
                              ? MODE_COLORS.longBreak.selectedPill
                              : "border-white/[0.06] bg-[#1b1b16]/80 text-[#9c9788] hover:border-white/[0.12] hover:text-[#e4dfcf]"
                          }`}
                        >
                          {preset}m
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Focus Environment Switcher */}
                <div className="space-y-2">
                  <div className="text-[10px] font-bold uppercase tracking-[0.09em] text-[#5c5a52]">
                    Focus environment
                  </div>
                  <div className="space-y-1.5">
                    {[
                      {
                        label: "Auto-start breaks",
                        value: autoStartBreaks,
                        setValue: setAutoStartBreaks,
                      },
                      {
                        label: "Auto-start focus",
                        value: autoStartFocus,
                        setValue: setAutoStartFocus,
                      },
                      {
                        label: "Fullscreen reminder",
                        value: fullscreenReminder,
                        setValue: setFullscreenReminder,
                      },
                    ].map((item) => (
                      <button
                        key={item.label}
                        onClick={() => item.setValue((current) => !current)}
                        className="flex w-full items-center justify-between rounded-[8px] border border-white/[0.06] bg-[#1b1b16]/80 px-3 py-2.5 text-left text-[11.5px] text-[#9c9788] transition-all duration-200 hover:border-white/[0.12] hover:text-[#e4dfcf]"
                      >
                        <span className="flex items-center gap-2">
                          {item.label === "Fullscreen reminder" ? (
                            <Expand className="h-3.5 w-3.5 text-[#c97d0c]/80" />
                          ) : (
                            <Sparkles className="h-3.5 w-3.5 text-[#1a9e75]/80" />
                          )}
                          {item.label}
                        </span>
                        <span
                          className={`rounded-full border px-2.5 py-0.5 text-[9.5px] font-bold tracking-[0.08em] transition-all duration-300 ${
                            item.value
                              ? "border-white/[0.1] bg-white/[0.06] text-[#e4dfcf]"
                              : "border-white/[0.06] text-[#5c5a52]"
                          }`}
                        >
                          {item.value ? "On" : "Off"}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: AMBIENT SOUNDS */}
            {activeTab === "sounds" && (
              <div className="space-y-5 animate-fade-in">
                {/* Quiet mode info card */}
                <div className="flex items-center justify-between rounded-[8px] border border-white/[0.06] bg-[#1b1b16]/80 px-3 py-2.5 text-[11.5px] text-[#9c9788]">
                  <span className="flex items-center gap-2 font-medium">
                    <Volume2 className="h-3.5 w-3.5 text-[#c97d0c]" />
                    {ambientEnabled ? "Procedural Audio Active" : "Quiet mode / Silent"}
                  </span>
                  <button
                    onClick={() => setAmbientEnabled((current) => !current)}
                    className={`rounded-full border px-2.5 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.08em] transition-all duration-300 ${
                      ambientEnabled
                        ? "border-[#c97d0c]/30 bg-[#c97d0c]/10 text-[#c97d0c]"
                        : "border-white/[0.1] text-[#9c9788]"
                    }`}
                  >
                    {ambientEnabled ? "Muted" : "Unmute"}
                  </button>
                </div>

                {/* Predefined Noise Tracks */}
                <div className="space-y-2">
                  <div className="text-[10px] font-bold uppercase tracking-[0.09em] text-[#5c5a52]">
                    Built-in ambient
                  </div>
                  <div className="flex gap-1.5">
                    {AMBIENT_TRACKS.map((track) => (
                      <button
                        key={track}
                        onClick={() => {
                          setAmbientTrack(track);
                          setAmbientEnabled(true);
                        }}
                        className={`flex-1 rounded-[8px] border px-2 py-2.5 text-[11.5px] font-medium transition-all duration-300 ${
                          ambientTrack === track && ambientEnabled
                            ? "border-white/[0.12] bg-white/[0.06] text-[#e4dfcf]"
                            : "border-white/[0.06] bg-[#1b1b16]/80 text-[#9c9788] hover:border-white/[0.12] hover:text-[#e4dfcf]"
                        }`}
                      >
                        {track}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Custom ambient track card */}
                <div className="space-y-2">
                  <div className="text-[10px] font-bold uppercase tracking-[0.09em] text-[#5c5a52]">
                    Custom background loop
                  </div>
                  <div
                    className={`grid gap-1.5 ${
                      customAmbientSrc ? "grid-cols-[minmax(0,1fr)_auto]" : "grid-cols-1"
                    }`}
                  >
                    <button
                      onClick={() => {
                        if (customAmbientSrc) {
                          setAmbientTrack("Custom");
                          setAmbientEnabled(true);
                          return;
                        }
                        customAmbientInputRef.current?.click();
                      }}
                      className={`rounded-[8px] border px-3 py-2.5 text-left text-[11.5px] transition-all duration-300 ${
                        ambientTrack === "Custom" && ambientEnabled
                          ? "border-[#c97d0c]/30 bg-[#c97d0c]/5 text-[#e4dfcf]"
                          : "border-white/[0.06] bg-[#1b1b16]/80 text-[#9c9788] hover:border-white/[0.12] hover:text-[#e4dfcf]"
                      }`}
                    >
                      <div className="truncate font-semibold text-[#e4dfcf]">
                        {customAmbientName || "Upload custom ambient MP3"}
                      </div>
                      <div className="mt-0.5 text-[9.5px] uppercase tracking-[0.08em] text-[#5c5a52] font-semibold">
                        {customAmbientSrc ? "Looped Local Audio" : "Support under 15MB"}
                      </div>
                    </button>
                    {customAmbientSrc ? (
                      <button
                        onClick={clearCustomAmbient}
                        className="rounded-[8px] border border-red-950/20 bg-red-950/10 px-3 py-2.5 text-[11.5px] text-red-400 font-semibold transition hover:border-red-900/40 hover:bg-red-950/30"
                      >
                        Remove
                      </button>
                    ) : null}
                  </div>
                  <input
                    ref={customAmbientInputRef}
                    type="file"
                    accept="audio/*"
                    className="hidden"
                    onChange={handleCustomAmbientUpload}
                  />
                </div>
              </div>
            )}

            {/* TAB 3: STATS & LOGS */}
            {activeTab === "stats" && (
              <div className="space-y-5 animate-fade-in">
                {/* Streak & cycles */}
                <div className="rounded-[10px] border border-white/[0.06] bg-[#1b1b16]/40 px-4 py-3.5 backdrop-blur-sm">
                  <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.09em] text-[#5c5a52]">
                    Streak & daily cycle
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2 text-[20px] font-semibold leading-none text-[#e4dfcf] font-[family:var(--font-fraunces)]">
                      <Flame className="h-4.5 w-4.5 text-[#c97d0c]" />
                      {streak} days
                    </div>
                    <div className="text-right">
                      <div className="font-[family:var(--font-fraunces)] text-[18px] font-semibold leading-none text-[#e4dfcf]">
                        {focusCycleCount % 4} / 4
                      </div>
                      <div className="mt-0.5 text-[9.5px] text-[#5c5a52] font-semibold uppercase">Next: {nextBreak}</div>
                    </div>
                  </div>
                  
                  {/* Visual progress bar nodes */}
                  <div className="mt-3.5 grid grid-cols-4 gap-1.5">
                    {[0, 1, 2, 3].map((index) => {
                      const active = index < focusCycleCount % 4;
                      return (
                        <div
                          key={index}
                          className="h-1.5 rounded-full transition-all duration-500"
                          style={{
                            background: active ? "#c97d0c" : "rgba(255,255,255,0.06)",
                            boxShadow: active ? "0 0 8px 1px rgba(201,125,12,0.3)" : "none"
                          }}
                        />
                      );
                    })}
                  </div>
                </div>

                {/* Today's Stats grid */}
                <div className="space-y-2">
                  <div className="text-[10px] font-bold uppercase tracking-[0.09em] text-[#5c5a52]">
                    Today's overview
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {[
                      { label: "Sessions", value: today.completedFocus, sub: "done today" },
                      {
                        label: "Focus time",
                        value: formatMinutes(today.focusMinutes),
                        sub: "logged total",
                      },
                      { label: "Breaks", value: today.completedBreaks, sub: "completed" },
                      { label: "Rate", value: `${completionRate}%`, sub: "completion" },
                    ].map((stat) => (
                      <div
                        key={stat.label}
                        className="rounded-[8px] border border-white/[0.06] bg-[#1b1b16]/80 px-3 py-3"
                      >
                        <div className="text-[9.5px] font-bold uppercase tracking-[0.06em] text-[#5c5a52]">
                          {stat.label}
                        </div>
                        <div className="mt-1.5 font-[family:var(--font-fraunces)] text-[22px] leading-none text-[#e4dfcf]">
                          {stat.value}
                        </div>
                        <div className="mt-1 text-[9.5px] font-semibold text-[#5c5a52]">{stat.sub}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Recent Completed Logs */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="text-[10px] font-bold uppercase tracking-[0.09em] text-[#5c5a52]">
                      Completed log
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setHistoryPage(0);
                          setIsHistoryOpen(true);
                        }}
                        className="text-[10px] text-[#c97d0c] hover:underline font-semibold"
                      >
                        View All
                      </button>
                      <span className="text-[10px] text-[#5c5a52] font-semibold">•</span>
                      <span className="text-[10px] text-[#5c5a52] font-semibold">{displayLogs.length} total</span>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    {hydrated && displayLogs.length === 0 ? (
                      <div className="rounded-[8px] border border-dashed border-white/[0.1] bg-[#1b1b16]/40 px-3 py-4 text-center text-[12px] text-[#888375]">
                        Completed sessions will show here.
                      </div>
                    ) : null}

                    {displayLogs.slice(0, 4).map((entry) => (
                      <div
                        key={entry.id}
                        className="rounded-[8px] border border-white/[0.06] bg-[#1b1b16]/80 px-3 py-3 transition hover:border-white/[0.12]"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span
                                className="rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em]"
                                style={{
                                  color: MODE_COLORS[entry.type].badge,
                                  border: `1px solid ${MODE_COLORS[entry.type].badge}22`,
                                  background: MODE_COLORS[entry.type].badgeBg,
                                }}
                              >
                                {entry.label}
                              </span>
                              <span className="text-[10.5px] font-semibold text-[#5c5a52]">
                                {formatMinutes(entry.minutes)}
                              </span>
                            </div>
                            
                            {editingSessionId === entry.id ? (
                              <div className="mt-2 flex items-center gap-1.5">
                                <input
                                  type="text"
                                  value={editingGoalValue}
                                  onChange={(e) => setEditingGoalValue(e.target.value)}
                                  className="h-7 w-full rounded border border-white/[0.12] bg-[#12120e] px-2 py-1 text-[11px] text-[#e4dfcf] placeholder:text-[#5c5a52] focus:border-[rgba(201,125,12,0.5)] focus:ring-0 focus:outline-none"
                                  placeholder="Update title..."
                                  autoFocus
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") handleUpdateGoal(entry.id, editingGoalValue);
                                    if (e.key === "Escape") setEditingSessionId(null);
                                  }}
                                />
                                <button
                                  onClick={() => handleUpdateGoal(entry.id, editingGoalValue)}
                                  className="flex h-7 w-7 items-center justify-center rounded border border-[#1a9e75]/20 bg-[#1a9e75]/10 text-[#1a9e75] hover:bg-[#1a9e75]/20 transition"
                                  title="Save"
                                >
                                  <Check className="h-3 w-3" />
                                </button>
                                <button
                                  onClick={() => setEditingSessionId(null)}
                                  className="flex h-7 w-7 items-center justify-center rounded border border-white/[0.06] bg-white/[0.03] text-[#5c5a52] hover:bg-white/[0.08] hover:text-[#e4dfcf] transition"
                                  title="Cancel"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            ) : (
                              <div className="mt-2 flex items-center gap-2 group">
                                <span className="truncate text-[12px] text-[#e4dfcf] max-w-[170px] block">
                                  {entry.goal}
                                </span>
                                <button
                                  onClick={() => {
                                    setEditingSessionId(entry.id);
                                    setEditingGoalValue(entry.goal || "");
                                  }}
                                  className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 text-[#5c5a52] hover:text-[#e4dfcf]"
                                  title="Edit title"
                                >
                                  <Pencil className="h-3 w-3" />
                                </button>
                              </div>
                            )}

                            <div className="mt-1 text-[10px] font-semibold text-[#5c5a52]">
                              {getDayLabel(entry.completedAt)}
                            </div>
                          </div>
                          <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#1a9e75]" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

          </div>

          {/* Tabbed Sidebar Footer - Mode Indicator */}
          <div className="px-5 py-4 border-t border-white/[0.06] bg-[#1b1b16]/50">
            <div className="flex items-center gap-2 text-[11px] text-[#9c9788]">
              <Clock3 className="h-3.5 w-3.5 text-[#c97d0c]" />
              <div className="truncate flex-1">
                <span className="font-bold text-[#5c5a52] uppercase tracking-[0.06em] mr-1">Active:</span>
                <span className="text-[#e4dfcf] font-medium">
                  {selectedType === "focus"
                    ? sessionGoal || goal || "Focus cycle"
                    : SESSION_LABELS[selectedType]}
                </span>
              </div>
            </div>
          </div>
        </aside>
        
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
            pointerEvents: "none" 
          }}
        />

        {pipWindow && (
          <PictureInPicturePortal pipWindow={pipWindow}>
            <FocusPipUI
              selectedType={selectedType}
              timeLeft={timeLeft}
              isActive={isActive}
              goal={goal}
              sessionGoal={sessionGoal}
              toggleTimer={toggleTimer}
              resetTimer={resetTimer}
              skipSession={skipSession}
              onClose={() => pipWindow.close()}
            />
          </PictureInPicturePortal>
        )}

        {/* History Modal Overlay */}
        {isHistoryOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-fade-in">
            <div className="w-full max-w-md rounded-xl border border-white/[0.08] bg-[#12120e] p-6 text-[#ddd8cc] shadow-2xl flex flex-col max-h-[80vh]">
              <div className="flex items-center justify-between border-b border-white/[0.06] pb-4 mb-4">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[#e4dfcf]">Focus History</h3>
                  <p className="text-[10px] text-[#5c5a52] font-semibold mt-0.5">
                    {paginatedSessionsData?.total ?? 0} total sessions recorded
                  </p>
                </div>
                <button
                  onClick={() => setIsHistoryOpen(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.07] bg-[#161612]/70 text-[#9c9788] transition hover:border-white/[0.18] hover:text-[#e4dfcf]"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar min-h-0">
                {!paginatedSessionsData ? (
                  <div className="py-12 text-center text-[12px] text-[#888375]">Loading history...</div>
                ) : paginatedSessionsData.sessions.length === 0 ? (
                  <div className="py-12 text-center text-[12px] text-[#888375]">No sessions recorded yet.</div>
                ) : (
                  paginatedSessionsData.sessions.map((entry: any) => (
                    <div
                      key={entry.id}
                      className="rounded-[8px] border border-white/[0.06] bg-[#1b1b16]/40 px-3 py-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span
                              className="rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em]"
                              style={{
                                color: MODE_COLORS[entry.type as SessionType]?.badge || "#ffd000",
                                border: `1px solid ${MODE_COLORS[entry.type as SessionType]?.badge || "#ffd000"}22`,
                                background: MODE_COLORS[entry.type as SessionType]?.badgeBg || "rgba(255,208,0,0.13)",
                              }}
                            >
                              {SESSION_LABELS[entry.type as SessionType] || entry.type}
                            </span>
                            <span className="text-[10.5px] font-semibold text-[#5c5a52]">
                              {formatMinutes(Math.round(entry.durationMs / 60000))}
                            </span>
                          </div>
                          
                          <div className="mt-2 text-[12.5px] text-[#e4dfcf] break-words">
                            {entry.goal || (SESSION_LABELS[entry.type as SessionType] || entry.type)}
                          </div>

                          <div className="mt-1 text-[10px] font-semibold text-[#5c5a52]">
                            {getDayLabel(entry.createdAt)}
                          </div>
                        </div>
                        <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#1a9e75]" />
                      </div>
                    </div>
                  ))
                )}
              </div>

              {paginatedSessionsData && paginatedSessionsData.total > 10 && (
                <div className="flex items-center justify-between border-t border-white/[0.06] pt-4 mt-4 text-[11px]">
                  <button
                    disabled={historyPage === 0}
                    onClick={() => setHistoryPage((p) => p - 1)}
                    className="px-2.5 py-1 rounded border border-white/[0.07] bg-white/[0.02] text-[#9c9788] transition hover:bg-white/[0.05] disabled:opacity-30 disabled:pointer-events-none"
                  >
                    Previous
                  </button>
                  <span className="text-[#5c5a52] font-semibold">
                    Page {historyPage + 1} of {Math.ceil(paginatedSessionsData.total / 10)}
                  </span>
                  <button
                    disabled={(historyPage + 1) * 10 >= paginatedSessionsData.total}
                    onClick={() => setHistoryPage((p) => p + 1)}
                    className="px-2.5 py-1 rounded border border-white/[0.07] bg-white/[0.02] text-[#9c9788] transition hover:bg-white/[0.05] disabled:opacity-30 disabled:pointer-events-none"
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function createNoiseBuffer(
  context: AudioContext,
  color: "white" | "pink" | "brown" = "white",
) {
  const length = context.sampleRate * 2;
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  let lastBrown = 0;
  let lastPinkA = 0;
  let lastPinkB = 0;
  let lastPinkC = 0;

  for (let i = 0; i < length; i += 1) {
    const white = Math.random() * 2 - 1;

    if (color === "brown") {
      lastBrown = (lastBrown + 0.02 * white) / 1.02;
      data[i] = lastBrown * 3.5;
      continue;
    }

    if (color === "pink") {
      lastPinkA = 0.99765 * lastPinkA + white * 0.099046;
      lastPinkB = 0.963 * lastPinkB + white * 0.2965164;
      lastPinkC = 0.57 * lastPinkC + white * 1.0526913;
      data[i] = (lastPinkA + lastPinkB + lastPinkC + white * 0.1848) * 0.2;
      continue;
    }

    data[i] = white * 0.35;
  }

  return buffer;
}

function createAmbientSound(context: AudioContext, track: AmbientTrack) {
  if (track === "White Noise") {
    const source = context.createBufferSource();
    const gain = context.createGain();

    source.buffer = createNoiseBuffer(context, "white");
    source.loop = true;
    gain.gain.value = 0.16;

    source.connect(gain);
    gain.connect(context.destination);
    source.start();

    return () => {
      source.stop();
      source.disconnect();
      gain.disconnect();
    };
  }

  if (track === "Rain") {
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    const lfo = context.createOscillator();
    const lfoGain = context.createGain();

    source.buffer = createNoiseBuffer(context, "pink");
    source.loop = true;
    filter.type = "bandpass";
    filter.frequency.value = 900;
    filter.Q.value = 0.35;
    gain.gain.value = 0.12;
    lfo.frequency.value = 0.18;
    lfoGain.gain.value = 0.035;

    lfo.connect(lfoGain);
    lfoGain.connect(gain.gain);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(context.destination);

    source.start();
    lfo.start();

    return () => {
      source.stop();
      lfo.stop();
      source.disconnect();
      filter.disconnect();
      gain.disconnect();
      lfo.disconnect();
      lfoGain.disconnect();
    };
  }

  return () => {};
}

function stopEndAlert(endAlertCleanupRef: React.MutableRefObject<(() => void) | null>) {
  endAlertCleanupRef.current?.();
  endAlertCleanupRef.current = null;
}

function openAmbientDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open(AMBIENT_DB_NAME, 1);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(AMBIENT_STORE_NAME)) {
        db.createObjectStore(AMBIENT_STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open audio storage."));
  });
}

async function saveStoredAmbientBlob(file: Blob) {
  const db = await openAmbientDb();

  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(AMBIENT_STORE_NAME, "readwrite");
    const store = transaction.objectStore(AMBIENT_STORE_NAME);
    store.put(file, CUSTOM_AMBIENT_ID);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("Could not save ambient audio."));
  });

  db.close();
}

async function getStoredAmbientBlob() {
  const db = await openAmbientDb();

  const blob = await new Promise<Blob | null>((resolve, reject) => {
    const transaction = db.transaction(AMBIENT_STORE_NAME, "readonly");
    const store = transaction.objectStore(AMBIENT_STORE_NAME);
    const request = store.get(CUSTOM_AMBIENT_ID);
    request.onsuccess = () => resolve((request.result as Blob | undefined) ?? null);
    request.onerror = () =>
      reject(request.error ?? new Error("Could not load ambient audio."));
  });

  db.close();
  return blob;
}

async function deleteStoredAmbientBlob() {
  const db = await openAmbientDb();

  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(AMBIENT_STORE_NAME, "readwrite");
    const store = transaction.objectStore(AMBIENT_STORE_NAME);
    store.delete(CUSTOM_AMBIENT_ID);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("Could not delete ambient audio."));
  });

  db.close();
}

function playTimerEndAlert(
  audioContextRef: React.MutableRefObject<AudioContext | null>,
  endAlertCleanupRef: React.MutableRefObject<(() => void) | null>,
) {
  if (typeof window === "undefined") {
    return;
  }

  const AmbientAudioContext =
    window.AudioContext ||
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

  if (!AmbientAudioContext) {
    return;
  }

  const context = audioContextRef.current ?? new AmbientAudioContext();
  audioContextRef.current = context;
  stopEndAlert(endAlertCleanupRef);

  if (context.state === "suspended") {
    void context.resume().catch(() => undefined);
  }

  const startedNodes: Array<{
    osc: OscillatorNode;
    gain: GainNode;
    stopAt: number;
  }> = [];
  const timeouts: number[] = [];
  const durationMs = 9000;
  const intervalMs = 1400;

  const triggerBurst = () => {
    const startAt = context.currentTime + 0.01;
    const master = context.createGain();
    master.gain.setValueAtTime(0.0001, startAt);
    master.gain.exponentialRampToValueAtTime(0.34, startAt + 0.02);
    master.gain.exponentialRampToValueAtTime(0.0001, startAt + 1.1);
    master.connect(context.destination);

    const notes: Array<[number, number, OscillatorType]> = [
      [880, 0, "square"],
      [1174.66, 0.18, "square"],
      [880, 0.42, "square"],
      [1318.51, 0.62, "triangle"],
    ];

    notes.forEach(([frequency, offset, type]) => {
      const osc = context.createOscillator();
      const gain = context.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(frequency, startAt + offset);
      gain.gain.setValueAtTime(0.0001, startAt + offset);
      gain.gain.exponentialRampToValueAtTime(0.28, startAt + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + offset + 0.22);

      osc.connect(gain);
      gain.connect(master);

      const stopAt = startAt + offset + 0.26;
      osc.start(startAt + offset);
      osc.stop(stopAt);
      startedNodes.push({ osc, gain, stopAt });
      osc.onended = () => {
        osc.disconnect();
        gain.disconnect();
      };
    });

    const disconnectId = window.setTimeout(() => {
      master.disconnect();
    }, 1300);
    timeouts.push(disconnectId);
  };

  triggerBurst();

  const intervalId = window.setInterval(() => {
    triggerBurst();
  }, intervalMs);

  const endId = window.setTimeout(() => {
    stopEndAlert(endAlertCleanupRef);
  }, durationMs);

  endAlertCleanupRef.current = () => {
    window.clearInterval(intervalId);
    window.clearTimeout(endId);
    timeouts.forEach((id) => window.clearTimeout(id));

    const now = context.currentTime;
    startedNodes.forEach(({ osc, gain, stopAt }) => {
      try {
        gain.gain.cancelScheduledValues(now);
        gain.gain.setValueAtTime(gain.gain.value || 0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
        osc.stop(Math.max(now + 0.06, stopAt));
      } catch {
        // Ignore already-stopped oscillators.
      }
    });
  };
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

const FocusPipUI = ({
  selectedType,
  timeLeft,
  isActive,
  goal,
  sessionGoal,
  toggleTimer,
  resetTimer,
  skipSession,
  onClose,
}: {
  selectedType: SessionType;
  timeLeft: number;
  isActive: boolean;
  goal: string;
  sessionGoal: string;
  toggleTimer: () => void;
  resetTimer: () => void;
  skipSession: () => void;
  onClose: () => void;
}) => {
  const minStr = String(Math.floor(timeLeft / 60)).padStart(2, "0");
  const secStr = String(timeLeft % 60).padStart(2, "0");

  return (
    <div className="w-full h-full flex flex-col justify-between bg-[#0e0e0d] text-[#ddd8cc] p-4 select-none font-sans">
      <div className="flex items-center justify-between border-b border-white/5 pb-2 mb-2 w-full text-left">
        <span className="text-xs font-semibold text-[#ffd000] truncate max-w-[200px]">Focus Session</span>
        <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono uppercase font-bold ${
          selectedType === "focus"
            ? "bg-[rgba(201,125,12,0.13)] text-[#c97d0c] border border-[rgba(201,125,12,0.25)]"
            : "bg-[rgba(26,158,117,0.13)] text-[#1a9e75] border border-[rgba(26,158,117,0.25)]"
        }`}>
          {selectedType === "focus" ? "Focus" : "Break"}
        </span>
      </div>

      <div className="flex-1 w-full min-h-0 flex flex-col items-center justify-center py-2">
        {selectedType === "focus" && (sessionGoal || goal) && (
          <p className="text-[11px] text-[#9c9788] italic mb-2 text-center truncate w-full">
            "{sessionGoal || goal}"
          </p>
        )}
        <span className="text-4xl font-extrabold tracking-tight font-mono text-[#e4dfcf]">
          {minStr}:{secStr}
        </span>
      </div>

      <div className="flex items-center justify-center gap-3 mt-2 w-full border-t border-white/5 pt-2">
        <button
          onClick={resetTimer}
          className="p-2 rounded-full bg-white/5 hover:bg-white/10 text-[#ddd8cc] transition-all"
          title="Reset Timer"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
        </button>
        <button
          onClick={toggleTimer}
          className={`p-2.5 rounded-full transition-all ${
            isActive
              ? "bg-white/10 hover:bg-white/20 text-[#e4dfcf]"
              : "bg-[#c97d0c] hover:bg-[#b56d09] text-black"
          }`}
          title={isActive ? "Pause" : "Start"}
        >
          {isActive ? (
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><rect x="14" y="4" width="4" height="16" rx="1"/><rect x="6" y="4" width="4" height="16" rx="1"/></svg>
          ) : (
            <svg className="h-4 w-4 ml-0.5" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          )}
        </button>
        <button
          onClick={skipSession}
          className="p-2 rounded-full bg-white/5 hover:bg-white/10 text-[#ddd8cc] transition-all"
          title="Skip Session"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/></svg>
        </button>
        <button
          onClick={onClose}
          className="p-2 rounded-full bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-all ml-auto"
          title="Close PiP"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 14h6v6"/><path d="M20 10h-6V4"/><path d="M14 10l7-7"/><path d="M10 14l-7 7"/></svg>
        </button>
      </div>
    </div>
  );
};
