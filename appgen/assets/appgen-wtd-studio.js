/**
 * Shared WTD 3D studio — same defaults as Chess (backdrop, board wood textures,
 * scene light, Vercel Blob chess-settings sync).
 */
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import {
  hexToThreeColor,
  loadBoardThemePrefs,
  mixThemeHex,
  pickThemeOpacity
} from "./appgen-wtd-chess-board-theme.js";
import {
  DEFAULT_STUDIO_COLOR,
  applyBackdropImageBlend,
  applySceneBackground,
  createEnvironmentSphere,
  disposeEnvironmentSphere,
  loadBackgroundPrefs,
  resetBackgroundApplyCache
} from "./appgen-wtd-chess-scene-bg.js";
import {
  SCENE_LIGHT_BASE,
  loadSceneLightPrefs,
  normalizeLightIntensity
} from "./appgen-wtd-chess-scene-light.js";
import { syncChessSettingsWithCloud } from "./appgen-wtd-chess-settings.js";

/**
 * @param {import("three").MeshStandardMaterial} mat
 * @param {string} hex
 * @param {import("three").Texture | null} tex
 * @param {number} [colorOpacity]
 * @param {number} [imageOpacity]
 */
export function applyStudioColorAndMap(mat, hex, tex, colorOpacity = 1, imageOpacity = 1) {
  const co = pickThemeOpacity(colorOpacity, 1);
  const io = pickThemeOpacity(imageOpacity, 1);
  const tinted = mixThemeHex("#ffffff", hex, co);
  if (!tex || io <= 0.001) {
    mat.map = null;
    mat.color.set(hex);
    mat.transparent = false;
    mat.opacity = 1;
  } else if (io >= 0.999) {
    mat.map = tex;
    mat.color.set(tinted);
    mat.transparent = false;
    mat.opacity = 1;
  } else {
    mat.map = tex;
    mat.color.set(mixThemeHex(hex, tinted, io));
    mat.transparent = false;
    mat.opacity = 1;
  }
  mat.needsUpdate = true;
}

/**
 * Use loaded backdrop on scene.background and remove the sky-dome mesh (avoids a visible inner sphere).
 * @param {import("three").Scene} scene
 * @param {import("three").Mesh | null | undefined} envSphere
 */
export function flattenSphereBackdropOntoScene(scene, envSphere) {
  if (!scene || !envSphere) return;
  const mat = envSphere.material;
  if (mat instanceof THREE.MeshBasicMaterial) {
    if (mat.map) {
      /* The sky-dome texture is configured as UVMapping (configureSphereSkyTexture)
         so, assigned straight to scene.background, it renders as a STATIC
         screen-space image that ignores camera orbit. Equirectangular mapping
         makes three.js draw it as a world-locked skybox instead — the backdrop
         now shifts as the user changes view, without reintroducing the visible
         inner sphere that the flat pass removed. The shared texture is reset to
         UVMapping by configureSphereSkyTexture before any sphere reuse. */
      mat.map.mapping = THREE.EquirectangularReflectionMapping;
      mat.map.needsUpdate = true;
      scene.background = mat.map;
      scene.backgroundColorSpace = THREE.SRGBColorSpace;
    } else {
      scene.background = new THREE.Color(mat.color);
    }
  }
  if (envSphere.parent) scene.remove(envSphere);
  disposeEnvironmentSphere(envSphere);
}

/**
 * Attach chess studio backdrop (+ optional lights/PMREM) to a Three.js scene.
 * Prefs come from the same localStorage / Vercel Blob as Chess settings.
 * @param {import("three").WebGLRenderer} renderer
 * @param {import("three").Scene} scene
 * @param {{ skipPmrem?: boolean, lights?: boolean, flatBackground?: boolean }} [opts]
 */
export function attachWtdStudioEnvironment(renderer, scene, opts = {}) {
  const withLights = opts.lights !== false;
  const flatBackground = opts.flatBackground === true;
  const bgPrefs = loadBackgroundPrefs();
  const lightPrefs = loadSceneLightPrefs();
  const mult = normalizeLightIntensity(lightPrefs.intensity);

  resetBackgroundApplyCache();
  const envSphere = createEnvironmentSphere(THREE);
  if (!flatBackground) scene.add(envSphere);
  const finishBackdrop = () => {
    applyBackdropImageBlend(THREE, bgPrefs, envSphere);
    if (flatBackground) flattenSphereBackdropOntoScene(scene, envSphere);
  };
  applySceneBackground(scene, THREE, bgPrefs, envSphere, {
    onReady: finishBackdrop
  });
  if (bgPrefs.mode === "image") finishBackdrop();

  if (!opts.skipPmrem) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
  }

  /** @type {THREE.Light[]} */
  const lights = [];
  if (withLights) {
    const ambient = new THREE.AmbientLight(0xfff3e6, SCENE_LIGHT_BASE.ambient * mult);
    const hemi = new THREE.HemisphereLight(0xffeed6, 0xbfa894, SCENE_LIGHT_BASE.hemisphere * mult);
    const key = new THREE.DirectionalLight(0xfff4e6, SCENE_LIGHT_BASE.key * mult);
    key.position.set(4.5, 10, 6);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    const fill = new THREE.DirectionalLight(0xb8cce0, SCENE_LIGHT_BASE.fill * mult);
    fill.position.set(-5, 6, 4);
    lights.push(ambient, hemi, key, fill);
    scene.add(...lights);
  }

  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const fogColor = bgPrefs.mode === "color" && bgPrefs.color ? bgPrefs.color : DEFAULT_STUDIO_COLOR;
  if (flatBackground) {
    scene.fog = null;
    if (!scene.background) renderer.setClearColor(0x050510, 1);
  } else if (bgPrefs.mode === "color") {
    scene.fog = new THREE.Fog(fogColor, 18, 32);
    renderer.setClearColor(fogColor, 1);
  } else {
    scene.fog = null;
    renderer.setClearColor(DEFAULT_STUDIO_COLOR, 1);
  }

  return {
    envSphere: flatBackground ? null : envSphere,
    lights,
    dispose() {
      if (envSphere?.parent) scene.remove(envSphere);
      if (envSphere?.geometry) disposeEnvironmentSphere(envSphere);
      scene.background = null;
      lights.forEach((l) => scene.remove(l));
    }
  };
}

/**
 * Load chess board square textures (light/dark) from shared prefs / defaults / blob.
 * @param {(textures: { light: THREE.Texture | null, dark: THREE.Texture | null, prefs: import("./appgen-wtd-chess-board-theme.js").BoardThemePrefs }) => void} onReady
 */
export function loadStudioBoardTextures(onReady) {
  const prefs = loadBoardThemePrefs();
  /** @type {{ light: THREE.Texture | null, dark: THREE.Texture | null }} */
  const out = { light: null, dark: null };
  const loader = new THREE.TextureLoader();
  let pending = 0;
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    onReady({ light: out.light, dark: out.dark, prefs });
  };
  const loadSlot = (url, key) => {
    if (!url) return;
    pending++;
    loader.load(
      url,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        out[key] = tex;
        pending--;
        if (pending <= 0) finish();
      },
      undefined,
      () => {
        pending--;
        if (pending <= 0) finish();
      }
    );
  };
  loadSlot(prefs.squareLightImage, "light");
  loadSlot(prefs.squareDarkImage, "dark");
  if (pending === 0) finish();
}

/**
 * Material for a checker square using chess board theme.
 * @param {boolean} isLight
 * @param {import("./appgen-wtd-chess-board-theme.js").BoardThemePrefs} prefs
 * @param {THREE.Texture | null} tex
 */
export function createStudioSquareMaterial(isLight, prefs, tex) {
  const stem = isLight ? "squareLight" : "squareDark";
  const hex = prefs[stem] || (isLight ? "#858585" : "#4d1414");
  const mat = new THREE.MeshStandardMaterial({
    color: hexToThreeColor(hex),
    roughness: 0.72,
    metalness: 0.04
  });
  applyStudioColorAndMap(
    mat,
    hex,
    tex,
    pickThemeOpacity(prefs[stem + "ColorOpacity"], 1),
    pickThemeOpacity(prefs[stem + "ImageOpacity"], 1)
  );
  return mat;
}

/**
 * Re-apply map/tint to an existing square material after textures load.
 * @param {THREE.MeshStandardMaterial} mat
 * @param {boolean} isLight
 * @param {import("./appgen-wtd-chess-board-theme.js").BoardThemePrefs} prefs
 * @param {THREE.Texture | null} tex
 */
export function refreshStudioSquareMaterial(mat, isLight, prefs, tex) {
  const stem = isLight ? "squareLight" : "squareDark";
  const hex = prefs[stem] || (isLight ? "#858585" : "#4d1414");
  applyStudioColorAndMap(
    mat,
    hex,
    tex,
    pickThemeOpacity(prefs[stem + "ColorOpacity"], 1),
    pickThemeOpacity(prefs[stem + "ImageOpacity"], 1)
  );
}

/** Pull chess settings from cloud (blob) when signed in — shared across all games. */
export function ensureStudioSettingsSynced() {
  return syncChessSettingsWithCloud().catch(() => ({ ok: false }));
}
