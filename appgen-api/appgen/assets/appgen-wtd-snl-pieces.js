/**
 * Chess-piece tokens for Snakes & Ladders (scaled-down chess.js shapes).
 */
import * as THREE from "three";

/** @typedef {"p"|"n"|"b"|"r"|"q"|"k"} SnLPieceType */

export const SNL_PIECE_TYPES = /** @type {const} */ (["p", "n", "b", "r", "q", "k"]);

export const SNL_PIECE_LABELS = {
  p: "Pawn",
  n: "Knight",
  b: "Bishop",
  r: "Rook",
  q: "Queen",
  k: "King"
};

export const SNL_PIECE_GLYPHS = {
  p: "♟",
  n: "♞",
  b: "♝",
  r: "♜",
  q: "♛",
  k: "♚"
};

const DEFAULT_BY_SLOT = ["p", "n", "b", "r"];

/** @param {unknown} raw @returns {SnLPieceType} */
export function sanitizePieceType(raw) {
  const t = String(raw || "").toLowerCase().trim();
  if (SNL_PIECE_TYPES.includes(/** @type {SnLPieceType} */ (t))) {
    return /** @type {SnLPieceType} */ (t);
  }
  return "p";
}

/** @param {number} slot */
export function defaultPieceForSlot(slot) {
  return DEFAULT_BY_SLOT[Number(slot) % DEFAULT_BY_SLOT.length] || "p";
}

/**
 * @param {number} colorHex
 * @param {number} [accentHex]
 */
function matsForColor(colorHex, accentHex) {
  const body = new THREE.MeshStandardMaterial({
    color: colorHex,
    roughness: 0.42,
    metalness: 0.14
  });
  const accent = new THREE.MeshStandardMaterial({
    color: accentHex != null ? accentHex : colorHex,
    roughness: 0.35,
    metalness: 0.22,
    emissive: accentHex != null ? accentHex : colorHex,
    emissiveIntensity: 0.08
  });
  return { body, accent };
}

/**
 * @param {THREE.Group} group
 * @param {THREE.BufferGeometry} geo
 * @param {THREE.Material} mat
 * @param {number} x
 * @param {number} y
 * @param {number} z
 */
function addMesh(group, geo, mat, x, y, z) {
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
}

/**
 * @param {SnLPieceType} type
 * @param {number} colorHex player slot color
 * @param {number} [scale] default ~0.55 for half-size board
 */
export function createSnLPieceToken(type, colorHex, scale = 0.55) {
  const piece = sanitizePieceType(type);
  const accentHex =
    (colorHex & 0xfefefe) === colorHex ? Math.min(0xffffff, colorHex + 0x222222) : colorHex;
  const { body, accent } = matsForColor(colorHex, accentHex);
  const group = new THREE.Group();
  group.userData = { pieceType: piece, snlToken: true };

  if (piece === "p") {
    addMesh(group, new THREE.CylinderGeometry(0.2, 0.24, 0.38, 20), body, 0, 0.19, 0);
    addMesh(group, new THREE.SphereGeometry(0.16, 16, 12), body, 0, 0.44, 0);
  } else if (piece === "r") {
    addMesh(group, new THREE.BoxGeometry(0.38, 0.52, 0.38), body, 0, 0.26, 0);
    addMesh(group, new THREE.BoxGeometry(0.48, 0.1, 0.48), accent, 0, 0.52, 0);
  } else if (piece === "n") {
    addMesh(group, new THREE.CylinderGeometry(0.22, 0.26, 0.22, 16), body, 0, 0.11, 0);
    addMesh(group, new THREE.BoxGeometry(0.18, 0.32, 0.36), body, 0.06, 0.38, 0.02);
    addMesh(group, new THREE.BoxGeometry(0.12, 0.14, 0.22), accent, 0.12, 0.52, 0.08);
  } else if (piece === "b") {
    addMesh(group, new THREE.CylinderGeometry(0.22, 0.28, 0.2, 18), body, 0, 0.1, 0);
    addMesh(group, new THREE.ConeGeometry(0.22, 0.48, 20), body, 0, 0.44, 0);
    addMesh(group, new THREE.SphereGeometry(0.1, 12, 10), accent, 0, 0.68, 0);
  } else if (piece === "q") {
    addMesh(group, new THREE.CylinderGeometry(0.24, 0.3, 0.28, 22), body, 0, 0.14, 0);
    addMesh(group, new THREE.SphereGeometry(0.2, 20, 14), body, 0, 0.42, 0);
    addMesh(group, new THREE.TorusGeometry(0.12, 0.04, 10, 24), accent, 0, 0.62, 0);
  } else {
    addMesh(group, new THREE.CylinderGeometry(0.26, 0.32, 0.32, 22), body, 0, 0.16, 0);
    addMesh(group, new THREE.CylinderGeometry(0.18, 0.2, 0.28, 18), body, 0, 0.46, 0);
    addMesh(group, new THREE.BoxGeometry(0.34, 0.06, 0.06), accent, 0, 0.66, 0);
    addMesh(group, new THREE.BoxGeometry(0.06, 0.22, 0.06), accent, 0, 0.74, 0);
  }

  group.scale.setScalar(scale);
  return group;
}

/** @param {THREE.Object3D} root */
export function disposeSnLPieceToken(root) {
  if (!root) return;
  root.traverse((c) => {
    if (c.isMesh) {
      c.geometry?.dispose();
      const m = c.material;
      if (Array.isArray(m)) m.forEach((x) => x.dispose());
      else m?.dispose();
    }
  });
}
