import assert from "node:assert/strict";
import test from "node:test";
import { DOCK_PINNED_KEY, readDockPinned, writeDockPinned } from "./dock-pin";

const memory = () => {
  const data = new Map<string, string>();
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => void data.set(key, value), data };
};

test("the dock starts unpinned and remembers the choice", () => {
  const storage = memory();
  assert.equal(readDockPinned(storage), false);
  writeDockPinned(storage, true);
  assert.equal(storage.data.get(DOCK_PINNED_KEY), "1");
  assert.equal(readDockPinned(storage), true);
  writeDockPinned(storage, false);
  assert.equal(readDockPinned(storage), false);
});

test("anything but a stored 1 means unpinned", () => {
  const storage = memory();
  storage.setItem(DOCK_PINNED_KEY, "true");
  assert.equal(readDockPinned(storage), false);
  storage.setItem(DOCK_PINNED_KEY, "");
  assert.equal(readDockPinned(storage), false);
});

test("missing or failing storage never throws", () => {
  assert.equal(readDockPinned(null), false);
  assert.equal(readDockPinned(undefined), false);
  const broken = {
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("blocked");
    },
  };
  assert.equal(readDockPinned(broken), false);
  assert.doesNotThrow(() => writeDockPinned(broken, true));
  assert.doesNotThrow(() => writeDockPinned(null, true));
});
