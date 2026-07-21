// ---------------------------------------------------------------------------
// Shape Tool – Smart Alignment Snapping Engine
// ---------------------------------------------------------------------------

export interface Bounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SnapGuideLine {
  type: "v" | "h"; // vertical or horizontal line
  value: number; // canvas world coordinate of the line
}

export interface SnapResult {
  x: number; // snapped x
  y: number; // snapped y
  guides: SnapGuideLine[];
}

/**
 * Computes snap positioning and guide lines when moving an item.
 * Compares moving bounds against all other elements on the canvas.
 */
export function computeSnap(
  movingBounds: Bounds,
  otherItems: Bounds[],
  threshold = 6
): SnapResult {
  let snappedX = movingBounds.x;
  let snappedY = movingBounds.y;
  const guides: SnapGuideLine[] = [];

  const movingLeft = movingBounds.x;
  const movingCenterX = movingBounds.x + movingBounds.w / 2;
  const movingRight = movingBounds.x + movingBounds.w;

  const movingTop = movingBounds.y;
  const movingCenterY = movingBounds.y + movingBounds.h / 2;
  const movingBottom = movingBounds.y + movingBounds.h;

  let minDiffX = Infinity;
  let minDiffY = Infinity;

  otherItems.forEach((other) => {
    const otherLeft = other.x;
    const otherCenterX = other.x + other.w / 2;
    const otherRight = other.x + other.w;

    const otherTop = other.y;
    const otherCenterY = other.y + other.h / 2;
    const otherBottom = other.y + other.h;

    // ── Vertical snapping alignments (align x coordinates) ───────────────────
    const vAlignments = [
      { moving: movingLeft, other: otherLeft, diff: otherLeft - movingLeft, snapX: otherLeft },
      { moving: movingLeft, other: otherRight, diff: otherRight - movingLeft, snapX: otherRight },
      { moving: movingCenterX, other: otherCenterX, diff: otherCenterX - movingCenterX, snapX: otherCenterX - movingBounds.w / 2 },
      { moving: movingRight, other: otherLeft, diff: otherLeft - movingRight, snapX: otherLeft - movingBounds.w },
      { moving: movingRight, other: otherRight, diff: otherRight - movingRight, snapX: otherRight - movingBounds.w },
    ];

    vAlignments.forEach((align) => {
      const absDiff = Math.abs(align.diff);
      if (absDiff < threshold && absDiff < minDiffX) {
        minDiffX = absDiff;
        snappedX = align.snapX;
        guides.push({ type: "v", value: align.other });
      }
    });

    // ── Horizontal snapping alignments (align y coordinates) ─────────────────
    const hAlignments = [
      { moving: movingTop, other: otherTop, diff: otherTop - movingTop, snapY: otherTop },
      { moving: movingTop, other: otherBottom, diff: otherBottom - movingTop, snapY: otherBottom },
      { moving: movingCenterY, other: otherCenterY, diff: otherCenterY - movingCenterY, snapY: otherCenterY - movingBounds.h / 2 },
      { moving: movingBottom, other: otherTop, diff: otherTop - movingBottom, snapY: otherTop - movingBounds.h },
      { moving: movingBottom, other: otherBottom, diff: otherBottom - movingBottom, snapY: otherBottom - movingBounds.h },
    ];

    hAlignments.forEach((align) => {
      const absDiff = Math.abs(align.diff);
      if (absDiff < threshold && absDiff < minDiffY) {
        minDiffY = absDiff;
        snappedY = align.snapY;
        guides.push({ type: "h", value: align.other });
      }
    });
  });

  // Filter guides to match the snapped coordinates exactly
  const finalGuides = guides.filter((g) => {
    if (g.type === "v") {
      // Check if snapped edges match this guide value
      return (
        Math.abs(snappedX - g.value) < 1 ||
        Math.abs(snappedX + movingBounds.w / 2 - g.value) < 1 ||
        Math.abs(snappedX + movingBounds.w - g.value) < 1
      );
    } else {
      return (
        Math.abs(snappedY - g.value) < 1 ||
        Math.abs(snappedY + movingBounds.h / 2 - g.value) < 1 ||
        Math.abs(snappedY + movingBounds.h - g.value) < 1
      );
    }
  });

  return {
    x: snappedX,
    y: snappedY,
    guides: finalGuides,
  };
}
