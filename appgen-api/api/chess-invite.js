// WTD Chess PvP invite lobbies (Vercel Blob, Google session required).
//
//   POST { action: "create" }
//   GET  ?token=
//   POST { action: "join", token }
//   POST { action: "move", token, from, to, promotion? }
//   POST { action: "resign", token }

import { get, put } from "@vercel/blob";
import { publicUser, readSessionUser } from "../lib/auth-session.js";
import { blobResultToText, isBlobNotFound } from "../lib/user-settings.js";
import { assertRevisionMatch, parseBaseRevision } from "../lib/game-room-cas.js";
import {
  createInviteRecord,
  inviteBlobPath,
  newInviteToken,
  normalizeSeatHint,
  publicInvitePayload,
  sanitizeInviteToken,
  tryApplyMove,
  tryJoinInvite,
  tryResignInvite
} from "../lib/chess-invite.js";

/** Seat for dual-seat / role resolution: body or query `pvpSeat` / `seat` / `joinRole`. */
function seatFromRequest(req, body, url) {
  const b = body && typeof body === "object" ? body : {};
  const raw =
    b.pvpSeat ||
    b.seat ||
    b.joinRole ||
    (url && url.searchParams.get("pvpSeat")) ||
    (url && url.searchParams.get("seat")) ||
    (url && url.searchParams.get("joinRole")) ||
    "";
  return normalizeSeatHint(raw);
}

function json(res, status, obj) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(obj));
}

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  let raw = "";
  for await (const chunk of req) raw += chunk;
  if (!raw) return null;
  return JSON.parse(raw);
}

function requestOrigin(req) {
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host || "apply4job.vercel.app";
  return proto + "://" + host;
}

function requireUser(req, res) {
  const session = readSessionUser(req);
  const user = publicUser(session);
  if (!user || !user.id) {
    json(res, 401, { ok: false, error: "Sign in required" });
    return null;
  }
  return user;
}

async function loadInvite(getFn, token) {
  const path = inviteBlobPath(token);
  if (!path) return null;
  try {
    const text = await blobResultToText(await getFn(path, { access: "private", useCache: false }));
    if (!text.trim()) return null;
    return JSON.parse(text);
  } catch (e) {
    if (isBlobNotFound(e)) return null;
    throw e;
  }
}

function rejectStaleRevision(res, invite, user, body, req, seatHint) {
  const base = parseBaseRevision(body, req);
  const cas = assertRevisionMatch(invite, base);
  if (cas.ok) return null;
  return json(res, 409, {
    ok: false,
    error: cas.error,
    code: cas.code,
    revision: cas.currentRevision,
    invite: publicInvitePayload(invite, user.id, { pvpSeat: seatHint })
  });
}

async function saveInvite(putFn, invite) {
  const path = inviteBlobPath(invite.token);
  if (!path) throw new Error("Invalid token");
  await putFn(path, JSON.stringify(invite), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json"
  });
}

export function createChessInviteHandler(deps) {
  const { put: putFn, get: getFn } = deps;

  return async function handler(req, res) {
    try {
      const method = (req.method || "GET").toUpperCase();
      const url = new URL(req.url, "http://localhost");

      if (method === "GET") {
        const user = requireUser(req, res);
        if (!user) return;
        const token = sanitizeInviteToken(url.searchParams.get("token"));
        if (!token) {
          return json(res, 400, { ok: false, error: "token required" });
        }
        const seatHint = seatFromRequest(req, null, url);
        const invite = await loadInvite(getFn, token);
        if (!invite) {
          return json(res, 404, { ok: false, error: "Invite not found" });
        }
        if (invite.status === "cancelled") {
          return json(res, 410, {
            ok: false,
            error: "Invite cancelled",
            code: "cancelled",
            invite: publicInvitePayload(invite, user.id, { pvpSeat: seatHint })
          });
        }
        return json(res, 200, {
          ok: true,
          invite: publicInvitePayload(invite, user.id, { pvpSeat: seatHint })
        });
      }

      if (method !== "POST") {
        res.setHeader("Allow", "GET, POST");
        return json(res, 405, { ok: false, error: "Method not allowed" });
      }

      const user = requireUser(req, res);
      if (!user) return;

      const body = (await readBody(req)) || {};
      const action = String(body.action || url.searchParams.get("action") || "").toLowerCase();

      if (action === "create") {
        const token = newInviteToken();
        const invite = createInviteRecord({
          token,
          hostId: user.id,
          hostName: user.name || user.email || "Host",
          origin: requestOrigin(req)
        });
        await saveInvite(putFn, invite);
        return json(res, 201, {
          ok: true,
          token,
          url: invite.url,
          invite: publicInvitePayload(invite, user.id, { pvpSeat: "host" })
        });
      }

      const token = sanitizeInviteToken(body.token || url.searchParams.get("token"));
      if (!token) {
        return json(res, 400, { ok: false, error: "token required" });
      }

      const seatHint = seatFromRequest(req, body, url);
      let invite = await loadInvite(getFn, token);
      if (!invite) {
        return json(res, 404, { ok: false, error: "Invite not found" });
      }

      if (action === "join") {
        const stale = rejectStaleRevision(res, invite, user, body, req, seatHint || "guest");
        if (stale) return stale;
        const result = tryJoinInvite(invite, {
          guestId: user.id,
          guestName: user.name || user.email || "Guest"
        });
        if (!result.ok) {
          const status =
            result.code === "full" ? 409 : result.code === "expired" ? 410 : 400;
          return json(res, status, { ok: false, error: result.error, code: result.code });
        }
        invite = result.invite;
        await saveInvite(putFn, invite);
        // Join always returns the guest (Black) seat view — including dual-seat self-join.
        return json(res, 200, {
          ok: true,
          invite: publicInvitePayload(invite, user.id, { pvpSeat: seatHint || "guest" })
        });
      }

      if (action === "move") {
        const stale = rejectStaleRevision(res, invite, user, body, req, seatHint);
        if (stale) return stale;
        const result = tryApplyMove(
          invite,
          user.id,
          {
            from: body.from,
            to: body.to,
            promotion: body.promotion
          },
          seatHint
        );
        if (!result.ok) {
          const status =
            result.code === "wrong_turn" || result.code === "illegal_move"
              ? 409
              : result.code === "forbidden"
                ? 403
                : 400;
          return json(res, status, { ok: false, error: result.error, code: result.code });
        }
        invite = result.invite;
        await saveInvite(putFn, invite);
        return json(res, 200, {
          ok: true,
          invite: publicInvitePayload(invite, user.id, { pvpSeat: seatHint }),
          move: result.move
            ? { from: result.move.from, to: result.move.to, san: result.move.san }
            : null
        });
      }

      if (action === "resign") {
        const stale = rejectStaleRevision(res, invite, user, body, req, seatHint);
        if (stale) return stale;
        const result = tryResignInvite(invite, user.id, seatHint);
        if (!result.ok) {
          return json(res, 400, { ok: false, error: result.error, code: result.code });
        }
        invite = result.invite;
        await saveInvite(putFn, invite);
        return json(res, 200, {
          ok: true,
          invite: publicInvitePayload(invite, user.id, { pvpSeat: seatHint })
        });
      }

      return json(res, 400, { ok: false, error: "Unknown action" });
    } catch (e) {
      console.error("chess-invite", e);
      return json(res, 500, { ok: false, error: "Server error" });
    }
  };
}

export default createChessInviteHandler({ put, get });
