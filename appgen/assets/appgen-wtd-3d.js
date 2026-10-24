/**
 * WTD 3D Spatial Memory Lab — Three.js
 * Method: visuospatial encoding + delayed recall (object–location binding).
 * Workforce framing: rehearse holding priorities in mind between interruptions.
 */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import {
  attachWtdStudioEnvironment,
  createStudioSquareMaterial,
  ensureStudioSettingsSynced,
  loadStudioBoardTextures,
  refreshStudioSquareMaterial
} from "./appgen-wtd-studio.js";

const LEVEL_ID = "spatial3d";
const GRID = 5;
const CELL = 1.1;
/** Entire workspace (grid + dock) sits below default camera height so tiles read from above, not edge-on. */
const GRID_FLOOR_Y = -1.74;
/** Shape center height on a tile (foot on tile top via contact shadow). */
const OBJECT_REST_Y = GRID_FLOOR_Y + 0.45;
/** Level 1 → START_OBJECTS shapes; +1 shape per level through MAX_LEVEL. */
const START_OBJECTS = 3;
const MAX_LEVEL = 3;
const PROGRESS_KEY = "appgen_wtd_spatial3d_progress_v1";

const SHAPES = [
  { name: "box", geo: () => new THREE.BoxGeometry(0.55, 0.55, 0.55) },
  { name: "sphere", geo: () => new THREE.SphereGeometry(0.32, 24, 16) },
  { name: "cone", geo: () => new THREE.ConeGeometry(0.34, 0.65, 20) },
  { name: "torus", geo: () => new THREE.TorusGeometry(0.28, 0.1, 12, 24) },
  { name: "oct", geo: () => new THREE.OctahedronGeometry(0.38) }
];

const COLORS = [0xd62828, 0x1565c0, 0x1b9e59, 0xea580c, 0x9333ea, 0x0f766e];

/** Fallback checker before chess board textures load. */
const TILE_COLOR_A = 0x858585;
const TILE_COLOR_B = 0x4d1414;
const TILE_FEEDBACK_OK = 0x2ecc71;
const TILE_FEEDBACK_BAD = 0xe74c3c;
/** Dragon Points deducted per wrong tile drop (before cap); accuracy already lowers acc/eff bonuses. */
const WRONG_PLACEMENT_PENALTY = 40;

let host = null;
let hudEl = null;
let controlsEl = null;
let renderer = null;
let scene = null;
let camera = null;
/** @type {ReturnType<typeof attachWtdStudioEnvironment> | null} */
let studioEnvHandle = null;
/** @type {import("./appgen-wtd-chess-board-theme.js").BoardThemePrefs | null} */
let boardThemePrefs = null;
/** @type {{ light: import("three").Texture | null, dark: import("three").Texture | null }} */
let boardThemeTextures = { light: null, dark: null };
let controls = null;
let animId = null;
let floorTiles = [];
let activeMeshes = [];
/** Recall-phase dock meshes (pick up → drag → drop on grid). */
let stagingMeshes = [];
/** Shapes placed on wrong tiles during recall — stay on grid until relocated correctly. */
let recallWrongMeshes = [];
/** @type {THREE.Mesh[]} */
let stagingPadTiles = [];
let session = null;
let raycaster = null;
let pointer = null;
let boundPointerDown = null;
let boundPointerMove = null;
let boundPointerUp = null;
/** @type {{ def: object, mesh: THREE.Mesh, origin: THREE.Vector3, pointerId: number, moved: boolean } | null} */
let dragState = null;
const DRAG_PLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0), -OBJECT_REST_Y);
const DRAG_HIT = new THREE.Vector3();
let pmremGenerator = null;
let envMapTexture = null;
/** Directional key light shadow frustum target (grid + front dock). */
let keyLightTarget = null;

function disposeMeshDeep(mesh) {
  if (!mesh) return;
  mesh.traverse((node) => {
    if (node.geometry) node.geometry.dispose();
    if (node.material) {
      const mats = Array.isArray(node.material) ? node.material : [node.material];
      mats.forEach((m) => m.dispose());
    }
  });
}

/** Floor contact blob — readable on light checker tiles alongside PCF shadows. */
function attachContactShadow(mesh, radius) {
  const r = typeof radius === "number" ? radius : 0.36;
  const disk = new THREE.Mesh(
    new THREE.CircleGeometry(r, 22),
    new THREE.MeshBasicMaterial({
      color: 0x243444,
      transparent: true,
      opacity: 0.4,
      depthWrite: false
    })
  );
  disk.rotation.x = -Math.PI / 2;
  disk.position.y = -0.398;
  disk.renderOrder = 1;
  const mat = disk.material;
  mat.polygonOffset = true;
  mat.polygonOffsetFactor = -3;
  mat.polygonOffsetUnits = -3;
  disk.userData.type = "contactShadow";
  mesh.add(disk);
  return disk;
}

function configureKeyLightShadows(key) {
  const gridReach = gridOffset() + CELL * 0.55;
  const dockZ = gridOffset() + CELL * 1.35;
  const centerZ = (-gridReach + dockZ) * 0.5;
  const shadowHalf = Math.max(gridReach + 1.35, dockZ + 1.15);

  if (!keyLightTarget) {
    keyLightTarget = new THREE.Object3D();
  }
  keyLightTarget.position.set(0, GRID_FLOOR_Y + 0.2, centerZ);
  key.target = keyLightTarget;

  key.shadow.mapSize.set(3072, 3072);
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 26;
  key.shadow.camera.left = -shadowHalf;
  key.shadow.camera.right = shadowHalf;
  key.shadow.camera.top = shadowHalf;
  key.shadow.camera.bottom = -shadowHalf;
  key.shadow.bias = -0.00025;
  key.shadow.normalBias = 0.02;
  key.shadow.radius = 1.25;
  if (typeof key.shadow.intensity === "number") key.shadow.intensity = 1.22;
  key.shadow.camera.updateProjectionMatrix();
}

function $(id) {
  return document.getElementById(id);
}

function playerName() {
  if (window.AppgenWtd && typeof window.AppgenWtd.getPlayerName === "function") {
    return window.AppgenWtd.getPlayerName();
  }
  const inp = $("wtdPlayerName");
  return (inp && inp.value.trim()) || "Anonymous";
}

function scoreForRun(timeMs, accuracyPct, wrongAttempts) {
  const base = 650;
  const timeBonus = Math.max(0, Math.floor(900 - timeMs / 80));
  const accBonus = Math.floor((accuracyPct / 100) * 400);
  const effBonus = Math.floor(accuracyPct * 0.5);
  const raw = base + timeBonus + accBonus + effBonus;
  const attempts = Math.max(0, wrongAttempts || 0);
  const attemptPenalty = Math.min(
    attempts * WRONG_PLACEMENT_PENALTY,
    Math.max(0, raw - 100)
  );
  return Math.max(100, raw - attemptPenalty);
}

function setHud(html) {
  if (hudEl) hudEl.innerHTML = html;
}

function setControls(html) {
  if (controlsEl) controlsEl.innerHTML = html;
}

function gridToWorld(gx, gz) {
  const offset = ((GRID - 1) * CELL) / 2;
  return new THREE.Vector3(gx * CELL - offset, GRID_FLOOR_Y, gz * CELL - offset);
}

function pickRandomCells(n) {
  const cells = [];
  while (cells.length < n) {
    const gx = Math.floor(Math.random() * GRID);
    const gz = Math.floor(Math.random() * GRID);
    const key = gx + "," + gz;
    if (!cells.some((c) => c.key === key)) cells.push({ gx, gz, key });
  }
  return cells;
}

/** CSS hex from the same numeric color used by THREE.MeshStandardMaterial. */
function colorToCss(hex) {
  return "#" + (hex >>> 0).toString(16).padStart(6, "0");
}

/** Richer albedo under studio env — less pastel wash from PMREM + emissive. */
function shapeAlbedo(hex) {
  const c = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  c.setHSL(hsl.h, Math.min(1, hsl.s * 1.16 + 0.08), Math.max(0.34, Math.min(0.48, hsl.l * 0.9)));
  return c;
}

function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

function isLightTile(gx, gz) {
  return (gx + gz) % 2 === 0;
}

function tileBaseColor(gx, gz) {
  return isLightTile(gx, gz) ? TILE_COLOR_A : TILE_COLOR_B;
}

function createGridTileMaterial(gx, gz) {
  if (boardThemePrefs) {
    const isLight = isLightTile(gx, gz);
    return createStudioSquareMaterial(
      isLight,
      boardThemePrefs,
      isLight ? boardThemeTextures.light : boardThemeTextures.dark
    );
  }
  return createTileMaterial(tileBaseColor(gx, gz));
}

function applyTileBaseAppearance(tile) {
  if (!tile?.material || !tile.userData) return;
  const { gx, gz } = tile.userData;
  tile.material = tile.material.clone();
  if (boardThemePrefs) {
    const isLight = isLightTile(gx, gz);
    refreshStudioSquareMaterial(
      tile.material,
      isLight,
      boardThemePrefs,
      isLight ? boardThemeTextures.light : boardThemeTextures.dark
    );
  } else {
    tile.material.color.setHex(tileBaseColor(gx, gz));
  }
  tile.material.emissive.setHex(0x000000);
  tile.material.emissiveIntensity = 0;
}

function syncImmersiveStudioBackdrop() {
  if (!scene || !renderer) return;
  scene.fog = null;
}

function applyStudioBoardToGrid() {
  loadStudioBoardTextures(({ light, dark, prefs }) => {
    if (!scene) return;
    boardThemePrefs = prefs;
    boardThemeTextures = { light, dark };
    floorTiles.forEach((tile) => applyTileBaseAppearance(tile));
    stagingPadTiles.forEach((tile) => {
      if (tile.userData?.type === "stagingPadTile") applyTileBaseAppearance(tile);
    });
    if (renderer) {
      for (const tex of [light, dark]) {
        if (tex && typeof renderer.initTexture === "function") renderer.initTexture(tex);
      }
    }
  });
}

/** Soft lacquer trim (desk frame + backdrop) — tuned for light studio, not black void. */
function createPianoMaterial(colorHex) {
  return new THREE.MeshPhysicalMaterial({
    color: colorHex,
    metalness: 0.08,
    roughness: 0.5,
    clearcoat: 0.32,
    clearcoatRoughness: 0.45,
    envMapIntensity: 0.1,
    reflectivity: 0.24
  });
}

/** Grid tiles — opaque checker with gentle sheen so feedback colors stay readable. */
function createTileMaterial(colorHex) {
  return new THREE.MeshPhysicalMaterial({
    color: colorHex,
    metalness: 0.02,
    roughness: 0.54,
    clearcoat: 0.1,
    clearcoatRoughness: 0.58,
    envMapIntensity: 0.05,
    reflectivity: 0.16,
    emissive: 0x000000,
    emissiveIntensity: 0
  });
}

function disposeEnvironment() {
  if (envMapTexture) {
    envMapTexture.dispose();
    envMapTexture = null;
  }
  if (pmremGenerator) {
    pmremGenerator.dispose();
    pmremGenerator = null;
  }
  if (scene) scene.environment = null;
}

function initEnvironment() {
  if (!renderer || !scene) return;
  disposeEnvironment();
  pmremGenerator = new THREE.PMREMGenerator(renderer);
  pmremGenerator.compileEquirectangularShader();
  const roomScene = new RoomEnvironment();
  envMapTexture = pmremGenerator.fromScene(roomScene, 0.04).texture;
  scene.environment = envMapTexture;
}

function pickDistinctColors(n) {
  const pool = COLORS.slice();
  shuffleInPlace(pool);
  const out = [];
  for (let i = 0; i < n; i++) {
    if (i < pool.length) out.push(pool[i]);
    else out.push(COLORS[i % COLORS.length]);
  }
  return out;
}

function objectsForLevel(level) {
  const lv = Math.max(1, Math.min(MAX_LEVEL, Math.floor(level)));
  return START_OBJECTS + lv - 1;
}

function encodeMsForObjectCount(n) {
  return Math.min(9000, 3200 + n * 450);
}

function loadProgress() {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    const peak = parsed && typeof parsed.peakLevel === "number" ? parsed.peakLevel : 0;
    return { peakLevel: Math.max(0, Math.floor(peak)) };
  } catch (_) {
    return { peakLevel: 0 };
  }
}

function savePeakLevel(level) {
  const lv = Math.max(1, Math.floor(level));
  const prev = loadProgress();
  if (lv <= prev.peakLevel) return;
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify({ peakLevel: lv }));
  } catch (_) { /* private mode */ }
}

function gridOffset() {
  return ((GRID - 1) * CELL) / 2;
}

function stagingSlotPosition(index, total) {
  const spacing = 0.95;
  const totalWidth = Math.max(0, (total - 1) * spacing);
  const startX = -totalWidth / 2;
  const z = gridOffset() + CELL * 1.35;
  return new THREE.Vector3(startX + index * spacing, OBJECT_REST_Y, z);
}

function updatePointerFromEvent(ev) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
}

function raycastFloorTile() {
  const hits = raycaster.intersectObjects(floorTiles, false);
  return hits.length ? hits[0].object : null;
}

function raycastStagingMesh() {
  const hits = raycaster.intersectObjects(stagingMeshes, false);
  return hits.length ? hits[0].object : null;
}

function raycastRecallWrongMesh() {
  const hits = raycaster.intersectObjects(recallWrongMeshes, false);
  return hits.length ? hits[0].object : null;
}

function clearRecallWrongMeshes() {
  recallWrongMeshes.forEach((m) => {
    if (scene) scene.remove(m);
    disposeMeshDeep(m);
  });
  recallWrongMeshes = [];
}

function isTileOccupiedByRecall(gx, gz, exceptMesh) {
  return recallWrongMeshes.some(
    (m) =>
      m !== exceptMesh &&
      m.userData &&
      m.userData.gx === gx &&
      m.userData.gz === gz
  );
}

function meshForDefId(defId) {
  const wrong = recallWrongMeshes.find((m) => m.userData.defId === defId);
  if (wrong) return wrong;
  return stagingMeshes.find((m) => m.userData.defId === defId) || null;
}

function unlinkStagingMesh(mesh) {
  const idx = stagingMeshes.indexOf(mesh);
  if (idx >= 0) stagingMeshes.splice(idx, 1);
}

function removeRecallWrongMesh(mesh) {
  const idx = recallWrongMeshes.indexOf(mesh);
  if (idx >= 0) recallWrongMeshes.splice(idx, 1);
}

function placeMeshOnGrid(mesh, gx, gz) {
  const pos = gridToWorld(gx, gz);
  mesh.position.set(pos.x, OBJECT_REST_Y, pos.z);
  mesh.scale.setScalar(1);
  mesh.userData.gx = gx;
  mesh.userData.gz = gz;
}

function markMeshAsWrongOnGrid(mesh, gx, gz) {
  const prevGx = mesh.userData.gx;
  const prevGz = mesh.userData.gz;
  if (
    mesh.userData.type === "recallWrong" &&
    prevGx != null &&
    (prevGx !== gx || prevGz !== gz)
  ) {
    resetTileToBase(prevGx, prevGz, mesh);
  }
  unlinkStagingMesh(mesh);
  if (!recallWrongMeshes.includes(mesh)) recallWrongMeshes.push(mesh);
  placeMeshOnGrid(mesh, gx, gz);
  mesh.userData.type = "recallWrong";
  mesh.material = mesh.material.clone();
  mesh.material.emissive.setHex(0x992222);
  mesh.material.emissiveIntensity = 0.38;
}

function clearStagingMeshes() {
  stagingMeshes.forEach((m) => {
    if (scene) scene.remove(m);
    disposeMeshDeep(m);
  });
  stagingMeshes = [];
  disposeStagingPadTiles();
}

function createObjectMaterial(def, opts) {
  const transparent = opts && opts.transparent;
  const opacity = opts && typeof opts.opacity === "number" ? opts.opacity : 1;
  const albedo = shapeAlbedo(def.color);
  return new THREE.MeshStandardMaterial({
    color: albedo,
    metalness: 0.02,
    roughness: 0.64,
    envMapIntensity: 0.05,
    transparent: !!transparent,
    opacity,
    emissive: albedo.clone().multiplyScalar(0.02),
    emissiveIntensity: 0.18
  });
}

function spawnStagingObject(def, index, total) {
  if (!scene) return null;
  const shape = SHAPES[def.shapeIdx];
  const geo = shape.geo();
  const mat = createObjectMaterial(def, { transparent: true, opacity: 0.92 });
  const mesh = new THREE.Mesh(geo, mat);
  const pos = stagingSlotPosition(index, total);
  mesh.position.copy(pos);
  mesh.castShadow = true;
  mesh.receiveShadow = false;
  attachContactShadow(mesh, 0.34);
  mesh.userData = {
    defId: def.id,
    type: "staging",
    stagingIndex: index,
    origin: pos.clone()
  };
  scene.add(mesh);
  stagingMeshes.push(mesh);
  return mesh;
}

function disposeStagingPadTiles() {
  if (!scene) {
    stagingPadTiles = [];
    return;
  }
  stagingPadTiles.forEach((tile) => {
    scene.remove(tile);
    tile.geometry?.dispose();
    const mat = tile.material;
    if (mat) {
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else mat.dispose();
    }
  });
  stagingPadTiles = [];
}

function buildStagingPadChecker(padW, padZ) {
  disposeStagingPadTiles();
  if (!scene) return;
  const cols = Math.max(4, Math.ceil(padW / CELL) + 1);
  const rows = 2;
  const tileSpan = CELL * 0.92;
  const width = cols * tileSpan;
  const depth = rows * tileSpan;
  const startX = -width / 2 + tileSpan / 2;
  const startZ = padZ - depth / 2 + tileSpan / 2;

  const frame = new THREE.Mesh(
    new THREE.BoxGeometry(width + 0.14, 0.05, depth + 0.14),
    createPianoMaterial(0x3d2817)
  );
  frame.position.set(0, GRID_FLOOR_Y + 0.006, padZ);
  frame.receiveShadow = true;
  frame.userData = { type: "stagingPadFrame" };
  scene.add(frame);
  stagingPadTiles.push(frame);

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const gx = col;
      const gz = row + GRID;
      const mat = createGridTileMaterial(gx, gz);
      const tile = new THREE.Mesh(new THREE.BoxGeometry(tileSpan, 0.04, tileSpan), mat);
      tile.position.set(startX + col * tileSpan, GRID_FLOOR_Y + 0.01, startZ + row * tileSpan);
      tile.receiveShadow = true;
      tile.userData = { type: "stagingPadTile", gx, gz };
      scene.add(tile);
      stagingPadTiles.push(tile);
    }
  }
}

function buildStagingDock() {
  clearStagingMeshes();
  if (!scene || !session || !session.targets) return;
  const n = session.targets.length;
  const padW = Math.max(GRID * CELL * 0.55, (n - 1) * 0.95 + 1.4);
  const padZ = gridOffset() + CELL * 1.35;
  buildStagingPadChecker(padW, padZ);
  session.targets.forEach((def, i) => spawnStagingObject(def, i, n));
}

function applyStagingHighlight(def) {
  stagingMeshes.forEach((m) => {
    if (!m.material || !m.material.emissive) return;
    const active = def && m.userData.defId === def.id;
    m.material.emissive.copy(new THREE.Color(m.material.color).multiplyScalar(active ? 0.14 : 0.02));
    m.material.emissiveIntensity = active ? 0.38 : 0.18;
    m.scale.setScalar(active ? 1.06 : 1);
  });
}

function resetTileToBase(gx, gz, exceptMesh) {
  const occupied =
    activeMeshes.some(
      (m) => m !== exceptMesh && m.userData && m.userData.gx === gx && m.userData.gz === gz
    ) || isTileOccupiedByRecall(gx, gz, exceptMesh);
  if (occupied) return;
  const tile = floorTiles.find((t) => t.userData.gx === gx && t.userData.gz === gz);
  if (!tile || !tile.material) return;
  applyTileBaseAppearance(tile);
}

/** Full-grid reset — use on new trial / level (correct feedback has no auto-clear). */
function resetAllTilesToBase() {
  floorTiles.forEach((tile) => applyTileBaseAppearance(tile));
}

function flashTileFeedback(gx, gz, correct) {
  const tile = floorTiles.find((t) => t.userData.gx === gx && t.userData.gz === gz);
  if (!tile || !tile.material) return;
  tile.material = tile.material.clone();
  tile.material.color.setHex(correct ? TILE_FEEDBACK_OK : TILE_FEEDBACK_BAD);
  tile.material.emissive.setHex(correct ? 0x145a32 : 0x6b2010);
  tile.material.emissiveIntensity = correct ? 0.22 : 0.28;
  if (!correct) {
    setTimeout(() => resetTileToBase(gx, gz), 900);
  }
}

function removeStagingMeshForDef(defId) {
  const idx = stagingMeshes.findIndex((m) => m.userData.defId === defId);
  if (idx < 0) return;
  const m = stagingMeshes[idx];
  if (dragState && dragState.mesh === m) {
    dragState = null;
    if (controls) controls.enabled = true;
  }
  if (scene) scene.remove(m);
  disposeMeshDeep(m);
  stagingMeshes.splice(idx, 1);
}

function nextUnplacedTarget() {
  if (!session || !session.targets) return null;
  const placed = new Set(session.placements.map((p) => p.defId));
  return session.targets.find((t) => !placed.has(t.id)) || null;
}

function setPendingDef(def) {
  if (!session) return;
  session.pendingDef = def || null;
  applyStagingHighlight(def);
}

function buildScene() {
  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(50, 1, 0.1, 60);
  camera.position.set(0, 7.8, 9.2);

  scene.add(new THREE.AmbientLight(0xfff3e6, 0.26));
  const hemi = new THREE.HemisphereLight(0xffeed6, 0xbfa894, 0.4);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xfff4e6, 0.64);
  key.position.set(5, 11, 7);
  key.castShadow = true;
  configureKeyLightShadows(key);
  scene.add(keyLightTarget);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xb8cce0, 0.18);
  fill.position.set(-6, 7, 5);
  scene.add(fill);
  const back = new THREE.DirectionalLight(0xe8dfd0, 0.1);
  back.position.set(0, 4, -8);
  scene.add(back);

  const desk = new THREE.Mesh(
    new THREE.BoxGeometry(GRID * CELL + 0.55, 0.12, GRID * CELL + 0.55),
    createPianoMaterial(0x3d2817)
  );
  desk.position.y = GRID_FLOOR_Y - 0.07;
  desk.receiveShadow = true;
  desk.castShadow = false;
  scene.add(desk);

  floorTiles = [];
  const offset = ((GRID - 1) * CELL) / 2;
  for (let gx = 0; gx < GRID; gx++) {
    for (let gz = 0; gz < GRID; gz++) {
      const mat = createGridTileMaterial(gx, gz);
      const tile = new THREE.Mesh(new THREE.BoxGeometry(CELL * 0.92, 0.06, CELL * 0.92), mat);
      tile.position.set(gx * CELL - offset, GRID_FLOOR_Y + 0.02, gz * CELL - offset);
      tile.receiveShadow = true;
      tile.userData = { gx, gz, type: "tile" };
      scene.add(tile);
      floorTiles.push(tile);
    }
  }

  raycaster = new THREE.Raycaster();
  pointer = new THREE.Vector2();
}

function clearActiveMeshes() {
  activeMeshes.forEach((m) => {
    if (scene) scene.remove(m);
    disposeMeshDeep(m);
  });
  activeMeshes = [];
}

function spawnObject(def, gx, gz) {
  if (!scene) return null;
  const shape = SHAPES[def.shapeIdx];
  const geo = shape.geo();
  const mat = createObjectMaterial(def);
  const mesh = new THREE.Mesh(geo, mat);
  const pos = gridToWorld(gx, gz);
  mesh.position.set(pos.x, OBJECT_REST_Y, pos.z);
  mesh.castShadow = true;
  mesh.receiveShadow = false;
  attachContactShadow(mesh, 0.36);
  mesh.userData = { defId: def.id, gx, gz, type: "object" };
  scene.add(mesh);
  activeMeshes.push(mesh);
  return mesh;
}

function ensureCanvasHost() {
  const playSection = $("wtd3dPlay");
  if (playSection) {
    playSection.classList.remove("wtd-3d-light");
    playSection.classList.add("wtd-3d-immersive");
  }
  let el = $("wtd3dCanvasHost");
  if (el) {
    el.classList.remove("wtd-3d-light");
    el.classList.add("wtd-3d-immersive");
    return el;
  }
  const play = $("wtd3dPlay");
  if (!play) return null;
  el = document.createElement("div");
  el.id = "wtd3dCanvasHost";
  el.className = "wtd-3d-canvas-host wtd-3d-immersive";
  el.setAttribute("aria-label", "3D spatial memory workspace");
  const controls = $("wtd3dControls");
  if (controls && controls.parentNode === play) {
    play.insertBefore(el, controls);
  } else {
    play.appendChild(el);
  }
  return el;
}

function resize() {
  if (!renderer || !host || !camera) return;
  const inModal = !!(host.closest && host.closest(".wtd-session-modal"));
  const parentW = host.parentElement ? host.parentElement.clientWidth : 0;
  const w = Math.max(1, host.clientWidth || parentW || window.innerWidth);
  let h = host.clientHeight || 0;
  if (inModal) {
    if (h < 160) {
      h = Math.max(280, Math.floor(window.innerHeight * 0.55));
      host.style.height = h + "px";
    } else {
      host.style.height = "";
      h = host.clientHeight || h;
    }
  } else {
    h = Math.max(320, Math.min(520, w * 0.62));
    host.style.height = h + "px";
  }
  renderer.setSize(w, Math.max(1, h), false);
  camera.aspect = w / Math.max(1, h);
  camera.updateProjectionMatrix();
}

function animate() {
  animId = requestAnimationFrame(animate);
  if (controls) controls.update();
  if (renderer && scene && camera) renderer.render(scene, camera);
}

function disposeEngine() {
  if (animId) cancelAnimationFrame(animId);
  animId = null;
  clearRecallTimer();
  detachRecallPointer();
  clearActiveMeshes();
  clearStagingMeshes();
  clearRecallWrongMeshes();
  dragState = null;
  floorTiles = [];
  boardThemePrefs = null;
  boardThemeTextures = { light: null, dark: null };
  if (studioEnvHandle) {
    studioEnvHandle.dispose();
    studioEnvHandle = null;
  }
  disposeEnvironment();
  if (renderer) {
    detachRecallPointer();
    renderer.dispose();
    if (host) host.innerHTML = "";
  }
  renderer = null;
  scene = null;
  camera = null;
  controls = null;
  session = null;
}

function ensureEngine() {
  /* Rebuild if disposed mid-session (e.g. Start Again after results) left renderer/scene inconsistent. */
  if (renderer && scene && camera) return true;
  if (renderer && !scene) {
    try {
      renderer.dispose();
    } catch (_) { /* ignore */ }
    renderer = null;
  }
  host = ensureCanvasHost();
  if (!host) return false;
  host.hidden = false;
  host.removeAttribute("hidden");
  buildScene();
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.86;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  host.appendChild(renderer.domElement);
  initEnvironment();
  // Shared Chess studio backdrop (nebula / user blob prefs) — keep spatial lights as-is.
  if (studioEnvHandle) studioEnvHandle.dispose();
  studioEnvHandle = attachWtdStudioEnvironment(renderer, scene, {
    lights: false,
    skipPmrem: true,
    flatBackground: true
  });
  syncImmersiveStudioBackdrop();
  applyStudioBoardToGrid();
  ensureStudioSettingsSynced().then((r) => {
    if (r && r.ok && r.loaded && renderer && scene) {
      if (studioEnvHandle) studioEnvHandle.dispose();
      studioEnvHandle = attachWtdStudioEnvironment(renderer, scene, {
        lights: false,
        skipPmrem: true,
        flatBackground: true
      });
      syncImmersiveStudioBackdrop();
      applyStudioBoardToGrid();
    }
  });
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.minPolarAngle = 0.22;
  controls.maxPolarAngle = Math.PI / 2.35;
  controls.minDistance = 6;
  controls.maxDistance = 16;
  controls.target.set(0, GRID_FLOOR_Y + 0.28, 0);
  window.addEventListener("resize", resize);
  resize();
  animate();
  return true;
}

async function submitRun(timeMs, accuracyPct, wrongAttempts) {
  const entry = {
    player: playerName(),
    levelId: LEVEL_ID,
    timeMs: Math.round(timeMs),
    points: scoreForRun(timeMs, accuracyPct, wrongAttempts),
    accuracyPct: Math.round(accuracyPct),
    at: new Date().toISOString()
  };
  if (window.AppgenWtd && typeof window.AppgenWtd.submitRun === "function") {
    await window.AppgenWtd.submitRun(entry);
  }
}

function formatMs(ms) {
  return (ms / 1000).toFixed(2) + "s";
}

function clearRecallTimer() {
  if (!session || session.recallTimerId == null) return;
  clearInterval(session.recallTimerId);
  session.recallTimerId = null;
}

function detachRecallPointer() {
  if (!renderer) return;
  const el = renderer.domElement;
  if (boundPointerDown) el.removeEventListener("pointerdown", boundPointerDown);
  if (boundPointerMove) el.removeEventListener("pointermove", boundPointerMove);
  if (boundPointerUp) {
    el.removeEventListener("pointerup", boundPointerUp);
    el.removeEventListener("pointercancel", boundPointerUp);
  }
  boundPointerDown = null;
  boundPointerMove = null;
  boundPointerUp = null;
}

function attachRecallPointer() {
  if (!renderer) return;
  detachRecallPointer();
  const el = renderer.domElement;
  boundPointerDown = (ev) => onRecallPointerDown(ev);
  boundPointerMove = (ev) => onRecallPointerMove(ev);
  boundPointerUp = (ev) => onRecallPointerUp(ev);
  el.addEventListener("pointerdown", boundPointerDown);
  el.addEventListener("pointermove", boundPointerMove);
  el.addEventListener("pointerup", boundPointerUp);
  el.addEventListener("pointercancel", boundPointerUp);
}

function snapDragMeshToOrigin(mesh) {
  if (!mesh || !mesh.userData.origin) return;
  mesh.position.copy(mesh.userData.origin);
  mesh.scale.setScalar(1);
}

function endDrag(returnToOrigin) {
  if (!dragState) return;
  const { mesh } = dragState;
  if (returnToOrigin) snapDragMeshToOrigin(mesh);
  dragState = null;
  if (controls) controls.enabled = true;
}

function lockMeshAsCorrect(def, gx, gz, mesh) {
  if (mesh) {
    if (dragState && dragState.mesh === mesh) {
      dragState = null;
      if (controls) controls.enabled = true;
    }
    unlinkStagingMesh(mesh);
    removeRecallWrongMesh(mesh);
    placeMeshOnGrid(mesh, gx, gz);
    mesh.userData = { defId: def.id, gx, gz, type: "object" };
    mesh.material = mesh.material.clone();
    mesh.material.emissive.setHex(0x228844);
    mesh.material.emissiveIntensity = 0.65;
    activeMeshes.push(mesh);
    return;
  }
  removeStagingMeshForDef(def.id);
  const ghost = spawnObject(def, gx, gz);
  if (ghost) {
    ghost.material = ghost.material.clone();
    ghost.material.emissive.setHex(0x228844);
    ghost.material.emissiveIntensity = 0.65;
  }
}

function commitPlacement(def, gx, gz) {
  if (!session || session.placements.some((p) => p.defId === def.id)) return;

  const correct = def.gx === gx && def.gz === gz;
  const mesh =
    dragState && dragState.def && dragState.def.id === def.id
      ? dragState.mesh
      : meshForDefId(def.id);

  if (!correct) {
    session.wrongAttempts = (session.wrongAttempts || 0) + 1;
    session.totalTargets += 1;
    flashTileFeedback(gx, gz, false);
    if (mesh) markMeshAsWrongOnGrid(mesh, gx, gz);
    if (dragState && dragState.def && dragState.def.id === def.id) {
      dragState = null;
      if (controls) controls.enabled = true;
    }
    setControls(
      '<p class="wtd-3d-phase">Not that tile — the shape stays where you put it; drag it to another tile. Each miss costs <strong>' +
        WRONG_PLACEMENT_PENALTY +
        "</strong> Dragon Points (see accuracy).</p>"
    );
    setPendingDef(def);
    return;
  }

  session.totalTargets += 1;
  session.totalCorrect += 1;
  session.placements.push({ defId: def.id, gx, gz, correct: true });

  lockMeshAsCorrect(def, gx, gz, mesh);
  flashTileFeedback(gx, gz, true);

  const placedEl = $("wtd3dPlaced");
  if (placedEl) placedEl.textContent = String(session.placements.length);

  if (session.placements.length >= session.targets.length) {
    setPendingDef(null);
    detachRecallPointer();
    clearRecallTimer();
    session.roundsCompleted += 1;
    savePeakLevel(session.level);
    session.peakLevelThisSession = Math.max(session.peakLevelThisSession, session.level);
    if (session.level >= MAX_LEVEL) {
      setControls('<p class="wtd-3d-phase">Level 3 cleared — session complete!</p>');
      setTimeout(() => finishSession(), 1400);
      return;
    }
    session.level += 1;
    const nextObjects = objectsForLevel(session.level);
    setControls(
      '<p class="wtd-3d-phase">Level up! Next round: <strong>' + nextObjects + "</strong> objects.</p>"
    );
    setTimeout(() => runTrial(), 1400);
  } else {
    setPendingDef(nextUnplacedTarget());
  }
}

function prepareSessionChrome() {
  hudEl = $("wtd3dHud");
  controlsEl = $("wtd3dControls");
  host = ensureCanvasHost();
  if (hudEl) {
    hudEl.hidden = false;
    hudEl.removeAttribute("hidden");
  }
  if (host) {
    host.hidden = false;
    host.removeAttribute("hidden");
  }
  const mount = $("wtdSessionModalMount");
  if (mount) {
    mount.classList.remove("layout-3d-results");
    mount.classList.add("layout-3d");
  }
}

function openSessionModal() {
  if (window.AppgenWtdSessionModal) {
    window.AppgenWtdSessionModal.open({
      title: "3D Spatial Memory Lab",
      layout: "3d",
      nodeIds: ["wtd3dPlay"],
      onRestart: () => restartSession(),
      onExit: () => {
        disposeEngine();
        showIntro();
      }
    });
  }
  prepareSessionChrome();
}

function resetSessionState() {
  clearRecallTimer();
  detachRecallPointer();
  dragState = null;
  if (!ensureEngine()) return false;
  clearActiveMeshes();
  clearStagingMeshes();
  clearRecallWrongMeshes();
  resetAllTilesToBase();
  const mount = $("wtdSessionModalMount");
  if (mount) mount.classList.remove("layout-3d-results");
  session = {
    level: 1,
    peakLevelThisSession: 1,
    startedAt: performance.now(),
    recallStartedAt: null,
    totalTargets: 0,
    totalCorrect: 0,
    roundsCompleted: 0,
    wrongAttempts: 0,
    phase: "idle"
  };
  return true;
}

/** Abandon current attempt (no leaderboard submit) and start level 1 again. */
function restartSession() {
  prepareSessionChrome();
  if (!resetSessionState()) return;
  runTrial();
  window.requestAnimationFrame(() => resize());
}

function startSession() {
  openSessionModal();
  if (!resetSessionState()) return;
  runTrial();
  window.requestAnimationFrame(() => resize());
}

function runTrial() {
  if (!session) return;
  if (!scene && !ensureEngine()) return;
  const objectCount = objectsForLevel(session.level);
  const trial = { objects: objectCount, encodeMs: encodeMsForObjectCount(objectCount) };

  session.phase = "encode";
  session.currentTrial = trial;
  session.placements = [];
  session.targets = [];
  session.recallStartedAt = null;
  clearRecallTimer();
  dragState = null;

  clearActiveMeshes();
  clearStagingMeshes();
  clearRecallWrongMeshes();
  resetAllTilesToBase();
  const cells = pickRandomCells(trial.objects);
  const usedShapes = new Set();
  const trialColors = pickDistinctColors(cells.length);
  cells.forEach((cell, i) => {
    let shapeIdx = Math.floor(Math.random() * SHAPES.length);
    while (usedShapes.has(shapeIdx) && usedShapes.size < SHAPES.length) {
      shapeIdx = Math.floor(Math.random() * SHAPES.length);
    }
    usedShapes.add(shapeIdx);
    const color = trialColors[i];
    const def = {
      id: "L" + session.level + "-" + i,
      seq: i,
      shapeIdx,
      shapeName: SHAPES[shapeIdx].name,
      color,
      colorCss: colorToCss(color),
      gx: cell.gx,
      gz: cell.gz
    };
    session.targets.push(def);
    spawnObject(def, cell.gx, cell.gz);
  });

  controls.enabled = true;
  setHud(
    "<p><strong>Level " +
      session.level +
      "</strong> — Encoding: study object locations on the workspace (hippocampal object–location binding).</p>" +
      "<p class=\"wtd-3d-metric\">Objects: " +
      trial.objects +
      (session.level >= MAX_LEVEL ? " (final level)" : "") +
      " · Session accuracy: " +
      sessionAccuracy() +
      "% · Place every object correctly to level up (+1 object, " +
      MAX_LEVEL +
      " levels total). Wrong tiles cost Dragon Points but you can retry.</p>"
  );
  setControls("<p class=\"wtd-3d-phase\">Memorise… scene hides in " + (trial.encodeMs / 1000).toFixed(1) + "s</p>");

  setTimeout(() => beginRecall(), trial.encodeMs);
}

function sessionAccuracy() {
  if (!session.totalTargets) return 100;
  return Math.round((session.totalCorrect / session.totalTargets) * 100);
}

function beginRecall() {
  if (!session) return;
  clearRecallTimer();
  session.phase = "recall";
  session.recallStartedAt = performance.now();
  session.pendingDef = null;
  dragState = null;
  clearActiveMeshes();
  clearRecallWrongMeshes();
  buildStagingDock();

  if (controls) {
    controls.enabled = true;
    controls.target.set(0, GRID_FLOOR_Y + 0.35, 0.55);
  }

  setHud(
    "<p><strong>Level " +
      session.level +
      " · Recall phase</strong> — Pick up shapes from the <strong>front dock</strong> (below the grid) or from a tile where you placed one incorrectly, and drop on the tile where each object appeared. " +
      "On touch: tap a shape, then tap a tile. <em>Wrong drops stay on the grid (−" +
      WRONG_PLACEMENT_PENALTY +
      " Dragon Points each, capped); drag again until each shape is on the right tile.</em></p>" +
      "<p class=\"wtd-3d-metric\">Placed: <span id=\"wtd3dPlaced\">0</span> / " +
      session.targets.length +
      " · Recall timer: <span id=\"wtd3dRecallTimer\">0.0s</span></p>"
  );
  setControls(
    '<p class="wtd-3d-phase">Drag from the dock (or from a misplaced shape on the grid) — orbit view with empty space.</p>'
  );
  setPendingDef(nextUnplacedTarget());

  const recallTimerId = setInterval(() => {
    if (!session || !session.recallStartedAt) {
      clearInterval(recallTimerId);
      return;
    }
    const el = $("wtd3dRecallTimer");
    if (el) {
      el.textContent = formatMs(performance.now() - session.recallStartedAt);
    }
  }, 100);
  session.recallTimerId = recallTimerId;

  attachRecallPointer();
}

function onRecallPointerDown(ev) {
  if (!session || session.phase !== "recall") return;
  if (typeof ev.button === "number" && ev.button !== 0) return;

  updatePointerFromEvent(ev);
  const stagingHit = raycastStagingMesh();
  const recallWrongHit = stagingHit ? null : raycastRecallWrongMesh();
  const pickMesh = stagingHit || recallWrongHit;
  if (pickMesh) {
    const def = session.targets.find((t) => t.id === pickMesh.userData.defId);
    if (!def || session.placements.some((p) => p.defId === def.id)) return;
    if (recallWrongHit) {
      resetTileToBase(recallWrongHit.userData.gx, recallWrongHit.userData.gz, recallWrongHit);
    }
    dragState = {
      def,
      mesh: pickMesh,
      origin: recallWrongHit
        ? pickMesh.position.clone()
        : pickMesh.userData.origin.clone(),
      pointerId: ev.pointerId,
      moved: false,
      startX: ev.clientX,
      startY: ev.clientY
    };
    setPendingDef(def);
    if (controls) controls.enabled = false;
    try {
      renderer.domElement.setPointerCapture(ev.pointerId);
    } catch (_) { /* ignore */ }
    ev.preventDefault();
    return;
  }

  if (session.pendingDef && !dragState) {
    const tile = raycastFloorTile();
    if (tile) {
      commitPlacement(session.pendingDef, tile.userData.gx, tile.userData.gz);
      ev.preventDefault();
    }
  }
}

function onRecallPointerMove(ev) {
  if (!dragState || ev.pointerId !== dragState.pointerId) return;
  const dx = ev.clientX - dragState.startX;
  const dy = ev.clientY - dragState.startY;
  if (dx * dx + dy * dy > 64) dragState.moved = true;

  updatePointerFromEvent(ev);
  if (raycaster.ray.intersectPlane(DRAG_PLANE, DRAG_HIT)) {
    dragState.mesh.position.copy(DRAG_HIT);
    dragState.mesh.position.y = OBJECT_REST_Y + 0.13;
  }
  ev.preventDefault();
}

function onRecallPointerUp(ev) {
  if (!session || session.phase !== "recall") return;
  if (!dragState || ev.pointerId !== dragState.pointerId) return;

  updatePointerFromEvent(ev);
  const tile = raycastFloorTile();
  const def = dragState.def;

  if (tile && def && !session.placements.some((p) => p.defId === def.id)) {
    commitPlacement(def, tile.userData.gx, tile.userData.gz);
    if (dragState) {
      dragState = null;
      if (controls) controls.enabled = true;
    }
  } else {
    const fromDock = dragState.mesh && dragState.mesh.userData.type === "staging";
    endDrag(fromDock);
  }

  try {
    renderer.domElement.releasePointerCapture(ev.pointerId);
  } catch (_) { /* ignore */ }
  ev.preventDefault();
}

function trialObjectsCount() {
  if (!session || !session.currentTrial) return START_OBJECTS;
  return session.currentTrial.objects;
}

function finishSession() {
  clearRecallTimer();
  detachRecallPointer();
  dragState = null;
  if (!session) return;
  session.phase = "done";
  const timeMs = performance.now() - session.startedAt;
  const accuracyPct = session.totalTargets
    ? (session.totalCorrect / session.totalTargets) * 100
    : 0;
  const wrongAttempts = session.wrongAttempts || 0;
  const rawPoints = scoreForRun(timeMs, accuracyPct, 0);
  const points = scoreForRun(timeMs, accuracyPct, wrongAttempts);
  const pointsLost = rawPoints - points;
  const eff = Math.round(accuracyPct * (1000 / Math.max(timeMs, 1000)));

  /* Keep Three.js engine alive — only clear placed meshes so Start Again works. */
  clearActiveMeshes();
  clearStagingMeshes();
  clearRecallWrongMeshes();
  resetAllTilesToBase();
  hudEl = $("wtd3dHud");
  controlsEl = $("wtd3dControls");
  host = ensureCanvasHost();
  if (hudEl) {
    hudEl.hidden = false;
    hudEl.removeAttribute("hidden");
  }
  if (host) {
    host.hidden = false;
    host.removeAttribute("hidden");
  }
  const mount = $("wtdSessionModalMount");
  if (mount) mount.classList.remove("layout-3d-results");

  setHud(
    '<div class="wtd-3d-result">' +
      "<h3>Session complete — Spatial Memory Lab</h3>" +
      '<p class="wtd-points">+' +
      points +
      " Dragon Points</p>" +
      (pointsLost > 0
        ? '<p class="wtd-3d-metric">Retry penalty: <strong>−' +
          pointsLost +
          "</strong> (" +
          wrongAttempts +
          " wrong tile" +
          (wrongAttempts === 1 ? "" : "s") +
          " × " +
          WRONG_PLACEMENT_PENALTY +
          ", score floor 100)</p>"
        : "") +
      "<p>Time: <strong>" +
      formatMs(timeMs) +
      "</strong> · Recall accuracy: <strong>" +
      Math.round(accuracyPct) +
      "%</strong> · Peak level: <strong>" +
      (session.peakLevelThisSession || 1) +
      "</strong> (" +
      objectsForLevel(session.peakLevelThisSession || 1) +
      " objects)</p>" +
      '<p class="wtd-3d-eff">Workforce efficiency index (demo): <strong>' +
      eff +
      "</strong> — higher when accurate recall meets shorter total time.</p>" +
      '<p class="wtd-3d-metric">Method: visuospatial encoding → delayed object–location recall (supported in cognitive training literature for working memory and episodic binding).</p>' +
      '<div class="wtd-3d-start-center"><button type="button" class="btn big" id="wtd3dAgain">Start Again</button></div>' +
      "</div>"
  );
  setControls("");
  submitRun(timeMs, accuracyPct, wrongAttempts);
}

function showIntro() {
  hudEl = $("wtd3dHud");
  controlsEl = $("wtd3dControls");
  host = ensureCanvasHost();
  if (hudEl) {
    hudEl.hidden = false;
    hudEl.removeAttribute("hidden");
  }
  if (host) {
    host.hidden = false;
    host.removeAttribute("hidden");
  }
  const peak = loadProgress().peakLevel;
  setHud(
    "<h3>3D Spatial Memory Lab</h3>" +
      "<p>Objects appear on a virtual workspace. Memorise <em>what</em> and <em>where</em>, then drag shapes from the in-scene dock onto the grid (or tap shape → tap tile on mobile).</p>" +
      "<p>Progressive difficulty: start with <strong>" +
      START_OBJECTS +
      "</strong> shapes across <strong>" +
      MAX_LEVEL +
      " levels</strong> — get every placement correct to <strong>level up</strong> (+1 shape per level). Wrong tile drops cost <strong>" +
      WRONG_PLACEMENT_PENALTY +
      " Dragon Points</strong> each (you can reposition until correct).</p>" +
      (peak > 0
        ? '<p class="wtd-3d-metric">Personal best level: <strong>' + peak + "</strong>.</p>"
        : "") +
      '<p class="wtd-3d-metric">Tracked: total time, recall accuracy, efficiency index → cloud leaderboard (<code>spatial3d</code>).</p>' +
      '<div class="wtd-3d-start-center"><button type="button" class="btn big" id="wtd3dStart">Start 3D session</button></div>'
  );
  setControls("");
}

/** Cancels a pending auto-start from a prior init() if mode closes / re-enters. */
let autoStartTimer = 0;
/** Bumps each init(); scheduled auto-start only runs for the latest visit token. */
let autoStartVisitToken = 0;

/**
 * One auto-start per 3d mode entry (Cognitive Training / 3d tab).
 * Keeps #wtd3dStart as fallback if auto-start does not run or fails.
 * Exit → showIntro() does not re-auto-start (manual Start / Again only).
 */
function scheduleAutoStartSession() {
  if (autoStartTimer) {
    clearTimeout(autoStartTimer);
    autoStartTimer = 0;
  }
  const visitToken = ++autoStartVisitToken;
  autoStartTimer = setTimeout(() => {
    autoStartTimer = 0;
    if (visitToken !== autoStartVisitToken) return;
    /* Still on intro chrome — skip if user already started or UI moved on. */
    if (!document.getElementById("wtd3dStart")) return;
    startSession();
  }, 0);
}

function init() {
  hudEl = $("wtd3dHud");
  controlsEl = $("wtd3dControls");
  /* Document delegation survives modal re-parenting of #wtd3dControls. */
  if (!document.documentElement.dataset.wtd3dDelegated) {
    document.documentElement.dataset.wtd3dDelegated = "1";
    document.addEventListener("click", (e) => {
      if (e.target.closest("#wtd3dStart, #wtd3dAgain")) {
        e.preventDefault();
        startSession();
      }
    });
  }
  showIntro();
  scheduleAutoStartSession();
}

function onClose() {
  if (autoStartTimer) {
    clearTimeout(autoStartTimer);
    autoStartTimer = 0;
  }
  autoStartVisitToken += 1;
  if (window.AppgenWtdSessionModal) window.AppgenWtdSessionModal.close(true);
  disposeEngine();
  window.removeEventListener("resize", resize);
}

window.AppgenWtd3d = { init, onClose, dispose: onClose };
