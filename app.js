import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const canvas = document.querySelector("#signage-canvas");
const fallback = document.querySelector("#model-fallback");
const status = document.querySelector("#viewer-status");
const viewer = document.querySelector(".viewer");
const buttons = Array.from(document.querySelectorAll(".view-button"));

const renderer = new THREE.WebGLRenderer({
  canvas,
  alpha: true,
  antialias: true,
  preserveDrawingBuffer: true,
  powerPreference: "high-performance",
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.18;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, 1, 0.01, 100);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.enablePan = false;
controls.minDistance = 2.0;
controls.maxDistance = 6.2;
controls.target.set(0, 0, 0);

const ambient = new THREE.HemisphereLight(0xffffff, 0x1e302f, 2.0);
scene.add(ambient);

const key = new THREE.DirectionalLight(0xffffff, 2.2);
key.position.set(-3.4, 4.2, 4.8);
scene.add(key);

const rim = new THREE.DirectionalLight(0xd9ff4f, 1.2);
rim.position.set(3.2, 2.2, -3.8);
scene.add(rim);

let modelRoot = null;
let activeView = "front";
let autoRotate = true;

const viewMap = {
  front: {
    camera: [2.45, 1.18, 3.15],
    target: [0, 0, 0],
    label: "Front view",
  },
  connector: {
    camera: [0.34, -0.18, 3.75],
    target: [0, -0.38, -0.28],
    label: "Connector view",
  },
  top: {
    camera: [0.35, 4.35, 0.95],
    target: [0, 0, 0],
    label: "Top view",
  },
};

function resize() {
  const rect = viewer.getBoundingClientRect();
  const width = Math.max(1, Math.floor(rect.width));
  const height = Math.max(1, Math.floor(rect.height));
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function setView(name, immediate = false) {
  activeView = name;
  const view = viewMap[name];
  autoRotate = name === "front";
  buttons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.view === name);
  });
  status.textContent = view.label;

  const toPosition = new THREE.Vector3(...view.camera);
  const toTarget = new THREE.Vector3(...view.target);

  if (immediate) {
    camera.position.copy(toPosition);
    controls.target.copy(toTarget);
    controls.update();
    return;
  }

  const fromPosition = camera.position.clone();
  const fromTarget = controls.target.clone();
  const start = performance.now();
  const duration = 520;

  function tick(now) {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    camera.position.lerpVectors(fromPosition, toPosition, eased);
    controls.target.lerpVectors(fromTarget, toTarget, eased);
    controls.update();
    if (t < 1 && activeView === name) requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);
}

function normalizeModel(root) {
  const box = new THREE.Box3().setFromObject(root);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  root.position.sub(center);
  const maxAxis = Math.max(size.x, size.y, size.z);
  if (maxAxis > 0) root.scale.setScalar(2.65 / maxAxis);
  root.rotation.y = 0.45;
  root.traverse((child) => {
    if (!child.isMesh) return;
    child.castShadow = true;
    child.receiveShadow = true;
    if (child.material) {
      child.material.needsUpdate = true;
    }
  });
}

new GLTFLoader().load(
  "assets/signage-concept.glb",
  (gltf) => {
    modelRoot = gltf.scene;
    normalizeModel(modelRoot);
    scene.add(modelRoot);
    fallback.style.opacity = "0";
    viewer.dataset.ready = "model";
    setView("front", true);
    status.textContent = "Web 3D preview";
  },
  undefined,
  () => {
    status.textContent = "Blender render preview";
    viewer.dataset.ready = "fallback";
    fallback.style.opacity = "0.72";
  },
);

buttons.forEach((button) => {
  button.addEventListener("click", () => setView(button.dataset.view));
});

viewer.addEventListener("pointerdown", () => {
  autoRotate = false;
});

const observer = new ResizeObserver(resize);
observer.observe(viewer);
resize();
setView("front", true);

function animate() {
  requestAnimationFrame(animate);
  if (modelRoot && autoRotate) {
    modelRoot.rotation.y += 0.004;
  }
  controls.update();
  renderer.render(scene, camera);
}

animate();
