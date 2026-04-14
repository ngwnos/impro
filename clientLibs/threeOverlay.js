import * as THREE from "three/webgpu";

const MAX_PIXEL_RATIO = 2;
const CUBE_SIZE = 1.35;
const CAMERA_DISTANCE = 3.8;

function getPixelRatio() {
  return Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
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
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  camera.position.set(0, 0, CAMERA_DISTANCE);

  const cubeGeometry = new THREE.BoxGeometry(CUBE_SIZE, CUBE_SIZE, CUBE_SIZE);
  const cubeMaterial = new THREE.MeshNormalMaterial();
  const cube = new THREE.Mesh(cubeGeometry, cubeMaterial);
  scene.add(cube);

  const resize = () => {
    const width = Math.max(window.innerWidth || 0, 1);
    const height = Math.max(window.innerHeight || 0, 1);
    renderer.setPixelRatio(getPixelRatio());
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };

  resize();
  window.addEventListener("resize", resize, { passive: true });

  const start = performance.now();
  renderer.setAnimationLoop(() => {
    const elapsed = (performance.now() - start) * 0.001;
    cube.rotation.x = elapsed * 0.55;
    cube.rotation.y = elapsed * 0.72;
    cube.rotation.z = elapsed * 0.18;
    renderer.render(scene, camera);
  });

  return {
    dispose() {
      window.removeEventListener("resize", resize);
      renderer.setAnimationLoop(null);
      cubeGeometry.dispose();
      cubeMaterial.dispose();
      renderer.dispose();
      root.replaceChildren();
    },
  };
}
