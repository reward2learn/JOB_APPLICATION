/**
 * Per-user directory for the Application Generator.
 *
 * Vercel Blob only (no DB):
 *   users/<sha256(sub)>.json  — the user's record (identity, groups, flags)
 *   users-index.json          — admin-readable list of every Google sign-in
 *
 * Written from the Google OAuth callback and lazily from GET /api/auth/me so
 * the admin panel can see users who signed in before this feature existed.
 */

import crypto from "crypto";
import { get, put } from "@vercel/blob";
import { blobResultToText, isBlobNotFound, userSettingsBlobPath } from "./user-settings.js";
import {
  DEFAULT_GROUPS,
  grantsFor,
  groupsForNewUser,
  normalizeGroups
} from "./security-groups.js";
import { loadGroupGrants } from "./group-grants.js";

const RECORD_PREFIX = "users/";
export const USERS_INDEX_PATH = "users-index.json";
/** Don't rewrite lastSeenAt more often than this (me is called on every load). */
export const TOUCH_THROTTLE_MS = 60_000;

function hashSub(sub) {
  return crypto.createHash("sha256").update(String(sub)).digest("hex").slice(0, 40);
}

export function userRecordBlobPath(sub) {
  const id = String(sub || "").trim();
  if (!id) return null;
  return RECORD_PREFIX + hashSub(id) + ".json";
}

async function readJson(path) {
  try {
    const result = await get(path, { access: "private" });
    const raw = (await blobResultToText(result)) || "";
    if (!raw.trim()) return null;
    return JSON.parse(raw);
  } catch (e) {
    if (isBlobNotFound(e)) return null;
    console.error("user-directory read", path, e);
    return null;
  }
}

async function writeJson(path, value) {
  await put(path, JSON.stringify(value), {
    access: "private",
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true
  });
}

/** Index shape: { version, updatedAt, users: { [id]: summary } } */
async function readIndex() {
  const idx = await readJson(USERS_INDEX_PATH);
  if (!idx || typeof idx !== "object" || typeof idx.users !== "object" || !idx.users) {
    return { version: 1, users: {} };
  }
  return idx;
}

export function summarizeUser(record) {
  if (!record || !record.id) return null;
  return {
    id: record.id,
    email: record.email || null,
    name: record.name || null,
    picture: record.picture || null,
    groups: normalizeGroups(record.groups),
    profileCompleted: !!record.profileCompleted,
    firstSeenAt: record.firstSeenAt || null,
    lastSeenAt: record.lastSeenAt || null,
    lastSignInAt: record.lastSignInAt || null,
    signInCount: record.signInCount || 0
  };
}

async function writeIndexEntry(summary) {
  if (!summary || !summary.id) return;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const idx = await readIndex();
      idx.version = 1;
      idx.updatedAt = Date.now();
      idx.users = idx.users || {};
      idx.users[summary.id] = summary;
      await writeJson(USERS_INDEX_PATH, idx);
      return;
    } catch (e) {
      if (attempt === 2) console.error("user-directory index write", e);
      else await new Promise((r) => setTimeout(r, 40 * (attempt + 1)));
    }
  }
}

export async function readUserRecord(sub) {
  const path = userRecordBlobPath(sub);
  if (!path) return null;
  const rec = await readJson(path);
  if (!rec || typeof rec !== "object" || !rec.id) return null;
  rec.groups = normalizeGroups(rec.groups);
  return rec;
}

async function settingsExist(sub) {
  const path = userSettingsBlobPath(sub);
  if (!path) return false;
  try {
    const result = await get(path, { access: "private" });
    const raw = (await blobResultToText(result)) || "";
    return !!raw.trim();
  } catch (e) {
    if (isBlobNotFound(e)) return false;
    return false;
  }
}

/**
 * Create-or-update the record for a signed-in user.
 *
 * @param {object} p
 * @param {string} p.sub               Google OAuth sub (required)
 * @param {string} [p.email]
 * @param {string} [p.name]
 * @param {string} [p.picture]
 * @param {boolean} [p.bumpSignIn]     true on the OAuth callback (counts a sign-in)
 * @param {boolean} [p.fromMe]         true on /api/auth/me (throttles the write)
 * @returns {Promise<object|null>} the record
 */
export async function upsertUser({
  sub,
  email = "",
  name = "",
  picture = "",
  bumpSignIn = false,
  fromMe = false
}) {
  const id = String(sub || "").trim();
  if (!id) return null;
  const path = userRecordBlobPath(id);
  const now = Date.now();
  let rec = await readJson(path);
  const fresh = !rec || typeof rec !== "object" || !rec.id;

  if (fresh) {
    // A user who saved settings before this feature existed has completed onboarding.
    const hadSettings = await settingsExist(id);
    rec = {
      id,
      email: email || "",
      name: name || "",
      picture: picture || "",
      groups: groupsForNewUser(email),
      profileCompleted: hadSettings,
      firstSeenAt: now,
      lastSeenAt: now,
      lastSignInAt: bumpSignIn ? now : null,
      signInCount: bumpSignIn ? 1 : 0,
      updatedAt: now
    };
  } else {
    // Refresh identity from Google on every sign-in / me call.
    if (email) rec.email = email;
    if (name) rec.name = name;
    if (picture) rec.picture = picture;
    rec.groups = normalizeGroups(rec.groups);
    rec.profileCompleted = !!rec.profileCompleted;
    if (bumpSignIn) {
      rec.signInCount = (rec.signInCount || 0) + 1;
      rec.lastSignInAt = now;
      rec.lastSeenAt = now;
    } else if (fromMe && now - (rec.lastSeenAt || 0) < TOUCH_THROTTLE_MS) {
      // Throttled: skip the write, still return the (read) record.
      return rec;
    } else {
      rec.lastSeenAt = now;
    }
    rec.updatedAt = now;
  }

  try {
    await writeJson(path, rec);
  } catch (e) {
    console.error("user-directory record write", e);
    return rec;
  }
  await writeIndexEntry(summarizeUser(rec));
  return rec;
}

/** Admin-visible list of every Google sign-in, newest activity first. */
export async function listUsers() {
  const idx = await readIndex();
  return Object.values(idx.users || {})
    .filter((u) => u && u.id)
    .map((u) => ({ ...u, groups: normalizeGroups(u.groups) }))
    .sort((a, b) => (b.lastSeenAt || 0) - (a.lastSeenAt || 0));
}

/** Admin: assign groups (array) to a user. Creates the record if it is missing. */
export async function setUserGroups(sub, groups) {
  const id = String(sub || "").trim();
  if (!id) return { ok: false, error: "Unknown user id" };
  const next = normalizeGroups(groups);
  let rec = await readUserRecord(id);
  if (!rec) {
    rec = await upsertUser({ sub: id });
  }
  if (!rec) return { ok: false, error: "Could not load user record" };
  rec.groups = next;
  rec.updatedAt = Date.now();
  try {
    await writeJson(userRecordBlobPath(id), rec);
  } catch (e) {
    console.error("user-directory groups write", e);
    return { ok: false, error: "Failed to save groups" };
  }
  await writeIndexEntry(summarizeUser(rec));
  return { ok: true, user: summarizeUser(rec) };
}

/**
 * Bulk group assignment for the admin Users & Access panel.
 * mode: "set" (replace), "add" (union), "remove" (subtract).
 * Reads the index once, patches every record, writes the index once.
 */
export async function assignGroupsToUsers(ids, groups, mode = "set") {
  const list = (Array.isArray(ids) ? ids : [])
    .map((x) => String(x || "").trim())
    .filter(Boolean);
  if (!list.length) return { ok: false, error: "No users selected" };
  const next = normalizeGroups(groups);
  if (!groups || !groups.length) return { ok: false, error: "Pick at least one group" };

  const idx = await readIndex();
  const updated = [];
  for (const id of list) {
    let rec = await readUserRecord(id);
    if (!rec) rec = await upsertUser({ sub: id });
    if (!rec) continue;
    let current = normalizeGroups(rec.groups);
    if (mode === "add") {
      for (const g of next) if (!current.includes(g)) current.push(g);
    } else if (mode === "remove") {
      current = current.filter((g) => !next.includes(g));
      if (!current.length) current = [...DEFAULT_GROUPS];   // never leave a user groupless
    } else {
      current = [...next];
    }
    rec.groups = current;
    rec.updatedAt = Date.now();
    try {
      await writeJson(userRecordBlobPath(id), rec);
    } catch (e) {
      console.error("user-directory bulk write", id, e);
      continue;
    }
    idx.users = idx.users || {};
    idx.users[id] = summarizeUser(rec);
    updated.push(summarizeUser(rec));
  }
  idx.version = 1;
  idx.updatedAt = Date.now();
  try {
    await writeJson(USERS_INDEX_PATH, idx);
  } catch (e) {
    console.error("user-directory bulk index write", e);
  }
  return { ok: true, updated, count: updated.length };
}

/** Flip onboarding complete (called after a successful profile save). */
export async function markProfileComplete(sub, { name = "", location = "" } = {}) {
  const id = String(sub || "").trim();
  if (!id) return null;
  let rec = await readUserRecord(id);
  if (!rec) rec = await upsertUser({ sub: id });
  if (!rec) return null;
  rec.profileCompleted = true;
  if (name && !rec.name) rec.name = name;
  rec.profileCompletedAt = Date.now();
  rec.location = location || rec.location || "";
  rec.updatedAt = Date.now();
  try {
    await writeJson(userRecordBlobPath(id), rec);
  } catch (e) {
    console.error("user-directory profile write", e);
    return rec;
  }
  await writeIndexEntry(summarizeUser(rec));
  return rec;
}

/**
 * What /api/auth/me reports: groups + onboarding state, server-side truth.
 * Never throws — auth must keep working if Blob is unhappy.
 */
export async function resolveAccess({ sub, email } = {}) {
  /* Apply the admin-configured permission matrix before computing grants. */
  try { await loadGroupGrants(); } catch (_) { /* fall back to defaults */ }
  try {
    const rec = await upsertUser({ sub, email, fromMe: true });
    if (rec) {
      const groups = normalizeGroups(rec.groups);
      return { groups, grants: grantsFor(groups), profileCompleted: !!rec.profileCompleted };
    }
  } catch (e) {
    console.error("resolveAccess", e);
  }
  const groups = groupsForNewUser(email);
  return { groups, grants: grantsFor(groups), profileCompleted: false };
}
