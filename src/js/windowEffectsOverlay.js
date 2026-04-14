let overlayPromise = null;
let cleanupRegistered = false;
let overlayModulePromise = null;
let toolSubscriptionRegistered = false;

export const WINDOW_EFFECT_TOOLS = Object.freeze({
  LASER: "laser",
  BASKETBALLIZE: "basketballize",
});

const VALID_WINDOW_EFFECT_TOOLS = new Set(Object.values(WINDOW_EFFECT_TOOLS));
const toolListeners = new Set();
let activeWindowEffectTool = null;

function normalizeWindowEffectTool(toolId) {
  return VALID_WINDOW_EFFECT_TOOLS.has(toolId) ? toolId : null;
}

function applyActiveWindowEffectTool(overlay) {
  overlay?.setActiveTool?.(activeWindowEffectTool);
}

export function getActiveWindowEffectTool() {
  return activeWindowEffectTool;
}

export function setActiveWindowEffectTool(toolId) {
  const nextTool = normalizeWindowEffectTool(toolId);

  if (nextTool === activeWindowEffectTool) {
    return activeWindowEffectTool;
  }

  activeWindowEffectTool = nextTool;
  toolListeners.forEach((listener) => listener(activeWindowEffectTool));
  return activeWindowEffectTool;
}

export function toggleWindowEffectTool(toolId) {
  const normalizedTool = normalizeWindowEffectTool(toolId);

  if (normalizedTool === null || normalizedTool === activeWindowEffectTool) {
    return setActiveWindowEffectTool(null);
  }

  return setActiveWindowEffectTool(normalizedTool);
}

export function subscribeToWindowEffectTool(listener) {
  toolListeners.add(listener);
  listener(activeWindowEffectTool);

  return () => {
    toolListeners.delete(listener);
  };
}

async function loadOverlayModule() {
  if (!overlayModulePromise) {
    const version = encodeURIComponent(window.env?.gitCommit ?? "dev");
    overlayModulePromise = import(`/js/lib/three-overlay.js?v=${version}`);
  }

  return overlayModulePromise;
}

export async function setUpWindowEffectsOverlay() {
  if (!toolSubscriptionRegistered) {
    toolSubscriptionRegistered = true;
    subscribeToWindowEffectTool((toolId) => {
      if (!overlayPromise) {
        return;
      }

      void overlayPromise.then((overlay) => {
        overlay?.setActiveTool?.(toolId);
      });
    });
  }

  if (overlayPromise) {
    return overlayPromise;
  }

  overlayPromise = (async () => {
    const root = document.getElementById("window-effects-overlay");
    if (!root) {
      return null;
    }

    try {
      const { createWindowEffectsOverlay } = await loadOverlayModule();
      const overlay = await createWindowEffectsOverlay({ root });
      if (!overlay) {
        root.hidden = true;
      } else {
        applyActiveWindowEffectTool(overlay);
        if (!cleanupRegistered) {
          cleanupRegistered = true;
          window.addEventListener(
            "pagehide",
            () => {
              overlay.dispose();
            },
            { once: true },
          );
        }
      }
      return overlay;
    } catch (error) {
      root.hidden = true;
      if (window.env?.environment === "development") {
        console.error("Window effects overlay failed to initialize", error);
      }
      return null;
    }
  })();

  return overlayPromise;
}
