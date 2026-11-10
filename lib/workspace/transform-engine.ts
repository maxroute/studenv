// ---------------------------------------------------------------------------
// Shape Tool – Bounding Box Transformations (Resize & Rotate Math)
// ---------------------------------------------------------------------------

export type ResizeHandle = "n" | "s" | "e" | "w" | "nw" | "ne" | "sw" | "se";

export interface Bounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Calculates new bounds when dragging a specific resize handle.
 * Supports aspect ratio lock (e.g., when Shift is held, or for perfect circles/squares).
 */
export function computeResize(
  handle: ResizeHandle,
  startBounds: Bounds,
  deltaX: number,
  deltaY: number,
  lockAspect = false,
  rotation = 0
): Bounds {
  const rotationRad = (rotation * Math.PI) / 180;
  const cos = Math.cos(rotationRad);
  const sin = Math.sin(rotationRad);

  // 1. Calculate start center of bounding box
  const startCenter = {
    x: startBounds.x + startBounds.w / 2,
    y: startBounds.y + startBounds.h / 2,
  };

  // 2. Identify the local anchor offset (opposite of the drag handle)
  let localAnchorX = 0;
  let localAnchorY = 0;

  if (handle.includes("w")) {
    localAnchorX = startBounds.w / 2;
  } else if (handle.includes("e")) {
    localAnchorX = -startBounds.w / 2;
  }

  if (handle.includes("n")) {
    localAnchorY = startBounds.h / 2;
  } else if (handle.includes("s")) {
    localAnchorY = -startBounds.h / 2;
  }

  // 3. Project local anchor to world coordinates
  const worldAnchorX = startCenter.x + (localAnchorX * cos - localAnchorY * sin);
  const worldAnchorY = startCenter.y + (localAnchorX * sin + localAnchorY * cos);

  // 4. Project screen pointer delta onto the shape's local coordinate axes
  const localDeltaX = deltaX * cos + deltaY * sin;
  const localDeltaY = -deltaX * sin + deltaY * cos;

  // 5. Calculate new width and height based on handle type
  let newW = startBounds.w;
  let newH = startBounds.h;

  if (handle.includes("e")) {
    newW = startBounds.w + localDeltaX;
  } else if (handle.includes("w")) {
    newW = startBounds.w - localDeltaX;
  }

  if (handle.includes("s")) {
    newH = startBounds.h + localDeltaY;
  } else if (handle.includes("n")) {
    newH = startBounds.h - localDeltaY;
  }

  // Minimum size clamp
  const minSize = 10;
  newW = Math.max(minSize, newW);
  newH = Math.max(minSize, newH);

  // 6. Constrain aspect ratio if locked
  if (lockAspect) {
    const originalRatio = startBounds.w / (startBounds.h || 1);
    if (handle === "nw" || handle === "ne" || handle === "se" || handle === "sw") {
      const absDeltaW = Math.abs(newW - startBounds.w);
      const absDeltaH = Math.abs(newH - startBounds.h);
      if (absDeltaW > absDeltaH) {
        newH = newW / originalRatio;
      } else {
        newW = newH * originalRatio;
      }
    } else if (handle === "n" || handle === "s") {
      newW = newH * originalRatio;
    } else if (handle === "e" || handle === "w") {
      newH = newW / originalRatio;
    }
  }

  // 7. Calculate new local anchor offset relative to new center
  let newLocalAnchorX = 0;
  let newLocalAnchorY = 0;

  if (handle.includes("w")) {
    newLocalAnchorX = newW / 2;
  } else if (handle.includes("e")) {
    newLocalAnchorX = -newW / 2;
  }

  if (handle.includes("n")) {
    newLocalAnchorY = newH / 2;
  } else if (handle.includes("s")) {
    newLocalAnchorY = -newH / 2;
  }

  // 8. Compute new center in world space from the locked world anchor point
  const newCenterX = worldAnchorX - (newLocalAnchorX * cos - newLocalAnchorY * sin);
  const newCenterY = worldAnchorY - (newLocalAnchorX * sin + newLocalAnchorY * cos);

  // 9. Return new top-left bounds
  return {
    x: newCenterX - newW / 2,
    y: newCenterY - newH / 2,
    w: newW,
    h: newH,
  };
}

/** Keep intrinsic media proportions while resizing. Shape-specific rules
 * remain unchanged; images are always aspect-locked for every handle. */
export function shouldLockAspectRatioOnResize(
  itemType: string,
  props: Record<string, unknown>,
  shiftKey: boolean,
): boolean {
  if (itemType === "image") return true;
  return itemType === "shape" && (
    props.kind === "circle" ||
    props.kind === "star" ||
    props.kind === "pentagon" ||
    shiftKey
  );
}

/**
 * Computes rotation angle relative to shape center point and pointer location.
 * Snaps to 15-degree increments unless holdAlt is active.
 */
export function computeRotation(
  center: { x: number; y: number },
  pointer: { x: number; y: number },
  snap = true
): number {
  const dx = pointer.x - center.x;
  const dy = pointer.y - center.y;

  // Calculate raw angle in degrees
  const radians = Math.atan2(dy, dx);
  let degrees = (radians * 180) / Math.PI + 90; // Rotate 90 deg so handle is at top center at 0 deg

  // Normalize to 0-359
  degrees = (degrees + 360) % 360;

  // Apply snapping every 15 degrees
  if (snap) {
    degrees = Math.round(degrees / 15) * 15;
  }

  return degrees % 360;
}
