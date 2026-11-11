import test from "node:test";
import assert from "node:assert/strict";
import { applyLabelText, getConnectorLabelLayout, getLabelOffsetAtPoint, CONNECTOR_LABEL_CLIP_PADDING } from "./connector-label";
import { getPointAtOffset } from "./connector-path";
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

const curve: ConnectorRoute = {
  mode: "curve",
  start: { x: 0, y: 0, normal: null },
  end: { x: 300, y: 100, normal: null },
  points: [{ x: 0, y: 0 }, { x: 300, y: 100 }],
  controls: [{ x: 100, y: 0 }, { x: 200, y: 100 }],
};

test("dragging a label slides it to the nearest point on the path", () => {
  assert.equal(getLabelOffsetAtPoint(elbow, { x: 60, y: 30 }), 0.4);
  assert.equal(getLabelOffsetAtPoint(elbow, { x: -40, y: -40 }), 0);
  assert.equal(getLabelOffsetAtPoint(elbow, { x: 400, y: 400 }), 1);
});

test("label offsets round-trip through points on every mode", () => {
  for (const route of [elbow, curve]) {
    for (const offset of [0.1, 0.5, 0.83]) {
      const at = getLabelOffsetAtPoint(route, getPointAtOffset(route, offset));
      assert.ok(Math.abs(at - offset) < 1e-6, `${route.mode} ${offset} -> ${at}`);
    }
  }
});

test("blank label text removes the label; other text keeps its offset", () => {
  assert.equal(applyLabelText("", 0.3), undefined);
  assert.equal(applyLabelText("  \n ", 0.3), undefined);
  assert.deepEqual(applyLabelText("depends on", 0.3), { text: "depends on", offset: 0.3 });
  assert.deepEqual(applyLabelText("x", 1.4), { text: "x", offset: 1 });
});
