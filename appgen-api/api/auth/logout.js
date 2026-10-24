// POST /api/auth/logout — clear session cookie.
import { sessionCookieHeader } from "../../lib/auth-session.js";

function json(res, status, obj) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(obj));
}

export default function handler(req, res) {
  const method = (req.method || "GET").toUpperCase();
  if (method !== "POST" && method !== "GET") {
    return json(res, 405, { error: "Method not allowed" });
  }
  res.setHeader("Set-Cookie", sessionCookieHeader("", { clear: true }));
  if (method === "GET") {
    res.statusCode = 302;
    res.setHeader("Location", "/#chess");
    return res.end();
  }
  return json(res, 200, { ok: true });
}
