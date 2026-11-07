"use client";

const PENDING_SESSIONS_KEY = "second-brain-pending-sessions";

export async function persistSessionToServer(session: {
  type: string;
  durationMs: number;
  status: "completed" | "interrupted";
  goal?: string;
  startedAt?: string;
  taskId?: string | null;
  courseNodeId?: string | null;
}): Promise<boolean> {
  try {
    const res = await fetch("/api/focus-sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(session),
    });
    if (!res.ok) {
      throw new Error(`Server returned ${res.status}`);
    }
    await flushPendingSessions();
    return true;
  } catch (err) {
    console.error("Failed to persist session to server, queuing:", err);
    queuePendingSession(session);
    return false;
  }
}

function queuePendingSession(session: Record<string, unknown>) {
  try {
    const raw = window.localStorage.getItem(PENDING_SESSIONS_KEY);
    const pending = raw ? JSON.parse(raw) : [];
    pending.push(session);
    window.localStorage.setItem(
      PENDING_SESSIONS_KEY,
      JSON.stringify(pending),
    );
  } catch {}
}

export async function flushPendingSessions() {
  try {
    const raw = window.localStorage.getItem(PENDING_SESSIONS_KEY);
    if (!raw) return;
    const pending = JSON.parse(raw) as Array<Record<string, unknown>>;
    if (pending.length === 0) return;

    const remaining: Array<Record<string, unknown>> = [];
    for (const session of pending) {
      try {
        const res = await fetch("/api/focus-sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(session),
        });
        if (!res.ok) {
          remaining.push(session);
        }
      } catch {
        remaining.push(session);
      }
    }

    if (remaining.length === 0) {
      window.localStorage.removeItem(PENDING_SESSIONS_KEY);
    } else {
      window.localStorage.setItem(
        PENDING_SESSIONS_KEY,
        JSON.stringify(remaining),
      );
    }
  } catch {}
}
