import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const canvas = document.querySelector("#signage-canvas");
const fallback = document.querySelector("#model-fallback");
const status = document.querySelector("#viewer-status");
const viewer = document.querySelector(".viewer");
const viewButtons = Array.from(document.querySelectorAll(".view-button"));
const shapeButtons = Array.from(document.querySelectorAll(".shape-button"));
const shapeTitle = document.querySelector("#shape-title");
const shapeDescription = document.querySelector("#shape-description");

const shapes = {
  cylinder: {
    label: "円筒形",
    path: "assets/signage-cylinder.glb",
    fallback: "assets/shape-cylinder-render.png",
    description: "曲面LED、下部筐体、接続部まで見せる円筒形プレビュー。",
    status: "Cylinder 3D preview",
    rotationY: 0.35,
    scale: 2.24,
  },
  ten: {
    label: "10型",
    path: "assets/signage-10.glb",
    fallback: "assets/shape-10-render.png",
    description: "1型と0型が離れて立つ10型。表示体160cm、台座込み195cm、配線まわりまで含めたプレビュー。",
    status: "10 shape 3D preview",
    rotationY: 0.15,
    scale: 1.74,
  },
  h: {
    label: "H型",
    path: "assets/signage-h.glb",
    fallback: "assets/shape-h-render.png",
    description: "厚みのある箱型H。正面と側面に映像が回り込む立体什器プレビュー。",
    status: "H shape 3D preview",
    rotationY: 0.15,
    scale: 1.58,
  },
};

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
controls.maxDistance = 6.8;
controls.target.set(0, 0, 0);

const ambient = new THREE.HemisphereLight(0xffffff, 0x1e302f, 2.0);
scene.add(ambient);

const mainLight = new THREE.DirectionalLight(0xffffff, 2.25);
mainLight.position.set(-3.4, 4.2, 4.8);
scene.add(mainLight);

const rim = new THREE.DirectionalLight(0xd9ff4f, 1.28);
rim.position.set(3.2, 2.2, -3.8);
scene.add(rim);

const loader = new GLTFLoader();
let modelRoot = null;
let activeView = "front";
let activeShape = "cylinder";
let autoRotate = true;
let loadSequence = 0;

const viewMap = {
  front: {
    camera: [0.16, 0.56, 4.35],
    target: [0, 0, 0],
    label: "Front view",
  },
  angle: {
    camera: [2.75, 1.25, 3.4],
    target: [0, 0, 0],
    label: "Angle view",
  },
  top: {
    camera: [0.32, 4.75, 0.88],
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

function setShapeCopy(shape) {
  shapeTitle.textContent = shape.label;
  shapeDescription.textContent = shape.description;
  status.textContent = shape.status;
}

function setView(name, immediate = false) {
  activeView = name;
  const view = viewMap[name];
  autoRotate = name === "front";
  viewButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.view === name);
  });
  if (viewer.dataset.ready === "model") {
    status.textContent = `${shapes[activeShape].status} / ${view.label}`;
  }

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

function disposeObject(root) {
  root.traverse((child) => {
    if (!child.isMesh) return;
    child.geometry?.dispose?.();
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach((material) => {
      if (!material) return;
      Object.values(material).forEach((value) => {
        if (value && typeof value.dispose === "function") value.dispose();
      });
      material.dispose?.();
    });
  });
}

function normalizeModel(root, shape) {
  const box = new THREE.Box3().setFromObject(root);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  root.position.sub(center);
  const maxAxis = Math.max(size.x, size.y, size.z);
  if (maxAxis > 0) root.scale.setScalar(shape.scale / maxAxis);
  root.rotation.y = shape.rotationY;
  root.traverse((child) => {
    if (!child.isMesh) return;
    child.castShadow = true;
    child.receiveShadow = true;
    if (child.material) child.material.needsUpdate = true;
  });
}

function loadShape(name) {
  const shape = shapes[name] || shapes.cylinder;
  activeShape = name;
  loadSequence += 1;
  const sequence = loadSequence;

  shapeButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.shape === name);
  });
  setShapeCopy(shape);
  fallback.src = shape.fallback;
  fallback.style.opacity = "0.64";
  viewer.dataset.ready = "loading";
  status.textContent = "Loading 3D model";

  if (modelRoot) {
    scene.remove(modelRoot);
    disposeObject(modelRoot);
    modelRoot = null;
  }

  loader.load(
    shape.path,
    (gltf) => {
      if (sequence !== loadSequence) return;
      modelRoot = gltf.scene;
      normalizeModel(modelRoot, shape);
      scene.add(modelRoot);
      fallback.style.opacity = "0";
      viewer.dataset.ready = "model";
      setView("front", true);
      status.textContent = shape.status;
    },
    undefined,
    () => {
      if (sequence !== loadSequence) return;
      viewer.dataset.ready = "fallback";
      fallback.style.opacity = "0.72";
      status.textContent = "Blender render preview";
    },
  );
}

viewButtons.forEach((button) => {
  button.addEventListener("click", () => setView(button.dataset.view));
});

shapeButtons.forEach((button) => {
  button.addEventListener("click", () => loadShape(button.dataset.shape));
});

viewer.addEventListener("pointerdown", () => {
  autoRotate = false;
});

const observer = new ResizeObserver(resize);
observer.observe(viewer);
resize();
setView("front", true);
loadShape("cylinder");

function animate() {
  requestAnimationFrame(animate);
  if (modelRoot && autoRotate) {
    modelRoot.rotation.y += 0.0036;
  }
  controls.update();
  renderer.render(scene, camera);
}

animate();
