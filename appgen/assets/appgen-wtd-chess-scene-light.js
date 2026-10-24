/**
 * 3D chess scene lighting — user brightness multiplier (localStorage).
 */

export const LIGHT_STORAGE_KEY = "wtdChessSceneLight";

/** Multiplier applied to default Three.js light intensities (1 = studio default). */
export const DEFAULT_LIGHT_INTENSITY = 1.51;
export const LIGHT_INTENSITY_MIN = 0.25;
export const LIGHT_INTENSITY_MAX = 2;

/** Default intensities at multiplier 1 (must match buildScene in appgen-wtd-chess.js). */
export const SCENE_LIGHT_BASE = {
  ambient: 0.22,
  hemisphere: 0.32,
  key: 0.7,
  fill: 0.16,
  keyShadow: 1.72
};

/** @typedef {{ intensity: number }} SceneLightPrefs */

/** @param {unknown} v */
export function normalizeLightIntensity(v) {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  if (!Number.isFinite(n)) return DEFAULT_LIGHT_INTENSITY;
  return Math.min(LIGHT_INTENSITY_MAX, Math.max(LIGHT_INTENSITY_MIN, n));
}

export function loadSceneLightPrefs() {
  /** @type {SceneLightPrefs} */
  const fallback = { intensity: DEFAULT_LIGHT_INTENSITY };
  try {
    const raw = localStorage.getItem(LIGHT_STORAGE_KEY);
    if (!raw) return fallback;
    const p = JSON.parse(raw);
    if (!p || typeof p !== "object") return fallback;
    return { intensity: normalizeLightIntensity(/** @type {SceneLightPrefs} */ (p).intensity) };
  } catch (_) {
    return fallback;
  }
}

/** @param {SceneLightPrefs} prefs */
export function saveSceneLightPrefs(prefs) {
  try {
    localStorage.setItem(
      LIGHT_STORAGE_KEY,
      JSON.stringify({ intensity: normalizeLightIntensity(prefs.intensity) })
    );
  } catch (_) {
    /* quota / private mode */
  }
}
