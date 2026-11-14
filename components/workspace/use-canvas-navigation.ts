"use client";

// ---------------------------------------------------------------------------
// Canvas navigation that works in every tool (tldraw / Excalidraw parity)
// ---------------------------------------------------------------------------
// - Space + drag, middle-button drag and right-button drag pan (a right press
//   that does not move still opens the context menu)
// - the wheel and trackpad scroll pan, Shift pans sideways, Ctrl/⌘ and
//   trackpad pinch zoom around the pointer
// - two fingers pan and pinch in every tool; a second finger ends the first
//   finger's tool gesture and item drags made with it
// - pans keep gliding briefly after a fast release
// Listeners sit on window in the capture phase so they see a press before the
// canvas, item and react-rnd handlers, and can stop it when it is a pan.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useRef, useState, type MutableRefObject, type RefObject } from "react";
import {
  PanVelocity, RIGHT_DRAG_PAN_THRESHOLD, glideStep, panCamera, pinchCamera, wheelAction, zoomCameraAt, type Camera, type Point,
} from "@/lib/workspace/navigation";
import { setMultiTouchNavigating } from "@/lib/workspace/navigation-state";

type TransformHandle = {
  instance?: { transformState: { positionX: number; positionY: number; scale: number } };
  setTransform: (x: number, y: number, scale: number, time?: number, easing?: string) => void;
} | null;

type Options = {
  wrapperRef: RefObject<HTMLDivElement>;
  transformRef: MutableRefObject<TransformHandle>;
  /** Opens the canvas context menu (a right press that did not move). */
  openContextMenu: (clientX: number, clientY: number, target: Element | null, fromKeyboard: boolean) => boolean;
  /**
   * A second finger landed: end the first finger's tool gesture so two
   * fingers can navigate. Returns false to keep it (a stroke already being
   * drawn is kept, and the second finger is then ignored as a palm).
   */
  yieldToTwoFingers: (now: number) => boolean;
};

/** Targets where the browser's own scrolling, typing or controls win. */
const NATIVE_TARGETS = 'input, textarea, select, [contenteditable="true"], [data-no-canvas-gesture], [data-workspace-overlay], [data-workspace-context-menu]';

const isTyping = () => {
  const active = document.activeElement;
  return active instanceof HTMLElement && (active.isContentEditable || active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.tagName === "SELECT");
};

export function useCanvasNavigation({ wrapperRef, transformRef, openContextMenu, yieldToTwoFingers }: Options) {
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [dragPanning, setDragPanning] = useState(false);
  const glideFrame = useRef<number | null>(null);
  const live = useRef({ openContextMenu, yieldToTwoFingers });
  live.current = { openContextMenu, yieldToTwoFingers };

  const getCamera = useCallback((): Camera | null => {
    const state = transformRef.current?.instance?.transformState;
    return state ? { x: state.positionX, y: state.positionY, scale: state.scale } : null;
  }, [transformRef]);

  const setCamera = useCallback((camera: Camera) => {
    transformRef.current?.setTransform(camera.x, camera.y, camera.scale, 0);
  }, [transformRef]);

  const stopGlide = useCallback(() => {
    if (glideFrame.current !== null) cancelAnimationFrame(glideFrame.current);
    glideFrame.current = null;
  }, []);

  /** Keeps a released pan moving, slowing to a stop (velocity in screen px/ms). */
  const startGlide = useCallback((velocity: Point) => {
    stopGlide();
    let current = velocity;
    let last = performance.now();
    const frame = (now: number) => {
      const step = glideStep(current, Math.min(32, now - last));
      last = now;
      const camera = getCamera();
      if (!step || !camera) {
        glideFrame.current = null;
        return;
      }
      setCamera({ x: camera.x + step.dx, y: camera.y + step.dy, scale: camera.scale });
      current = step.velocity;
      glideFrame.current = requestAnimationFrame(frame);
    };
    glideFrame.current = requestAnimationFrame(frame);
  }, [getCamera, setCamera, stopGlide]);

  // Space held: the next press pans, whatever the tool.
  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.code !== "Space" || event.repeat || isTyping()) return;
      event.preventDefault();
      setSpaceHeld(true);
    };
    const up = (event: KeyboardEvent) => {
      if (event.code === "Space") setSpaceHeld(false);
    };
    const reset = () => setSpaceHeld(false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", reset);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", reset);
    };
  }, []);
  const spaceRef = useRef(false);
  spaceRef.current = spaceHeld;

  // Drag pans: Space + main button, middle button, right button (after a small move).
  useEffect(() => {
    let session: {
      pointerId: number;
      button: number;
      startX: number;
      startY: number;
      start: Camera;
      engaged: boolean;
      target: Element | null;
      velocity: PanVelocity;
      nativeMenuDuringPress: boolean;
    } | null = null;
    let suppressMenuUntil = 0;

    const onCanvas = (target: EventTarget | null): target is Element => {
      const wrapper = wrapperRef.current;
      return target instanceof Element && !!wrapper && wrapper.contains(target) && !target.closest(NATIVE_TARGETS);
    };

    const down = (event: PointerEvent) => {
      if (session || event.pointerType === "touch" || !onCanvas(event.target)) return;
      const panButton = event.button === 1 || event.button === 2 || (event.button === 0 && spaceRef.current);
      if (!panButton) return;
      const camera = getCamera();
      if (!camera) return;
      stopGlide();
      session = {
        pointerId: event.pointerId,
        button: event.button,
        startX: event.clientX,
        startY: event.clientY,
        start: camera,
        // A right press is only a pan once it moves; until then it may be a right-click.
        engaged: event.button !== 2,
        target: event.target,
        velocity: new PanVelocity(),
        nativeMenuDuringPress: false,
      };
      session.velocity.add(event.timeStamp, event.clientX, event.clientY);
      if (session.engaged) setDragPanning(true);
      // Keep the canvas, items and react-rnd from treating this press as theirs.
      // A right press is left alone: the platform still needs it for its menu.
      if (event.button !== 2) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    const move = (event: PointerEvent) => {
      if (!session || event.pointerId !== session.pointerId) return;
      const dx = event.clientX - session.startX;
      const dy = event.clientY - session.startY;
      if (!session.engaged) {
        if (Math.hypot(dx, dy) < RIGHT_DRAG_PAN_THRESHOLD) return;
        session.engaged = true;
        setDragPanning(true);
      }
      event.preventDefault();
      event.stopPropagation();
      session.velocity.add(event.timeStamp, event.clientX, event.clientY);
      setCamera({ x: session.start.x + dx, y: session.start.y + dy, scale: session.start.scale });
    };

    const up = (event: PointerEvent) => {
      if (!session || event.pointerId !== session.pointerId) return;
      const ended = session;
      session = null;
      setDragPanning(false);
      if (ended.engaged) {
        event.preventDefault();
        event.stopPropagation();
        // Windows sends `contextmenu` after the release: a right-drag pan is not a right-click.
        if (ended.button === 2) suppressMenuUntil = event.timeStamp + 400;
        const velocity = ended.velocity.velocity(event.timeStamp);
        if (Math.hypot(velocity.x, velocity.y) > 0.1) startGlide(velocity);
      } else if (ended.button === 2 && ended.nativeMenuDuringPress) {
        // macOS / Linux sent `contextmenu` with the press and it was held back: open on release.
        live.current.openContextMenu(event.clientX, event.clientY, ended.target, false);
      }
    };

    const cancel = (event: PointerEvent) => {
      if (session && event.pointerId === session.pointerId) {
        session = null;
        setDragPanning(false);
      }
    };

    const contextMenu = (event: MouseEvent) => {
      if (session && session.button === 2) {
        // Pressed, not yet released: it may still become a pan. Decide on release.
        session.nativeMenuDuringPress = true;
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (event.timeStamp < suppressMenuUntil) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    window.addEventListener("pointerdown", down, true);
    window.addEventListener("pointermove", move, true);
    window.addEventListener("pointerup", up, true);
    window.addEventListener("pointercancel", cancel, true);
    window.addEventListener("contextmenu", contextMenu, true);
    return () => {
      window.removeEventListener("pointerdown", down, true);
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerup", up, true);
      window.removeEventListener("pointercancel", cancel, true);
      window.removeEventListener("contextmenu", contextMenu, true);
    };
  }, [getCamera, setCamera, startGlide, stopGlide, wrapperRef]);

  // Wheel and trackpad: scroll pans, Shift pans sideways, Ctrl/⌘ or pinch zooms.
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const wheel = (event: WheelEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest(NATIVE_TARGETS)) return;
      const action = wheelAction(event, wrapper.clientHeight);
      if (action.type === "none") return;
      event.preventDefault();
      stopGlide();
      const camera = getCamera();
      if (!camera) return;
      if (action.type === "pan") {
        setCamera(panCamera(camera, action.dx, action.dy));
      } else {
        const rect = wrapper.getBoundingClientRect();
        setCamera(zoomCameraAt(camera, { x: event.clientX - rect.left, y: event.clientY - rect.top }, camera.scale * action.factor));
      }
    };
    wrapper.addEventListener("wheel", wheel, { passive: false });
    return () => wrapper.removeEventListener("wheel", wheel);
  }, [getCamera, setCamera, stopGlide, wrapperRef]);

  // Two fingers pan and pinch in every tool.
  useEffect(() => {
    const touches = new Map<number, Point>();
    let pinch: { ids: [number, number]; start: { camera: Camera; a: Point; b: Point }; velocity: PanVelocity } | null = null;

    const local = (event: PointerEvent): Point => {
      const rect = wrapperRef.current?.getBoundingClientRect();
      return { x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) };
    };

    const down = (event: PointerEvent) => {
      if (event.pointerType !== "touch") return;
      const wrapper = wrapperRef.current;
      const target = event.target instanceof Element ? event.target : null;
      if (!wrapper || !target || !wrapper.contains(target) || target.closest(NATIVE_TARGETS)) return;
      touches.set(event.pointerId, local(event));
      if (touches.size === 2 && !pinch) {
        const camera = getCamera();
        if (!camera) return;
        // The first finger's tool action (selection box, stroke dot, item drag) gives way.
        if (!live.current.yieldToTwoFingers(event.timeStamp)) return;
        stopGlide();
        setMultiTouchNavigating(true);
        const [[idA, a], [idB, b]] = [...touches.entries()];
        pinch = { ids: [idA, idB], start: { camera, a, b }, velocity: new PanVelocity() };
      }
    };

    const move = (event: PointerEvent) => {
      if (event.pointerType !== "touch" || !touches.has(event.pointerId)) return;
      touches.set(event.pointerId, local(event));
      if (!pinch) return;
      const a = touches.get(pinch.ids[0]);
      const b = touches.get(pinch.ids[1]);
      if (!a || !b) return;
      event.preventDefault();
      setCamera(pinchCamera(pinch.start, a, b));
      pinch.velocity.add(event.timeStamp, (a.x + b.x) / 2, (a.y + b.y) / 2);
    };

    const up = (event: PointerEvent) => {
      if (event.pointerType !== "touch" || !touches.delete(event.pointerId)) return;
      if (pinch && pinch.ids.includes(event.pointerId)) {
        const velocity = pinch.velocity.velocity(event.timeStamp);
        pinch = null;
        if (Math.hypot(velocity.x, velocity.y) > 0.3) startGlide(velocity);
      }
      // Item drags stay blocked until every finger is up.
      if (touches.size === 0) setMultiTouchNavigating(false);
    };

    window.addEventListener("pointerdown", down, { capture: true, passive: true });
    window.addEventListener("pointermove", move, { capture: true, passive: false });
    window.addEventListener("pointerup", up, { capture: true, passive: true });
    window.addEventListener("pointercancel", up, { capture: true, passive: true });
    return () => {
      window.removeEventListener("pointerdown", down, true);
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerup", up, true);
      window.removeEventListener("pointercancel", up, true);
      setMultiTouchNavigating(false);
    };
  }, [getCamera, setCamera, startGlide, stopGlide, wrapperRef]);

  useEffect(() => stopGlide, [stopGlide]);

  return { spaceHeld, dragPanning, startGlide, stopGlide, getCamera, setCamera };
}
