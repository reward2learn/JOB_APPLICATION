// Active lab users (device geo + timezone heartbeats). Google session required.
//   GET  — list users active in the last ~5 minutes
//   POST { lat?, lng?, timezone? } — upsert self

import { get, put } from "@vercel/blob";
import { publicUser, readSessionUser } from "../lib/auth-session.js";
import {
  loadPresenceList,
  publicPresenceList,
  sanitizePresenceGeo,
  upsertPresence
} from "../lib/wtd-presence.js";
import { loadInbox, publicInboxList } from "../lib/snl-invite-inbox.js";

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
  return user;
}

export function createWtdPresenceHandler(deps = {}) {
  const getFn = deps.get || get;
  const putFn = deps.put || put;

  return async function handler(req, res) {
    try {
      const user = requireUser(req, res);
      if (!user) return;
      const method = (req.method || "GET").toUpperCase();

      if (method === "GET") {
        const users = await loadPresenceList(getFn);
        const inbox = await loadInbox(user.id, getFn);
        return json(res, 200, {
          ok: true,
          users: publicPresenceList(users, user.id),
          inbox: publicInboxList(inbox),
          note: "Location comes from each device (browser geolocation), not the Google profile."
        });
      }

      if (method !== "POST") {
        res.setHeader("Allow", "GET, POST");
        return json(res, 405, { ok: false, error: "Method not allowed" });
      }

      const body = (await readBody(req)) || {};
      const geo = sanitizePresenceGeo(body);
      const result = await upsertPresence(user, geo, { get: getFn, put: putFn });
      if (!result.ok) {
        return json(res, 400, { ok: false, error: result.error || "Failed" });
      }
      const inbox = await loadInbox(user.id, getFn);
      return json(res, 200, {
        ok: true,
        me: result.me,
        users: publicPresenceList(result.users, user.id),
        inbox: publicInboxList(inbox)
      });
    } catch (e) {
      console.error("wtd-presence", e);
      return json(res, 500, { ok: false, error: "Server error" });
    }
  };
}

export default createWtdPresenceHandler();
