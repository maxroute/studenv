"use client";

import React, { useEffect, useState, useRef } from "react";
import useSWR, { mutate } from "swr";
import { motion, AnimatePresence } from "framer-motion";
import { Bell, Clock, Check, X, Volume2, VolumeX } from "lucide-react";
import { toast } from "react-hot-toast";

interface Task {
  id: string;
  title: string;
  description: string | null;
  priority: string;
  status: string;
  category: string;
  dueDate: string | null;
  dueTime: string | null;
  notificationEnabled: boolean;
  repeat: string;
  color: string | null;
  icon: string | null;
}

interface LocalReminderState {
  fiveMinWarningSent?: boolean;
  exactTimeSent?: boolean;
  ignoredRepeatCount?: number;
  lastIgnoredRepeatSentAt?: number | null;
  snoozedUntil?: number | null;
  dismissed?: boolean;
}

// Helper to load/save reminder states in localStorage
const NOTIFICATION_STATES_KEY = "studenv-planner-reminders-v2";

function getReminderStates(): Record<string, LocalReminderState> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(NOTIFICATION_STATES_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveReminderStates(states: Record<string, LocalReminderState>) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(NOTIFICATION_STATES_KEY, JSON.stringify(states));
  } catch {}
}

// Web Audio API Synthesizer for soft chime
function playChimeSound() {
  if (typeof window === "undefined") return;

  // Respect sound preference if set
  const soundsDisabled =
    localStorage.getItem("studenv-planner-sounds-disabled") === "true";
  if (soundsDisabled) return;

  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    if (ctx.state === "suspended") {
      void ctx.resume();
    }

    const startAt = ctx.currentTime + 0.02;
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, startAt);
    master.gain.exponentialRampToValueAtTime(0.12, startAt + 0.04);
    master.gain.exponentialRampToValueAtTime(0.0001, startAt + 1.2);
    master.connect(ctx.destination);

    const playTone = (freq: number, offset: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, startAt + offset);

      gain.gain.setValueAtTime(0.0001, startAt + offset);
      gain.gain.exponentialRampToValueAtTime(0.1, startAt + offset + 0.03);
      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        startAt + offset + duration - 0.02,
      );

      osc.connect(gain);
      gain.connect(master);
      osc.start(startAt + offset);
      osc.stop(startAt + offset + duration);

      osc.onended = () => {
        osc.disconnect();
        gain.disconnect();
      };
    };

    // Synthesize C-major 9 soft chords (C, E, G, C, D)
    playTone(261.63, 0, 0.5); // C4
    playTone(329.63, 0.05, 0.55); // E4
    playTone(392.0, 0.1, 0.6); // G4
    playTone(523.25, 0.15, 0.7); // C5
    playTone(587.33, 0.2, 0.8); // D5

    setTimeout(() => {
      master.disconnect();
      void ctx.close().catch(() => {});
    }, 1500);
  } catch (err) {
    console.warn("Audio Context blocked or unsupported:", err);
  }
}

export function ReminderManager() {
  const { data: tasks } = useSWR<Task[]>(
    "/api/planner/tasks",
    async (url) => {
      const res = await fetch(url);
      if (!res.ok) return [];
      const json = await res.json();
      return json.ok ? json.data : [];
    },
    {
      refreshInterval: 10000, // Sync tasks from server every 10 seconds
    },
  );

  const [activeReminder, setActiveReminder] = useState<Task | null>(null);
  const [reminderType, setReminderType] = useState<
    "warning" | "due" | "snoozed"
  >("due");
  const [soundDisabled, setSoundDisabled] = useState(false);
  const audioContextRef = useRef<boolean>(false);

  // Initialize sound setting and notification permissions
  useEffect(() => {
    if (typeof window !== "undefined") {
      setSoundDisabled(
        localStorage.getItem("studenv-planner-sounds-disabled") === "true",
      );

      // Request browser notification permission gently if user clicks anywhere first
      const requestNotifyPerm = () => {
        if ("Notification" in window && Notification.permission === "default") {
          // Never request immediately, wait for interactive session
          const hasLoggedInBefore = localStorage.getItem(
            "studenv-logged-in-previously",
          );
          if (hasLoggedInBefore) {
            void Notification.requestPermission();
          } else {
            localStorage.setItem("studenv-logged-in-previously", "true");
          }
        }
      };

      window.addEventListener("click", requestNotifyPerm, { once: true });
      return () => window.removeEventListener("click", requestNotifyPerm);
    }
  }, []);

  // background loop running every second
  useEffect(() => {
    const checkInterval = setInterval(() => {
      if (!tasks || tasks.length === 0) return;

      const now = Date.now();
      const currentStates = getReminderStates();
      let statesChanged = false;

      for (const task of tasks) {
        // Skip completed/cancelled tasks
        if (
          task.status === "completed" ||
          task.status === "cancelled" ||
          task.status === "missed"
        ) {
          continue;
        }

        // Skip reminders if task lacks date or time or notifications are disabled
        if (!task.dueDate || !task.dueTime || !task.notificationEnabled) {
          continue;
        }

        // Combine task dueDate and dueTime in local timezone
        const d = new Date(task.dueDate);
        const [hours, minutes] = task.dueTime.split(":").map(Number);
        const dueDateTime = new Date(
          d.getUTCFullYear(),
          d.getUTCMonth(),
          d.getUTCDate(),
          hours,
          minutes,
          0,
          0,
        );

        const diffMs = dueDateTime.getTime() - now;
        const state = currentStates[task.id] || {};

        // 1. 5-Minute Warning: diffMs is positive and <= 5 minutes
        if (diffMs > 0 && diffMs <= 5 * 60 * 1000) {
          if (!state.fiveMinWarningSent) {
            state.fiveMinWarningSent = true;
            currentStates[task.id] = state;
            statesChanged = true;

            // Trigger notification
            setActiveReminder(task);
            setReminderType("warning");
            playChimeSound();
            triggerBrowserNotification(
              "Task starting soon",
              `"${task.title}" starts in ${Math.round(diffMs / 60000)} minutes.`,
            );
          }
        }

        // 2. Exact Time Due: diffMs is <= 0 (due now or past due)
        else if (diffMs <= 0) {
          if (!state.exactTimeSent) {
            state.exactTimeSent = true;
            state.ignoredRepeatCount = 0;
            state.lastIgnoredRepeatSentAt = now;
            state.dismissed = false;
            state.snoozedUntil = null;
            currentStates[task.id] = state;
            statesChanged = true;

            // Trigger notification
            setActiveReminder(task);
            setReminderType("due");
            playChimeSound();
            triggerBrowserNotification(
              "Task scheduled now",
              `Your scheduled task "${task.title}" is ready.`,
            );
          } else if (!state.dismissed) {
            // 3. Check Snooze expiration
            if (state.snoozedUntil) {
              if (now >= state.snoozedUntil) {
                state.snoozedUntil = null;
                state.lastIgnoredRepeatSentAt = now; // reset repeat interval after snooze finishes
                currentStates[task.id] = state;
                statesChanged = true;

                // Re-trigger due reminder
                setActiveReminder(task);
                setReminderType("snoozed");
                playChimeSound();
                triggerBrowserNotification(
                  "Snoozed Task Ready",
                  `"${task.title}" is ready now.`,
                );
              }
            }
            // 4. Check Ignored Repeat (every 5 minutes for up to 30 minutes = 6 repeats max)
            else {
              const repeatCount = state.ignoredRepeatCount ?? 0;
              if (repeatCount < 6) {
                const lastSentAt =
                  state.lastIgnoredRepeatSentAt ?? dueDateTime.getTime();
                if (now - lastSentAt >= 5 * 60 * 1000) {
                  state.ignoredRepeatCount = repeatCount + 1;
                  state.lastIgnoredRepeatSentAt = now;
                  currentStates[task.id] = state;
                  statesChanged = true;

                  // Re-trigger reminder popup
                  setActiveReminder(task);
                  setReminderType("due");
                  playChimeSound();
                  triggerBrowserNotification(
                    "Reminder Alert",
                    `"${task.title}" is still pending.`,
                  );
                }
              }
            }
          }
        }
      }

      if (statesChanged) {
        saveReminderStates(currentStates);
      }
    }, 1000);

    return () => clearInterval(checkInterval);
  }, [tasks]);

  const triggerBrowserNotification = (title: string, body: string) => {
    if (
      typeof window !== "undefined" &&
      "Notification" in window &&
      Notification.permission === "granted"
    ) {
      try {
        const n = new Notification(title, {
          body,
          icon: "/brand-logo.png",
          badge: "/brand-logo.png",
          tag: "studenv-planner-alert",
          requireInteraction: true,
        });
        n.onclick = () => {
          window.focus();
          n.close();
        };
      } catch {}
    }
  };

  const handleSnooze = (minutes: number) => {
    if (!activeReminder) return;
    const currentStates = getReminderStates();
    const state = currentStates[activeReminder.id] || {};
    state.snoozedUntil = Date.now() + minutes * 60 * 1000;
    state.dismissed = false; // Reset dismissed state
    currentStates[activeReminder.id] = state;
    saveReminderStates(currentStates);

    toast.success(`Task snoozed for ${minutes} minutes.`);
    setActiveReminder(null);
  };

  const handleDismiss = () => {
    if (!activeReminder) return;
    const currentStates = getReminderStates();
    const state = currentStates[activeReminder.id] || {};
    state.dismissed = true;
    state.snoozedUntil = null;
    currentStates[activeReminder.id] = state;
    saveReminderStates(currentStates);

    toast.success("Reminder dismissed.");
    setActiveReminder(null);
  };

  const handleComplete = async () => {
    if (!activeReminder) return;
    try {
      const res = await fetch(`/api/planner/tasks/${activeReminder.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "completed" }),
      });
      if (res.ok) {
        toast.success("Task completed!");
        void mutate("/api/planner/tasks");

        // Mark as dismissed locally to prevent repeats
        const currentStates = getReminderStates();
        const state = currentStates[activeReminder.id] || {};
        state.dismissed = true;
        state.snoozedUntil = null;
        currentStates[activeReminder.id] = state;
        saveReminderStates(currentStates);

        setActiveReminder(null);
      } else {
        throw new Error();
      }
    } catch {
      toast.error("Failed to complete task.");
    }
  };

  const toggleSound = () => {
    const nextVal = !soundDisabled;
    setSoundDisabled(nextVal);
    localStorage.setItem("studenv-planner-sounds-disabled", String(nextVal));
    toast.success(
      nextVal ? "Reminder sounds disabled." : "Reminder sounds enabled.",
    );
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "urgent":
        return "border-[#e05555] text-[#e05555]";
      case "high":
        return "border-[#c97d0c] text-[#c97d0c]";
      case "medium":
        return "border-[#1a9e75] text-[#1a9e75]";
      default:
        return "border-[#FAA91F] text-[#FAA91F]";
    }
  };

  return (
    <>
      <AnimatePresence>
        {activeReminder && (
          <motion.div
            initial={{ opacity: 0, x: 100, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
            exit={{ opacity: 0, x: 100, scale: 0.9 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className={`fixed bottom-6 right-6 z-[9999] w-[340px] rounded-[14px] border bg-[#1b1b16] p-[15px] shadow-2xl ${getPriorityColor(activeReminder.priority)}`}
          >
            <div className="flex mb-3.5 items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="rounded-[8px] bg-white/[0.04] p-2">
                  {reminderType === "warning" ? (
                    <Clock className="h-4.5 w-4.5 text-[#c97d0c]" />
                  ) : (
                    <Bell className="h-4.5 w-4.5 animate-bounce text-[#e05555]" />
                  )}
                </div>
                <div>
                  <h4 className="text-[11px] uppercase tracking-wider text-[#9c9788] font-semibold">
                    {reminderType === "warning"
                      ? "Starting Soon"
                      : reminderType === "snoozed"
                        ? "Snoozed Task Due"
                        : "Task Due Now"}
                  </h4>
                  <p className="mt-0.5 font-[family:var(--font-fraunces)] text-[16px] text-[#e4dfcf] leading-tight">
                    {activeReminder.title}
                  </p>
                </div>
              </div>

              <button
                onClick={toggleSound}
                className="rounded-[6px] p-1.5 text-[#5c5a52] transition hover:bg-white/[0.04] hover:text-[#e4dfcf]"
                title={soundDisabled ? "Enable sounds" : "Disable sounds"}
              >
                {soundDisabled ? (
                  <VolumeX className="h-4 w-4" />
                ) : (
                  <Volume2 className="h-4 w-4" />
                )}
              </button>
            </div>

            {activeReminder.description && (
              <p className="mt-2.5 mb-2.5 text-[12px] text-[#9c9788] line-clamp-2 italic">
                "{activeReminder.description}"
              </p>
            )}

            <div className="mt-4.5 grid grid-cols-2 gap-2">
              <button
                onClick={handleComplete}
                className="flex items-center justify-center gap-1.5 rounded-[8px] bg-[#009900] px-3 py-2 text-[12px] font-medium text-white transition hover:bg-[#15805e]"
              >
                <Check className="h-3.5 w-3.5" />
                Complete
              </button>
              <button
                onClick={handleDismiss}
                className="flex items-center justify-center gap-1.5 rounded-[8px] border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-[12px] font-medium text-[#9c9788] transition hover:bg-white/[0.06] hover:text-[#e4dfcf]"
              >
                <X className="h-3.5 w-3.5" />
                Dismiss
              </button>
            </div>

            <div className="mt-2 grid grid-cols-2 gap-2 border-t border-white/[0.05] pt-2">
              <button
                onClick={() => handleSnooze(5)}
                className="rounded-[6px] bg-white/[0.02] py-1.5 text-[11px] text-[#9c9788] transition hover:bg-white/[0.05] hover:text-[#e4dfcf]"
              >
                Snooze 5 Min
              </button>
              <button
                onClick={() => handleSnooze(10)}
                className="rounded-[6px] bg-white/[0.02] py-1.5 text-[11px] text-[#9c9788] transition hover:bg-white/[0.05] hover:text-[#e4dfcf]"
              >
                Snooze 10 Min
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
