// Share blobs for cover letter / CV (unguessable token). Stored as private blobs;
// world-readable only via GET /api/application-view?token=… (not public blob URLs).

import crypto from "crypto";

export const PUBLIC_SHARE_PREFIX = "applications/share/";

export function makeShareToken() {
  return crypto.randomBytes(24).toString("base64url");
}

/** @returns {string|null} blob pathname or null if token invalid */
export function publicSharePath(token) {
  const safe = String(token || "").replace(/[^a-zA-Z0-9_-]/g, "");
  if (safe.length < 16 || safe.length > 64) return null;
  return PUBLIC_SHARE_PREFIX + safe + ".json";
}

export function isValidShareToken(token) {
  return publicSharePath(token) !== null;
}

export function buildShareDocUrls(origin, token) {
  if (!isValidShareToken(token)) return null;
  const base = String(origin || "").replace(/\/$/, "");
  const q = encodeURIComponent(token);
  return {
    letter: `${base}/api/application-view?token=${q}&doc=letter`,
    cv: `${base}/api/application-view?token=${q}&doc=cv`
  };
}

export function requestOrigin(req) {
  if (process.env.APPGEN_PUBLIC_ORIGIN) {
    return String(process.env.APPGEN_PUBLIC_ORIGIN).replace(/\/$/, "");
  }
  try {
    const url = new URL(req.url, "https://apply4job.vercel.app");
    return url.origin;
  } catch {
    return "https://apply4job.vercel.app";
  }
}

export async function publishPublicShare(putFn, token, snapshot) {
  const path = publicSharePath(token);
  if (!path) throw new Error("Invalid share token");
  await putFn(path, JSON.stringify(snapshot), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json"
  });
}

export async function revokePublicShare(delFn, token) {
  const path = publicSharePath(token);
  if (!path) return;
  try {
    await delFn(path);
  } catch (e) {
    if (e && (e.name === "BlobNotFoundError" || /not found/i.test(String(e.message)))) return;
    throw e;
  }
}
