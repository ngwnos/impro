import { TestSuite } from "../../testSuite.js";
import { assert, assertEquals } from "../../testHelpers.js";
import {
  findProjectileHit,
  getPluginHitTargetElement,
  getPluginHitTargets,
  segmentIntersectsCircle,
} from "/js/plugins/pluginHitTargets.js";

const t = new TestSuite("Plugin Hit Targets");

function clearDOM() {
  document.body.innerHTML = "";
}

function rect({ x, y, width, height }) {
  return {
    x,
    y,
    width,
    height,
    left: x,
    top: y,
    right: x + width,
    bottom: y + height,
  };
}

function addHitTarget({ kind = "profile-avatar", x = 100, y = 100 } = {}) {
  const target = document.createElement("img");
  target.dataset.pluginHitTarget = kind;
  target.getBoundingClientRect = () => rect({ x, y, width: 40, height: 40 });
  document.body.appendChild(target);
  return target;
}

t.describe("getPluginHitTargets", (it) => {
  it("returns only host-marked targets of allowed requested kinds", () => {
    clearDOM();
    const avatar = addHitTarget({ kind: "profile-avatar" });
    addHitTarget({ kind: "other-kind" });
    const ordinary = document.createElement("img");
    ordinary.getBoundingClientRect = () =>
      rect({ x: 0, y: 0, width: 40, height: 40 });
    document.body.appendChild(ordinary);

    const targets = getPluginHitTargets({ targetKinds: ["profile-avatar"] });

    assertEquals(targets.length, 1);
    assertEquals(targets[0].kind, "profile-avatar");
    assertEquals(targets[0].id.startsWith("profile-avatar:"), true);
    assertEquals(targets[0].element, avatar);
  });

  it("keeps target ids opaque and stable for the same element", () => {
    clearDOM();
    addHitTarget();

    const first = getPluginHitTargets({ targetKinds: ["profile-avatar"] })[0];
    const second = getPluginHitTargets({ targetKinds: ["profile-avatar"] })[0];

    assertEquals(first.id, second.id);
    assert(
      !first.id.includes("did:"),
      "target id should not expose profile identity",
    );
  });

  it("resolves opaque target ids only while the target remains connected", () => {
    clearDOM();
    const avatar = addHitTarget();

    const target = getPluginHitTargets({ targetKinds: ["profile-avatar"] })[0];

    assertEquals(getPluginHitTargetElement(target.id), avatar);
    avatar.remove();
    assertEquals(getPluginHitTargetElement(target.id), null);
  });
});

t.describe("segmentIntersectsCircle", (it) => {
  it("detects swept arrow tip collision with an avatar circle", () => {
    assert(
      segmentIntersectsCircle({
        start: { x: 80, y: 120 },
        end: { x: 160, y: 120 },
        circle: { x: 120, y: 120, radius: 20 },
      }),
      "segment should hit the circle",
    );
    assert(
      !segmentIntersectsCircle({
        start: { x: 80, y: 80 },
        end: { x: 160, y: 80 },
        circle: { x: 120, y: 120, radius: 20 },
      }),
      "segment should miss the circle",
    );
  });
});

t.describe("findProjectileHit", (it) => {
  it("returns a sanitized hit event without rects or DOM nodes", () => {
    clearDOM();
    addHitTarget();

    const hit = findProjectileHit({
      previousTip: { x: 80, y: 120 },
      currentTip: { x: 160, y: 120 },
      targetKinds: ["profile-avatar"],
    });

    assertEquals(Object.keys(hit).sort(), ["impact", "targetId", "targetKind"]);
    assertEquals(hit.targetKind, "profile-avatar");
    assertEquals(hit.impact, { x: 0.5, y: 0.5 });
  });
});

await t.run();
