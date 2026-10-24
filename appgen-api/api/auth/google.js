// GET /api/auth/google — start Google OAuth (redirect).
import crypto from "crypto";
import {
  googleConfigured,
  googleRedirectUri,
  requestOrigin
} from "../../lib/auth-session.js";

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
  if (!googleConfigured()) {
    return json(res, 503, {
      error: "Google OAuth not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET on Vercel."
    });
  }

  const url = new URL(req.url, requestOrigin(req));
  let next = url.searchParams.get("next") || "/#chess";
  if (!next.startsWith("/") && !next.startsWith("#")) next = "/#chess";
  if (next.startsWith("#")) next = "/" + next;

  const state = crypto.randomBytes(16).toString("hex") + "." + Buffer.from(next).toString("base64url");
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: googleRedirectUri(req),
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "online",
    prompt: "select_account"
  });

  const secure = process.env.VERCEL || process.env.NODE_ENV === "production";
  res.setHeader(
    "Set-Cookie",
    "appgen_oauth_state=" +
      encodeURIComponent(state) +
      "; Path=/; HttpOnly; SameSite=Lax; Max-Age=600" +
      (secure ? "; Secure" : "")
  );
  res.statusCode = 302;
  res.setHeader("Location", "https://accounts.google.com/o/oauth2/v2/auth?" + params.toString());
  res.end();
}
