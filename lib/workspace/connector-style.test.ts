import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_CONNECTOR_STYLE,
  flipEndpointStyles,
  getMostCommonValue,
  parseStoredConnectorStyle,
} from "./connector-style";

test("a mixed selection shows its most common value, ties going to the first seen", () => {
  assert.equal(getMostCommonValue(["arrow", "none", "none"]), "none");
  assert.equal(getMostCommonValue([4, 2, 2, 4]), 4);
  assert.equal(getMostCommonValue([]), undefined);
});

test("flip swaps start and end styles only", () => {
  assert.deepEqual(flipEndpointStyles({ frontEndpointStyle: "none", rearEndpointStyle: "arrow" }), {
    frontEndpointStyle: "arrow",
    rearEndpointStyle: "none",
  });
  assert.deepEqual(flipEndpointStyles({ frontEndpointStyle: "circle", rearEndpointStyle: "diamond" }), {
    frontEndpointStyle: "diamond",
    rearEndpointStyle: "circle",
  });
});

test("new connectors default to AFFiNE's grey, 2 px, solid, no start, arrow end", () => {
  assert.deepEqual(parseStoredConnectorStyle(null), {
    color: "#929292",
    strokeWidth: 2,
    strokeStyle: "solid",
    frontEndpointStyle: "none",
    rearEndpointStyle: "arrow",
  });
});

test("the last-used style is restored field by field, ignoring invalid or corrupt data", () => {
  assert.deepEqual(
    parseStoredConnectorStyle(JSON.stringify({ color: "#f43f5e", strokeWidth: 6, strokeStyle: "dash", rearEndpointStyle: "diamond" })),
    { ...DEFAULT_CONNECTOR_STYLE, color: "#f43f5e", strokeWidth: 6, strokeStyle: "dash", rearEndpointStyle: "diamond" },
  );
  assert.deepEqual(
    parseStoredConnectorStyle(JSON.stringify({ color: "red;}", strokeWidth: 400, strokeStyle: "wavy", frontEndpointStyle: "circle" })),
    { ...DEFAULT_CONNECTOR_STYLE, frontEndpointStyle: "circle" },
  );
  assert.deepEqual(parseStoredConnectorStyle("{not json"), DEFAULT_CONNECTOR_STYLE);
  assert.deepEqual(parseStoredConnectorStyle("[1,2]"), DEFAULT_CONNECTOR_STYLE);
});
