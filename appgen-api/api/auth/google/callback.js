// GET /api/auth/google/callback — exchange code, set session cookie, redirect home.
import {
  getAuthSecret,
  googleConfigured,
  googleRedirectUri,
  parseCookies,
  sessionCookieHeader,
  signSession,
  SESSION_TTL_SEC,
  requestOrigin
} from "../../../lib/auth-session.js";

function htmlError(res, status, message) {
  res.statusCode = status;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(
    "<!doctype html><html><body style=\"font-family:system-ui;padding:2rem\">" +
      "<h1>Sign-in failed</h1><p>" +
      String(message).replace(/</g, "&lt;") +
      '</p><p><a href="/#chess">Back to WTD</a></p></body></html>'
  );
}

export default async function handler(req, res) {
  if ((req.method || "GET").toUpperCase() !== "GET") {
    return htmlError(res, 405, "Method not allowed");
  }
  if (!googleConfigured()) {
    return htmlError(res, 503, "Google OAuth is not configured on this deployment.");
  }
  const secret = getAuthSecret();
  if (!secret) {
    return htmlError(res, 503, "AUTH_SECRET (or GOOGLE_CLIENT_SECRET) required to sign sessions.");
  }

  const url = new URL(req.url, requestOrigin(req));
  const err = url.searchParams.get("error");
  if (err) {
    const redirectUri = googleRedirectUri(req);
    if (err === "redirect_uri_mismatch") {
      return htmlError(
        res,
        400,
        "Google OAuth redirect_uri_mismatch. Add this exact URI under APIs & Services → Credentials → your OAuth client → Authorized redirect URIs: " +
          redirectUri +
          " — or open /api/auth/google/config for the full list. Client must be type Web application."
      );
    }
    return htmlError(res, 400, "Google returned: " + err);
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state") || "";
  const cookies = parseCookies(req);
  const expected = cookies.appgen_oauth_state || "";
  if (!code || !state || !expected || state !== expected) {
    return htmlError(res, 400, "Invalid or expired OAuth state. Try signing in again.");
  }

  let next = "/#chess";
  const stateParts = state.split(".");
  if (stateParts.length >= 2) {
    try {
      const decoded = Buffer.from(stateParts.slice(1).join("."), "base64url").toString("utf8");
      if (decoded.startsWith("/")) next = decoded;
    } catch (_) { /* keep default */ }
  }

  let tokenJson;
  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: googleRedirectUri(req),
        grant_type: "authorization_code"
      })
    });
    tokenJson = await tokenRes.json();
    if (!tokenRes.ok || !tokenJson.access_token) {
      return htmlError(res, 400, tokenJson.error_description || tokenJson.error || "Token exchange failed");
    }
  } catch (e) {
    return htmlError(res, 502, "Token exchange error: " + (e && e.message ? e.message : "unknown"));
  }

  let profile;
  try {
    const profileRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: "Bearer " + tokenJson.access_token }
    });
    profile = await profileRes.json();
    if (!profileRes.ok || !profile.sub) {
      return htmlError(res, 400, "Could not load Google profile");
    }
  } catch (e) {
    return htmlError(res, 502, "Profile fetch error: " + (e && e.message ? e.message : "unknown"));
  }

  const now = Math.floor(Date.now() / 1000);
  const sessionToken = signSession(
    {
      sub: profile.sub,
      email: profile.email || "",
      name: profile.name || profile.given_name || "",
      picture: profile.picture || "",
      exp: now + SESSION_TTL_SEC
    },
    secret
  );

  const secure = process.env.VERCEL || process.env.NODE_ENV === "production";
  res.setHeader("Set-Cookie", [
    sessionCookieHeader(sessionToken),
    "appgen_oauth_state=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0" + (secure ? "; Secure" : "")
  ]);
  res.statusCode = 302;
  res.setHeader("Location", next);
  res.end();
}
