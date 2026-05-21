import { TestSuite } from "../../testSuite.js";
import { assert, assertEquals } from "../../testHelpers.js";
import {
  bindPluginOverlayRelationship,
  clearPluginOverlayRelationshipsForPlugin,
  unbindPluginOverlayRelationship,
} from "/js/plugins/pluginAnimationBindings.js";

const t = new TestSuite("Plugin Animation Bindings");

function clearDOM() {
  clearPluginOverlayRelationshipsForPlugin("archery__LOCAL");
  clearPluginOverlayRelationshipsForPlugin("other-plugin");
  document.body.innerHTML = "";
}

function makePlugin(pluginId = "archery__LOCAL") {
  return {
    pluginId,
    sentEvents: [],
    sendEvent(event, data) {
      this.sentEvents.push({ event, data });
    },
  };
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

function createOverlay({
  pluginId = "archery__LOCAL",
  overlayId = "archery-bow",
} = {}) {
  const overlay = document.createElement("div");
  overlay.className = "plugin-overlay";
  overlay.dataset.pluginId = pluginId;
  overlay.dataset.overlayId = overlayId;
  overlay.getBoundingClientRect = () =>
    rect({ x: 100, y: 50, width: 220, height: 180 });
  document.body.appendChild(overlay);
  return overlay;
}

function addTarget(
  overlay,
  targetId,
  { x = 140, y = 90, width = 20, height = 20 } = {},
) {
  const target = document.createElement("div");
  target.dataset.pluginAnimationTarget = targetId;
  target.getBoundingClientRect = () => rect({ x, y, width, height });
  overlay.appendChild(target);
  return target;
}

function dispatchPointerMove({ x, y }) {
  const event = new Event("pointermove");
  Object.defineProperty(event, "clientX", { value: x });
  Object.defineProperty(event, "clientY", { value: y });
  window.dispatchEvent(event);
}

function waitForFrame() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

t.describe("bindPluginOverlayRelationship", (it) => {
  it("rotates a plugin-owned target toward the host-owned pointer", async () => {
    clearDOM();
    const overlay = createOverlay();
    const bow = addTarget(overlay, "bow");
    const plugin = makePlugin();

    bindPluginOverlayRelationship(plugin, {
      overlayId: "archery-bow",
      binding: {
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
      },
    });

    dispatchPointerMove({ x: 150, y: 220 });
    await waitForFrame();

    assertEquals(bow.style.transform, "rotate(90deg)");
    assertEquals(bow.style.transition, "transform 80ms linear");
    assertEquals(plugin.sentEvents, []);
  });

  it("translates a plugin-owned target from an expression relative to overlay origin", async () => {
    clearDOM();
    const overlay = createOverlay();
    const dot = addTarget(overlay, "cursor-dot", {
      x: 100,
      y: 50,
      width: 10,
      height: 10,
    });
    const plugin = makePlugin();

    bindPluginOverlayRelationship(plugin, {
      overlayId: "archery-bow",
      binding: {
        id: "dot-follows-pointer",
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
      },
    });

    dispatchPointerMove({ x: 130, y: 80 });
    await waitForFrame();

    assertEquals(dot.style.transform, "translate(25px, 25px)");
    assertEquals(plugin.sentEvents, []);
  });

  it("rejects targets outside the requesting plugin overlay", () => {
    clearDOM();
    createOverlay();
    const otherOverlay = createOverlay({
      pluginId: "other-plugin",
      overlayId: "archery-bow",
    });
    addTarget(otherOverlay, "bow");

    let caught = null;
    try {
      bindPluginOverlayRelationship(makePlugin(), {
        overlayId: "archery-bow",
        binding: {
          id: "aim-bow",
          target: "bow",
          transform: { rotate: 0 },
        },
      });
    } catch (error) {
      caught = error;
    }

    assert(caught instanceof Error);
    assertEquals(caught.message, 'Unknown animation target "bow"');
  });

  it("clears transforms and stops updating when a relationship is unbound", async () => {
    clearDOM();
    const overlay = createOverlay();
    const dot = addTarget(overlay, "cursor-dot");
    const plugin = makePlugin();

    bindPluginOverlayRelationship(plugin, {
      overlayId: "archery-bow",
      binding: {
        id: "dot-follows-pointer",
        target: "cursor-dot",
        transform: { translate: { source: "pointer" } },
      },
    });
    dispatchPointerMove({ x: 10, y: 20 });
    await waitForFrame();
    assertEquals(dot.style.transform, "translate(10px, 20px)");

    unbindPluginOverlayRelationship(plugin.pluginId, {
      overlayId: "archery-bow",
      bindingId: "dot-follows-pointer",
    });
    assertEquals(dot.style.transform, "");

    dispatchPointerMove({ x: 30, y: 40 });
    await waitForFrame();
    assertEquals(dot.style.transform, "");
  });
});

await t.run();
