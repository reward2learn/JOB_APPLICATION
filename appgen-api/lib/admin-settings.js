/**
 * Global Application Generator content overrides (KB section text, letter themes).
 * Admin-only; stored in Vercel Blob at a fixed path.
 */

export const ADMIN_SETTINGS_BLOB_PATH = "admin-settings/global.json";
export const MAX_ADMIN_SETTINGS_BYTES = 3 * 1024 * 1024;

export const KNOWN_CONTENT_KEYS = [
  "summary",
  "skills",
  "tech",
  "experience",
  "education",
  "projects",
  "references",
  "letterThemes",
  "openingTemplate"
];

function isString(v) {
  return typeof v === "string";
}

export function validateAdminSettings(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Body must be a JSON object" };
  }
  if (body.version !== undefined && typeof body.version !== "number") {
    return { ok: false, error: "version must be a number" };
  }
  if (body.content === undefined) {
    return { ok: false, error: "content is required" };
  }
  if (typeof body.content !== "object" || Array.isArray(body.content)) {
    return { ok: false, error: "content must be an object" };
  }
  for (const k of Object.keys(body.content)) {
    if (!KNOWN_CONTENT_KEYS.includes(k)) {
      return { ok: false, error: "Unknown key content." + k };
    }
  }
  for (const k of KNOWN_CONTENT_KEYS) {
    if (body.content[k] !== undefined && !isString(body.content[k])) {
      return { ok: false, error: "content." + k + " must be a string" };
    }
  }
  const bytes = Buffer.byteLength(JSON.stringify(body), "utf8");
  if (bytes > MAX_ADMIN_SETTINGS_BYTES) {
    return { ok: false, error: "Admin settings payload too large (max ~3MB)" };
  }
  return { ok: true };
}

export function pickUserSettingsOnly(stored) {
  if (!stored || typeof stored !== "object") return null;
  const out = { version: stored.version != null ? stored.version : 1 };
  if (stored.profile && typeof stored.profile === "object") out.profile = stored.profile;
  if (stored.appearance && typeof stored.appearance === "object") out.appearance = stored.appearance;
  return out;
}
