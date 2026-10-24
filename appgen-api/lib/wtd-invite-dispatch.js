/**
 * Admin bulk cancel for WTD SnL + Chess invite blobs (Vercel Blob list by prefix).
 */
import { list } from "@vercel/blob";
import { blobResultToText } from "./user-settings.js";
import { CHESS_INVITE_PREFIX, inviteBlobPath as chessBlobPath } from "./chess-invite.js";
import { SNL_INVITE_PREFIX, inviteBlobPath as snlBlobPath } from "./snl-invite.js";

/** @param {object} invite @param {{ force?: boolean }} [opts] */
export function markSnLInviteCancelled(invite, opts = {}) {
  if (!invite || typeof invite !== "object") return false;
  const force = !!opts.force;
  if (!force && (invite.status === "cancelled" || invite.status === "finished")) return false;
  invite.status = "cancelled";
  invite.revision = (typeof invite.revision === "number" ? invite.revision : 0) + 1;
  invite.cancelledAt = new Date().toISOString();
  return true;
}

/** @param {object} invite @param {{ force?: boolean }} [opts] */
export function markChessInviteCancelled(invite, opts = {}) {
  if (!invite || typeof invite !== "object") return false;
  const force = !!opts.force;
  if (!force && (invite.status === "cancelled" || invite.status === "finished")) return false;
  invite.status = "cancelled";
  invite.revision = (typeof invite.revision === "number" ? invite.revision : invite.moves?.length || 0) + 1;
  invite.cancelledAt = new Date().toISOString();
  return true;
}

/**
 * Cancel one invite by exact blob path (does not rely on list()).
 * @param {{ get: Function, put: Function }} deps
 * @param {"snl"|"chess"} game
 * @param {string} token
 * @param {{ force?: boolean }} [opts]
 */
export async function cancelInviteByToken(deps, game, token, opts = {}) {
  const { get: getFn, put: putFn } = deps;
  const path = game === "chess" ? chessBlobPath(token) : snlBlobPath(token);
  if (!path) return { ok: false, error: "Invalid token", cancelled: false };
  let invite;
  try {
    const text = await blobResultToText(await getFn(path, { access: "private", useCache: false }));
    if (!text.trim()) return { ok: false, error: "Invite not found", cancelled: false, code: "not_found" };
    invite = JSON.parse(text);
  } catch (e) {
    return { ok: false, error: "Invite not found", cancelled: false, code: "not_found", detail: String(e.message || e) };
  }
  const markFn = game === "chess" ? markChessInviteCancelled : markSnLInviteCancelled;
  if (!markFn(invite, { force: !!opts.force })) {
    return { ok: true, cancelled: false, reason: "already_closed", game, token, path, status: invite.status };
  }
  await putFn(path, JSON.stringify(invite), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json"
  });
  return { ok: true, cancelled: true, game, token, path, revision: invite.revision };
}

/**
 * @param {{ get: Function, put: Function }} deps
 * @param {string} prefix
 * @param {(inv: object, opts?: { force?: boolean }) => boolean} markFn
 */
export async function cancelInvitesUnderPrefix(deps, prefix, markFn) {
  const { get: getFn, put: putFn } = deps;
  let cursor;
  let scanned = 0;
  let cancelled = 0;
  let alreadyClosed = 0;
  const errors = [];
  const prefixes = Array.from(
    new Set([prefix, prefix.replace(/\/$/, ""), prefix.endsWith("/") ? prefix : prefix + "/"].filter(Boolean))
  );

  let listFailed = false;
  let listError = null;
  const seenPath = new Set();

  for (const tryPrefix of prefixes) {
    cursor = undefined;
    do {
      let page;
      try {
        page = await list({ prefix: tryPrefix, cursor, limit: 500 });
      } catch (e) {
        listFailed = true;
        listError = String(e && e.message ? e.message : e);
        errors.push({ prefix: tryPrefix, error: listError });
        break;
      }
      const blobs = Array.isArray(page?.blobs) ? page.blobs : [];
      for (const blob of blobs) {
        const pathname = blob && blob.pathname;
        if (!pathname || seenPath.has(pathname)) continue;
        seenPath.add(pathname);
        scanned += 1;
        try {
          const text = await blobResultToText(
            await getFn(pathname, { access: "private", useCache: false })
          );
          if (!text.trim()) {
            errors.push({ path: pathname, error: "empty blob" });
            continue;
          }
          const invite = JSON.parse(text);
          if (!markFn(invite, { force: false })) {
            alreadyClosed += 1;
            continue;
          }
          await putFn(pathname, JSON.stringify(invite), {
            access: "private",
            addRandomSuffix: false,
            allowOverwrite: true,
            contentType: "application/json"
          });
          cancelled += 1;
        } catch (e) {
          errors.push({ path: pathname, error: String(e && e.message ? e.message : e) });
        }
      }
      cursor = page && page.hasMore ? page.cursor : undefined;
    } while (cursor);
  }

  return {
    scanned,
    cancelled,
    alreadyClosed,
    listFailed,
    listError,
    errors: errors.slice(0, 20),
    prefixesTried: prefixes
  };
}

/**
 * @param {{ get: Function, put: Function }} deps
 * @param {{ game?: "snl"|"chess"|"all", tokens?: Array<{ game?: string, token?: string }> }} [opts]
 */
export async function cancelAllWtdInvites(deps, opts = {}) {
  const game = opts.game === "snl" || opts.game === "chess" ? opts.game : "all";
  const out = {
    snl: { scanned: 0, cancelled: 0, alreadyClosed: 0, errors: [] },
    chess: { scanned: 0, cancelled: 0, alreadyClosed: 0, errors: [] },
    byToken: []
  };
  if (game === "all" || game === "snl") {
    out.snl = await cancelInvitesUnderPrefix(deps, SNL_INVITE_PREFIX, markSnLInviteCancelled);
  }
  if (game === "all" || game === "chess") {
    out.chess = await cancelInvitesUnderPrefix(deps, CHESS_INVITE_PREFIX, markChessInviteCancelled);
  }

  const extra = Array.isArray(opts.tokens) ? opts.tokens : [];
  for (const entry of extra) {
    const g = entry && entry.game === "chess" ? "chess" : entry && entry.game === "snl" ? "snl" : null;
    const token = entry && String(entry.token || "").trim();
    if (!g || !token) continue;
    if (game !== "all" && game !== g) continue;
    const result = await cancelInviteByToken(deps, g, token, { force: true });
    out.byToken.push(result);
    if (result.cancelled) {
      if (g === "snl") out.snl.cancelled = (out.snl.cancelled || 0) + 1;
      else out.chess.cancelled = (out.chess.cancelled || 0) + 1;
    }
  }

  return out;
}
