/**
 * 3D chess scene backdrop — inverted environment sphere (sky dome) for color,
 * galaxy, and uploaded images (ClampToEdge — no repeat tiling; moves with orbit).
 */

import { mixThemeHex, pickThemeOpacity } from "./appgen-wtd-chess-board-theme.js";

export const BG_STORAGE_KEY = "wtdChessSceneBg";
const LEGACY_BG_KEY = "wtdChessSceneBackground";
export const DEFAULT_STUDIO_COLOR = "#d8e2ea";
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
/** Bundled galaxy art for preset environment sphere. */
export const GALAXY_FLOOR_URL = new URL("./chess-galaxy-floor.jpg", import.meta.url).href;
/** Default nebula backdrop (legacy preset). */
export const DEFAULT_BACKDROP_URL = new URL("./chess-default-backdrop.jpg", import.meta.url).href;
/** Reflective space grid + nebula (user reference art). */
export const COSMIC_GRID_BACKDROP_URL = new URL("./chess-cosmic-grid-backdrop.jpg", import.meta.url).href;

/** @typedef {{ mode: "color" | "galaxy" | "cosmic" | "image", color?: string, imageDataUrl?: string, imageColorOpacity?: number, imageOpacity?: number }} SceneBgPrefs */

/** @type {SceneBgPrefs} */
export const DEFAULT_SCENE_BG = {
  mode: "cosmic",
  imageColorOpacity: 1,
  imageOpacity: 1
};
/** Radius of the inner-facing sky dome (camera stays inside). */
export const ENV_SPHERE_RADIUS = 64;

/** @param {unknown} v */
function pickBgImageUrl(v) {
  if (typeof v !== "string" || !v) return undefined;
  if (v.startsWith("data:")) return v;
  if (/^https?:\/\//i.test(v)) return v;
  return undefined;
}

export function loadBackgroundPrefs() {
  /** @type {SceneBgPrefs} */
  const fallback = { ...DEFAULT_SCENE_BG };
  try {
    let raw = localStorage.getItem(BG_STORAGE_KEY);
    if (!raw) {
      raw = localStorage.getItem(LEGACY_BG_KEY);
      if (raw) {
        const migrated = migrateLegacyPrefs(JSON.parse(raw));
        if (migrated) saveBackgroundPrefs(migrated);
        return migrated || fallback;
      }
      return fallback;
    }
    const p = JSON.parse(raw);
    return normalizePrefs(p) || fallback;
  } catch (_) {
    return fallback;
  }
}

/** @param {unknown} p */
function migrateLegacyPrefs(p) {
  if (!p || typeof p !== "object") return null;
  const kind = /** @type {{ kind?: string, color?: string, imageDataUrl?: string }} */ (p).kind;
  if (kind === "galaxy") return { mode: "galaxy" };
  if (kind === "image" && typeof p.imageDataUrl === "string") {
    return { mode: "image", imageDataUrl: p.imageDataUrl };
  }
  if (kind === "color" && typeof p.color === "string") return { mode: "color", color: p.color };
  return { mode: "color", color: DEFAULT_STUDIO_COLOR };
}

/** @param {unknown} p */
function normalizePrefs(p) {
  if (!p || typeof p !== "object") return null;
  const o = /** @type {SceneBgPrefs} */ (p);
  if (o.mode === "galaxy") return { mode: "galaxy" };
  if (o.mode === "cosmic") return { mode: "cosmic" };
  if (o.mode === "color" && typeof o.color === "string") return { mode: "color", color: o.color };
  const imageUrl = pickBgImageUrl(o.imageDataUrl);
  if (o.mode === "image" && imageUrl) {
    return {
      mode: "image",
      imageDataUrl: imageUrl,
      imageColorOpacity: pickBgOpacity(o.imageColorOpacity),
      imageOpacity: pickBgOpacity(o.imageOpacity)
    };
  }
  return null;
}

/** @param {unknown} v */
function pickBgOpacity(v) {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  if (!Number.isFinite(n)) return 1;
  return Math.min(1, Math.max(0, n));
}

export function saveBackgroundPrefs(prefs) {
  try {
    localStorage.setItem(BG_STORAGE_KEY, JSON.stringify(prefs));
    try {
      localStorage.removeItem(LEGACY_BG_KEY);
    } catch (_) {
      /* ignore */
    }
  } catch (_) {
    /* quota — image may be too large */
  }
}

/**
 * @param {number} w
 * @param {number} h
 * @returns {HTMLCanvasElement}
 */
export function createGalaxyCanvas(w = 1024, h = 512) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, "#0a0618");
  grad.addColorStop(0.35, "#1a0f3d");
  grad.addColorStop(0.65, "#3d1a5c");
  grad.addColorStop(1, "#0d1528");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  const neb = ctx.createRadialGradient(w * 0.72, h * 0.38, 0, w * 0.72, h * 0.38, w * 0.45);
  neb.addColorStop(0, "rgba(120, 80, 255, 0.35)");
  neb.addColorStop(0.45, "rgba(200, 60, 180, 0.12)");
  neb.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = neb;
  ctx.fillRect(0, 0, w, h);

  const neb2 = ctx.createRadialGradient(w * 0.22, h * 0.62, 0, w * 0.22, h * 0.62, w * 0.35);
  neb2.addColorStop(0, "rgba(40, 120, 255, 0.28)");
  neb2.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = neb2;
  ctx.fillRect(0, 0, w, h);

  const starCount = 420;
  for (let i = 0; i < starCount; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    const r = Math.random() < 0.08 ? 1.8 : Math.random() < 0.25 ? 1.2 : 0.6;
    const a = 0.35 + Math.random() * 0.65;
    ctx.fillStyle = `rgba(255,255,255,${a})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  return canvas;
}

/**
 * Resize/compress user image for localStorage.
 * @param {File} file
 * @returns {Promise<string>}
 */
export function readImageFileAsDataUrl(file) {
  if (file.size > MAX_IMAGE_BYTES) {
    return Promise.reject(new Error("Image must be 2MB or smaller"));
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const max = 1280;
        let { width, height } = img;
        if (width > max || height > max) {
          const scale = max / Math.max(width, height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas unavailable"));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      img.onerror = () => reject(new Error("Invalid image"));
      img.src = String(reader.result);
    };
    reader.onerror = () => reject(new Error("Read failed"));
    reader.readAsDataURL(file);
  });
}

/** @type {import("three").Texture | null} */
let activeBgTexture = null;
let bgApplyGeneration = 0;
/** Skip redundant teardown/reload when prefs unchanged (prevents backdrop flicker). */
let lastAppliedBackgroundKey = "";
/** Same prefs while TextureLoader is in flight — avoid duplicate teardown. */
let pendingBackgroundKey = "";
/** Fires when async backdrop texture is on the sphere (or sync color path). */
let backdropReadyHook = null;

/** @param {SceneBgPrefs | null | undefined} prefs */
export function backgroundPrefsKey(prefs) {
  const mode = prefs?.mode || "color";
  if (mode === "galaxy") return "galaxy";
  if (mode === "cosmic") return "cosmic";
  if (mode === "color") return "color:" + (prefs?.color || DEFAULT_STUDIO_COLOR);
  if (mode === "image" && prefs?.imageDataUrl) {
    const u = prefs.imageDataUrl;
    return "image:" + u.length + ":" + u.slice(0, 40) + u.slice(-24);
  }
  return "color:" + DEFAULT_STUDIO_COLOR;
}

export function resetBackgroundApplyCache() {
  lastAppliedBackgroundKey = "";
  pendingBackgroundKey = "";
  backdropReadyHook = null;
}

export function disposeBackgroundTexture() {
  if (activeBgTexture) {
    activeBgTexture.dispose();
    activeBgTexture = null;
  }
}

/**
 * Sky dome texture — single wrap, no Repeat tiling (avoids obvious repeat seams).
 * @param {import("three")} THREE
 * @param {import("three").Texture} texture
 */
function configureSphereSkyTexture(THREE, texture) {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.mapping = THREE.UVMapping;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.repeat.set(1, 1);
  texture.offset.set(0, 0);
  texture.center.set(0.5, 0.5);
  texture.rotation = 0;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Large inner-facing sphere — galaxy / image / solid color wraps the board while orbiting.
 * @param {import("three")} THREE
 * @param {number} [radius]
 */
export function createEnvironmentSphere(THREE, radius = ENV_SPHERE_RADIUS) {
  const geometry = new THREE.SphereGeometry(radius, 72, 36);
  const material = new THREE.MeshBasicMaterial({
    side: THREE.BackSide,
    depthWrite: false
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  mesh.raycast = () => {};
  mesh.userData = { type: "environmentSphere" };
  return mesh;
}

/** @param {import("three").Mesh | null | undefined} envSphere */
export function disposeEnvironmentSphere(envSphere) {
  if (!envSphere) return;
  if (envSphere.material instanceof Object && "map" in envSphere.material) {
    const map = /** @type {import("three").MeshBasicMaterial} */ (envSphere.material).map;
    if (map && map !== activeBgTexture) map.dispose();
  }
  envSphere.geometry?.dispose();
  if (envSphere.material) envSphere.material.dispose();
}

/**
 * @param {import("three").Mesh | null | undefined} envSphere
 */
function detachSphereMap(envSphere) {
  if (!envSphere?.material || !("map" in envSphere.material)) return;
  /** @type {import("three").MeshBasicMaterial} */ (envSphere.material).map = null;
}

/**
 * @param {import("three").Mesh | null | undefined} envSphere
 * @param {import("three")} THREE
 * @param {string} hex
 * @param {import("three").Texture | null} [texture]
 */
function applySphereMaterial(envSphere, THREE, hex, texture = null) {
  if (!envSphere) return;
  let mat = envSphere.material;
  if (!(mat instanceof THREE.MeshBasicMaterial)) {
    if (mat) mat.dispose();
    mat = new THREE.MeshBasicMaterial({ side: THREE.BackSide, depthWrite: false });
    envSphere.material = mat;
  }
  if (texture) {
    mat.color.setHex(0xffffff);
    mat.map = texture;
  } else {
    mat.map = null;
    mat.color.set(hex);
  }
  mat.needsUpdate = true;
}

/**
 * @param {import("three").Scene} threeScene
 * @param {import("three")} THREE
 * @param {import("three").Texture} texture
 * @param {import("three").Mesh | null | undefined} envSphere
 */
/**
 * @param {import("three").Scene} threeScene
 * @param {import("three")} THREE
 * @param {import("three").Texture} texture
 * @param {import("three").Mesh | null | undefined} envSphere
 * @param {string} [prefsKey]
 * @param {SceneBgPrefs} [prefs]
 */
function assignSphereBackdropTexture(threeScene, THREE, texture, envSphere, prefsKey, prefs) {
  configureSphereSkyTexture(THREE, texture);
  activeBgTexture = texture;
  threeScene.background = null;
  if (envSphere) envSphere.visible = true;
  applySphereMaterial(envSphere, THREE, DEFAULT_STUDIO_COLOR, texture);
  if (prefs) applyBackdropImageBlend(THREE, prefs, envSphere);
  if (prefsKey) lastAppliedBackgroundKey = prefsKey;
  if (backdropReadyHook) {
    const hook = backdropReadyHook;
    backdropReadyHook = null;
    hook();
  }
}

function finishBackdropReadySync() {
  if (backdropReadyHook) {
    const hook = backdropReadyHook;
    backdropReadyHook = null;
    hook();
  }
}

/**
 * @param {import("three").Scene} threeScene
 * @param {import("three")} THREE
 * @param {string} fogColor
 * @param {boolean} immersive
 */
function syncFog(threeScene, THREE, fogColor, immersive) {
  if (immersive) {
    threeScene.fog = null;
    return;
  }
  if (!threeScene.fog || !(threeScene.fog instanceof THREE.Fog)) {
    threeScene.fog = new THREE.Fog(fogColor, 18, 32);
  } else {
    threeScene.fog.color.set(fogColor);
  }
}

/**
 * @param {import("three").Scene} threeScene
 * @param {import("three")} THREE
 * @param {SceneBgPrefs} prefs
 * @param {import("three").Mesh | null | undefined} [envSphere]
 * @param {{ onReady?: () => void } | null} [hooks]
 */
export function applySceneBackground(threeScene, THREE, prefs, envSphere = null, hooks = null) {
  if (hooks?.onReady) backdropReadyHook = hooks.onReady;
  const prefsKey = backgroundPrefsKey(prefs);
  if (prefsKey === lastAppliedBackgroundKey) {
    if ((prefs?.mode === "image" || prefs?.mode === "cosmic") && activeBgTexture) {
      applyBackdropImageBlend(THREE, prefs, envSphere);
    }
    finishBackdropReadySync();
    return;
  }
  if (prefsKey === pendingBackgroundKey) {
    return;
  }

  const applyGen = ++bgApplyGeneration;
  const mode = prefs?.mode || "color";
  let fogColor = DEFAULT_STUDIO_COLOR;
  const immersive = mode === "galaxy" || mode === "cosmic" || mode === "image";

  /**
   * @param {string} url
   * @param {() => import("three").Texture} onError
   */
  function loadBundledSphereBackdrop(url, onError) {
    pendingBackgroundKey = prefsKey;
    threeScene.background = null;
    detachSphereMap(envSphere);
    disposeBackgroundTexture();
    if (envSphere) envSphere.visible = true;
    applySphereMaterial(envSphere, THREE, fogColor);
    new THREE.TextureLoader().load(
      url,
      (tex) => {
        if (applyGen !== bgApplyGeneration) {
          tex.dispose();
          return;
        }
        assignSphereBackdropTexture(threeScene, THREE, tex, envSphere, prefsKey, prefs);
        if (pendingBackgroundKey === prefsKey) pendingBackgroundKey = "";
      },
      undefined,
      () => {
        if (applyGen !== bgApplyGeneration) return;
        assignSphereBackdropTexture(
          threeScene,
          THREE,
          onError(),
          envSphere,
          prefsKey,
          prefs
        );
        if (pendingBackgroundKey === prefsKey) pendingBackgroundKey = "";
      }
    );
  }

  if (mode === "galaxy") {
    fogColor = "#120a24";
    loadBundledSphereBackdrop(GALAXY_FLOOR_URL, () => new THREE.CanvasTexture(createGalaxyCanvas(1024, 512)));
  } else if (mode === "cosmic") {
    fogColor = "#0a1428";
    loadBundledSphereBackdrop(COSMIC_GRID_BACKDROP_URL, () => {
      const canvas = createGalaxyCanvas(1024, 512);
      return new THREE.CanvasTexture(canvas);
    });
  } else if (mode === "color") {
    const hex = prefs.color || DEFAULT_STUDIO_COLOR;
    pendingBackgroundKey = "";
    detachSphereMap(envSphere);
    disposeBackgroundTexture();
    threeScene.background = null;
    if (envSphere) envSphere.visible = true;
    applySphereMaterial(envSphere, THREE, hex);
    fogColor = hex;
    lastAppliedBackgroundKey = prefsKey;
    finishBackdropReadySync();
  } else if (mode === "image" && prefs.imageDataUrl) {
    fogColor = "#1a1a22";
    pendingBackgroundKey = prefsKey;
    threeScene.background = null;
    detachSphereMap(envSphere);
    disposeBackgroundTexture();
    if (envSphere) envSphere.visible = true;
    applySphereMaterial(envSphere, THREE, fogColor);
    new THREE.TextureLoader().load(prefs.imageDataUrl, (tex) => {
      if (applyGen !== bgApplyGeneration) {
        tex.dispose();
        return;
      }
      assignSphereBackdropTexture(threeScene, THREE, tex, envSphere, prefsKey, prefs);
      if (pendingBackgroundKey === prefsKey) pendingBackgroundKey = "";
    });
  } else {
    pendingBackgroundKey = "";
    detachSphereMap(envSphere);
    disposeBackgroundTexture();
    threeScene.background = null;
    if (envSphere) envSphere.visible = true;
    applySphereMaterial(envSphere, THREE, DEFAULT_STUDIO_COLOR);
    fogColor = DEFAULT_STUDIO_COLOR;
    lastAppliedBackgroundKey = prefsKey;
    finishBackdropReadySync();
  }

  syncFog(threeScene, THREE, fogColor, immersive);
}

/**
 * Adjust tint/opacity on an already-loaded backdrop image (no texture reload).
 * @param {import("three")} THREE
 * @param {SceneBgPrefs} prefs
 * @param {import("three").Mesh | null | undefined} envSphere
 */
export function applyBackdropImageBlend(THREE, prefs, envSphere) {
  if (!envSphere?.material || !(envSphere.material instanceof THREE.MeshBasicMaterial)) return;
  const mat = envSphere.material;
  const mode = prefs?.mode || "color";
  if ((mode !== "image" && mode !== "cosmic") || !activeBgTexture || !mat.map) {
    mat.opacity = 1;
    mat.transparent = false;
    if (mode === "cosmic" && mat.map) {
      mat.color.setHex(0xffffff);
    }
    mat.needsUpdate = true;
    return;
  }
  if (mode === "cosmic") {
    mat.color.setHex(0xffffff);
    mat.opacity = 1;
    mat.transparent = false;
    mat.depthWrite = false;
    mat.needsUpdate = true;
    return;
  }
  if (envSphere) envSphere.visible = true;
  const colorOp = pickThemeOpacity(prefs.imageColorOpacity, 1);
  const imageOp = pickThemeOpacity(prefs.imageOpacity, 1);
  const tint = prefs.color || DEFAULT_STUDIO_COLOR;
  mat.color.set(mixThemeHex("#ffffff", tint, colorOp));
  mat.opacity = imageOp;
  mat.transparent = imageOp < 0.999;
  mat.depthWrite = false;
  mat.needsUpdate = true;
}
