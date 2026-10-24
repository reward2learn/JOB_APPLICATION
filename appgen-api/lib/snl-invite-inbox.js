/**
 * Per-user SNL lobby invite inbox (accept / reject direct invites from online lab users).
 */
import crypto from "crypto";
import { get, put } from "@vercel/blob";
import { blobResultToText, isBlobNotFound } from "./user-settings.js";

export const SNL_INBOX_PREFIX = "wtd/snl-inbox/";
const INBOX_TTL_MS = 2 * 60 * 60 * 1000;
const MAX_INBOX = 40;

function safeUserId(raw) {
  const id = String(raw || "").trim();
  if (!id || id.length > 128) return null;
  return id.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64) || null;
}

function inboxPath(userId) {
  const id = safeUserId(userId);
  if (!id) return null;
  return SNL_INBOX_PREFIX + id + ".json";
}

function pruneInbox(items, now = Date.now()) {
  const cutoff = now - INBOX_TTL_MS;
  return (Array.isArray(items) ? items : [])
    .filter((e) => {
      if (!e || !e.id || e.status !== "pending") return false;
      const t = new Date(e.createdAt || 0).getTime();
      return Number.isFinite(t) && t > cutoff;
    })
    .slice(0, MAX_INBOX);
}

export async function loadInbox(userId, getFn = get) {
  const path = inboxPath(userId);
  if (!path) return [];
  try {
    const text = await blobResultToText(await getFn(path, { access: "private", useCache: false }));
    if (!text.trim()) return [];
    const parsed = JSON.parse(text);
    return pruneInbox(parsed.items || parsed || []);
  } catch (e) {
    if (isBlobNotFound(e)) return [];
    throw e;
  }
}

async function saveInbox(userId, items, putFn = put) {
  const path = inboxPath(userId);
  if (!path) return [];
  const list = pruneInbox(items);
  await putFn(
    path,
    JSON.stringify({ version: 1, updatedAt: new Date().toISOString(), items: list }),
    {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json"
    }
  );
  return list;
}

/**
 * @param {string} toUserId
 * @param {{ id: string, name?: string|null }} fromUser
 * @param {{ lobbyToken: string, joinUrl: string, lobbyLabel?: string }} payload
 */
export async function pushDirectLobbyInvite(toUserId, fromUser, payload, deps = {}) {
  const getFn = deps.get || get;
  const putFn = deps.put || put;
  const to = safeUserId(toUserId);
  const from = safeUserId(fromUser && fromUser.id);
  const lobbyToken = String(payload?.lobbyToken || "").trim();
  const joinUrl = String(payload?.joinUrl || "").trim();
  if (!to || !from || !lobbyToken || !joinUrl) {
    return { ok: false, error: "Invalid invite payload" };
  }
  if (to === from) return { ok: false, error: "Cannot invite yourself" };
  const list = await loadInbox(to, getFn);
  const dup = list.find(
    (e) => e.lobbyToken === lobbyToken && e.fromId === from && e.status === "pending"
  );
  if (dup) return { ok: true, item: dup, duplicate: true };
  const item = {
    id: crypto.randomBytes(8).toString("hex"),
    status: "pending",
    lobbyToken,
    joinUrl,
    lobbyLabel: String(payload.lobbyLabel || "Snakes & Ladders lobby").slice(0, 80),
    fromId: from,
    fromName: String(fromUser.name || "Player").slice(0, 40),
    createdAt: new Date().toISOString()
  };
  list.unshift(item);
  const saved = await saveInbox(to, list, putFn);
  const savedItem = saved.find((e) => e.id === item.id) || item;
  return { ok: true, item: savedItem };
}

/** Public inbox rows for the signed-in user (pending only). */
export function publicInboxList(items) {
  return pruneInbox(items).map((e) => ({
    id: e.id,
    lobbyToken: e.lobbyToken,
    joinUrl: e.joinUrl,
    lobbyLabel: e.lobbyLabel,
    fromId: e.fromId,
    fromName: e.fromName,
    createdAt: e.createdAt
  }));
}

/**
 * @param {string} userId
 * @param {string} inboxId
 * @param {"accept"|"reject"} decision
 */
export async function respondInboxInvite(userId, inboxId, decision, deps = {}) {
  const getFn = deps.get || get;
  const putFn = deps.put || put;
  const uid = safeUserId(userId);
  const id = String(inboxId || "").trim();
  if (!uid || !id) return { ok: false, error: "Invalid request" };
  const list = await loadInbox(uid, getFn);
  const idx = list.findIndex((e) => e.id === id && e.status === "pending");
  if (idx < 0) return { ok: false, error: "Invite not found", code: "not_found" };
  const item = list[idx];
  if (decision === "reject") {
    list.splice(idx, 1);
    await saveInbox(uid, list, putFn);
    return { ok: true, rejected: true };
  }
  list.splice(idx, 1);
  await saveInbox(uid, list, putFn);
  return { ok: true, accepted: true, joinUrl: item.joinUrl, lobbyToken: item.lobbyToken };
}
