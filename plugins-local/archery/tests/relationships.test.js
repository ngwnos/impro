import assert from "node:assert/strict";
import test from "node:test";
import {
  createBowAimRelationship,
  createCursorDotRelationship,
} from "../src/relationships.js";

test("bow relationship describes rotation toward the host pointer", () => {
  assert.deepEqual(createBowAimRelationship(), {
    id: "aim-bow",
    target: "bow",
    transform: {
      rotate: {
        op: "angleBetween",
        from: { source: "targetCenter", target: "bow" },
        to: { source: "pointer" },
      },
    },
    timing: { duration: 80, easing: "linear" },
  });
});

test("cursor dot relationship describes translation from overlay origin to pointer", () => {
  assert.deepEqual(createCursorDotRelationship(), {
    id: "cursor-dot-follows-pointer",
    target: "cursor-dot",
    transform: {
      translate: {
        op: "add",
        values: [
          {
            op: "subtract",
            left: { source: "pointer" },
            right: { source: "overlayOrigin" },
          },
          { x: -5, y: -5 },
        ],
      },
    },
    timing: { duration: 40, easing: "linear" },
  });
});
