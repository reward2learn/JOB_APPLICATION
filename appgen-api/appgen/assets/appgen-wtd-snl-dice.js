/**
 * Physics dice (cannon-es) for Snakes & Ladders — drop on the board center;
 * collides with board bounds and snake/ladder obstacle bodies; face from physics.
 */
import * as THREE from "three";
import * as CANNON from "cannon-es";

const DIE_SIZE_BASE = 0.48;
const SETTLE_LIN = 0.14;
const SETTLE_ANG = 0.4;
const SETTLE_MS = 320;
const MAX_SHAKE_MS = 5200;
const BOARD_SURFACE_Y = 0.055;
/** World units above board tiles — roll spawn (independent of die mesh scale). */
const ROLL_DROP_HEIGHT = 1.35;
/** Idle float height above board when waiting for human click. */
const FLOAT_HEIGHT = 0.62;

/** BoxGeometry material order: +x, -x, +y, -y, +z, -z → face values */
const FACE_BY_AXIS = [
  { axis: new THREE.Vector3(1, 0, 0), value: 3 },
  { axis: new THREE.Vector3(-1, 0, 0), value: 4 },
  { axis: new THREE.Vector3(0, 1, 0), value: 1 },
  { axis: new THREE.Vector3(0, -1, 0), value: 6 },
  { axis: new THREE.Vector3(0, 0, 1), value: 2 },
  { axis: new THREE.Vector3(0, 0, -1), value: 5 }
];

function makePipsTexture(value) {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#faf7f0";
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = "#c4b8a8";
  ctx.lineWidth = 4;
  ctx.strokeRect(3, 3, size - 6, size - 6);
  ctx.fillStyle = "#1a1a1a";
  const r = 10;
  const c = size / 2;
  const o = size * 0.28;
  const spots = {
    1: [[c, c]],
    2: [
      [c - o, c - o],
      [c + o, c + o]
    ],
    3: [
      [c - o, c - o],
      [c, c],
      [c + o, c + o]
    ],
    4: [
      [c - o, c - o],
      [c + o, c - o],
      [c - o, c + o],
      [c + o, c + o]
    ],
    5: [
      [c - o, c - o],
      [c + o, c - o],
      [c, c],
      [c - o, c + o],
      [c + o, c + o]
    ],
    6: [
      [c - o, c - o],
      [c + o, c - o],
      [c - o, c],
      [c + o, c],
      [c - o, c + o],
      [c + o, c + o]
    ]
  };
  for (const [x, y] of spots[value] || spots[1]) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * @param {THREE.Scene} threeScene
 * @param {{ scale?: number }} [opts]
 */
export function createSnLDice(threeScene, opts = {}) {
  const scale = typeof opts.scale === "number" && opts.scale > 0 ? opts.scale : 1;
  const DIE_SIZE = DIE_SIZE_BASE * scale;

  function dieRestY() {
    return BOARD_SURFACE_Y + DIE_SIZE * 0.5 + 0.05 * scale;
  }

  function dieDropY() {
    return BOARD_SURFACE_Y + ROLL_DROP_HEIGHT;
  }

  function dieFloatY() {
    return BOARD_SURFACE_Y + FLOAT_HEIGHT * scale;
  }

  function dieIdleY() {
    return floating ? dieFloatY() : dieRestY();
  }

  let originX = 0;
  let originZ = 0;
  let floating = false;
  let floatPhase = 0;

  const root = new THREE.Group();
  root.name = "snlDiceArena";
  root.visible = false;
  threeScene.add(root);

  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -24, 0) });
  world.broadphase = new CANNON.NaiveBroadphase();
  world.allowSleep = true;
  world.defaultContactMaterial.friction = 0.62;
  world.defaultContactMaterial.restitution = 0.22;

  /** @type {CANNON.Body[]} */
  let envBodies = [];

  function clearEnvironment() {
    for (const b of envBodies) {
      world.removeBody(b);
    }
    envBodies = [];
  }

  /**
   * Board floor, rim walls, and snake/ladder colliders along curves.
   * @param {{ boardHalf: number, curves: { curve: THREE.QuadraticBezierCurve3, kind: string }[] }} spec
   */
  function rebuildEnvironment(spec) {
    clearEnvironment();
    const half = spec.boardHalf;
    if (!half || half <= 0) return;

    const floor = new CANNON.Body({
      type: CANNON.Body.STATIC,
      shape: new CANNON.Box(new CANNON.Vec3(half, 0.025, half))
    });
    floor.position.set(0, BOARD_SURFACE_Y - 0.025, 0);
    world.addBody(floor);
    envBodies.push(floor);

    const wallH = 0.32 * scale;
    const wallY = BOARD_SURFACE_Y + wallH * 0.5;
    const rim = [
      { pos: [0, wallY, -half], size: [half * 2, wallH, 0.06 * scale] },
      { pos: [0, wallY, half], size: [half * 2, wallH, 0.06 * scale] },
      { pos: [-half, wallY, 0], size: [0.06 * scale, wallH, half * 2] },
      { pos: [half, wallY, 0], size: [0.06 * scale, wallH, half * 2] }
    ];
    for (const w of rim) {
      const body = new CANNON.Body({
        type: CANNON.Body.STATIC,
        shape: new CANNON.Box(new CANNON.Vec3(w.size[0] / 2, w.size[1] / 2, w.size[2] / 2))
      });
      body.position.set(w.pos[0], w.pos[1], w.pos[2]);
      world.addBody(body);
      envBodies.push(body);
    }

    const curves = spec.curves || [];
    for (const row of curves) {
      const curve = row.curve;
      if (!curve) continue;
      const isSnake = row.kind === "snake";
      const steps = isSnake ? 14 : 10;
      const radius = isSnake ? 0.052 * scale : 0.038 * scale;
      for (let i = 0; i <= steps; i++) {
        const p = curve.getPoint(i / steps);
        const body = new CANNON.Body({
          type: CANNON.Body.STATIC,
          shape: new CANNON.Sphere(radius)
        });
        body.position.set(p.x, p.y + 0.03, p.z);
        world.addBody(body);
        envBodies.push(body);
      }
    }
  }

  const padRadius = 0.38 * scale;
  const tapPad = new THREE.Mesh(
    new THREE.CylinderGeometry(padRadius, padRadius * 1.04, 0.1 * scale, 32),
    new THREE.MeshStandardMaterial({
      color: 0xe6a817,
      emissive: 0x8a5a00,
      emissiveIntensity: 0.35,
      roughness: 0.42,
      metalness: 0.15
    })
  );
  tapPad.receiveShadow = true;
  tapPad.castShadow = true;
  tapPad.userData = { snlDiceHit: true };
  root.add(tapPad);

  const highlightRing = new THREE.Mesh(
    new THREE.RingGeometry(padRadius * 0.82, padRadius * 1.08, 48),
    new THREE.MeshBasicMaterial({
      color: 0xffe082,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false
    })
  );
  highlightRing.rotation.x = -Math.PI / 2;
  highlightRing.renderOrder = 2;
  root.add(highlightRing);

  function applyOriginToPad() {
    const padY = floating
      ? dieFloatY() - DIE_SIZE * 0.42
      : BOARD_SURFACE_Y + 0.04 * scale;
    tapPad.position.set(originX, padY, originZ);
    highlightRing.position.set(originX, padY + 0.06 * scale, originZ);
  }
  applyOriginToPad();

  const mats = [3, 4, 1, 6, 2, 5].map((n) => {
    return new THREE.MeshStandardMaterial({
      map: makePipsTexture(n),
      roughness: 0.4,
      metalness: 0.1
    });
  });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(DIE_SIZE, DIE_SIZE, DIE_SIZE), mats);
  mesh.castShadow = true;
  mesh.position.set(originX, dieRestY(), originZ);
  mesh.userData = { snlDiceHit: true };
  root.add(mesh);

  const body = new CANNON.Body({
    mass: 0.52 * scale,
    shape: new CANNON.Box(new CANNON.Vec3(DIE_SIZE / 2, DIE_SIZE / 2, DIE_SIZE / 2)),
    linearDamping: 0.11,
    angularDamping: 0.16,
    allowSleep: true,
    sleepSpeedLimit: 0.14,
    sleepTimeLimit: 0.28
  });
  body.position.set(mesh.position.x, mesh.position.y, mesh.position.z);
  world.addBody(body);

  let shaking = false;
  let lastTime = 0;
  let clickable = false;
  let hovered = false;
  let pulseT = 0;

  function syncMesh() {
    mesh.position.copy(body.position);
    mesh.quaternion.copy(body.quaternion);
  }

  const spinQuat = new THREE.Quaternion();
  const spinAxis = new THREE.Vector3(0, 1, 0);

  function step(dt) {
    const floatIdle = floating && !shaking && clickable && root.visible;
    if (!floatIdle) {
      world.step(1 / 60, Math.min(dt, 0.05), 3);
    } else {
      floatPhase += dt;
      const bob = Math.sin(floatPhase * 2.4) * 0.04 * scale;
      body.position.set(originX, dieFloatY() + bob, originZ);
      body.velocity.setZero();
      body.angularVelocity.setZero();
      spinQuat.setFromAxisAngle(spinAxis, dt * 1.15);
      body.quaternion.multiply(spinQuat);
    }
    syncMesh();
    if (clickable && root.visible && !shaking) {
      pulseT += dt;
      const wave = Math.sin(pulseT * 4.2);
      const hoverBoost = hovered ? 0.2 : 0;
      const mat = highlightRing.material;
      if (mat instanceof THREE.MeshBasicMaterial) {
        mat.opacity = 0.34 + wave * 0.16 + hoverBoost;
      }
      const padMat = tapPad.material;
      if (padMat instanceof THREE.MeshStandardMaterial) {
        padMat.emissiveIntensity = 0.38 + wave * 0.14 + (hovered ? 0.22 : 0);
      }
      const scalePad = 1 + (hovered ? 0.04 : 0) + wave * 0.015;
      tapPad.scale.set(scalePad, 1, scalePad);
    } else if (!clickable || !root.visible) {
      tapPad.scale.set(1, 1, 1);
    }
  }

  const WORLD_UP = new THREE.Vector3(0, 1, 0);
  const faceNormal = new THREE.Vector3();

  function readTopFace() {
    let best = 1;
    let bestDot = -Infinity;
    for (const face of FACE_BY_AXIS) {
      faceNormal.copy(face.axis).applyQuaternion(mesh.quaternion);
      const d = faceNormal.dot(WORLD_UP);
      if (d > bestDot) {
        bestDot = d;
        best = face.value;
      }
    }
    return best;
  }

  /** Snap mesh + body so pip `value` (1–6) faces world +Y — matches BoxGeometry material layout. */
  function orientToFace(value) {
    const target = Math.min(6, Math.max(1, Math.round(Number(value)) || 1));
    const faceDef = FACE_BY_AXIS.find((f) => f.value === target);
    if (faceDef) {
      const q = new THREE.Quaternion();
      q.setFromUnitVectors(faceDef.axis.clone().normalize(), WORLD_UP);
      mesh.quaternion.copy(q);
      body.quaternion.copy(q);
    }
    const restY = floating ? dieIdleY() : dieRestY();
    body.position.set(originX, restY, originZ);
    body.velocity.setZero();
    body.angularVelocity.setZero();
    syncMesh();
    return target;
  }

  /** Authoritative snap — top pip must match `value` (used for server move sync). */
  function commitRollFace(value) {
    const target = orientToFace(value);
    if (readTopFace() !== target) {
      orientToFace(target);
    }
    return target;
  }

  function idlePose() {
    body.wakeUp();
    body.velocity.setZero();
    body.angularVelocity.setZero();
    body.position.set(originX, dieIdleY(), originZ);
    body.quaternion.set(0.08, 0.12, -0.06, 1);
    body.quaternion.normalize();
    syncMesh();
  }

  function dropImpulseFromEnvironment() {
    const n = envBodies.length;
    const bias = (n % 6) * 0.04;
    body.velocity.set(
      (Math.random() - 0.5) * (2.8 + bias),
      -0.2 + Math.random() * 0.4,
      (Math.random() - 0.5) * (2.8 + bias)
    );
    body.angularVelocity.set(
      (Math.random() - 0.5) * (18 + n * 0.15),
      (Math.random() - 0.5) * (20 + n * 0.12),
      (Math.random() - 0.5) * (18 + n * 0.15)
    );
  }

  /**
   * Drop die from above board center; outcome from physics + collisions.
   * @returns {Promise<number>}
   */
  function dropRoll() {
    if (shaking) return Promise.reject(new Error("Dice busy"));
    shaking = true;
    const launchFromFloat = floating;
    floating = false;
    applyOriginToPad();
    root.visible = true;
    body.wakeUp();
    body.velocity.setZero();
    body.angularVelocity.setZero();
    if (launchFromFloat) {
      body.quaternion.set(0.08, 0.12, -0.06, 1);
      body.quaternion.normalize();
      body.position.set(originX, dieFloatY(), originZ);
      body.velocity.set(
        (Math.random() - 0.5) * 1.4,
        -0.35 - Math.random() * 0.25,
        (Math.random() - 0.5) * 1.4
      );
      body.angularVelocity.set(
        (Math.random() - 0.5) * 14,
        (Math.random() - 0.5) * 16,
        (Math.random() - 0.5) * 14
      );
    } else {
      body.position.set(originX, dieDropY(), originZ);
      body.quaternion.set(
        (Math.random() - 0.5) * 0.9,
        (Math.random() - 0.5) * 0.9,
        (Math.random() - 0.5) * 0.9,
        1
      );
      body.quaternion.normalize();
      dropImpulseFromEnvironment();
    }
    syncMesh();

    const started = performance.now();
    let settledSince = 0;
    lastTime = started;

    return new Promise((resolve) => {
      function frame(now) {
        const dt = (now - lastTime) / 1000;
        lastTime = now;
        step(dt);
        const lin = body.velocity.length();
        const ang = body.angularVelocity.length();
        const onBoard =
          body.position.y < BOARD_SURFACE_Y + DIE_SIZE + 0.45 &&
          Math.abs(body.position.x) < 3.5 &&
          Math.abs(body.position.z) < 3.5;
        const still = lin < SETTLE_LIN && ang < SETTLE_ANG && onBoard;
        if (still) {
          if (!settledSince) settledSince = now;
          if (now - settledSince >= SETTLE_MS || now - started > MAX_SHAKE_MS) {
            shaking = false;
            body.velocity.setZero();
            body.angularVelocity.setZero();
            syncMesh();
            resolve(commitRollFace(readTopFace()));
            return;
          }
        } else {
          settledSince = 0;
        }
        if (now - started > MAX_SHAKE_MS) {
          shaking = false;
          syncMesh();
          resolve(commitRollFace(readTopFace()));
          return;
        }
        requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    });
  }

  /** @deprecated alias */
  function shake() {
    return dropRoll();
  }

  /**
   * Visual roll ending on server value (agents) — physics first, rare snap.
   * @param {number} value 1–6
   */
  async function shakeToValue(value) {
    root.visible = true;
    const target = Math.min(6, Math.max(1, Math.round(Number(value)) || 1));
    await dropRoll();
    return commitRollFace(target);
  }

  function dispose() {
    clearEnvironment();
    world.removeBody(body);
    threeScene.remove(root);
    mats.forEach((m) => {
      if (m.map) m.map.dispose();
      m.dispose();
    });
    mesh.geometry.dispose();
    tapPad.geometry.dispose();
    tapPad.material.dispose();
    highlightRing.geometry.dispose();
    highlightRing.material.dispose();
  }

  function setOrigin(x, z) {
    originX = Number(x) || 0;
    originZ = Number(z) || 0;
    applyOriginToPad();
    if (!shaking) idlePose();
  }

  function setFloating(on) {
    floating = !!on;
    applyOriginToPad();
    if (!shaking) idlePose();
  }

  function getCameraFocus() {
    const y =
      shaking || !floating
        ? body.position.y + DIE_SIZE * 0.35
        : dieFloatY() + DIE_SIZE * 0.42;
    return { x: originX, y, z: originZ };
  }

  idlePose();

  return {
    dropRoll,
    shake,
    shakeToValue,
    readTopFace,
    commitRollFace,
    rebuildEnvironment,
    setOrigin,
    setFloating,
    getCameraFocus,
    isShaking: () => shaking,
    getHitTargets() {
      return [mesh, tapPad];
    },
    setVisible(on) {
      root.visible = !!on;
      if (on && !shaking) idlePose();
      if (!on) {
        const mat = highlightRing.material;
        if (mat instanceof THREE.MeshBasicMaterial) mat.opacity = 0;
      }
    },
    setClickable(on) {
      clickable = !!on;
      if (on && !shaking) {
        idlePose();
        pulseT = 0;
        const mat = highlightRing.material;
        if (mat instanceof THREE.MeshBasicMaterial) mat.opacity = 0.42;
        const padMat = tapPad.material;
        if (padMat instanceof THREE.MeshStandardMaterial) padMat.emissiveIntensity = 0.48;
      }
      if (!on) {
        hovered = false;
        tapPad.scale.set(1, 1, 1);
        const mat = highlightRing.material;
        if (mat instanceof THREE.MeshBasicMaterial) mat.opacity = 0;
        const padMat = tapPad.material;
        if (padMat instanceof THREE.MeshStandardMaterial) padMat.emissiveIntensity = 0.25;
      }
      mesh.userData.snlDiceClickable = !!on;
      tapPad.userData.snlDiceClickable = !!on;
    },
    setHovered(on) {
      hovered = !!(on && clickable && !shaking);
    },
    stepIdle(dt) {
      if (!shaking) {
        step(dt);
      }
    },
    dispose
  };
}
