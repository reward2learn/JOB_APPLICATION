/**
 * Chess 3D board piece + checker colors (localStorage).
 */

export const BOARD_THEME_STORAGE_KEY = "wtdChessBoardTheme";

/** Bundled square / piece wood textures (export defaults). */
export const DEFAULT_SQUARE_LIGHT_URL = new URL(
  "./chess-default-square-light.jpg",
  import.meta.url
).href;
export const DEFAULT_SQUARE_DARK_URL = new URL(
  "./chess-default-square-dark.jpg",
  import.meta.url
).href;

/**
 * @typedef {{
 *   pieceWhite: string,
 *   pieceBlack: string,
 *   squareLight: string,
 *   squareDark: string,
 *   squareLightImage?: string,
 *   squareDarkImage?: string,
 *   pieceWhiteImage?: string,
 *   pieceBlackImage?: string,
 *   squareLightColorOpacity?: number,
 *   squareLightImageOpacity?: number,
 *   squareDarkColorOpacity?: number,
 *   squareDarkImageOpacity?: number,
 *   pieceWhiteColorOpacity?: number,
 *   pieceWhiteImageOpacity?: number,
 *   pieceBlackColorOpacity?: number,
 *   pieceBlackImageOpacity?: number
 * }} BoardThemePrefs
 */

/** @type {BoardThemePrefs} */
export const DEFAULT_BOARD_THEME = {
  pieceWhite: "#000000",
  pieceBlack: "#000000",
  squareLight: "#858585",
  squareDark: "#4d1414",
  squareLightImage: DEFAULT_SQUARE_LIGHT_URL,
  squareDarkImage: DEFAULT_SQUARE_DARK_URL,
  pieceWhiteImage: DEFAULT_SQUARE_LIGHT_URL,
  pieceBlackImage: DEFAULT_SQUARE_DARK_URL,
  squareLightColorOpacity: 1,
  squareLightImageOpacity: 1,
  squareDarkColorOpacity: 1,
  squareDarkImageOpacity: 1,
  pieceWhiteColorOpacity: 0,
  pieceWhiteImageOpacity: 1,
  pieceBlackColorOpacity: 1,
  pieceBlackImageOpacity: 1
};

/** @param {unknown} v @param {number} [fallback] */
export function pickThemeOpacity(v, fallback = 1) {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(1, Math.max(0, n));
}

/** @param {string} hexA @param {string} hexB @param {number} t 0..1 */
export function mixThemeHex(hexA, hexB, t) {
  const clamp = Math.min(1, Math.max(0, t));
  const parse = (hex) => {
    const n = parseInt(hex.replace(/^#/, ""), 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  };
  const a = parse(hexA);
  const b = parse(hexB);
  const r = Math.round(a.r + (b.r - a.r) * clamp);
  const g = Math.round(a.g + (b.g - a.g) * clamp);
  const bl = Math.round(a.b + (b.b - a.b) * clamp);
  return "#" + ((1 << 24) + (r << 16) + (g << 8) + bl).toString(16).slice(1);
}

/** @param {unknown} v */
function pickImageUrl(v) {
  if (typeof v !== "string" || !v) return undefined;
  if (v.startsWith("data:image/")) return v;
  if (/^https?:\/\//i.test(v)) return v;
  return undefined;
}

/** @param {unknown} o @param {string} key */
function pickOpacityField(o, key) {
  const v = pickThemeOpacity(o[key], 1);
  return v;
}

/** @param {unknown} p */
function normalizeTheme(p) {
  if (!p || typeof p !== "object") return null;
  const o = /** @type {Record<string, unknown>} */ (p);
  const pick = (key, fallback) =>
    typeof o[key] === "string" && /^#[0-9a-fA-F]{6}$/.test(o[key]) ? o[key] : fallback;
  /** @type {BoardThemePrefs} */
  const out = {
    pieceWhite: pick("pieceWhite", DEFAULT_BOARD_THEME.pieceWhite),
    pieceBlack: pick("pieceBlack", DEFAULT_BOARD_THEME.pieceBlack),
    squareLight: pick("squareLight", DEFAULT_BOARD_THEME.squareLight),
    squareDark: pick("squareDark", DEFAULT_BOARD_THEME.squareDark)
  };
  const lightImg = pickImageUrl(o.squareLightImage);
  const darkImg = pickImageUrl(o.squareDarkImage);
  const whitePieceImg = pickImageUrl(o.pieceWhiteImage);
  const blackPieceImg = pickImageUrl(o.pieceBlackImage);
  if (lightImg) out.squareLightImage = lightImg;
  if (darkImg) out.squareDarkImage = darkImg;
  if (whitePieceImg) out.pieceWhiteImage = whitePieceImg;
  if (blackPieceImg) out.pieceBlackImage = blackPieceImg;
  out.squareLightColorOpacity = pickOpacityField(o, "squareLightColorOpacity");
  out.squareLightImageOpacity = pickOpacityField(o, "squareLightImageOpacity");
  out.squareDarkColorOpacity = pickOpacityField(o, "squareDarkColorOpacity");
  out.squareDarkImageOpacity = pickOpacityField(o, "squareDarkImageOpacity");
  out.pieceWhiteColorOpacity = pickOpacityField(o, "pieceWhiteColorOpacity");
  out.pieceWhiteImageOpacity = pickOpacityField(o, "pieceWhiteImageOpacity");
  out.pieceBlackColorOpacity = pickOpacityField(o, "pieceBlackColorOpacity");
  out.pieceBlackImageOpacity = pickOpacityField(o, "pieceBlackImageOpacity");
  return out;
}

/** @returns {BoardThemePrefs} */
export function loadBoardThemePrefs() {
  try {
    const raw = localStorage.getItem(BOARD_THEME_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_BOARD_THEME };
    return normalizeTheme(JSON.parse(raw)) || { ...DEFAULT_BOARD_THEME };
  } catch (_) {
    return { ...DEFAULT_BOARD_THEME };
  }
}

/** @param {BoardThemePrefs} prefs */
export function saveBoardThemePrefs(prefs) {
  try {
    localStorage.setItem(BOARD_THEME_STORAGE_KEY, JSON.stringify(normalizeTheme(prefs) || prefs));
  } catch (_) {
    /* ignore quota */
  }
}

/** @param {string} hex */
export function hexToThreeColor(hex) {
  return parseInt(hex.replace(/^#/, ""), 16);
}
