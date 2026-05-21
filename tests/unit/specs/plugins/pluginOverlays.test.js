import { TestSuite } from "../../testSuite.js";
import { assert, assertEquals } from "../../testHelpers.js";
import {
  showPluginOverlay,
  hidePluginOverlay,
  hidePluginOverlaysForPlugin,
} from "/js/plugins/pluginOverlays.js";

const t = new TestSuite("Plugin Overlays");

function clearDOM() {
  document.body.innerHTML = "";
}

function makePluginRenderer(pluginId = "test-plugin") {
  const calls = [];
  function renderNode(node) {
    calls.push({ node, pluginId });
    const element = document.createElement(node.tag ?? "div");
    const className = node.attrs?.class;
    if (className) element.className = className;
    if (node.text != null) element.textContent = node.text;
    if (Array.isArray(node.children)) {
      for (const child of node.children) {
        element.appendChild(renderNode(child));
      }
    }
    return element;
  }
  return {
    calls,
    renderer: {
      createRoot() {
        return {
          render(node) {
            return renderNode(node);
          },
        };
      },
    },
  };
}

function makeStablePluginRenderer() {
  const element = document.createElement("div");
  return {
    element,
    renderer: {
      createRoot() {
        return {
          render(node) {
            element.className = node.attrs?.class ?? "";
            element.textContent = node.text ?? "";
            return element;
          },
        };
      },
    },
  };
}

function overlayNode(text = "Target") {
  return {
    tag: "div",
    attrs: { class: "archery-stage" },
    text,
    children: [],
    events: {},
  };
}

t.describe("showPluginOverlay", (it) => {
  it("creates a shared overlay root and positions the plugin overlay", () => {
    clearDOM();
    const { renderer, calls } = makePluginRenderer("archery__LOCAL");
    showPluginOverlay({
      pluginRenderer: renderer,
      pluginId: "archery__LOCAL",
      overlayId: "bow",
      position: "bottom-right",
      content: overlayNode(),
    });

    const root = document.querySelector("#plugin-overlay-root");
    const overlay = document.querySelector(".plugin-overlay");
    assert(root !== null);
    assert(overlay !== null);
    assertEquals(overlay.dataset.pluginId, "archery__LOCAL");
    assertEquals(overlay.dataset.overlayId, "bow");
    assertEquals(overlay.dataset.position, "bottom-right");
    assert(overlay.querySelector(".archery-stage") !== null);
    assertEquals(calls.length, 1);
  });

  it("replaces content for the same plugin and overlay id", () => {
    clearDOM();
    const { renderer } = makePluginRenderer();
    const args = {
      pluginRenderer: renderer,
      pluginId: "test-plugin",
      overlayId: "target",
      position: "top-left",
    };
    showPluginOverlay({ ...args, content: overlayNode("First") });
    showPluginOverlay({ ...args, content: overlayNode("Second") });

    assertEquals(document.querySelectorAll(".plugin-overlay").length, 1);
    assert(document.body.textContent.includes("Second"));
    assert(!document.body.textContent.includes("First"));
  });

  it("does not reinsert a stable rendered root on updates", () => {
    clearDOM();
    const { renderer, element } = makeStablePluginRenderer();
    const args = {
      pluginRenderer: renderer,
      pluginId: "test-plugin",
      overlayId: "target",
      position: "top-left",
    };
    showPluginOverlay({ ...args, content: overlayNode("First") });
    const overlay = document.querySelector(".plugin-overlay");
    let replaceChildrenCalls = 0;
    const originalReplaceChildren = overlay.replaceChildren.bind(overlay);
    overlay.replaceChildren = (...children) => {
      replaceChildrenCalls++;
      return originalReplaceChildren(...children);
    };

    showPluginOverlay({ ...args, content: overlayNode("Second") });

    assertEquals(replaceChildrenCalls, 0);
    assertEquals(overlay.firstChild, element);
    assertEquals(element.textContent, "Second");
  });

  it("keeps separate overlays for different plugins using the same overlay id", () => {
    clearDOM();
    const { renderer } = makePluginRenderer();
    showPluginOverlay({
      pluginRenderer: renderer,
      pluginId: "plugin-a",
      overlayId: "shared",
      content: overlayNode("A"),
    });
    showPluginOverlay({
      pluginRenderer: renderer,
      pluginId: "plugin-b",
      overlayId: "shared",
      content: overlayNode("B"),
    });

    assertEquals(document.querySelectorAll(".plugin-overlay").length, 2);
  });
});

t.describe("hidePluginOverlay", (it) => {
  it("removes one overlay and removes the root when empty", () => {
    clearDOM();
    const { renderer } = makePluginRenderer();
    showPluginOverlay({
      pluginRenderer: renderer,
      pluginId: "test-plugin",
      overlayId: "target",
      content: overlayNode(),
    });
    hidePluginOverlay({ pluginId: "test-plugin", overlayId: "target" });

    assert(document.querySelector(".plugin-overlay") === null);
    assert(document.querySelector("#plugin-overlay-root") === null);
  });

  it("only removes the matching overlay", () => {
    clearDOM();
    const { renderer } = makePluginRenderer();
    showPluginOverlay({
      pluginRenderer: renderer,
      pluginId: "plugin-a",
      overlayId: "one",
      content: overlayNode("A"),
    });
    showPluginOverlay({
      pluginRenderer: renderer,
      pluginId: "plugin-b",
      overlayId: "one",
      content: overlayNode("B"),
    });
    hidePluginOverlay({ pluginId: "plugin-a", overlayId: "one" });

    assertEquals(document.querySelectorAll(".plugin-overlay").length, 1);
    assert(document.body.textContent.includes("B"));
  });
});

t.describe("hidePluginOverlaysForPlugin", (it) => {
  it("removes every overlay owned by one plugin", () => {
    clearDOM();
    const { renderer } = makePluginRenderer();
    showPluginOverlay({
      pluginRenderer: renderer,
      pluginId: "plugin-a",
      overlayId: "one",
      content: overlayNode("A1"),
    });
    showPluginOverlay({
      pluginRenderer: renderer,
      pluginId: "plugin-a",
      overlayId: "two",
      content: overlayNode("A2"),
    });
    showPluginOverlay({
      pluginRenderer: renderer,
      pluginId: "plugin-b",
      overlayId: "one",
      content: overlayNode("B"),
    });

    hidePluginOverlaysForPlugin("plugin-a");

    assertEquals(document.querySelectorAll(".plugin-overlay").length, 1);
    assert(document.body.textContent.includes("B"));
    assert(!document.body.textContent.includes("A1"));
    assert(!document.body.textContent.includes("A2"));
  });
});

await t.run();
