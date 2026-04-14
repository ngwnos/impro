import * as THREE from "three/webgpu";
import { pass } from "three/tsl";
import { bloom } from "three/addons/tsl/display/BloomNode.js";

const MAX_PIXEL_RATIO = 2;
const SIDEBAR_AVATAR_SELECTOR = ".sidebar-profile-avatar";
const VISUAL_AVATAR_SELECTOR =
  ".avatar-image, .avatar-placeholder, .avatar-link, [data-testid='avatar']";
const BASE_RING_INNER_RADIUS = 0.84;
const BASE_RING_OUTER_RADIUS = 1;
const ACCENT_ARC_LENGTH = Math.PI * 0.72;
const TARGET_PADDING_PX = 5;
const TARGET_PADDING_RATIO = 0.1;
const RING_PULSE_SCALE = 0.04;
const LASER_LINE_COUNT = 18;
const LASER_TOGGLE_CODE = "Backquote";
const LASER_ORIGIN_RADIUS_SCALE = 1.04;
const DEFAULT_CURSOR_POSITION = { x: 0.5, y: 0.5 };
const LASER_COLOR = "#ff3b30";
const LASER_COLOR_INTENSITY = 3.2;
const LASER_BLOOM_STRENGTH = 1.6;
const LASER_BLOOM_RADIUS = 0.28;
const LASER_BLOOM_THRESHOLD = 0.55;

function getPixelRatio() {
  return Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
}

function getOverlayRect(root) {
  const rect = root.getBoundingClientRect();

  return {
    left: rect.left,
    top: rect.top,
    width: Math.max(rect.width, 1),
    height: Math.max(rect.height, 1),
  };
}

function getViewportWidth() {
  return Math.max(window.innerWidth || 0, 1);
}

function getViewportHeight() {
  return Math.max(window.innerHeight || 0, 1);
}

function rectIntersectsOverlay(rect, overlayRect) {
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    rect.bottom >= overlayRect.top &&
    rect.right >= overlayRect.left &&
    rect.top <= overlayRect.top + overlayRect.height &&
    rect.left <= overlayRect.left + overlayRect.width
  );
}

function isElementVisible(element) {
  let current = element;

  while (current && current instanceof Element) {
    if (current.hasAttribute("hidden")) {
      return false;
    }

    const style = getComputedStyle(current);
    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      style.visibility === "collapse" ||
      style.opacity === "0"
    ) {
      return false;
    }

    current = current.parentElement;
  }

  return true;
}

function elementMatchesHitTest(element, x, y) {
  const hit = document.elementFromPoint(x, y);
  if (!hit) {
    return false;
  }

  return (
    hit === element ||
    element.contains(hit) ||
    (hit instanceof Element && hit.contains(element))
  );
}

function getHitTestScore(element, rect) {
  const insetX = Math.min(Math.max(rect.width * 0.2, 2), rect.width / 2);
  const insetY = Math.min(Math.max(rect.height * 0.2, 2), rect.height / 2);
  const points = [
    [rect.left + rect.width / 2, rect.top + rect.height / 2],
    [rect.left + insetX, rect.top + rect.height / 2],
    [rect.right - insetX, rect.top + rect.height / 2],
    [rect.left + rect.width / 2, rect.top + insetY],
    [rect.left + rect.width / 2, rect.bottom - insetY],
  ];

  let score = 0;
  for (const [rawX, rawY] of points) {
    const x = Math.min(Math.max(rawX, 0), getViewportWidth() - 1);
    const y = Math.min(Math.max(rawY, 0), getViewportHeight() - 1);
    if (elementMatchesHitTest(element, x, y)) {
      score += 1;
    }
  }

  return score;
}

function getTargetCandidate(root) {
  const overlayRect = getOverlayRect(root);
  const containers = [...document.querySelectorAll(SIDEBAR_AVATAR_SELECTOR)];
  const candidates = containers
    .map((container) => {
      const page = container.closest(".page");
      if (page && !page.classList.contains("page-visible")) {
        return null;
      }

      const visualTarget =
        container.querySelector(VISUAL_AVATAR_SELECTOR) || container;
      if (!isElementVisible(container) || !isElementVisible(visualTarget)) {
        return null;
      }

      const rect = visualTarget.getBoundingClientRect();
      if (!rectIntersectsOverlay(rect, overlayRect)) {
        return null;
      }

      const hitScore = getHitTestScore(visualTarget, rect);
      if (hitScore === 0) {
        return null;
      }

      const leftBias = Math.max(0, overlayRect.width - rect.left);
      const topBias = Math.max(0, overlayRect.height - rect.top);
      const score = hitScore * 1000 + leftBias - topBias * 0.1;

      return { rect, score };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);

  return candidates[0] ?? null;
}

function getHighlightColor() {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue("--highlight-color")
    .trim();

  return value || "#006aff";
}

function isEditableEventTarget(target) {
  if (!(target instanceof Element)) {
    return false;
  }

  return Boolean(
    target.closest(
      "input, textarea, select, [contenteditable], [contenteditable='true']",
    ),
  );
}

function updateLaserPositions(
  positions,
  { centerX, centerY, radius, cursorX, cursorY },
) {
  const emissionRadius = Math.max(radius * LASER_ORIGIN_RADIUS_SCALE, 1);

  for (let i = 0; i < LASER_LINE_COUNT; i += 1) {
    const angle = (i / LASER_LINE_COUNT) * Math.PI * 2 - Math.PI / 2;
    const startX = centerX + Math.cos(angle) * emissionRadius;
    const startY = centerY + Math.sin(angle) * emissionRadius;
    const offset = i * 6;

    positions[offset] = startX;
    positions[offset + 1] = startY;
    positions[offset + 2] = 0;
    positions[offset + 3] = cursorX;
    positions[offset + 4] = cursorY;
    positions[offset + 5] = 0;
  }
}

export async function createWindowEffectsOverlay({ root }) {
  if (!root || !("gpu" in navigator)) {
    return null;
  }

  const renderer = new THREE.WebGPURenderer({
    antialias: true,
    alpha: true,
  });
  renderer._getFallback = null;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ReinhardToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.setPixelRatio(getPixelRatio());
  const canvas = renderer.domElement;
  canvas.className = "window-effects-overlay-canvas";
  canvas.setAttribute("aria-hidden", "true");
  root.replaceChildren(canvas);
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
  camera.position.z = 1;

  const baseColor = new THREE.Color(getHighlightColor());
  const accentColor = baseColor.clone().offsetHSL(0.05, 0.1, 0.12);
  const laserColor = new THREE.Color(LASER_COLOR).multiplyScalar(
    LASER_COLOR_INTENSITY,
  );

  const baseRingGeometry = new THREE.RingGeometry(
    BASE_RING_INNER_RADIUS,
    BASE_RING_OUTER_RADIUS,
    96,
  );
  const baseRingMaterial = new THREE.MeshBasicMaterial({
    color: baseColor,
    transparent: true,
    opacity: 0.28,
    side: THREE.DoubleSide,
  });
  const baseRing = new THREE.Mesh(baseRingGeometry, baseRingMaterial);

  const accentRingGeometry = new THREE.RingGeometry(
    BASE_RING_INNER_RADIUS,
    BASE_RING_OUTER_RADIUS,
    96,
    1,
    0,
    ACCENT_ARC_LENGTH,
  );
  const accentRingMaterial = new THREE.MeshBasicMaterial({
    color: accentColor,
    transparent: true,
    opacity: 0.9,
    side: THREE.DoubleSide,
  });
  const accentRing = new THREE.Mesh(accentRingGeometry, accentRingMaterial);

  const ringGroup = new THREE.Group();
  ringGroup.visible = false;
  ringGroup.add(baseRing);
  ringGroup.add(accentRing);
  scene.add(ringGroup);

  const laserPositions = new Float32Array(LASER_LINE_COUNT * 2 * 3);
  const laserGeometry = new THREE.BufferGeometry();
  laserGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(laserPositions, 3),
  );
  const laserMaterial = new THREE.LineBasicMaterial({
    color: laserColor,
    transparent: true,
    opacity: 0.92,
  });
  const laserSegments = new THREE.LineSegments(laserGeometry, laserMaterial);
  laserSegments.visible = false;
  scene.add(laserSegments);

  const renderPipeline = new THREE.RenderPipeline(renderer);
  const scenePass = pass(scene, camera);
  const scenePassColor = scenePass.getTextureNode("output");
  const bloomPass = bloom(
    scenePassColor,
    LASER_BLOOM_STRENGTH,
    LASER_BLOOM_RADIUS,
    LASER_BLOOM_THRESHOLD,
  );
  renderPipeline.outputNode = scenePassColor.add(bloomPass);

  let laserModeEnabled = false;
  let cursorClientX = getViewportWidth() * DEFAULT_CURSOR_POSITION.x;
  let cursorClientY = getViewportHeight() * DEFAULT_CURSOR_POSITION.y;

  const resize = () => {
    const { width, height } = getOverlayRect(root);
    renderer.setPixelRatio(getPixelRatio());
    renderer.setSize(width, height, false);
    camera.left = -width / 2;
    camera.right = width / 2;
    camera.top = height / 2;
    camera.bottom = -height / 2;
    camera.updateProjectionMatrix();
  };

  resize();
  window.addEventListener("resize", resize, { passive: true });

  const updateCursorPosition = (event) => {
    cursorClientX = event.clientX;
    cursorClientY = event.clientY;
  };

  const handleKeyDown = (event) => {
    if (
      event.code !== LASER_TOGGLE_CODE ||
      event.repeat ||
      event.metaKey ||
      event.ctrlKey ||
      event.altKey ||
      isEditableEventTarget(event.target)
    ) {
      return;
    }

    laserModeEnabled = !laserModeEnabled;
    event.preventDefault();
  };

  window.addEventListener("pointermove", updateCursorPosition, {
    passive: true,
  });
  window.addEventListener("pointerdown", updateCursorPosition, {
    passive: true,
  });
  window.addEventListener("keydown", handleKeyDown);

  const start = performance.now();
  renderer.setAnimationLoop(() => {
    const elapsed = (performance.now() - start) * 0.001;
    const target = getTargetCandidate(root);

    if (target) {
      const { rect } = target;
      const overlayRect = getOverlayRect(root);
      const centerX =
        rect.left + rect.width / 2 - overlayRect.left - overlayRect.width / 2;
      const centerY =
        overlayRect.top + overlayRect.height / 2 - (rect.top + rect.height / 2);
      const outerRadius =
        Math.max(rect.width, rect.height) / 2 +
        Math.max(TARGET_PADDING_PX, rect.width * TARGET_PADDING_RATIO);
      const pulse = 1 + Math.sin(elapsed * 2.4) * RING_PULSE_SCALE;

      ringGroup.visible = true;
      ringGroup.position.set(centerX, centerY, 0);
      baseRing.scale.setScalar(outerRadius);
      accentRing.scale.setScalar(outerRadius * pulse);
      accentRing.rotation.z = elapsed * 0.95;

      if (laserModeEnabled) {
        const cursorX =
          cursorClientX - overlayRect.left - overlayRect.width / 2;
        const cursorY =
          overlayRect.top + overlayRect.height / 2 - cursorClientY;

        laserSegments.visible = true;
        updateLaserPositions(laserPositions, {
          centerX,
          centerY,
          radius: outerRadius,
          cursorX,
          cursorY,
        });
        laserGeometry.attributes.position.needsUpdate = true;
      } else {
        laserSegments.visible = false;
      }
    } else {
      ringGroup.visible = false;
      laserSegments.visible = false;
    }

    renderPipeline.render();
  });

  return {
    dispose() {
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", updateCursorPosition);
      window.removeEventListener("pointerdown", updateCursorPosition);
      window.removeEventListener("keydown", handleKeyDown);
      renderer.setAnimationLoop(null);
      baseRingGeometry.dispose();
      baseRingMaterial.dispose();
      accentRingGeometry.dispose();
      accentRingMaterial.dispose();
      laserGeometry.dispose();
      laserMaterial.dispose();
      renderer.dispose();
      root.replaceChildren();
    },
  };
}
