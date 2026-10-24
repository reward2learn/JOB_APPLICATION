// GET/PUT /api/chess-settings — WTD chess visual prefs per signed-in Google user (Vercel Blob).
//
//   GET  -> { ok, settings } | settings null if never saved
//   PUT  -> body = settings JSON -> { ok, ts }

import { get, put } from "@vercel/blob";
import { publicUser, readSessionUser } from "../lib/auth-session.js";
import {
  blobResultToText,
  isBlobNotFound
} from "../lib/user-settings.js";
import {
  chessSettingsBlobPath,
  validateChessSettings
} from "../lib/chess-settings.js";

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

function requireUser(req, res) {
  const session = readSessionUser(req);
  const user = publicUser(session);
  if (!user || !user.id) {
    json(res, 401, { ok: false, error: "Sign in required" });
    return null;
  }
  const path = chessSettingsBlobPath(user.id);
  if (!path) {
    json(res, 401, { ok: false, error: "Invalid session" });
    return null;
  }
  return { user, path };
}

export default async function handler(req, res) {
  const method = (req.method || "GET").toUpperCase();
  const auth = requireUser(req, res);
  if (!auth) return;

  if (method === "GET") {
    try {
      const result = await get(auth.path, { access: "private" });
      const raw = await blobResultToText(result);
      if (!raw.trim()) {
        return json(res, 200, { ok: true, settings: null });
      }
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch (_) {
        return json(res, 500, { ok: false, error: "Stored chess settings corrupt" });
      }
      const v = validateChessSettings(parsed);
      if (!v.ok) {
        return json(res, 500, { ok: false, error: "Stored chess settings invalid: " + v.error });
      }
      return json(res, 200, { ok: true, settings: v.settings });
    } catch (e) {
      if (isBlobNotFound(e)) {
        return json(res, 200, { ok: true, settings: null });
      }
      console.error("chess-settings GET", e);
      return json(res, 500, { ok: false, error: "Failed to load chess settings" });
    }
  }

  if (method === "PUT") {
    let body;
    try {
      body = await readBody(req);
    } catch (_) {
      return json(res, 400, { ok: false, error: "Invalid JSON body" });
    }
    const v = validateChessSettings(body);
    if (!v.ok) {
      return json(res, 400, { ok: false, error: v.error });
    }
    const ts = Date.now();
    try {
      await put(auth.path, JSON.stringify(v.settings), {
        access: "private",
        contentType: "application/json",
        addRandomSuffix: false,
        allowOverwrite: true
      });
      return json(res, 200, { ok: true, ts });
    } catch (e) {
      console.error("chess-settings PUT", e);
      return res.statusCode === 413
        ? json(res, 413, { ok: false, error: "Payload too large for storage" })
        : json(res, 500, { ok: false, error: "Failed to save chess settings" });
    }
  }

  return json(res, 405, { ok: false, error: "Method not allowed" });
}
