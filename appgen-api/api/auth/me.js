// GET /api/auth/me — current user or null.
import { googleConfigured, publicUser, readSessionUser } from "../../lib/auth-session.js";

function json(res, status, obj) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(obj));
}

export default async function handler(req, res) {
  if ((req.method || "GET").toUpperCase() !== "GET") {
    return json(res, 405, { error: "Method not allowed" });
  }
  const session = readSessionUser(req);
  const user = publicUser(session);
  let access = null;
  if (user && user.id) {
    const { resolveAccess } = await import("../../lib/user-directory.js");
    access = await resolveAccess({ sub: user.id, email: user.email });
  }
  return json(res, 200, {
    ok: true,
    user,
    googleConfigured: googleConfigured(),
    groups: access ? access.groups : null,
    grants: access ? access.grants : [],
    profileCompleted: access ? access.profileCompleted : false
  });
}
