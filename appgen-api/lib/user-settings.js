/**
 * Per-user Application Generator settings (profile + appearance only).
 * Global content overrides live in admin-settings blob (admin API).
 * Stored in Vercel Blob; keyed by Google OAuth `sub` (hashed for path).
 */

import crypto from "crypto";

export const USER_SETTINGS_PREFIX = "user-settings/";
export const MAX_SETTINGS_BYTES = 3 * 1024 * 1024; // base64 photos/banners

const LAYOUTS = ["classic", "sidebar", "banner", "compact"];
const KNOWN_PROFILE_KEYS = [
  "name",
  "location",
  "mobile",
  "whatsapp",
  "linkedin",
  "github",
  "email",
  "photo"
];
const KNOWN_APPEARANCE_KEYS = ["layout", "accent", "accent2", "banner", "copyBackground"];

function isString(v) {
  return typeof v === "string";
}

export function userSettingsBlobPath(userSub) {
  const id = String(userSub || "").trim();
  if (!id) return null;
  const hash = crypto.createHash("sha256").update(id).digest("hex").slice(0, 40);
  return USER_SETTINGS_PREFIX + hash + ".json";
}

export function validateUserSettings(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Body must be a JSON object" };
  }
  if (body.version !== undefined && typeof body.version !== "number") {
    return { ok: false, error: "version must be a number" };
  }
  if (body.content !== undefined) {
    return { ok: false, error: "content is not allowed on user settings; use admin settings" };
  }
  const sections = [
    ["profile", KNOWN_PROFILE_KEYS],
    ["appearance", KNOWN_APPEARANCE_KEYS]
  ];
  for (const [sec, keys] of sections) {
    if (body[sec] === undefined) continue;
    if (typeof body[sec] !== "object" || Array.isArray(body[sec])) {
      return { ok: false, error: sec + " must be an object" };
    }
    for (const k of Object.keys(body[sec])) {
      if (!keys.includes(k)) return { ok: false, error: "Unknown key " + sec + "." + k };
    }
    for (const k of keys) {
      if (body[sec][k] !== undefined && !isString(body[sec][k])) {
        return { ok: false, error: sec + "." + k + " must be a string" };
      }
    }
  }
  if (body.profile && body.profile.photo && !/^data:image\//.test(body.profile.photo)) {
    return { ok: false, error: "profile.photo must be a data:image URI or empty" };
  }
  if (body.appearance) {
    if (body.appearance.banner && !/^data:image\//.test(body.appearance.banner)) {
      return { ok: false, error: "appearance.banner must be a data:image URI or empty" };
    }
    if (
      body.appearance.layout !== undefined &&
      !LAYOUTS.includes(body.appearance.layout)
    ) {
      return { ok: false, error: "appearance.layout invalid" };
    }
    if (
      body.appearance.copyBackground !== undefined &&
      !["white", "black"].includes(body.appearance.copyBackground)
    ) {
      return { ok: false, error: "appearance.copyBackground invalid" };
    }
    for (const k of ["accent", "accent2"]) {
      if (
        body.appearance[k] !== undefined &&
        !/^#[0-9a-fA-F]{6}$/.test(body.appearance[k])
      ) {
        return { ok: false, error: "appearance." + k + " must be #RRGGBB" };
      }
    }
  }
  const bytes = Buffer.byteLength(JSON.stringify(body), "utf8");
  if (bytes > MAX_SETTINGS_BYTES) {
    return { ok: false, error: "Settings payload too large (max ~3MB)" };
  }
  return { ok: true };
}

export async function blobResultToText(result) {
  if (result === undefined || result === null) return "";
  if (typeof result === "string") return result;
  const status =
    typeof result.statusCode === "number"
      ? result.statusCode
      : typeof result.status === "number"
        ? result.status
        : null;
  if (status !== null && status !== 200) {
    const err = new Error("Blob not found (HTTP " + status + ")");
    err.name = "BlobNotFoundError";
    throw err;
  }
  if (typeof result.text === "function") return await result.text();
  if (result.stream) {
    const reader = result.stream.getReader();
    const dec = new TextDecoder();
    let out = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      out += dec.decode(value, { stream: true });
    }
    return out + dec.decode();
  }
  return "";
}

export function isBlobNotFound(e) {
  if (!e) return false;
  if (e.name === "BlobNotFoundError" || e.code === "blob_not_found") return true;
  return /not[\s_-]?found/i.test(String(e.message || ""));
}
