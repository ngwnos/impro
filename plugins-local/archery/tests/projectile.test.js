import assert from "node:assert/strict";
import test from "node:test";
import { createArrowProjectile } from "../src/projectile.js";

test("createArrowProjectile asks the host to test profile avatar collisions", () => {
  assert.deepEqual(createArrowProjectile({ power: 4, pullDistance: 38 }), {
    projectileId: "arrow-shot",
    target: "flying-arrow",
    aimTarget: "bow",
    power: 4,
    pullDistance: 38,
    collision: {
      targetKinds: ["profile-avatar"],
      shape: "tip",
      stopOnHit: false,
    },
  });
});
