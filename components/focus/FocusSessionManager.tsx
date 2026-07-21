"use client";

import { useEffect, useRef, useState } from "react";
import useSWR, { mutate } from "swr";
import { toast } from "react-hot-toast";
import {
  useFocusStore,
  initializeFocusStore,
} from "@/hooks/useFocusStore";
import { persistSessionToServer, flushPendingSessions } from "@/lib/client/focus-persist";
import { Modal } from "@/components/ui/modal";

interface Task {
  id: string;
  title: string;
  description: string | null;
  priority: string;
  status: string;
  category: string;
  dueDate: string | null;
  dueTime: string | null;
  estimatedDuration: number | null;
  trackedDuration: number;
}

// ─── Timer end alert (standalone, no React refs needed) ──────
function playCompletionAlert() {
  if (typeof window === "undefined") return;

  const AudioCtx =
    window.AudioContext ||
    (window as typeof window & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AudioCtx) return;

  const ctx = new AudioCtx();
  if (ctx.state === "suspended") {
    void ctx.resume().catch(() => undefined);
  }

  const timeouts: number[] = [];
  const intervalMs = 1400;
  const durationMs = 9000;

  const triggerBurst = () => {
    const startAt = ctx.currentTime + 0.01;
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, startAt);
    master.gain.exponentialRampToValueAtTime(0.34, startAt + 0.02);
    master.gain.exponentialRampToValueAtTime(0.0001, startAt + 1.1);
    master.connect(ctx.destination);

    const notes: Array<[number, number, OscillatorType]> = [
      [880, 0, "square"],
      [1174.66, 0.18, "square"],
      [880, 0.42, "square"],
      [1318.51, 0.62, "triangle"],
    ];

    notes.forEach(([frequency, offset, type]) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(frequency, startAt + offset);
      gain.gain.setValueAtTime(0.0001, startAt + offset);
      gain.gain.exponentialRampToValueAtTime(0.28, startAt + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + offset + 0.22);
      osc.connect(gain);
      gain.connect(master);
      osc.start(startAt + offset);
      osc.stop(startAt + offset + 0.26);
      osc.onended = () => {
        osc.disconnect();
        gain.disconnect();
      };
    });

    const disconnectId = window.setTimeout(() => master.disconnect(), 1300);
    timeouts.push(disconnectId);
  };

  triggerBurst();
  const intervalId = window.setInterval(triggerBurst, intervalMs);
  const endId = window.setTimeout(() => {
    window.clearInterval(intervalId);
    timeouts.forEach((id) => window.clearTimeout(id));
    // Close the audio context after the alert finishes
    setTimeout(() => void ctx.close().catch(() => {}), 200);
  }, durationMs);
  timeouts.push(endId);
}

// ─── Global Focus Session Manager ────────────────────────────
export function FocusSessionManager() {
  const pendingCompletion = useFocusStore((s) => s.pendingCompletion);
  const completionProcessed = useRef(false);

  // Fetch tasks to cross-reference completed study time
  const { data: tasks } = useSWR<Task[]>("/api/planner/tasks", async (url) => {
    const res = await fetch(url);
    if (!res.ok) return [];
    const json = await res.json();
    return json.ok ? json.data : [];
  });

  const [completedTaskPrompt, setCompletedTaskPrompt] = useState<Task | null>(null);
  const [isPromptSubmitting, setIsPromptSubmitting] = useState(false);

  // ── 1. Hydrate store on mount ────────────────────────────
  useEffect(() => {
    initializeFocusStore();
    // Also flush any pending sessions from earlier failures
    void flushPendingSessions();
  }, []);

  // ── 2. Global tick interval ──────────────────────────────
  useEffect(() => {
    const interval = window.setInterval(() => {
      useFocusStore.getState().tick();
    }, 1000);

    // Tick immediately to sync display on mount / recover expired sessions
    useFocusStore.getState().tick();

    return () => () => window.clearInterval(interval);
  }, []);

  // ── 3. Handle session completions ────────────────────────
  useEffect(() => {
    if (!pendingCompletion) {
      completionProcessed.current = false;
      return;
    }

    // Prevent duplicate processing
    if (completionProcessed.current) return;
    completionProcessed.current = true;

    // Play alert sound
    playCompletionAlert();

    // Persist to server
    void persistSessionToServer({
      type: pendingCompletion.type,
      durationMs: pendingCompletion.durationMs,
      status: "completed",
      goal: pendingCompletion.goal,
      startedAt: pendingCompletion.startedAt,
      taskId: pendingCompletion.taskId,
    }).then(() => {
      void mutate("/api/analytics");
      void mutate("/api/dashboard");
      void mutate("/api/planner/tasks");

      // Check if task estimated duration is reached
      if (pendingCompletion.type === "focus" && pendingCompletion.taskId && tasks) {
        const task = tasks.find((t) => t.id === pendingCompletion.taskId);
        if (task && task.estimatedDuration) {
          const estimatedMs = task.estimatedDuration * 60 * 1000;
          const newTracked = task.trackedDuration + pendingCompletion.durationMs;
          if (newTracked >= estimatedMs && task.status !== "completed") {
            // Delay slightly so completion toast displays first
            setTimeout(() => {
              setCompletedTaskPrompt(task);
            }, 1000);
          }
        }
      }
    });

    // Toast notification
    const wasType = pendingCompletion.type;
    if (wasType === "focus") {
      const state = useFocusStore.getState();
      const nextIsLong = state.selectedType === "longBreak";
      toast.success(
        nextIsLong
          ? "Focus block complete. Time for a long break."
          : "Focus block complete. Take a short break.",
      );
    } else {
      toast.success("Break complete. You're ready for the next focus session.");
    }

    // Auto-start next session if configured
    const state = useFocusStore.getState();
    if (wasType === "focus" && state.autoStartBreaks) {
      setTimeout(() => useFocusStore.getState().startTimer(), 50);
    } else if (wasType !== "focus" && state.autoStartFocus) {
      setTimeout(() => useFocusStore.getState().startTimer(), 50);
    }

    // Consume the event
    useFocusStore.getState().consumeCompletion();
  }, [pendingCompletion, tasks]);

  const handleMarkTaskComplete = async () => {
    if (!completedTaskPrompt) return;
    setIsPromptSubmitting(true);
    try {
      const res = await fetch(`/api/planner/tasks/${completedTaskPrompt.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "completed" }),
      });
      if (res.ok) {
        toast.success("Task marked as completed!");
        void mutate("/api/planner/tasks");
        setCompletedTaskPrompt(null);
      } else {
        throw new Error();
      }
    } catch {
      toast.error("Failed to update task.");
    } finally {
      setIsPromptSubmitting(false);
    }
  };

  return (
    <>
      {/* Global Task Completed Dialog */}
      <Modal
        open={completedTaskPrompt !== null}
        onClose={() => setCompletedTaskPrompt(null)}
        title="Task study target reached!"
        footer={
          <div className="flex justify-end gap-3.5">
            <button
              onClick={() => setCompletedTaskPrompt(null)}
              className="rounded-[8px] border border-white/[0.06] bg-white/[0.03] px-4.5 py-2 text-[12px] font-medium text-[#9c9788] transition hover:bg-white/[0.06] hover:text-[#e4dfcf]"
            >
              Later
            </button>
            <button
              onClick={() => setCompletedTaskPrompt(null)}
              className="rounded-[8px] border border-[#1a9e75]/25 bg-[#1a9e75]/5 px-4.5 py-2 text-[12px] font-medium text-[#1a9e75] transition hover:bg-[#1a9e75]/10"
            >
              Continue Study
            </button>
            <button
              disabled={isPromptSubmitting}
              onClick={handleMarkTaskComplete}
              className="rounded-[8px] bg-[#c97d0c] px-5 py-2 text-[12px] font-medium text-white transition hover:bg-[#b56d09]"
            >
              {isPromptSubmitting ? "Completing..." : "Complete Task"}
            </button>
          </div>
        }
      >
        <p className="text-[13px] leading-6 text-[#9c9788]">
          You have achieved your estimated study duration for task{" "}
          <strong className="text-[#e4dfcf]">"{completedTaskPrompt?.title}"</strong>.
          Would you like to mark this task as completed now?
        </p>
      </Modal>
    </>
  );
}



