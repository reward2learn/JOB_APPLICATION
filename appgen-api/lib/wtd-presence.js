/**
 * Lab presence — signed-in users who recently heartbeated with device geo + timezone.
 * Google OAuth does not provide lat/lng; clients send navigator.geolocation.
 */
import { get, put } from "@vercel/blob";
import { blobResultToText, isBlobNotFound } from "./user-settings.js";

export const PRESENCE_BLOB = "wtd/presence/active.json";
/** Consider a user active if they heartbeated within this window. */
export const PRESENCE_TTL_MS = 5 * 60 * 1000;
const MAX_ENTRIES = 80;

function clampCoord(n, min, max) {
  const x = Number(n);
  if (!Number.isFinite(x)) return null;
  return Math.min(max, Math.max(min, x));
}

/** @param {unknown} raw */
export function sanitizeTimezone(raw) {
  const t = String(raw || "").trim().slice(0, 64);
  if (!t || !/^[A-Za-z0-9_+\-\/]+$/.test(t)) return null;
  return t;
}

/**
 * @param {{ lat?: unknown, lng?: unknown, timezone?: unknown }} body
 */
export function sanitizePresenceGeo(body) {
  const lat = clampCoord(body && body.lat, -90, 90);
  const lng = clampCoord(body && body.lng, -180, 180);
  const timezone = sanitizeTimezone(body && body.timezone);
  return { lat, lng, timezone };
}

function pruneList(list, now = Date.now()) {
  const cutoff = now - PRESENCE_TTL_MS;
  return (Array.isArray(list) ? list : [])
    .filter((e) => e && e.id && e.updatedAt && new Date(e.updatedAt).getTime() > cutoff)
    .slice(0, MAX_ENTRIES);
}

export async function loadPresenceList(getFn = get) {
  try {
    const text = await blobResultToText(
      await getFn(PRESENCE_BLOB, { access: "private", useCache: false })
    );
    if (!text || !text.trim()) return [];
    const parsed = JSON.parse(text);
    return pruneList(parsed.users || parsed || []);
  } catch (e) {
    if (isBlobNotFound(e)) return [];
    throw e;
  }
}

export async function savePresenceList(list, putFn = put) {
  const users = pruneList(list);
  await putFn(
    PRESENCE_BLOB,
    JSON.stringify({ version: 1, updatedAt: new Date().toISOString(), users }),
    {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json"
    }
  );
  return users;
}

/**
 * Upsert the signed-in user into the active presence list.
 * @param {{ id: string, name?: string|null, picture?: string|null, email?: string|null }} user
 * @param {{ lat?: number|null, lng?: number|null, timezone?: string|null }} geo
 */
export async function upsertPresence(user, geo, deps = {}) {
  const getFn = deps.get || get;
  const putFn = deps.put || put;
  if (!user || !user.id) return { ok: false, error: "Sign in required" };
  const list = await loadPresenceList(getFn);
  const now = new Date().toISOString();
  const next = {
    id: String(user.id),
    name: String(user.name || user.email || "Player").trim().slice(0, 40),
    picture: user.picture || null,
    lat: geo.lat != null ? geo.lat : null,
    lng: geo.lng != null ? geo.lng : null,
    timezone: geo.timezone || null,
    updatedAt: now
  };
  const idx = list.findIndex((e) => e.id === next.id);
  if (idx >= 0) list[idx] = { ...list[idx], ...next };
  else list.unshift(next);
  const users = await savePresenceList(list, putFn);
  return { ok: true, users, me: next };
}

/** Public list for signed-in lab clients (no email). */
export function publicPresenceList(users, selfId) {
  return (users || []).map((u) => ({
    id: u.id,
    name: u.name,
    picture: u.picture || null,
    lat: u.lat,
    lng: u.lng,
    timezone: u.timezone,
    updatedAt: u.updatedAt,
    isYou: u.id === String(selfId || "")
  }));
}
