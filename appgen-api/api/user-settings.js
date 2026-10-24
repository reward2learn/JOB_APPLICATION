// GET/PUT /api/user-settings — profile + appearance per signed-in Google user (Vercel Blob).
//
//   GET  -> { ok, settings } | settings null if never saved
//   PUT  -> body = settings JSON object -> { ok, ts }

import { get, put } from "@vercel/blob";
import { publicUser, readSessionUser } from "../lib/auth-session.js";
import { pickUserSettingsOnly } from "../lib/admin-settings.js";
import {
  blobResultToText,
  isBlobNotFound,
  userSettingsBlobPath,
  validateUserSettings
} from "../lib/user-settings.js";

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
  const path = userSettingsBlobPath(user.id);
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
      let settings;
      try {
        settings = JSON.parse(raw);
      } catch (_) {
        return json(res, 500, { ok: false, error: "Stored settings corrupt" });
      }
      const slim = pickUserSettingsOnly(settings);
      const v = validateUserSettings(slim);
      if (!v.ok) {
        return json(res, 500, { ok: false, error: "Stored settings invalid: " + v.error });
      }
      return json(res, 200, { ok: true, settings: slim });
    } catch (e) {
      if (isBlobNotFound(e)) {
        return json(res, 200, { ok: true, settings: null });
      }
      console.error("user-settings GET", e);
      return json(res, 500, { ok: false, error: "Failed to load settings" });
    }
  }

  if (method === "PUT") {
    let body;
    try {
      body = await readBody(req);
    } catch (_) {
      return json(res, 400, { ok: false, error: "Invalid JSON body" });
    }
    const v = validateUserSettings(body);
    if (!v.ok) {
      const status = body && body.content !== undefined ? 403 : 400;
      return json(res, status, { ok: false, error: v.error });
    }
    const ts = Date.now();
    const payload = pickUserSettingsOnly(
      Object.assign({}, body, { version: body.version != null ? body.version : 1 })
    );
    try {
      await put(auth.path, JSON.stringify(payload), {
        access: "private",
        contentType: "application/json",
        addRandomSuffix: false,
        allowOverwrite: true
      });
      return json(res, 200, { ok: true, ts });
    } catch (e) {
      console.error("user-settings PUT", e);
      return json(res, 500, { ok: false, error: "Failed to save settings" });
    }
  }

  return json(res, 405, { ok: false, error: "Method not allowed" });
}
