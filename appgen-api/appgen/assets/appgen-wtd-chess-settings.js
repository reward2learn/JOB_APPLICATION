/**
 * WTD Chess settings bundle — export/import file + Vercel Blob sync.
 */

import { loadBoardThemePrefs, saveBoardThemePrefs } from "./appgen-wtd-chess-board-theme.js";
import { loadBackgroundPrefs, saveBackgroundPrefs } from "./appgen-wtd-chess-scene-bg.js";
import { loadSceneLightPrefs, saveSceneLightPrefs } from "./appgen-wtd-chess-scene-light.js";
import {
  isLessonModeEnabled,
  LESSON_MODE_KEY,
  setLessonModeEnabled
} from "./appgen-wtd-chess-golden-rules.js";
import { appgenFetch, isExtensionFetchNoise, warnExtensionFetchOnce } from "./appgen-net.js";

export const CHESS_SETTINGS_API = "/api/chess-settings";
export const CHESS_SETTINGS_KIND = "appgen-wtd-chess-settings";
export const CHESS_SETTINGS_VERSION = 1;
export const MAX_CHESS_SETTINGS_BYTES = 3 * 1024 * 1024;

/** First-visit coaching defaults (match 2026-10-21 export). */
export const DEFAULT_CHESS_COACHING = { beginnerHints: true, lessonMode: true };

const BEGINNER_HINTS_KEY = "wtdChessBeginnerHints";

function loadBeginnerHints() {
  try {
    const raw = localStorage.getItem(BEGINNER_HINTS_KEY);
    if (raw === "0") return false;
    if (raw === "1") return true;
  } catch (_) {
    /* ignore */
  }
  return true;
}

function saveBeginnerHints(on) {
  try {
    localStorage.setItem(BEGINNER_HINTS_KEY, on ? "1" : "0");
  } catch (_) {
    /* ignore */
  }
}

/** @returns {import("./appgen-wtd-chess-settings.js").ChessSettingsPayload} */
export function readChessSettingsFromStorage() {
  return {
    version: CHESS_SETTINGS_VERSION,
    background: loadBackgroundPrefs(),
    boardTheme: loadBoardThemePrefs(),
    sceneLight: loadSceneLightPrefs(),
    coaching: {
      beginnerHints: loadBeginnerHints(),
      lessonMode: isLessonModeEnabled()
    }
  };
}

/**
 * @typedef {{
 *   version: number,
 *   background: import("./appgen-wtd-chess-scene-bg.js").SceneBgPrefs,
 *   boardTheme: import("./appgen-wtd-chess-board-theme.js").BoardThemePrefs,
 *   sceneLight: import("./appgen-wtd-chess-scene-light.js").SceneLightPrefs,
 *   coaching: { beginnerHints: boolean, lessonMode: boolean }
 * }} ChessSettingsPayload
 */

/** @param {ChessSettingsPayload} payload */
export function writeChessSettingsToStorage(payload) {
  if (payload.background) saveBackgroundPrefs(payload.background);
  if (payload.boardTheme) saveBoardThemePrefs(payload.boardTheme);
  if (payload.sceneLight) saveSceneLightPrefs(payload.sceneLight);
  if (payload.coaching) {
    saveBeginnerHints(payload.coaching.beginnerHints !== false);
    setLessonModeEnabled(!!payload.coaching.lessonMode);
  }
}

/** @param {unknown} raw @returns {ChessSettingsPayload | null} */
export function parseChessSettingsImport(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = /** @type {Record<string, unknown>} */ (raw);
  if (o.kind !== undefined && o.kind !== CHESS_SETTINGS_KIND) return null;
  const background = o.background;
  const boardTheme = o.boardTheme;
  const sceneLight = o.sceneLight;
  const coaching = o.coaching;
  if (!background || typeof background !== "object") return null;
  if (!boardTheme || typeof boardTheme !== "object") return null;
  if (!sceneLight || typeof sceneLight !== "object") return null;
  /** @type {ChessSettingsPayload} */
  const payload = {
    version: typeof o.version === "number" ? o.version : CHESS_SETTINGS_VERSION,
    background: /** @type {ChessSettingsPayload["background"]} */ (background),
    boardTheme: /** @type {ChessSettingsPayload["boardTheme"]} */ (boardTheme),
    sceneLight: /** @type {ChessSettingsPayload["sceneLight"]} */ (sceneLight),
    coaching:
      coaching && typeof coaching === "object"
        ? {
            beginnerHints:
              /** @type {{ beginnerHints?: boolean }} */ (coaching).beginnerHints !== false,
            lessonMode: !!/** @type {{ lessonMode?: boolean }} */ (coaching).lessonMode
          }
        : { ...DEFAULT_CHESS_COACHING }
  };
  if (chessSettingsByteSize(payload) > MAX_CHESS_SETTINGS_BYTES) return null;
  return payload;
}

/** @param {ChessSettingsPayload} payload */
export function applyChessSettingsPayload(payload) {
  writeChessSettingsToStorage(payload);
  return readChessSettingsFromStorage();
}

/** @param {ChessSettingsPayload} payload */
export function wrapChessSettingsForExport(payload) {
  return {
    kind: CHESS_SETTINGS_KIND,
    version: payload.version != null ? payload.version : CHESS_SETTINGS_VERSION,
    exportedAt: new Date().toISOString(),
    background: payload.background,
    boardTheme: payload.boardTheme,
    sceneLight: payload.sceneLight,
    coaching: payload.coaching
  };
}

/** @param {ChessSettingsPayload} payload */
export function chessSettingsByteSize(payload) {
  return new TextEncoder().encode(JSON.stringify(payload)).length;
}

/** @param {ChessSettingsPayload} payload @param {string} [filename] */
export function downloadChessSettingsExport(payload, filename) {
  const wrapped = wrapChessSettingsForExport(payload);
  const data = JSON.stringify(wrapped, null, 2);
  const blob = new Blob([data], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download =
    filename ||
    "wtd-chess-settings-" + new Date().toISOString().slice(0, 10) + ".json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

function isSignedIn() {
  return !!(
    window.AppgenAuth &&
    typeof window.AppgenAuth.isSignedIn === "function" &&
    window.AppgenAuth.isSignedIn()
  );
}

/** @param {ChessSettingsPayload} payload */
export async function pushChessSettingsToCloud(payload) {
  if (!isSignedIn()) return { ok: false, skipped: true };
  if (chessSettingsByteSize(payload) > MAX_CHESS_SETTINGS_BYTES) {
    return {
      ok: false,
      error: "Chess settings too large for cloud (~3MB max — remove some custom images)"
    };
  }
  try {
    const res = await appgenFetch(CHESS_SETTINGS_API, {
      method: "PUT",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!res) return { ok: false, error: "Network blocked (check browser extensions)" };
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.error || "Could not save chess settings to cloud" };
    }
    return { ok: true, ts: data.ts };
  } catch (e) {
    if (isExtensionFetchNoise(e)) warnExtensionFetchOnce();
    return { ok: false, error: String(e.message || e) };
  }
}

/**
 * Pull cloud chess settings. When loaded, caller should apply to UI (server wins).
 */
export async function pullChessSettingsFromCloud() {
  if (!isSignedIn()) return { ok: false, skipped: true };
  try {
    const res = await appgenFetch(CHESS_SETTINGS_API, { credentials: "same-origin" });
    if (!res) return { ok: false, error: "Network blocked (check browser extensions)" };
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.error || "Could not load chess settings from cloud" };
    }
    if (data.settings) {
      writeChessSettingsToStorage(data.settings);
      return { ok: true, loaded: true, settings: readChessSettingsFromStorage() };
    }
    return { ok: true, loaded: false, settings: null };
  } catch (e) {
    if (isExtensionFetchNoise(e)) warnExtensionFetchOnce();
    return { ok: false, error: String(e.message || e) };
  }
}

/** Coalesce parallel syncs (open WTD fires many access-change listeners at once). */
let chessSettingsSyncPromise = null;

/**
 * On sign-in: server blob wins when present; else upload local snapshot once.
 */
export async function syncChessSettingsWithCloud() {
  if (chessSettingsSyncPromise) return chessSettingsSyncPromise;
  chessSettingsSyncPromise = (async () => {
    try {
      const pull = await pullChessSettingsFromCloud();
      if (!pull.ok) return pull;
      if (pull.loaded && pull.settings) return pull;
      const local = readChessSettingsFromStorage();
      const push = await pushChessSettingsToCloud(local);
      return push.ok ? { ok: true, loaded: false, pushed: true, settings: local } : push;
    } finally {
      chessSettingsSyncPromise = null;
    }
  })();
  return chessSettingsSyncPromise;
}
