const pluginOverlays = new Map();

function overlayKey(pluginId, overlayId) {
  return `${pluginId}:${overlayId}`;
}

function ensureOverlayRoot() {
  let root = document.getElementById("plugin-overlay-root");
  if (!root) {
    root = document.createElement("div");
    root.id = "plugin-overlay-root";
    document.body.appendChild(root);
  }
  return root;
}

function removeOverlayRootIfEmpty() {
  const root = document.getElementById("plugin-overlay-root");
  if (root && root.children.length === 0) root.remove();
}

function createOverlay({ pluginId, overlayId, position }) {
  const root = ensureOverlayRoot();
  const container = document.createElement("div");
  container.classList.add("plugin-overlay");
  container.dataset.pluginId = pluginId;
  container.dataset.overlayId = String(overlayId);
  container.dataset.position = position;
  root.appendChild(container);
  return container;
}

export function showPluginOverlay({
  pluginRenderer,
  pluginId,
  overlayId,
  content,
  position = "bottom-right",
}) {
  const key = overlayKey(pluginId, overlayId);
  let entry = pluginOverlays.get(key);
  if (entry && !entry.container.isConnected) {
    pluginOverlays.delete(key);
    entry = null;
  }
  if (!entry) {
    entry = {
      container: createOverlay({ pluginId, overlayId, position }),
      renderRoot: pluginRenderer.createRoot(),
    };
    pluginOverlays.set(key, entry);
  }

  entry.container.dataset.position = position;
  if (content) {
    const rendered = entry.renderRoot.render(content);
    // Keep a patched root connected when the renderer returns the same element.
    // Detaching and re-inserting it on every plugin update cancels CSS
    // transitions inside overlays, which breaks declarative animation effects.
    if (
      entry.container.childNodes.length !== 1 ||
      entry.container.firstChild !== rendered
    ) {
      entry.container.replaceChildren(rendered);
    }
  } else {
    entry.container.replaceChildren();
  }
}

export function hidePluginOverlay({ pluginId, overlayId }) {
  const key = overlayKey(pluginId, overlayId);
  const entry = pluginOverlays.get(key);
  if (!entry) return;
  entry.container.remove();
  pluginOverlays.delete(key);
  removeOverlayRootIfEmpty();
}

export function hidePluginOverlaysForPlugin(pluginId) {
  for (const [key, entry] of pluginOverlays) {
    if (entry.container.dataset.pluginId !== pluginId) continue;
    entry.container.remove();
    pluginOverlays.delete(key);
  }
  removeOverlayRootIfEmpty();
}
