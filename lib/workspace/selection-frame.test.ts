import test from "node:test";
import assert from "node:assert/strict";
import { getConnectorAnchorPoint, isConnectableWorkspaceItem, type ConnectorPoint } from "./connector-geometry";
import { getEffectiveRotation, getSelectionFrame, usesOverlayOutlineOnly } from "./selection-frame";
import { isMigratedToSelectionOverlay } from "./shape-engine";
import { createWorkspaceItem, type ConnectorAnchor, type StudioItem, type WorkspaceNodeType } from "@/types/workspace";

type Connectable = Exclude<StudioItem, { type: "connector" }>;

const EPSILON = 1e-6;
const ANCHORS: ConnectorAnchor[] = ["top", "right", "bottom", "left"];
const ROTATIONS = [0, 45, 90, 180];

// Non-square on purpose so swapped width/height cannot pass.
const FRAME = { w: 100, h: 60 };
const ORIGIN = { x: 10, y: 20 };

const PROPS_BY_TYPE: Partial<Record<WorkspaceNodeType, Record<string, unknown>>> = {
  sticky: { text: "Note" },
  "free-text": { text: "Label" },
  "pdf-fragment": { assetId: "asset-1", pageNumber: 1 },
  "video-anchor": { assetId: "asset-2", startTimeMs: 0 },
  shape: { kind: "rectangle" },
  text: { text: "Body" },
  image: { src: "https://example.com/image.png" },
};

const AFFECTED_TYPES: WorkspaceNodeType[] = ["sticky", "free-text", "pdf-fragment", "video-anchor"];
const MIGRATED_TYPES: WorkspaceNodeType[] = ["shape", "text", "image"];

function makeItem(type: WorkspaceNodeType, rotation: number): Connectable {
  const item = createWorkspaceItem(
    type,
    { ...PROPS_BY_TYPE[type], ...FRAME, rotation },
    { id: `${type}-1`, ...ORIGIN, zIndex: 1 },
  );
  assert.ok(item, `createWorkspaceItem returned null for ${type}`);
  assert.notEqual(item.type, "connector");
  return item as Connectable;
}

function assertClose(actual: ConnectorPoint, expected: ConnectorPoint, label: string) {
  assert.ok(
    Math.abs(actual.x - expected.x) < EPSILON && Math.abs(actual.y - expected.y) < EPSILON,
    `${label}: expected (${expected.x}, ${expected.y}), got (${actual.x}, ${actual.y})`,
  );
}

/**
 * Independent reference: corners of the outline box rendered with
 * `left/top/width/height` and `rotate(deg)` about its center (CSS, y down).
 */
function rotatedOutlineCorners(frame: { left: number; top: number; width: number; height: number; rotation: number }) {
  const cx = frame.left + frame.width / 2;
  const cy = frame.top + frame.height / 2;
  const r = (frame.rotation * Math.PI) / 180;
  const rotate = (x: number, y: number): ConnectorPoint => ({
    x: cx + (x - cx) * Math.cos(r) - (y - cy) * Math.sin(r),
    y: cy + (x - cx) * Math.sin(r) + (y - cy) * Math.cos(r),
  });
  const right = frame.left + frame.width;
  const bottom = frame.top + frame.height;
  return {
    topLeft: rotate(frame.left, frame.top),
    topRight: rotate(right, frame.top),
    bottomRight: rotate(right, bottom),
    bottomLeft: rotate(frame.left, bottom),
  };
}

function midpoint(a: ConnectorPoint, b: ConnectorPoint): ConnectorPoint {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function expectedEdgeMidpoints(frame: Parameters<typeof rotatedOutlineCorners>[0]): Record<ConnectorAnchor, ConnectorPoint> {
  const c = rotatedOutlineCorners(frame);
  return {
    top: midpoint(c.topLeft, c.topRight),
    right: midpoint(c.topRight, c.bottomRight),
    bottom: midpoint(c.bottomRight, c.bottomLeft),
    left: midpoint(c.bottomLeft, c.topLeft),
  };
}

test("outline-only selection applies to the affected types and never to migrated or excluded types", () => {
  for (const type of [...AFFECTED_TYPES, "pdf-page"] as const) {
    assert.equal(usesOverlayOutlineOnly(type), true, `${type} should use the outline-only frame`);
    assert.equal(isMigratedToSelectionOverlay(type), false, `${type} must keep react-rnd resizing`);
  }
  for (const type of [...MIGRATED_TYPES, "drawing", "group", "connector"]) {
    assert.equal(usesOverlayOutlineOnly(type), false, `${type} must not get the outline-only frame`);
  }
});

test("locked affected items keep their outline but expose no connector handles", () => {
  const locked = { ...makeItem("sticky", 0), props: { text: "Locked", locked: true } } as unknown as Connectable;
  assert.equal(usesOverlayOutlineOnly(locked.type), true);
  assert.equal(isConnectableWorkspaceItem(locked), false);
});

for (const type of [...AFFECTED_TYPES, ...MIGRATED_TYPES]) {
  for (const rotation of ROTATIONS) {
    test(`${type} at ${rotation}°: all four connector handles sit on the rotated outline edge midpoints`, () => {
      const item = makeItem(type, rotation);
      assert.equal(isConnectableWorkspaceItem(item), true);

      const frame = getSelectionFrame(item, getEffectiveRotation(item, {}));
      assert.deepEqual(
        { left: frame.left, top: frame.top, width: frame.width, height: frame.height, rotation: frame.rotation },
        { left: ORIGIN.x, top: ORIGIN.y, width: FRAME.w, height: FRAME.h, rotation },
        "outline uses the stored, untilted frame",
      );

      const expected = expectedEdgeMidpoints(frame);
      for (const anchor of ANCHORS) {
        // The anchor geometry for each side, and what the outline exposes.
        const handle = getConnectorAnchorPoint(item, anchor, getEffectiveRotation(item, {}));
        assertClose(handle, expected[anchor], `${anchor} handle`);
        assertClose(frame.edgeMidpoints[anchor], expected[anchor], `${anchor} outline midpoint`);
        // Each handle is half the opposite dimension from the center.
        const radius = anchor === "top" || anchor === "bottom" ? FRAME.h / 2 : FRAME.w / 2;
        assert.ok(Math.abs(Math.hypot(handle.x - frame.center.x, handle.y - frame.center.y) - radius) < EPSILON);
      }
    });
  }
}

test("live rotation preview drives both the outline and the handles before release", () => {
  for (const type of [...AFFECTED_TYPES, ...MIGRATED_TYPES]) {
    const item = makeItem(type, 0);
    const previews = { [item.id]: 45 };

    const rotation = getEffectiveRotation(item, previews);
    assert.equal(rotation, 45, `${type} uses the preview while rotating`);

    const frame = getSelectionFrame(item, rotation);
    const expected = expectedEdgeMidpoints(frame);
    for (const anchor of ANCHORS) {
      assertClose(getConnectorAnchorPoint(item, anchor, rotation), expected[anchor], `${type} ${anchor} during preview`);
    }
    // The stored rotation alone would leave the handles behind the outline.
    assert.ok(Math.abs(getConnectorAnchorPoint(item, "right").y - expected.right.y) > 1);
  }
});

test("rotation preview hands off to stored rotation without a jump", () => {
  const item = makeItem("shape", 0);
  // Between pointer-up and the preview being cleared, both hold the final angle.
  const released = { ...item, rotation: 45 } as Connectable;
  const during = getSelectionFrame(released, getEffectiveRotation(released, { [item.id]: 45 }));
  const after = getSelectionFrame(released, getEffectiveRotation(released, {}));
  for (const anchor of ANCHORS) {
    assertClose(during.edgeMidpoints[anchor], after.edgeMidpoints[anchor], `${anchor} at hand-off`);
  }
  // Other items' previews never leak into this item.
  assert.equal(getEffectiveRotation(item, { "other-id": 90 }), 0);
});

test("unwrapped rotation angles match their normalized equivalent", () => {
  const item = makeItem("image", 0);
  const unwrapped = getSelectionFrame(item, getEffectiveRotation(item, { [item.id]: 370 }));
  const normalized = getSelectionFrame(item, 10);
  for (const anchor of ANCHORS) {
    assertClose(unwrapped.edgeMidpoints[anchor], normalized.edgeMidpoints[anchor], `${anchor} at 370°`);
  }
});

test("explicit rotation argument defaults to the stored rotation", () => {
  const item = makeItem("sticky", 90);
  for (const anchor of ANCHORS) {
    assertClose(getConnectorAnchorPoint(item, anchor), getConnectorAnchorPoint(item, anchor, 90), anchor);
  }
});
