// GET  /api/admin/users — list every Google sign-in (admin only)
// PUT  /api/admin/users — { id, groups } assign security groups (admin only)
//
// Groups: Admin | ApplicantGroup | CognitiveGroup | PlayerGroup  (see lib/security-groups.js)

import { publicUser, readSessionUser } from "../../lib/auth-session.js";
import { isAdminIdentity } from "../../lib/app-admin.js";
import {
  DEFAULT_GROUPS,
  SECURITY_GROUPS,
  grantsFor,
  normalizeGroups
} from "../../lib/security-groups.js";
import { assignGroupsToUsers, listUsers, setUserGroups } from "../../lib/user-directory.js";
import { loadGroupGrants } from "../../lib/group-grants.js";

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

async function requireAdmin(req, res) {
  const user = publicUser(readSessionUser(req));
  if (!user || !user.id) {
    json(res, 401, { ok: false, error: "Sign in required" });
    return null;
  }
  if (!(await isAdminIdentity(user.id, user.email))) {
    json(res, 403, { ok: false, error: "Admin access required" });
    return null;
  }
  return user;
}

export default async function handler(req, res) {
  const method = (req.method || "GET").toUpperCase();
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  if (method === "GET") {
    try {
      const users = await listUsers();
      await loadGroupGrants();
      return json(res, 200, {
        ok: true,
        users,
        groups: SECURITY_GROUPS,
        defaultGroups: DEFAULT_GROUPS,
        grantsByGroup: Object.fromEntries(
          SECURITY_GROUPS.map((g) => [g, grantsFor([g])])
        )
      });
    } catch (e) {
      console.error("admin/users GET", e);
      return json(res, 500, { ok: false, error: "Failed to list users" });
    }
  }

  if (method === "PUT") {
    let body;
    try {
      body = await readBody(req);
    } catch (_) {
      return json(res, 400, { ok: false, error: "Invalid JSON body" });
    }
    if (!body || !Array.isArray(body.groups)) {
      return json(res, 400, { ok: false, error: "groups must be an array" });
    }
    if (!body.groups.length) {
      return json(res, 400, { ok: false, error: "Pick at least one group" });
    }
    if (body.groups.some((g) => !SECURITY_GROUPS.includes(String(g).trim()))) {
      return json(res, 400, { ok: false, error: "Unknown group" });
    }
    const groups = normalizeGroups(body.groups);

    /* Bulk: { ids: [...], mode: "set"|"add"|"remove" } */
    if (Array.isArray(body.ids) && body.ids.length) {
      const mode = ["set", "add", "remove"].includes(body.mode) ? body.mode : "set";
      try {
        const out = await assignGroupsToUsers(body.ids, groups, mode);
        if (!out.ok) return json(res, 400, { ok: false, error: out.error });
        return json(res, 200, { ok: true, updated: out.updated, count: out.count, mode });
      } catch (e) {
        console.error("admin/users bulk PUT", e);
        return json(res, 500, { ok: false, error: "Failed to save groups" });
      }
    }

    const id = body && body.id ? String(body.id).trim() : "";
    if (!id) return json(res, 400, { ok: false, error: "id or ids is required" });
    try {
      const out = await setUserGroups(id, groups);
      if (!out.ok) return json(res, 400, { ok: false, error: out.error });
      return json(res, 200, { ok: true, user: out.user, groups: out.user.groups });
    } catch (e) {
      console.error("admin/users PUT", e);
      return json(res, 500, { ok: false, error: "Failed to save groups" });
    }
  }

  return json(res, 405, { ok: false, error: "Method not allowed" });
}
