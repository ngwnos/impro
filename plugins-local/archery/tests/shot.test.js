import assert from "node:assert/strict";
import test from "node:test";
import { getDrawDistance, getShotPower, shotClass } from "../src/shot.js";

test("getShotPower scales hold time into bounded power levels", () => {
  assert.equal(getShotPower(0), 1);
  assert.equal(getShotPower(260), 1);
  assert.equal(getShotPower(520), 2);
  assert.equal(getShotPower(780), 3);
  assert.equal(getShotPower(1040), 4);
  assert.equal(getShotPower(1300), 5);
  assert.equal(getShotPower(5000), 5);
});

test("shotClass returns a stable class for valid shot powers", () => {
  assert.equal(shotClass(1), "archery-shot-power-1");
  assert.equal(shotClass(5), "archery-shot-power-5");
});

test("getDrawDistance tracks the arrow's linear pullback", () => {
  assert.equal(getDrawDistance(0), 0);
  assert.equal(getDrawDistance(650), 24);
  assert.equal(getDrawDistance(1300), 48);
  assert.equal(getDrawDistance(5000), 48);
});
