import { createWindowEffectsOverlay } from "/js/lib/three-overlay.js";

let overlayPromise = null;
let cleanupRegistered = false;

export async function setUpWindowEffectsOverlay() {
  if (overlayPromise) {
    return overlayPromise;
  }

  overlayPromise = (async () => {
    const root = document.getElementById("window-effects-overlay");
    if (!root) {
      return null;
    }

    try {
      const overlay = await createWindowEffectsOverlay({ root });
      if (!overlay) {
        root.hidden = true;
      } else if (!cleanupRegistered) {
        cleanupRegistered = true;
        window.addEventListener(
          "pagehide",
          () => {
            overlay.dispose();
          },
          { once: true },
        );
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
