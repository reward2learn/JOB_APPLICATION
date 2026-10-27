// GET  /api/admin/group-grants — current + default permission matrix (admin only)
// PUT  /api/admin/group-grants — { groupGrants: { Group: [grant, ...] } } (admin only)
//
// Grants: admin | applicant | cognitive | game   (see lib/security-groups.js)

import { readSessionUser } from "../../lib/auth-session.js";
import { isAdminIdentity } from "../../lib/app-admin.js";
import {
  ALL_GRANTS,
  GRANT_LABELS,
  GROUP_GRANTS,
  GROUP_LABELS,
  SECURITY_GROUPS,
  effectiveGroupGrants
} from "../../lib/security-groups.js";
import { loadGroupGrants, saveGroupGrants } from "../../lib/group-grants.js";

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
  const user = readSessionUser(req);
  if (!user || !user.sub) {
    json(res, 401, { ok: false, error: "Sign in required" });
    return null;
  }
  if (!(await isAdminIdentity(user.sub, user.email))) {
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
      const current = await loadGroupGrants();
      return json(res, 200, {
        ok: true,
        groupGrants: current || GROUP_GRANTS,
        defaults: GROUP_GRANTS,
        effective: effectiveGroupGrants(),
        groups: SECURITY_GROUPS,
        grants: ALL_GRANTS,
        grantLabels: GRANT_LABELS,
        groupLabels: GROUP_LABELS
      });
    } catch (e) {
      console.error("group-grants GET", e);
      return json(res, 500, { ok: false, error: "Failed to load permissions" });
    }
  }

  if (method === "PUT") {
    let body;
    try {
      body = await readBody(req);
    } catch (_) {
      return json(res, 400, { ok: false, error: "Invalid JSON body" });
    }
    try {
      const out = await saveGroupGrants(body);
      if (!out.ok) return json(res, 400, { ok: false, error: out.error });
      return json(res, 200, { ok: true, groupGrants: out.matrix, effective: out.effective });
    } catch (e) {
      console.error("group-grants PUT", e);
      return json(res, 500, { ok: false, error: "Failed to save permissions" });
    }
  }

  return json(res, 405, { ok: false, error: "Method not allowed" });
}
