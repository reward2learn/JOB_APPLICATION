/**
 * Per-user saved applications (Vercel Blob), keyed by Google OAuth `sub` (hashed for path).
 */

import crypto from "crypto";

export const LEGACY_INDEX_PATH = "applications/index.json";
export const LEGACY_RECORD_PREFIX = "applications/";
export const LEGACY_MIGRATION_MARKER = "applications/legacy-migrated.json";
export const USER_APPS_PREFIX = "applications/users/";

export function userApplicationsHash(userSub) {
  const id = String(userSub || "").trim();
  if (!id) return null;
  return crypto.createHash("sha256").update(id).digest("hex").slice(0, 40);
}

export function userApplicationsPaths(userSub) {
  const hash = userApplicationsHash(userSub);
  if (!hash) return null;
  const base = USER_APPS_PREFIX + hash + "/";
  return {
    hash,
    indexPath: base + "index.json",
    recordPath(id) {
      const safe = String(id || "").replace(/[^a-zA-Z0-9\-]/g, "").slice(0, 64);
      return base + safe + ".json";
    }
  };
}

export function legacyRecordPath(id) {
  const safe = String(id || "").replace(/[^a-zA-Z0-9\-]/g, "").slice(0, 64);
  return LEGACY_RECORD_PREFIX + safe + ".json";
}
