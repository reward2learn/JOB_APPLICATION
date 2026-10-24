// Snakes & Ladders multiplayer (Vercel Blob, Google session required).
//
//   POST { action: "create" }
//   GET  ?token=
//   POST { action: "join", token }
//   POST { action: "setPiece", token, piece }  // p|n|b|r|q|k
//   POST { action: "roll", token }
//   POST { action: "start", token }  // host early start
//   POST { action: "presence", token, lat?, lng?, timezone? }

import { get, put } from "@vercel/blob";
import { publicUser, readSessionUser } from "../lib/auth-session.js";
import { blobResultToText, isBlobNotFound } from "../lib/user-settings.js";
import { assertRevisionMatch, parseBaseRevision } from "../lib/game-room-cas.js";
import {
  createInviteRecord,
  inviteBlobPath,
  maybeAdvanceAgentTurn,
  maybeCloseLobby,
  newInviteToken,
  publicInvitePayload,
  sanitizeInviteToken,
  sanitizePlayerKey,
  tryJoinInvite,
  tryPlayerPresence,
  tryRoll,
  trySetPiece,
  tryStartLobby,
  resolvePlayerForClient,
  lobbyJoinOpen
} from "../lib/snl-invite.js";
import {
  pushDirectLobbyInvite,
  respondInboxInvite
} from "../lib/snl-invite-inbox.js";

/** Per-tab seat id — same Google account may claim multiple slots (chess dual-seat pattern). */
function playerKeyFromRequest(req, body, url) {
  const b = body && typeof body === "object" ? body : {};
  const raw =
    b.playerKey ||
    (url && url.searchParams.get("playerKey")) ||
    (req && req.headers && req.headers["x-snl-player-key"]) ||
    "";
  return sanitizePlayerKey(raw);
}

function closeLobbyAndAgents(invite) {
  let next = maybeCloseLobby(invite);
  const agent = maybeAdvanceAgentTurn(next);
  return agent.invite;
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

function rejectStaleRevision(res, invite, user, body, req, playerKey) {
  const base = parseBaseRevision(body, req);
  const cas = assertRevisionMatch(invite, base);
  if (cas.ok) return null;
  return json(res, 409, {
    ok: false,
    error: cas.error,
    code: cas.code,
    revision: cas.currentRevision,
    invite: publicInvitePayload(invite, user.id, { playerKey })
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

export function createSnLInviteHandler(deps) {
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
        let invite = await loadInvite(getFn, token);
        if (!invite) {
          return json(res, 404, { ok: false, error: "Invite not found" });
        }
        const playerKey = playerKeyFromRequest(req, null, url);
        if (invite.status === "cancelled") {
          return json(res, 410, {
            ok: false,
            error: "Invite cancelled",
            code: "cancelled",
            invite: publicInvitePayload(invite, user.id, { playerKey })
          });
        }
        const revBefore = invite.revision;
        const statusBefore = invite.status;
        invite = closeLobbyAndAgents(invite);
        if (invite.status !== statusBefore || invite.revision !== revBefore) {
          await saveInvite(putFn, invite);
        }
        if (invite.status === "cancelled") {
          return json(res, 410, {
            ok: false,
            error: "Invite cancelled",
            code: "cancelled",
            invite: publicInvitePayload(invite, user.id, { playerKey })
          });
        }
        return json(res, 200, {
          ok: true,
          invite: publicInvitePayload(invite, user.id, { playerKey })
        });
      }

      if (method !== "POST") {
        res.setHeader("Allow", "GET, POST");
        return json(res, 405, { ok: false, error: "Method not allowed" });
      }

      const user = requireUser(req, res);
      if (!user) return;

      const body = (await readBody(req)) || {};
      const playerKey = playerKeyFromRequest(req, body, url);
      const action = String(body.action || url.searchParams.get("action") || "").toLowerCase();

      if (action === "inboxrespond" || action === "inbox_respond") {
        const inboxId = String(body.inboxId || body.id || "").trim();
        const decision = String(body.decision || body.accept || "").toLowerCase();
        const accept = decision === "accept" || decision === "true" || decision === "1";
        const reject = decision === "reject" || decision === "false" || decision === "0";
        if (!inboxId || (!accept && !reject)) {
          return json(res, 400, { ok: false, error: "inboxId and decision (accept|reject) required" });
        }
        const result = await respondInboxInvite(user.id, inboxId, accept ? "accept" : "reject", {
          get: getFn,
          put: putFn
        });
        if (!result.ok) {
          const status = result.code === "not_found" ? 404 : 400;
          return json(res, status, { ok: false, error: result.error, code: result.code });
        }
        return json(res, 200, {
          ok: true,
          accepted: !!result.accepted,
          rejected: !!result.rejected,
          joinUrl: result.joinUrl || null,
          lobbyToken: result.lobbyToken || null
        });
      }

      if (action === "create") {
        const token = newInviteToken();
        const invite = createInviteRecord({
          token,
          hostId: user.id,
          hostName: user.name || user.email || "Host",
          origin: requestOrigin(req),
          level: body.level,
          playerKey
        });
        await saveInvite(putFn, invite);
        return json(res, 201, {
          ok: true,
          token,
          url: invite.url,
          invite: publicInvitePayload(invite, user.id, { playerKey })
        });
      }

      const token = sanitizeInviteToken(body.token || url.searchParams.get("token"));
      if (!token) {
        return json(res, 400, { ok: false, error: "token required" });
      }

      let invite = await loadInvite(getFn, token);
      if (!invite) {
        return json(res, 404, { ok: false, error: "Invite not found" });
      }

      if (action === "join") {
        const stale = rejectStaleRevision(res, invite, user, body, req, playerKey);
        if (stale) return stale;
        const result = tryJoinInvite(invite, {
          userId: user.id,
          userName: user.name || user.email || "Player",
          playerKey
        });
        if (!result.ok) {
          const status =
            result.code === "full" ? 409 : result.code === "expired" ? 410 : 400;
          return json(res, status, { ok: false, error: result.error, code: result.code });
        }
        invite = closeLobbyAndAgents(result.invite);
        await saveInvite(putFn, invite);
        return json(res, 200, {
          ok: true,
          invite: publicInvitePayload(invite, user.id, { playerKey })
        });
      }

      if (action === "setpiece" || action === "set_piece") {
        const stale = rejectStaleRevision(res, invite, user, body, req, playerKey);
        if (stale) return stale;
        const result = trySetPiece(invite, user.id, body.piece, playerKey);
        if (!result.ok) {
          const status = result.code === "forbidden" ? 403 : 400;
          return json(res, status, { ok: false, error: result.error, code: result.code });
        }
        invite = result.invite;
        await saveInvite(putFn, invite);
        return json(res, 200, {
          ok: true,
          invite: publicInvitePayload(invite, user.id, { playerKey })
        });
      }

      if (action === "roll") {
        invite = closeLobbyAndAgents(invite);
        const stale = rejectStaleRevision(res, invite, user, body, req, playerKey);
        if (stale) return stale;
        const rollVal =
          typeof body.roll === "number"
            ? body.roll
            : typeof body.roll === "string"
              ? Number(body.roll)
              : null;
        const result = tryRoll(invite, user.id, rollVal, playerKey);
        if (!result.ok) {
          const status =
            result.code === "wrong_turn" ? 409 : result.code === "forbidden" ? 403 : 400;
          return json(res, status, { ok: false, error: result.error, code: result.code });
        }
        invite = closeLobbyAndAgents(result.invite);
        await saveInvite(putFn, invite);
        return json(res, 200, {
          ok: true,
          invite: publicInvitePayload(invite, user.id, { playerKey }),
          roll: result.roll
        });
      }

      if (action === "start") {
        const stale = rejectStaleRevision(res, invite, user, body, req, playerKey);
        if (stale) return stale;
        const result = tryStartLobby(invite, user.id);
        if (!result.ok) {
          const status =
            result.code === "forbidden" ? 403 : result.code === "expired" ? 410 : 400;
          return json(res, status, { ok: false, error: result.error, code: result.code });
        }
        invite = closeLobbyAndAgents(result.invite);
        await saveInvite(putFn, invite);
        return json(res, 200, {
          ok: true,
          invite: publicInvitePayload(invite, user.id, { playerKey })
        });
      }

      if (action === "presence") {
        const result = tryPlayerPresence(invite, user.id, body, playerKey);
        if (!result.ok) {
          const status = result.code === "forbidden" ? 403 : 400;
          return json(res, status, { ok: false, error: result.error, code: result.code });
        }
        await saveInvite(putFn, result.invite);
        return json(res, 200, {
          ok: true,
          invite: publicInvitePayload(result.invite, user.id, { playerKey })
        });
      }

      if (action === "directinvite" || action === "direct_invite") {
        if (invite.status !== "lobby" || !lobbyJoinOpen(invite)) {
          return json(res, 409, { ok: false, error: "Lobby is not open for invites", code: "not_lobby" });
        }
        const me = resolvePlayerForClient(invite, user.id, playerKey);
        if (!me) {
          return json(res, 403, { ok: false, error: "Join the lobby first", code: "forbidden" });
        }
        const targetUserId = String(body.targetUserId || body.toUserId || "").trim();
        const joinUrl = String(body.joinUrl || invite.url || "").trim();
        if (!targetUserId || !joinUrl) {
          return json(res, 400, { ok: false, error: "targetUserId and joinUrl required" });
        }
        const pushed = await pushDirectLobbyInvite(
          targetUserId,
          { id: user.id, name: user.name || user.email || "Player" },
          {
            lobbyToken: invite.token,
            joinUrl,
            lobbyLabel: "Snakes & Ladders · " + (invite.players || []).length + "/4"
          },
          { get: getFn, put: putFn }
        );
        if (!pushed.ok) {
          return json(res, 400, { ok: false, error: pushed.error || "Could not send invite" });
        }
        return json(res, 200, { ok: true, sent: true, duplicate: !!pushed.duplicate });
      }

      return json(res, 400, { ok: false, error: "Unknown action" });
    } catch (e) {
      console.error("snl-invite", e);
      return json(res, 500, { ok: false, error: "Server error" });
    }
  };
}

export default createSnLInviteHandler({ put, get });
