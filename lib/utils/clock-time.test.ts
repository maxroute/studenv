import assert from "node:assert/strict";
import test from "node:test";
import { to12Hour } from "./clock-time";

test("stored times are shown on a 12-hour clock", () => {
  assert.equal(to12Hour("00:05"), "12:05 AM");
  assert.equal(to12Hour("09:00"), "9:00 AM");
  assert.equal(to12Hour("12:00"), "12:00 PM");
  assert.equal(to12Hour("23:59"), "11:59 PM");
  assert.equal(to12Hour("soon"), "soon");
});
