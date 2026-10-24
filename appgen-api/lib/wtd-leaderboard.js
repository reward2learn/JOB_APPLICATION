/** Pure helpers for WTD leaderboard (unit-tested). */

export const WTD_LEVEL_IDS = new Set([
  "inhibit",
  "memory",
  "switch",
  "pattern",
  "sprint",
  "spatial3d",
  "rainbow3d",
  "chess"
]);

export const WTD_MAX_ENTRIES = 800;
export const WTD_MAX_PLAYER_LEN = 40;

export function validateWtdEntry(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Body must be a JSON object" };
  }
  const levelId = typeof body.levelId === "string" ? body.levelId.trim() : "";
  if (!WTD_LEVEL_IDS.has(levelId)) {
    return { ok: false, error: "levelId must be one of: " + [...WTD_LEVEL_IDS].join(", ") };
  }
  const timeMs = Number(body.timeMs);
  if (!Number.isFinite(timeMs) || timeMs < 400 || timeMs > 600000) {
    return { ok: false, error: "timeMs must be a number between 400 and 600000" };
  }
  const points = Number(body.points);
  if (!Number.isFinite(points) || points < 0 || points > 5000) {
    return { ok: false, error: "points must be a number between 0 and 5000" };
  }
  const accuracyPct = Number(body.accuracyPct);
  if (!Number.isFinite(accuracyPct) || accuracyPct < 0 || accuracyPct > 100) {
    return { ok: false, error: "accuracyPct must be a number between 0 and 100" };
  }
  let player = typeof body.player === "string" ? body.player.trim() : "Anonymous";
  if (!player) player = "Anonymous";
  if (player.length > WTD_MAX_PLAYER_LEN) {
    return { ok: false, error: "player must be <= " + WTD_MAX_PLAYER_LEN + " characters" };
  }
  player = player.replace(/[\x00-\x1f\x7f<>]/g, "").slice(0, WTD_MAX_PLAYER_LEN);
  return {
    ok: true,
    entry: {
      levelId,
      timeMs: Math.round(timeMs),
      points: Math.round(points),
      accuracyPct: Math.round(accuracyPct),
      player
    }
  };
}

export function sanitizeWtdEntry(raw, fallbackId, fallbackAt) {
  if (!raw || typeof raw !== "object") return null;
  const levelId = typeof raw.levelId === "string" ? raw.levelId.trim() : "";
  if (!WTD_LEVEL_IDS.has(levelId)) return null;
  const timeMs = Number(raw.timeMs);
  const points = Number(raw.points);
  if (!Number.isFinite(timeMs) || !Number.isFinite(points)) return null;
  let player = typeof raw.player === "string" ? raw.player.trim() : "Anonymous";
  if (!player) player = "Anonymous";
  player = player.replace(/[\x00-\x1f\x7f<>]/g, "").slice(0, WTD_MAX_PLAYER_LEN);
  const id =
    typeof raw.id === "string" && raw.id.length <= 80 ? raw.id : fallbackId || "wtd-" + Date.now();
  let at = typeof raw.at === "string" ? raw.at : "";
  if (!at || Number.isNaN(Date.parse(at))) at = fallbackAt || new Date().toISOString();
  const accuracyPct = Number(raw.accuracyPct);
  return {
    id,
    player,
    levelId,
    timeMs: Math.round(timeMs),
    points: Math.round(points),
    accuracyPct: Number.isFinite(accuracyPct) ? Math.round(accuracyPct) : 0,
    at
  };
}

export function appendWtdEntry(entries, entry, maxEntries = WTD_MAX_ENTRIES) {
  const list = Array.isArray(entries) ? entries.slice() : [];
  list.unshift(entry);
  list.sort((a, b) => {
    const ta = Date.parse(a.at) || 0;
    const tb = Date.parse(b.at) || 0;
    return tb - ta;
  });
  return list.slice(0, maxEntries);
}

export function filterAndSortLeaderboard(entries, levelId, limit) {
  let rows = (Array.isArray(entries) ? entries : []).slice();
  if (levelId && levelId !== "all") {
    rows = rows.filter((e) => e && e.levelId === levelId);
  }
  rows.sort((a, b) => (a.timeMs || 0) - (b.timeMs || 0));
  const cap = Math.min(Math.max(Number(limit) || 25, 1), 100);
  return rows.slice(0, cap);
}
