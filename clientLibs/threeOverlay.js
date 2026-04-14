import * as THREE from "three/webgpu";

const MAX_PIXEL_RATIO = 2;
const AVATAR_SELECTORS = [
  ".sidebar-profile-avatar .avatar-link",
  ".sidebar-profile-avatar [data-testid='avatar']",
  ".sidebar-profile-avatar .avatar-placeholder",
];
const BASE_RING_INNER_RADIUS = 0.84;
const BASE_RING_OUTER_RADIUS = 1;
const ACCENT_ARC_LENGTH = Math.PI * 0.72;
const TARGET_PADDING_PX = 5;
const TARGET_PADDING_RATIO = 0.1;
const RING_PULSE_SCALE = 0.04;

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

function getTargetElement() {
  for (const selector of AVATAR_SELECTORS) {
    const target = document.querySelector(selector);
    if (target) {
      return target;
    }
  }

  return null;
}

function getHighlightColor() {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue("--highlight-color")
    .trim();

  return value || "#006aff";
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

  const start = performance.now();
  renderer.setAnimationLoop(() => {
    const elapsed = (performance.now() - start) * 0.001;
    const target = getTargetElement();

    if (target) {
      const rect = target.getBoundingClientRect();
      const overlayRect = getOverlayRect(root);
      const targetIsVisible =
        rect.width > 0 &&
        rect.height > 0 &&
        rect.bottom >= overlayRect.top &&
        rect.right >= overlayRect.left &&
        rect.top <= overlayRect.top + overlayRect.height &&
        rect.left <= overlayRect.left + overlayRect.width;

      if (targetIsVisible) {
        const centerX =
          rect.left + rect.width / 2 - overlayRect.left - overlayRect.width / 2;
        const centerY =
          overlayRect.top +
          overlayRect.height / 2 -
          (rect.top + rect.height / 2);
        const outerRadius =
          Math.max(rect.width, rect.height) / 2 +
          Math.max(TARGET_PADDING_PX, rect.width * TARGET_PADDING_RATIO);
        const pulse = 1 + Math.sin(elapsed * 2.4) * RING_PULSE_SCALE;

        ringGroup.visible = true;
        ringGroup.position.set(centerX, centerY, 0);
        baseRing.scale.setScalar(outerRadius);
        accentRing.scale.setScalar(outerRadius * pulse);
        accentRing.rotation.z = elapsed * 0.95;
      } else {
        ringGroup.visible = false;
      }
    } else {
      ringGroup.visible = false;
    }

    renderer.render(scene, camera);
  });

  return {
    dispose() {
      window.removeEventListener("resize", resize);
      renderer.setAnimationLoop(null);
      baseRingGeometry.dispose();
      baseRingMaterial.dispose();
      accentRingGeometry.dispose();
      accentRingMaterial.dispose();
      renderer.dispose();
      root.replaceChildren();
    },
  };
}
