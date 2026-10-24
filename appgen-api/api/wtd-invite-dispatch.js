// POST /api/wtd-invite-dispatch — admin cancel all / one WTD invite lobby (SnL + Chess).
//
//   POST { action: "cancelAll", game?: "snl"|"chess"|"all", tokens?: [{ game, token }] }
//   POST { action: "cancelToken", game: "snl"|"chess", token: string, force?: boolean }

import { get, put } from "@vercel/blob";
import { readSessionUser } from "../lib/auth-session.js";
import { isAppAdminSession } from "../lib/app-admin.js";
import {
  cancelAllWtdInvites,
  cancelInviteByToken
} from "../lib/wtd-invite-dispatch.js";

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

function requireAdmin(req, res) {
  const session = readSessionUser(req);
  if (!isAppAdminSession(session)) {
    json(res, 403, { ok: false, error: "Admin only" });
    return null;
  }
  return session;
}

export default async function handler(req, res) {
  try {
    if ((req.method || "GET").toUpperCase() !== "POST") {
      res.setHeader("Allow", "POST");
      return json(res, 405, { ok: false, error: "Method not allowed" });
    }
    if (!requireAdmin(req, res)) return;

    const body = (await readBody(req)) || {};
    const action = String(body.action || "").toLowerCase();

    if (action === "cancelall" || action === "cancel_all") {
      const result = await cancelAllWtdInvites(
        { get, put },
        { game: body.game, tokens: body.tokens }
      );
      const total =
        (result.snl?.cancelled || 0) + (result.chess?.cancelled || 0);
      const scanned =
        (result.snl?.scanned || 0) + (result.chess?.scanned || 0);
      const listFailed = !!(result.snl?.listFailed || result.chess?.listFailed);
      return json(res, 200, {
        ok: true,
        cancelled: total,
        scanned,
        listFailed,
        detail: result
      });
    }

    if (action === "canceltoken" || action === "cancel_token") {
      const game = body.game === "chess" ? "chess" : body.game === "snl" ? "snl" : null;
      const token = String(body.token || "").trim();
      if (!game || !token) {
        return json(res, 400, { ok: false, error: "game and token required" });
      }
      const result = await cancelInviteByToken(
        { get, put },
        game,
        token,
        { force: body.force !== false }
      );
      if (!result.ok && result.code === "not_found") {
        return json(res, 404, result);
      }
      if (!result.ok) {
        return json(res, 400, result);
      }
      return json(res, 200, result);
    }

    return json(res, 400, { ok: false, error: "Unknown action" });
  } catch (e) {
    console.error("wtd-invite-dispatch", e);
    return json(res, 500, {
      ok: false,
      error: "Dispatch failed",
      detail: String(e && e.message ? e.message : e)
    });
  }
}
