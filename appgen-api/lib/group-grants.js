/**
 * Admin-configurable security-group permission matrix.
 *
 * Stored in Vercel Blob at admin-settings/group-grants.json so the platform
 * admin can change what each group can access without a redeploy. When absent
 * (or unreadable) the built-in GROUP_GRANTS in lib/security-groups.js applies.
 */

import { get, put } from "@vercel/blob";
import {
  ALL_GRANTS,
  SECURITY_GROUPS,
  GROUP_GRANTS,
  setGroupGrantsOverride,
  effectiveGroupGrants
} from "./security-groups.js";
import { blobResultToText, isBlobNotFound } from "./user-settings.js";

export const GROUP_GRANTS_BLOB_PATH = "admin-settings/group-grants.json";
/** Serve a cached copy for this long before re-reading Blob (per warm lambda). */
const CACHE_TTL_MS = 30_000;

let cache = { at: 0, matrix: null };

/** Validate an incoming matrix; returns {ok, matrix}|{ok:false,error}. */
export function validateGroupGrants(body) {
  const src = body && typeof body === "object" ? body.groupGrants || body : null;
  if (!src || typeof src !== "object" || Array.isArray(src)) {
    return { ok: false, error: "groupGrants must be an object keyed by group" };
  }
  const matrix = {};
  for (const g of SECURITY_GROUPS) {
    const list = src[g] === undefined ? GROUP_GRANTS[g] : src[g];
    if (!Array.isArray(list)) return { ok: false, error: g + " must be an array of grants" };
    for (const x of list) {
      if (!ALL_GRANTS.includes(x)) return { ok: false, error: "Unknown grant '" + x + "' in " + g };
    }
    matrix[g] = [...new Set(list)];
  }
  /* An Admin group that has lost its `admin` grant would lock everyone out of
     user management — refuse a matrix that does that. */
  if (!matrix.Admin.includes("admin")) {
    return { ok: false, error: "The Admin group must keep the 'admin' grant" };
  }
  return { ok: true, matrix };
}

async function readMatrixFromBlob() {
  try {
    const result = await get(GROUP_GRANTS_BLOB_PATH, { access: "private" });
    const raw = (await blobResultToText(result)) || "";
    if (!raw.trim()) return null;
    const parsed = JSON.parse(raw);
    const v = validateGroupGrants(parsed);
    return v.ok ? v.matrix : null;
  } catch (e) {
    if (isBlobNotFound(e)) return null;
    console.error("group-grants read", e);
    return null;
  }
}

/**
 * Load the configured matrix into the in-process override (and cache it).
 * Call this before any grantsFor()/hasGrant() that must respect admin edits.
 */
export async function loadGroupGrants({ force = false } = {}) {
  const now = Date.now();
  if (!force && cache.matrix && now - cache.at < CACHE_TTL_MS) return cache.matrix;
  const matrix = await readMatrixFromBlob();
  cache = { at: now, matrix };
  setGroupGrantsOverride(matrix);
  return matrix;
}

/** Persist a new matrix and apply it immediately. */
export async function saveGroupGrants(matrix) {
  const v = validateGroupGrants(matrix);
  if (!v.ok) return { ok: false, error: v.error };
  await put(GROUP_GRANTS_BLOB_PATH, JSON.stringify({ version: 1, groupGrants: v.matrix }), {
    access: "private",
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true
  });
  cache = { at: Date.now(), matrix: v.matrix };
  setGroupGrantsOverride(v.matrix);
  return { ok: true, matrix: v.matrix, effective: effectiveGroupGrants() };
}
