"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ConnectorEnd, StudioItem } from "@/types/workspace";
import type { Vec } from "@/lib/workspace/connector-anchors";
import { findConnectionTarget, type ConnectionTarget } from "@/lib/workspace/connector-target";
import { useConnectorUiStore } from "@/lib/workspace/connector-ui-store";

export type ConnectionDraft = {
  source: ConnectorEnd;
  sourceId: string | null;
  target: ConnectionTarget;
  pointer: Vec;
  /** Pointer position in client (screen) coordinates. */
  client: Vec;
};

type SourceResolver = (pointer: Vec) => { end: ConnectorEnd; id: string | null };

export type ConnectionGestureStart = {
  /**
   * "drag": pointer pressed; becomes a connector once it travels `threshold`
   * world units, commits on release. "quick": the connector follows the
   * pointer without a press and commits on the next press (AFFiNE quick
   * connect).
   */
  kind: "drag" | "quick";
  pointerId?: number;
  clientX: number;
  clientY: number;
  /** World-unit travel before a drag starts (AFFiNE: 8 for auto-complete, 0 for the tool). */
  threshold?: number;
  resolveSource: SourceResolver;
  onClick?: () => void;
  onCommit: (draft: ConnectionDraft) => void;
  onCancel?: () => void;
};

type ActiveGesture = ConnectionGestureStart & { startWorld: Vec; active: boolean };

/**
 * Shared pointer lifecycle for every way of creating a connector. Targets
 * are resolved with AFFiNE's rules on each move; Escape, pointercancel and
 * lost capture cancel without side effects.
 */
export function useConnectionGesture({
  items,
  zoom,
  screenToWorld,
}: {
  items: readonly StudioItem[];
  zoom: number;
  screenToWorld: (clientX: number, clientY: number) => Vec;
}) {
  const [draft, setDraft] = useState<ConnectionDraft | null>(null);
  const gestureRef = useRef<ActiveGesture | null>(null);
  const draftRef = useRef<ConnectionDraft | null>(null);
  const itemsRef = useRef(items);
  const zoomRef = useRef(zoom);
  const screenToWorldRef = useRef(screenToWorld);
  itemsRef.current = items;
  zoomRef.current = zoom;
  screenToWorldRef.current = screenToWorld;
  const setGestureActive = useConnectorUiStore((state) => state.setGestureActive);

  const computeDraft = useCallback((gesture: ActiveGesture, clientX: number, clientY: number): ConnectionDraft => {
    const pointer = screenToWorldRef.current(clientX, clientY);
    const source = gesture.resolveSource(pointer);
    const target = findConnectionTarget(pointer, itemsRef.current, {
      zoom: zoomRef.current,
      excludeIds: source.id ? [source.id] : [],
    });
    return { source: source.end, sourceId: source.id, target, pointer, client: { x: clientX, y: clientY } };
  }, []);

  const end = useCallback(() => {
    gestureRef.current = null;
    draftRef.current = null;
    setDraft(null);
    setGestureActive(false);
  }, [setGestureActive]);

  const cancel = useCallback(() => {
    const gesture = gestureRef.current;
    if (!gesture) return;
    end();
    gesture.onCancel?.();
  }, [end]);

  const start = useCallback((options: ConnectionGestureStart) => {
    const startWorld = screenToWorldRef.current(options.clientX, options.clientY);
    const gesture: ActiveGesture = { ...options, startWorld, active: options.kind === "quick" };
    gestureRef.current = gesture;
    setGestureActive(true);
    if (gesture.active) {
      const next = computeDraft(gesture, options.clientX, options.clientY);
      draftRef.current = next;
      setDraft(next);
    }
  }, [computeDraft, setGestureActive]);

  useEffect(() => {
    const isOwnPointer = (gesture: ActiveGesture, event: PointerEvent) =>
      gesture.kind === "quick" || gesture.pointerId === undefined || gesture.pointerId === event.pointerId;

    const handleMove = (event: PointerEvent) => {
      const gesture = gestureRef.current;
      if (!gesture || !isOwnPointer(gesture, event)) return;
      if (!gesture.active) {
        const world = screenToWorldRef.current(event.clientX, event.clientY);
        const travelled = Math.hypot(world.x - gesture.startWorld.x, world.y - gesture.startWorld.y);
        if (travelled <= (gesture.threshold ?? 0)) return;
        gesture.active = true;
      }
      const next = computeDraft(gesture, event.clientX, event.clientY);
      draftRef.current = next;
      setDraft(next);
      if (gesture.kind === "drag") event.preventDefault();
    };

    const handleUp = (event: PointerEvent) => {
      const gesture = gestureRef.current;
      if (!gesture || gesture.kind !== "drag" || !isOwnPointer(gesture, event)) return;
      const current = gesture.active ? computeDraft(gesture, event.clientX, event.clientY) : null;
      end();
      if (current) gesture.onCommit(current);
      else gesture.onClick?.();
    };

    // Quick connect commits on the next press (target resolved at the press point).
    const handleDown = (event: PointerEvent) => {
      const gesture = gestureRef.current;
      if (!gesture || gesture.kind !== "quick") return;
      event.preventDefault();
      event.stopPropagation();
      const current = computeDraft(gesture, event.clientX, event.clientY);
      end();
      gesture.onCommit(current);
    };

    const handleCancel = (event: PointerEvent) => {
      const gesture = gestureRef.current;
      if (!gesture || !isOwnPointer(gesture, event)) return;
      cancel();
    };

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && gestureRef.current) {
        event.preventDefault();
        event.stopPropagation();
        cancel();
      }
    };

    window.addEventListener("pointermove", handleMove, { passive: false });
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointerdown", handleDown, true);
    window.addEventListener("pointercancel", handleCancel);
    window.addEventListener("keydown", handleKey, true);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointerdown", handleDown, true);
      window.removeEventListener("pointercancel", handleCancel);
      window.removeEventListener("keydown", handleKey, true);
    };
  }, [cancel, computeDraft, end]);

  return { draft, start, cancel, isActive: () => gestureRef.current !== null };
}
