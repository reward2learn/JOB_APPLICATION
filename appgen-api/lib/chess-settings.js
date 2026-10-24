/**
 * WTD Chess visual + coaching prefs (Vercel Blob per Google OAuth sub).
 */

import crypto from "crypto";

export const CHESS_SETTINGS_PREFIX = "chess-settings/";
export const CHESS_SETTINGS_VERSION = 1;
export const CHESS_SETTINGS_KIND = "appgen-wtd-chess-settings";
export const MAX_CHESS_SETTINGS_BYTES = 3 * 1024 * 1024;

const BG_MODES = ["color", "galaxy", "image"];
const LIGHT_MIN = 0.25;
const LIGHT_MAX = 2;

function isString(v) {
  return typeof v === "string";
}

function pickHex(v, fallback) {
  return isString(v) && /^#[0-9a-fA-F]{6}$/.test(v) ? v : fallback;
}

function pickImageUrl(v) {
  if (!isString(v) || !v) return undefined;
  if (v.startsWith("data:image/")) return v;
  if (/^https?:\/\//i.test(v)) return v;
  return undefined;
}

function pickOpacity(v, fallback = 1) {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(1, Math.max(0, n));
}

function normalizeBackground(p) {
  if (!p || typeof p !== "object") return null;
  const mode = p.mode;
  if (mode === "galaxy") return { mode: "galaxy" };
  if (mode === "color") {
    return { mode: "color", color: pickHex(p.color, "#d8e2ea") };
  }
  const bgImage = pickImageUrl(p.imageDataUrl);
  if (mode === "image" && bgImage) {
    const out = {
      mode: "image",
      imageDataUrl: bgImage,
      imageColorOpacity: pickOpacity(p.imageColorOpacity),
      imageOpacity: pickOpacity(p.imageOpacity)
    };
    if (isString(p.color)) out.color = pickHex(p.color, "#d8e2ea");
    return out;
  }
  return null;
}

function normalizeBoardTheme(p) {
  if (!p || typeof p !== "object") return null;
  /** @type {Record<string, unknown>} */
  const out = {
    pieceWhite: pickHex(p.pieceWhite, "#f2ebe0"),
    pieceBlack: pickHex(p.pieceBlack, "#242424"),
    squareLight: pickHex(p.squareLight, "#f0ead6"),
    squareDark: pickHex(p.squareDark, "#769656")
  };
  for (const key of [
    "squareLightImage",
    "squareDarkImage",
    "pieceWhiteImage",
    "pieceBlackImage"
  ]) {
    const url = pickImageUrl(p[key]);
    if (url) out[key] = url;
  }
  for (const key of [
    "squareLightColorOpacity",
    "squareLightImageOpacity",
    "squareDarkColorOpacity",
    "squareDarkImageOpacity",
    "pieceWhiteColorOpacity",
    "pieceWhiteImageOpacity",
    "pieceBlackColorOpacity",
    "pieceBlackImageOpacity"
  ]) {
    if (p[key] !== undefined) out[key] = pickOpacity(p[key]);
  }
  return out;
}

function normalizeSceneLight(p) {
  if (!p || typeof p !== "object") return null;
  const n = typeof p.intensity === "number" ? p.intensity : Number(p.intensity);
  if (!Number.isFinite(n)) return { intensity: 1 };
  return { intensity: Math.min(LIGHT_MAX, Math.max(LIGHT_MIN, n)) };
}

function normalizeCoaching(p) {
  if (!p || typeof p !== "object") return { beginnerHints: true, lessonMode: false };
  return {
    beginnerHints: p.beginnerHints !== false,
    lessonMode: !!p.lessonMode
  };
}

/**
 * Accept stored blob or export file (optional kind / exportedAt stripped).
 * @param {unknown} body
 */
export function normalizeChessSettings(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const o = /** @type {Record<string, unknown>} */ (body);
  const background = normalizeBackground(o.background);
  const boardTheme = normalizeBoardTheme(o.boardTheme);
  const sceneLight = normalizeSceneLight(o.sceneLight);
  if (!background || !boardTheme || !sceneLight) return null;
  const coaching = normalizeCoaching(o.coaching);
  const version =
    typeof o.version === "number" && Number.isFinite(o.version)
      ? o.version
      : CHESS_SETTINGS_VERSION;
  return {
    version,
    background,
    boardTheme,
    sceneLight,
    coaching
  };
}

export function validateChessSettings(body) {
  const norm = normalizeChessSettings(body);
  if (!norm) {
    return { ok: false, error: "Invalid chess settings shape" };
  }
  const bytes = Buffer.byteLength(JSON.stringify(norm), "utf8");
  if (bytes > MAX_CHESS_SETTINGS_BYTES) {
    return {
      ok: false,
      error: "Chess settings too large (max ~3MB — reduce or remove custom images)"
    };
  }
  return { ok: true, settings: norm };
}

export function chessSettingsBlobPath(userSub) {
  const id = String(userSub || "").trim();
  if (!id) return null;
  const hash = crypto.createHash("sha256").update(id).digest("hex").slice(0, 40);
  return CHESS_SETTINGS_PREFIX + hash + ".json";
}
