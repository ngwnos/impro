import { TestSuite } from "../../testSuite.js";
import { assert, assertEquals } from "../../testHelpers.js";
import {
  calculateProjectileOrigin,
  calculateProjectileTransform,
  calculateProjectileFrame,
  isRectOffscreen,
  launchPluginOverlayProjectile,
} from "/js/plugins/pluginProjectiles.js";

const t = new TestSuite("Plugin Projectiles");

function roundedPoint(point) {
  return {
    x: Math.round(point.x * 1000) / 1000,
    y: Math.round(point.y * 1000) / 1000,
  };
}

t.describe("calculateProjectileFrame", (it) => {
  it("launches with velocity along the arrow angle and gravity in viewport Y", () => {
    const frame = calculateProjectileFrame({
      origin: { x: 10, y: 20 },
      angleDeg: 0,
      power: 5,
      elapsedMs: 100,
    });

    assert(frame.x > 10, "arrow should move forward along its launch angle");
    assert(frame.y > 20, "gravity should increase viewport Y");
    assert(
      frame.rotationDeg > 0,
      "arrow should pitch down as gravity adds Y velocity",
    );
  });

  it("orients the arrow along its velocity over time", () => {
    const first = calculateProjectileFrame({
      origin: { x: 0, y: 0 },
      angleDeg: -90,
      power: 3,
      elapsedMs: 0,
    });
    const later = calculateProjectileFrame({
      origin: { x: 0, y: 0 },
      angleDeg: -90,
      power: 3,
      elapsedMs: 500,
    });

    assertEquals(first.rotationDeg, -90);
    assert(
      later.rotationDeg > first.rotationDeg,
      "gravity should rotate an upward shot back downward",
    );
  });
});

t.describe("calculateProjectileOrigin", (it) => {
  it("rotates the pulled-back arrow position around the bow center", () => {
    const stringPoint = { x: 72, y: 90 };
    const aimCenter = { x: 110, y: 90 };

    assertEquals(
      roundedPoint(
        calculateProjectileOrigin({
          stringPoint,
          aimCenter,
          angleDeg: 0,
          pullDistance: 48,
        }),
      ),
      { x: 24, y: 90 },
    );
    assertEquals(
      roundedPoint(
        calculateProjectileOrigin({
          stringPoint,
          aimCenter,
          angleDeg: 180,
          pullDistance: 48,
        }),
      ),
      { x: 196, y: 90 },
    );
  });
});

t.describe("calculateProjectileTransform", (it) => {
  it("positions frames relative to the target element's existing base position", () => {
    assertEquals(
      calculateProjectileTransform({
        frame: { x: 72, y: 99, rotationDeg: 0 },
        targetBase: { x: 72, y: 90 },
        targetHeight: 18,
      }),
      "translate(0px, 0px) rotate(0deg)",
    );
  });
});

t.describe("isRectOffscreen", (it) => {
  it("returns true only once the full rect leaves the viewport", () => {
    assert(
      !isRectOffscreen({ left: 10, right: 20, top: 10, bottom: 20 }, 100, 100),
    );
    assert(
      !isRectOffscreen({ left: 90, right: 110, top: 10, bottom: 20 }, 100, 100),
    );
    assert(
      isRectOffscreen({ left: 101, right: 120, top: 10, bottom: 20 }, 100, 100),
    );
    assert(
      isRectOffscreen({ left: 10, right: 20, top: 101, bottom: 120 }, 100, 100),
    );
  });
});

t.describe("launchPluginOverlayProjectile", (it) => {
  it("sends a sanitized projectileHit event when the arrow tip crosses an avatar", async () => {
    document.body.innerHTML = "";
    const plugin = {
      pluginId: "archery__LOCAL",
      sentEvents: [],
      sendEvent(event, data) {
        this.sentEvents.push({ event, data });
      },
    };
    const overlay = document.createElement("div");
    overlay.className = "plugin-overlay";
    overlay.dataset.pluginId = "archery__LOCAL";
    overlay.dataset.overlayId = "archery-bow";
    overlay.getBoundingClientRect = () => ({
      left: 600,
      top: 500,
      right: 820,
      bottom: 680,
      width: 220,
      height: 180,
    });
    const bow = document.createElement("div");
    bow.dataset.pluginAnimationTarget = "bow";
    bow.getBoundingClientRect = () => ({
      left: 600,
      top: 500,
      right: 820,
      bottom: 680,
      width: 220,
      height: 180,
    });
    const arrow = document.createElement("div");
    arrow.dataset.pluginAnimationTarget = "flying-arrow";
    arrow.getBoundingClientRect = () => ({
      left: 610,
      top: 581,
      right: 728,
      bottom: 599,
      width: 118,
      height: 18,
    });
    overlay.append(bow, arrow);
    document.body.appendChild(overlay);
    const avatar = document.createElement("img");
    avatar.dataset.pluginHitTarget = "profile-avatar";
    avatar.getBoundingClientRect = () => ({
      left: 720,
      top: 570,
      right: 760,
      bottom: 610,
      width: 40,
      height: 40,
    });
    document.body.appendChild(avatar);

    const originalComputedStyle = globalThis.getComputedStyle;
    const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
    const originalCancelAnimationFrame = globalThis.cancelAnimationFrame;
    const originalInnerWidth = window.innerWidth;
    const originalInnerHeight = window.innerHeight;
    globalThis.getComputedStyle = (element) => ({
      transform: element === bow ? "none" : "",
    });
    let frame = 0;
    globalThis.requestAnimationFrame = (callback) => {
      frame += 1;
      setTimeout(() => callback(frame * 100), 0);
      return frame;
    };
    globalThis.cancelAnimationFrame = () => {};
    Object.defineProperty(window, "innerWidth", {
      value: 800,
      configurable: true,
    });
    Object.defineProperty(window, "innerHeight", {
      value: 600,
      configurable: true,
    });

    try {
      await launchPluginOverlayProjectile(plugin, {
        overlayId: "archery-bow",
        projectile: {
          projectileId: "arrow-shot",
          target: "flying-arrow",
          aimTarget: "bow",
          power: 5,
          collision: { targetKinds: ["profile-avatar"], stopOnHit: true },
        },
      });
    } finally {
      globalThis.getComputedStyle = originalComputedStyle;
      globalThis.requestAnimationFrame = originalRequestAnimationFrame;
      globalThis.cancelAnimationFrame = originalCancelAnimationFrame;
      Object.defineProperty(window, "innerWidth", {
        value: originalInnerWidth,
        configurable: true,
      });
      Object.defineProperty(window, "innerHeight", {
        value: originalInnerHeight,
        configurable: true,
      });
    }

    assertEquals(plugin.sentEvents.length, 1);
    assertEquals(plugin.sentEvents[0].event, "projectileHit");
    assertEquals(Object.keys(plugin.sentEvents[0].data).sort(), [
      "overlayId",
      "projectileId",
      "targetId",
      "targetKind",
    ]);
    assertEquals(plugin.sentEvents[0].data.projectileId, "arrow-shot");
    assertEquals(plugin.sentEvents[0].data.targetKind, "profile-avatar");
  });
});

await t.run();
