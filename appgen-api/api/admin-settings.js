// GET/PUT /api/admin-settings — global content overrides (admin session only).

import { get, put } from "@vercel/blob";
import { readSessionUser } from "../lib/auth-session.js";
import { isAppAdminSession } from "../lib/app-admin.js";
import {
  ADMIN_SETTINGS_BLOB_PATH,
  validateAdminSettings
} from "../lib/admin-settings.js";
import { blobResultToText, isBlobNotFound } from "../lib/user-settings.js";

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
  if (!session || !session.sub) {
    json(res, 401, { ok: false, error: "Sign in required" });
    return null;
  }
  if (!isAppAdminSession(session)) {
    json(res, 403, { ok: false, error: "Admin access required" });
    return null;
  }
  return session;
}

export default async function handler(req, res) {
  const method = (req.method || "GET").toUpperCase();
  if (!requireAdmin(req, res)) return;

  if (method === "GET") {
    try {
      const result = await get(ADMIN_SETTINGS_BLOB_PATH, { access: "private" });
      const raw = await blobResultToText(result);
      if (!raw.trim()) {
        return json(res, 200, { ok: true, settings: null });
      }
      let settings;
      try {
        settings = JSON.parse(raw);
      } catch (_) {
        return json(res, 500, { ok: false, error: "Stored admin settings corrupt" });
      }
      const v = validateAdminSettings(settings);
      if (!v.ok) {
        return json(res, 500, { ok: false, error: "Stored admin settings invalid: " + v.error });
      }
      return json(res, 200, { ok: true, settings });
    } catch (e) {
      if (isBlobNotFound(e)) {
        return json(res, 200, { ok: true, settings: null });
      }
      console.error("admin-settings GET", e);
      return json(res, 500, { ok: false, error: "Failed to load admin settings" });
    }
  }

  if (method === "PUT") {
    let body;
    try {
      body = await readBody(req);
    } catch (_) {
      return json(res, 400, { ok: false, error: "Invalid JSON body" });
    }
    const v = validateAdminSettings(body);
    if (!v.ok) {
      return json(res, 400, { ok: false, error: v.error });
    }
    const ts = Date.now();
    const payload = Object.assign({}, body, { version: body.version != null ? body.version : 1 });
    try {
      await put(ADMIN_SETTINGS_BLOB_PATH, JSON.stringify(payload), {
        access: "private",
        contentType: "application/json",
        addRandomSuffix: false,
        allowOverwrite: true
      });
      return json(res, 200, { ok: true, ts });
    } catch (e) {
      console.error("admin-settings PUT", e);
      return json(res, 500, { ok: false, error: "Failed to save admin settings" });
    }
  }

  return json(res, 405, { ok: false, error: "Method not allowed" });
}
