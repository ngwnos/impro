import * as THREE from "three/webgpu";
import { pass, vec4, luminance } from "three/tsl";
import { bloom } from "three/addons/tsl/display/BloomNode.js";

const MAX_PIXEL_RATIO = 2;
const SIDEBAR_AVATAR_SELECTOR = ".sidebar-profile-avatar";
const VISUAL_AVATAR_SELECTOR =
  ".avatar-image, .avatar-placeholder, .avatar-link, [data-testid='avatar']";
const TARGET_PADDING_PX = 5;
const TARGET_PADDING_RATIO = 0.1;
const LASER_LINE_COUNT = 18;
const LASER_TOGGLE_CODE = "Backquote";
const LASER_ORIGIN_RADIUS_SCALE = 1.04;
const LASER_DOT_RADIUS_PX = 3.5;
const LASER_ORBIT_SPEED = 0.9;
const DEFAULT_CURSOR_POSITION = { x: 0.5, y: 0.5 };
const LASER_COLOR = "#ff3b30";
const LASER_COLOR_INTENSITY = 3.2;
const LASER_BLOOM_STRENGTH = 1.6;
const LASER_BLOOM_RADIUS = 0.28;
const LASER_BLOOM_THRESHOLD = 0;
const LASER_BLOOM_RAMP_SPEED = 8;

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

function elementMatchesHitTest(element, x, y, ignoredRoot = null) {
  const rawHits =
    typeof document.elementsFromPoint === "function"
      ? document.elementsFromPoint(x, y)
      : [document.elementFromPoint(x, y)].filter(Boolean);
  const hits = ignoredRoot
    ? rawHits.filter(
        (hit) =>
          !(hit instanceof Element) ||
          (hit !== ignoredRoot && !ignoredRoot.contains(hit)),
      )
    : rawHits;
  const hit = hits[0];
  if (!(hit instanceof Element)) {
    return false;
  }

  return hit === element || element.contains(hit) || hit.contains(element);
}

function getHitTestScore(element, rect, ignoredRoot = null) {
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
    if (elementMatchesHitTest(element, x, y, ignoredRoot)) {
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

      const hitScore = getHitTestScore(visualTarget, rect, root);
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

function consumeEvent(event) {
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
}

function isLaserToggleEvent(event) {
  return (
    event.code === LASER_TOGGLE_CODE &&
    !event.repeat &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.altKey
  );
}

function forEachLaserOrigin(
  { centerX, centerY, radius, rotation = 0 },
  callback,
) {
  const emissionRadius = Math.max(radius * LASER_ORIGIN_RADIUS_SCALE, 1);

  for (let i = 0; i < LASER_LINE_COUNT; i += 1) {
    const angle = (i / LASER_LINE_COUNT) * Math.PI * 2 - Math.PI / 2 + rotation;
    const startX = centerX + Math.cos(angle) * emissionRadius;
    const startY = centerY + Math.sin(angle) * emissionRadius;
    callback({ index: i, startX, startY });
  }
}

function updateLaserPositions(
  positions,
  { centerX, centerY, radius, rotation, cursorX, cursorY },
) {
  forEachLaserOrigin(
    { centerX, centerY, radius, rotation },
    ({ index, startX, startY }) => {
      const offset = index * 6;

      positions[offset] = startX;
      positions[offset + 1] = startY;
      positions[offset + 2] = 0;
      positions[offset + 3] = cursorX;
      positions[offset + 4] = cursorY;
      positions[offset + 5] = 0;
    },
  );
}

function updateLaserDotPositions(instancedMesh, dotTransform, target) {
  const dotRadius = Math.max(LASER_DOT_RADIUS_PX, target.radius * 0.08);

  forEachLaserOrigin(target, ({ index, startX, startY }) => {
    dotTransform.position.set(startX, startY, 0);
    dotTransform.scale.setScalar(dotRadius);
    dotTransform.updateMatrix();
    instancedMesh.setMatrixAt(index, dotTransform.matrix);
  });

  instancedMesh.instanceMatrix.needsUpdate = true;
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
  canvas.tabIndex = -1;
  root.replaceChildren(canvas);
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
  camera.position.z = 1;

  const laserColor = new THREE.Color(LASER_COLOR).multiplyScalar(
    LASER_COLOR_INTENSITY,
  );

  const laserDotGeometry = new THREE.CircleGeometry(1, 24);
  const laserDotMaterial = new THREE.MeshBasicMaterial({
    color: laserColor,
    transparent: true,
    opacity: 0.96,
  });
  const laserDots = new THREE.InstancedMesh(
    laserDotGeometry,
    laserDotMaterial,
    LASER_LINE_COUNT,
  );
  laserDots.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  laserDots.visible = false;
  scene.add(laserDots);
  const laserDotTransform = new THREE.Object3D();

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
  const bloomAlpha = luminance(bloomPass.rgb).mul(0.6).clamp(0, 1);
  const outputAlpha = scenePassColor.a.max(bloomAlpha).clamp(0, 1);
  renderPipeline.outputNode = vec4(
    scenePassColor.rgb.add(bloomPass.rgb),
    outputAlpha,
  );

  let laserModeEnabled = false;
  let laserPointerActive = false;
  let cursorClientX = getViewportWidth() * DEFAULT_CURSOR_POSITION.x;
  let cursorClientY = getViewportHeight() * DEFAULT_CURSOR_POSITION.y;
  let previousFocusedElement = null;
  let currentBloomStrength = 0;
  bloomPass.strength.value = currentBloomStrength;

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

  const setLaserModeEnabled = (enabled) => {
    if (laserModeEnabled === enabled) {
      return;
    }

    laserModeEnabled = enabled;
    laserPointerActive = false;
    laserSegments.visible = false;
    root.style.pointerEvents = enabled ? "auto" : "none";
    root.style.touchAction = enabled ? "none" : "";
    canvas.style.pointerEvents = enabled ? "auto" : "none";
    canvas.style.touchAction = enabled ? "none" : "";

    if (enabled) {
      previousFocusedElement =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      previousFocusedElement?.blur();
      canvas.tabIndex = 0;
      canvas.focus({ preventScroll: true });
      return;
    }

    canvas.tabIndex = -1;
    if (
      previousFocusedElement &&
      previousFocusedElement !== canvas &&
      previousFocusedElement.isConnected
    ) {
      previousFocusedElement.focus({ preventScroll: true });
    }
    previousFocusedElement = null;
  };

  const handlePointerMove = (event) => {
    updateCursorPosition(event);

    if (!laserModeEnabled) {
      return;
    }

    laserPointerActive = event.buttons !== 0;
    consumeEvent(event);
  };

  const handlePointerDown = (event) => {
    updateCursorPosition(event);

    if (!laserModeEnabled) {
      return;
    }

    laserPointerActive = event.buttons !== 0;
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch {}
    consumeEvent(event);
  };

  const handlePointerUp = (event) => {
    updateCursorPosition(event);

    if (!laserModeEnabled) {
      return;
    }

    laserPointerActive = false;
    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
    consumeEvent(event);
  };

  const handleWheel = (event) => {
    if (!laserModeEnabled) {
      return;
    }

    consumeEvent(event);
  };

  const handleClickLikeEvent = (event) => {
    if (!laserModeEnabled) {
      return;
    }

    consumeEvent(event);
  };

  const handleKeyDown = (event) => {
    if (laserModeEnabled) {
      if (isLaserToggleEvent(event)) {
        setLaserModeEnabled(false);
      }
      consumeEvent(event);
      return;
    }

    if (isEditableEventTarget(event.target) || !isLaserToggleEvent(event)) {
      return;
    }

    setLaserModeEnabled(true);
    consumeEvent(event);
  };

  const handleKeyUp = (event) => {
    if (!laserModeEnabled) {
      return;
    }

    consumeEvent(event);
  };

  window.addEventListener("pointermove", handlePointerMove, {
    capture: true,
    passive: false,
  });
  window.addEventListener("pointerdown", handlePointerDown, {
    capture: true,
    passive: false,
  });
  window.addEventListener("pointerup", handlePointerUp, {
    capture: true,
    passive: false,
  });
  window.addEventListener("pointercancel", handlePointerUp, {
    capture: true,
    passive: false,
  });
  window.addEventListener("wheel", handleWheel, {
    capture: true,
    passive: false,
  });
  window.addEventListener("click", handleClickLikeEvent, {
    capture: true,
    passive: false,
  });
  window.addEventListener("dblclick", handleClickLikeEvent, {
    capture: true,
    passive: false,
  });
  window.addEventListener("auxclick", handleClickLikeEvent, {
    capture: true,
    passive: false,
  });
  window.addEventListener("contextmenu", handleClickLikeEvent, {
    capture: true,
    passive: false,
  });
  window.addEventListener("keydown", handleKeyDown, true);
  window.addEventListener("keyup", handleKeyUp, true);

  const startTime = performance.now();
  let previousFrameTime = startTime;
  renderer.setAnimationLoop(() => {
    const now = performance.now();
    const elapsed = (now - startTime) * 0.001;
    const deltaTime = Math.min((now - previousFrameTime) * 0.001, 0.1);
    previousFrameTime = now;
    const targetBloomStrength = laserModeEnabled ? LASER_BLOOM_STRENGTH : 0;
    const bloomBlend = 1 - Math.exp(-LASER_BLOOM_RAMP_SPEED * deltaTime);
    currentBloomStrength = THREE.MathUtils.lerp(
      currentBloomStrength,
      targetBloomStrength,
      bloomBlend,
    );
    if (Math.abs(currentBloomStrength - targetBloomStrength) < 0.001) {
      currentBloomStrength = targetBloomStrength;
    }
    bloomPass.strength.value = currentBloomStrength;
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
      const laserTarget = {
        centerX,
        centerY,
        radius: outerRadius,
        rotation: elapsed * LASER_ORBIT_SPEED,
      };

      laserDots.visible = true;
      updateLaserDotPositions(laserDots, laserDotTransform, laserTarget);

      if (laserModeEnabled && laserPointerActive) {
        const cursorX =
          cursorClientX - overlayRect.left - overlayRect.width / 2;
        const cursorY =
          overlayRect.top + overlayRect.height / 2 - cursorClientY;

        laserSegments.visible = true;
        updateLaserPositions(laserPositions, {
          ...laserTarget,
          cursorX,
          cursorY,
        });
        laserGeometry.attributes.position.needsUpdate = true;
      } else {
        laserSegments.visible = false;
      }
    } else {
      laserDots.visible = false;
      laserSegments.visible = false;
    }

    renderPipeline.render();
  });

  return {
    dispose() {
      setLaserModeEnabled(false);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", handlePointerMove, true);
      window.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("pointerup", handlePointerUp, true);
      window.removeEventListener("pointercancel", handlePointerUp, true);
      window.removeEventListener("wheel", handleWheel, true);
      window.removeEventListener("click", handleClickLikeEvent, true);
      window.removeEventListener("dblclick", handleClickLikeEvent, true);
      window.removeEventListener("auxclick", handleClickLikeEvent, true);
      window.removeEventListener("contextmenu", handleClickLikeEvent, true);
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("keyup", handleKeyUp, true);
      renderer.setAnimationLoop(null);
      laserDotGeometry.dispose();
      laserDotMaterial.dispose();
      laserGeometry.dispose();
      laserMaterial.dispose();
      renderer.dispose();
      root.replaceChildren();
    },
  };
}
