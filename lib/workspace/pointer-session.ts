export interface PointerSessionTarget {
  setPointerCapture(pointerId: number): void;
  hasPointerCapture(pointerId: number): boolean;
  releasePointerCapture(pointerId: number): void;
}

export interface PointerSessionEvent {
  pointerId: number;
  isPrimary: boolean;
  button: number;
  preventDefault(): void;
  stopPropagation(): void;
}

export interface PointerSession {
  pointerId: number;
  target: PointerSessionTarget;
}

/**
 * Claims one primary pointer for a tool gesture.
 * A second finger or secondary mouse button cannot replace an active gesture.
 */
export function beginPointerSession(
  event: PointerSessionEvent,
  target: PointerSessionTarget,
  current: PointerSession | null,
): PointerSession | null {
  if (current || !event.isPrimary || event.button !== 0) return null;

  try {
    target.setPointerCapture(event.pointerId);
  } catch {
    return null;
  }

  event.preventDefault();
  event.stopPropagation();

  return { pointerId: event.pointerId, target };
}

export function ownsPointerSession(
  session: PointerSession | null,
  event: Pick<PointerSessionEvent, "pointerId">,
): boolean {
  return session !== null && session.pointerId === event.pointerId;
}

/** Completes the owning pointer and releases capture exactly once. */
export function endPointerSession(
  session: PointerSession | null,
  event: Pick<PointerSessionEvent, "pointerId">,
): null | PointerSession {
  if (!ownsPointerSession(session, event)) return session;

  if (session.target.hasPointerCapture(session.pointerId)) {
    session.target.releasePointerCapture(session.pointerId);
  }

  return null;
}

/** Clears a session when the browser cancels it or capture is unexpectedly lost. */
export function clearPointerSession(
  session: PointerSession | null,
  event: Pick<PointerSessionEvent, "pointerId">,
): null | PointerSession {
  return ownsPointerSession(session, event) ? null : session;
}
