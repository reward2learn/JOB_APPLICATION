// GET /api/auth/me — current user or null.
import { googleConfigured, publicUser, readSessionUser } from "../../lib/auth-session.js";

function json(res, status, obj) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(obj));
}

export default function handler(req, res) {
  if ((req.method || "GET").toUpperCase() !== "GET") {
    return json(res, 405, { error: "Method not allowed" });
  }
  const user = publicUser(readSessionUser(req));
  return json(res, 200, {
    ok: true,
    user,
    googleConfigured: googleConfigured()
  });
}
