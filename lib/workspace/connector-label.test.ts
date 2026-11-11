import test from "node:test";
import assert from "node:assert/strict";
import { getConnectorLabelLayout, CONNECTOR_LABEL_CLIP_PADDING } from "./connector-label";
import type { ConnectorRoute } from "./connector-routing";

const elbow: ConnectorRoute = {
  mode: "elbow",
  start: { x: 0, y: 0, normal: null },
  end: { x: 100, y: 100, normal: null },
  points: [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 100 }, { x: 100, y: 100 }],
};

test("label is centred at its offset along the path", () => {
  const layout = getConnectorLabelLayout(elbow, 0.5, { w: 90, h: 19 });
  assert.deepEqual(layout.center, { x: 50, y: 50 });
  assert.deepEqual(layout.rect, { x: 5, y: 40.5, w: 90, h: 19 });
});

test("the line is cut around the label with AFFiNE's padding", () => {
  const { rect, clip } = getConnectorLabelLayout(elbow, 0.25, { w: 40, h: 20 });
  assert.equal(clip.x, rect.x - CONNECTOR_LABEL_CLIP_PADDING);
  assert.equal(clip.w, rect.w + CONNECTOR_LABEL_CLIP_PADDING * 2);
  assert.deepEqual(getConnectorLabelLayout(elbow, 0.25, { w: 40, h: 20 }).center, { x: 50, y: 0 });
});

test("offsets are clamped to the path ends", () => {
  assert.deepEqual(getConnectorLabelLayout(elbow, -1, { w: 10, h: 10 }).center, { x: 0, y: 0 });
  assert.deepEqual(getConnectorLabelLayout(elbow, 2, { w: 10, h: 10 }).center, { x: 100, y: 100 });
});
