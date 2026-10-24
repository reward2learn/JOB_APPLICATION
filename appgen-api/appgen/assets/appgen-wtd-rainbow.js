/**
 * WTD Rainbow 3D Builder — Three.js + cannon-es physics.
 * Select / drag / drop spectrum blocks; stack or line them in ROYGBIV order.
 */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import * as CANNON from "cannon-es";
import {
  attachWtdStudioEnvironment,
  ensureStudioSettingsSynced
} from "./appgen-wtd-studio.js";

const LEVEL_ID = "rainbow3d";

const SPECTRUM = [
  { name: "Red", hex: 0xe74c3c, order: 0 },
  { name: "Orange", hex: 0xe67e22, order: 1 },
  { name: "Yellow", hex: 0xf1c40f, order: 2 },
  { name: "Green", hex: 0x27ae60, order: 3 },
  { name: "Blue", hex: 0x2980b9, order: 4 },
  { name: "Indigo", hex: 0x5b2c6f, order: 5 },
  { name: "Violet", hex: 0x9b59b6, order: 6 }
];

const BOX = 0.55;

let host = null;
let hudEl = null;
let controlsEl = null;
let renderer = null;
let scene = null;
let camera = null;
let controls = null;
let world = null;
let animId = null;
let blocks = [];
let raycaster = null;
let pointer = null;
let drag = null;
let session = null;
let completed = false;
let boundDown = null;
let boundMove = null;
let boundUp = null;

function $(id) {
  return document.getElementById(id);
}

function playerName() {
  if (window.AppgenAuth && typeof window.AppgenAuth.preferredPlayerName === "function") {
    const n = window.AppgenAuth.preferredPlayerName();
    if (n) return n;
  }
  if (window.AppgenWtd && typeof window.AppgenWtd.getPlayerName === "function") {
    return window.AppgenWtd.getPlayerName();
  }
  const inp = $("wtdPlayerName");
  return (inp && inp.value.trim()) || "Anonymous";
}

function scoreForRun(timeMs, accuracyPct) {
  const base = 700;
  const timeBonus = Math.max(0, Math.floor(1000 - timeMs / 90));
  const accBonus = Math.floor((accuracyPct / 100) * 450);
  return base + timeBonus + accBonus;
}

function setHud(html) {
  if (hudEl) hudEl.innerHTML = html;
}

function setControls(html) {
  if (controlsEl) controlsEl.innerHTML = html;
}

function disposeBlocks() {
  blocks.forEach((b) => {
    if (scene && b.mesh) {
      scene.remove(b.mesh);
      b.mesh.geometry.dispose();
      b.mesh.material.dispose();
    }
    if (world && b.body) world.removeBody(b.body);
  });
  blocks = [];
}

function buildScene() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xeef2f4);
  scene.fog = new THREE.Fog(0xeef2f4, 18, 36);

  camera = new THREE.PerspectiveCamera(50, 1, 0.1, 80);
  camera.position.set(4.5, 6.2, 9.5);

  const hemi = new THREE.HemisphereLight(0xffffff, 0x556677, 0.95);
  scene.add(hemi);
  const dir = new THREE.DirectionalLight(0xffffff, 0.7);
  dir.position.set(5, 12, 4);
  scene.add(dir);

  const floorGeo = new THREE.BoxGeometry(12, 0.2, 8);
  const floorMat = new THREE.MeshStandardMaterial({ color: 0xc5d0d6, roughness: 0.9 });
  const floorMesh = new THREE.Mesh(floorGeo, floorMat);
  floorMesh.position.y = -0.1;
  scene.add(floorMesh);

  const railMat = new THREE.MeshStandardMaterial({ color: 0x9aadb8, roughness: 1 });
  [-4, 4].forEach((z) => {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(12, 0.35, 0.15), railMat);
    rail.position.set(0, 0.1, z);
    scene.add(rail);
  });

  /* Slightly snappier fall for demo feeling */
  world = new CANNON.World({ gravity: new CANNON.Vec3(0, -14.5, 0) });
  world.broadphase = new CANNON.NaiveBroadphase();
  world.allowSleep = true;

  const groundBody = new CANNON.Body({
    type: CANNON.Body.STATIC,
    shape: new CANNON.Box(new CANNON.Vec3(6, 0.1, 4))
  });
  groundBody.position.set(0, -0.1, 0);
  world.addBody(groundBody);

  // Soft walls so blocks stay on the table
  [
    { x: 0, z: -4.1, sx: 6, sz: 0.15 },
    { x: 0, z: 4.1, sx: 6, sz: 0.15 },
    { x: -6.1, z: 0, sx: 0.15, sz: 4 },
    { x: 6.1, z: 0, sx: 0.15, sz: 4 }
  ].forEach((w) => {
    const body = new CANNON.Body({
      type: CANNON.Body.STATIC,
      shape: new CANNON.Box(new CANNON.Vec3(w.sx, 1.2, w.sz))
    });
    body.position.set(w.x, 1, w.z);
    world.addBody(body);
  });

  /* Entry ramp (~25°) — random drops tumble downslope into the play area */
  const rampAngle = -0.48;
  const rampBody = new CANNON.Body({
    type: CANNON.Body.STATIC,
    shape: new CANNON.Box(new CANNON.Vec3(2.6, 0.12, 3.6))
  });
  rampBody.quaternion.setFromEuler(0, 0, rampAngle);
  rampBody.position.set(-4.0, 1.35, 0);
  world.addBody(rampBody);

  const rampMesh = new THREE.Mesh(
    new THREE.BoxGeometry(5.2, 0.24, 7.2),
    new THREE.MeshStandardMaterial({ color: 0xa8b8c0, roughness: 0.82, metalness: 0.05 })
  );
  rampMesh.rotation.z = rampAngle;
  rampMesh.position.set(-4.0, 1.35, 0);
  scene.add(rampMesh);

  raycaster = new THREE.Raycaster();
  pointer = new THREE.Vector2();
}

function spawnSpectrum() {
  disposeBlocks();
  /* Alternate which side is “uphill” so each respawn feels different */
  const slopeSign = Math.random() < 0.5 ? 1 : -1;
  const useXSlope = Math.random() < 0.65;

  SPECTRUM.forEach((spec, i) => {
    const geo = new THREE.BoxGeometry(BOX, BOX, BOX);
    const mat = new THREE.MeshStandardMaterial({
      color: spec.hex,
      metalness: 0.12,
      roughness: 0.4,
      emissive: new THREE.Color(spec.hex).multiplyScalar(0.12)
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.userData = { type: "block", order: spec.order, name: spec.name };

    let x;
    let y;
    let z;
    if (useXSlope) {
      /* High on the ramp / table edge, then cascade toward centre */
      x = slopeSign * (3.2 + Math.random() * 2.2) + (Math.random() - 0.5) * 0.6;
      z = (i - 3) * 0.65 + (Math.random() - 0.5) * 1.8;
      y = 3.4 + Math.random() * 2.8 + Math.abs(x) * 0.12;
    } else {
      z = slopeSign * (2.0 + Math.random() * 1.6);
      x = (i - 3) * 0.75 + (Math.random() - 0.5) * 2.0;
      y = 3.6 + Math.random() * 2.6;
    }
    mesh.position.set(x, y, z);

    const body = new CANNON.Body({
      mass: 1.35,
      shape: new CANNON.Box(new CANNON.Vec3(BOX / 2, BOX / 2, BOX / 2)),
      linearDamping: 0.06,
      angularDamping: 0.1
    });
    body.position.set(x, y, z);

    const q = new CANNON.Quaternion();
    q.setFromEuler(
      (Math.random() - 0.5) * Math.PI * 1.4,
      Math.random() * Math.PI * 2,
      (Math.random() - 0.5) * Math.PI * 1.4
    );
    body.quaternion.copy(q);
    mesh.quaternion.copy(mesh.quaternion.set(q.x, q.y, q.z, q.w));

    const downX = useXSlope ? -slopeSign * (5.5 + Math.random() * 6.5) : (Math.random() - 0.5) * 4;
    const downZ = useXSlope ? (Math.random() - 0.5) * 4.5 : -slopeSign * (4.5 + Math.random() * 5.5);
    body.velocity.set(downX, -2.5 - Math.random() * 4, downZ);
    body.angularVelocity.set(
      (Math.random() - 0.5) * 14,
      (Math.random() - 0.5) * 14,
      (Math.random() - 0.5) * 14
    );

    world.addBody(body);
    scene.add(mesh);
    blocks.push({ mesh, body, order: spec.order, name: spec.name, hex: spec.hex });
  });
}

function ensureCanvasHost() {
  let el = $("wtdRainbowCanvasHost");
  if (el) return el;
  const play = $("wtdRainbowPlay");
  if (!play) return null;
  el = document.createElement("div");
  el.id = "wtdRainbowCanvasHost";
  el.className = "wtd-3d-canvas-host";
  el.setAttribute("aria-label", "Rainbow physics workspace");
  const controls = $("wtdRainbowControls");
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
    h = Math.max(340, Math.min(540, w * 0.64));
    host.style.height = h + "px";
  }
  renderer.setSize(w, Math.max(1, h), false);
  camera.aspect = w / Math.max(1, h);
  camera.updateProjectionMatrix();
}

function syncMeshes() {
  blocks.forEach((b) => {
    b.mesh.position.copy(b.body.position);
    b.mesh.quaternion.copy(b.body.quaternion);
  });
}

function animate() {
  animId = requestAnimationFrame(animate);
  if (world) world.step(1 / 60);
  syncMeshes();
  if (controls) controls.update();
  if (renderer && scene && camera) renderer.render(scene, camera);
  if (session && session.phase === "play" && !completed) {
    const timer = $("wtdRainbowTimer");
    if (timer) timer.textContent = formatMs(performance.now() - session.startedAt);
  }
}

function formatMs(ms) {
  return (ms / 1000).toFixed(2) + "s";
}

function setPointerFromEvent(ev) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
}

function onPointerDown(ev) {
  if (!session || session.phase !== "play" || completed) return;
  setPointerFromEvent(ev);
  raycaster.setFromCamera(pointer, camera);
  const meshes = blocks.map((b) => b.mesh);
  const hits = raycaster.intersectObjects(meshes, false);
  if (!hits.length) return;
  const mesh = hits[0].object;
  const block = blocks.find((b) => b.mesh === mesh);
  if (!block) return;

  drag = {
    block,
    grabY: Math.max(0.4, block.body.position.y)
  };
  block.body.velocity.set(0, 0, 0);
  block.body.angularVelocity.set(0, 0, 0);
  block.body.mass = 0;
  block.body.updateMassProperties();
  block.body.wakeUp();
  if (controls) controls.enabled = false;
  blocks.forEach((b) => {
    const factor = b === block ? 0.35 : 0.12;
    b.mesh.material.emissive.copy(new THREE.Color(b.hex).multiplyScalar(factor));
  });
  ev.preventDefault();
}

function onPointerMove(ev) {
  if (!drag) return;
  setPointerFromEvent(ev);
  raycaster.setFromCamera(pointer, camera);
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -drag.grabY);
  const hit = new THREE.Vector3();
  if (!raycaster.ray.intersectPlane(plane, hit)) return;
  hit.x = Math.max(-5.2, Math.min(5.2, hit.x));
  hit.z = Math.max(-3.4, Math.min(3.4, hit.z));
  drag.block.body.position.set(hit.x, drag.grabY, hit.z);
  drag.block.body.velocity.set(0, 0, 0);
  drag.block.body.angularVelocity.set(0, 0, 0);
  ev.preventDefault();
}

function onPointerUp() {
  if (!drag) return;
  const block = drag.block;
  block.body.mass = 1.2;
  block.body.updateMassProperties();
  block.body.wakeUp();
  blocks.forEach((b) => {
    b.mesh.material.emissive.copy(new THREE.Color(b.hex).multiplyScalar(0.12));
  });
  drag = null;
  if (controls) controls.enabled = true;
  setTimeout(() => maybeAutoCheck(), 700);
}

function orderAccuracy() {
  const resting = blocks.slice().sort((a, b) => a.body.position.x - b.body.position.x);
  let correct = 0;
  for (let i = 0; i < resting.length; i++) {
    if (resting[i].order === i) correct += 1;
  }
  return {
    correct,
    total: resting.length,
    pct: Math.round((correct / resting.length) * 100),
    ordered: resting.map((b) => b.name)
  };
}

function maybeAutoCheck() {
  if (!session || session.phase !== "play" || completed) return;
  const acc = orderAccuracy();
  if (acc.pct === 100) finishSession(acc);
}

function checkOrder() {
  if (!session || session.phase !== "play" || completed) return;
  const acc = orderAccuracy();
  const strip =
    '<div class="wtd-rainbow-strip" aria-hidden="true">' +
    SPECTRUM.map((s) => '<span style="background:#' + s.hex.toString(16).padStart(6, "0") + '"></span>').join("") +
    "</div>";
  setHud(
    "<p><strong>Spectrum check</strong> — left→right order: " +
      acc.ordered.join(" · ") +
      "</p>" +
      "<p class=\"wtd-3d-metric\">Match: <strong>" +
      acc.correct +
      "/" +
      acc.total +
      "</strong> (" +
      acc.pct +
      "%). Goal: Red → Orange → Yellow → Green → Blue → Indigo → Violet.</p>" +
      strip +
      (acc.pct === 100
        ? ""
        : "<p class=\"wtd-3d-metric\">Keep dragging blocks; gravity will settle stacks. Press <em>Check order</em> again when ready.</p>")
  );
  if (acc.pct === 100) finishSession(acc);
}

async function submitRun(timeMs, accuracyPct) {
  const entry = {
    player: playerName(),
    levelId: LEVEL_ID,
    timeMs: Math.round(timeMs),
    points: scoreForRun(timeMs, accuracyPct),
    accuracyPct: Math.round(accuracyPct),
    at: new Date().toISOString()
  };
  if (window.AppgenWtd && typeof window.AppgenWtd.submitRun === "function") {
    await window.AppgenWtd.submitRun(entry);
  }
}

function finishSession(acc) {
  completed = true;
  if (session) session.phase = "done";
  const timeMs = performance.now() - (session && session.startedAt ? session.startedAt : performance.now());
  const points = scoreForRun(timeMs, acc.pct);
  /* Keep engine alive — blocks stay visible; Start Again respawns via startSession. */
  hudEl = $("wtdRainbowHud");
  controlsEl = $("wtdRainbowControls");
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
      "<h3>Rainbow complete</h3>" +
      '<p class="wtd-points">+' +
      points +
      " Dragon Points</p>" +
      "<p>Time: <strong>" +
      formatMs(timeMs) +
      "</strong> · Spectrum order: <strong>" +
      acc.pct +
      "%</strong></p>" +
      '<p class="wtd-3d-metric">Physics drop + hue sequencing — playable demo of spatial planning under gravity (level <code>rainbow3d</code>).</p>' +
      "</div>"
  );
  setControls('<button type="button" class="btn big" id="wtdRainbowAgain">Start Again</button>');
  submitRun(timeMs, acc.pct);
}

function bindPointer() {
  unbindPointer();
  if (!renderer) return;
  boundDown = (e) => onPointerDown(e);
  boundMove = (e) => onPointerMove(e);
  boundUp = () => onPointerUp();
  renderer.domElement.addEventListener("pointerdown", boundDown);
  window.addEventListener("pointermove", boundMove);
  window.addEventListener("pointerup", boundUp);
  window.addEventListener("pointercancel", boundUp);
}

function unbindPointer() {
  if (renderer && boundDown) renderer.domElement.removeEventListener("pointerdown", boundDown);
  if (boundMove) window.removeEventListener("pointermove", boundMove);
  if (boundUp) {
    window.removeEventListener("pointerup", boundUp);
    window.removeEventListener("pointercancel", boundUp);
  }
  boundDown = boundMove = boundUp = null;
}

function disposeEngine() {
  if (animId) cancelAnimationFrame(animId);
  animId = null;
  unbindPointer();
  disposeBlocks();
  drag = null;
  session = null;
  completed = false;
  if (world) {
    world.bodies.slice().forEach((b) => world.removeBody(b));
  }
  world = null;
  if (renderer) {
    renderer.dispose();
    if (host) host.innerHTML = "";
  }
  renderer = null;
  scene = null;
  camera = null;
  controls = null;
}

function ensureEngine() {
  if (renderer && scene && camera && world) return true;
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
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  host.appendChild(renderer.domElement);
  // Shared Chess studio backdrop defaults / cloud blob prefs.
  let studioBg = attachWtdStudioEnvironment(renderer, scene, { lights: false, skipPmrem: true });
  ensureStudioSettingsSynced().then((r) => {
    if (r && r.ok && r.loaded && renderer && scene) {
      if (studioBg) studioBg.dispose();
      studioBg = attachWtdStudioEnvironment(renderer, scene, { lights: false, skipPmrem: true });
    }
  });
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI / 2.05;
  controls.minDistance = 5;
  controls.maxDistance = 18;
  controls.target.set(0, 0.6, 0);
  window.addEventListener("resize", resize);
  resize();
  bindPointer();
  animate();
  return true;
}

function openSessionModal() {
  if (window.AppgenWtdSessionModal) {
    window.AppgenWtdSessionModal.open({
      title: "Rainbow physics builder",
      layout: "3d",
      nodeIds: ["wtdRainbowPlay"],
      onRestart: () => startSession(),
      onExit: () => {
        disposeEngine();
        showIntro();
      }
    });
  }
  hudEl = $("wtdRainbowHud");
  controlsEl = $("wtdRainbowControls");
  host = ensureCanvasHost();
  if (hudEl) {
    hudEl.hidden = false;
    hudEl.removeAttribute("hidden");
  }
  if (host) {
    host.hidden = false;
    host.removeAttribute("hidden");
  }
}

function startSession() {
  openSessionModal();
  if (!ensureEngine()) return;
  completed = false;
  session = { phase: "play", startedAt: performance.now() };
  spawnSpectrum();
  const strip =
    '<div class="wtd-rainbow-strip" aria-label="Target spectrum">' +
    SPECTRUM.map(
      (s) =>
        '<span title="' +
        s.name +
        '" style="background:#' +
        s.hex.toString(16).padStart(6, "0") +
        '"></span>'
    ).join("") +
    "</div>";
  setHud(
    "<h3>Rainbow physics builder</h3>" +
      "<p>Select a block, drag it, then drop — gravity stacks them. Line blocks <strong>left → right</strong> in rainbow order (ROYGBIV).</p>" +
      '<p class="wtd-3d-metric">Timer: <span id="wtdRainbowTimer">0.00s</span> · Orbit to look around; drag disables orbit while holding.</p>' +
      strip
  );
  setControls(
    '<button type="button" class="btn big" id="wtdRainbowCheck">Check order</button>' +
      '<button type="button" class="btn ghost" id="wtdRainbowReset">Respawn</button>'
  );
  const check = $("wtdRainbowCheck");
  const reset = $("wtdRainbowReset");
  if (check) check.addEventListener("click", checkOrder);
  if (reset) reset.addEventListener("click", () => startSession());
  window.requestAnimationFrame(() => resize());
}

function showIntro() {
  hudEl = $("wtdRainbowHud");
  controlsEl = $("wtdRainbowControls");
  host = ensureCanvasHost();
  if (hudEl) {
    hudEl.hidden = false;
    hudEl.removeAttribute("hidden");
  }
  if (host) {
    host.hidden = false;
    host.removeAttribute("hidden");
  }
  setHud(
    "<h3>Rainbow 3D Builder</h3>" +
      "<p>Seven coloured blocks fall under gravity. Drag and stack them into spectrum order left-to-right.</p>" +
      '<p class="wtd-3d-metric">Tracked: time + order accuracy → cloud leaderboard (<code>rainbow3d</code>).</p>'
  );
  setControls('<button type="button" class="btn big" id="wtdRainbowStart">Start rainbow build</button>');
}

function init() {
  hudEl = $("wtdRainbowHud");
  controlsEl = $("wtdRainbowControls");
  /* Document delegation survives modal re-parenting of #wtdRainbowControls. */
  if (!document.documentElement.dataset.wtdRainbowDelegated) {
    document.documentElement.dataset.wtdRainbowDelegated = "1";
    document.addEventListener("click", (e) => {
      if (e.target.closest("#wtdRainbowStart, #wtdRainbowAgain")) {
        e.preventDefault();
        startSession();
      }
    });
  }
  showIntro();
}

function onClose() {
  if (window.AppgenWtdSessionModal) window.AppgenWtdSessionModal.close(true);
  disposeEngine();
  window.removeEventListener("resize", resize);
}

window.AppgenWtdRainbow = { init, onClose, dispose: onClose };
