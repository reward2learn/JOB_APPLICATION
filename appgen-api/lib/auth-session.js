/**
 * Signed httpOnly session cookie for Google OAuth (HMAC-SHA256).
 * Prefer AUTH_SECRET; else derive from GOOGLE_CLIENT_SECRET (never expose either).
 */
import crypto from "crypto";

export const SESSION_COOKIE = "appgen_session";
export const SESSION_TTL_SEC = 60 * 60 * 24 * 14; // 14 days

export function getAuthSecret() {
  const explicit = process.env.AUTH_SECRET && String(process.env.AUTH_SECRET).trim();
  if (explicit) return explicit;
  const googleSecret = process.env.GOOGLE_CLIENT_SECRET && String(process.env.GOOGLE_CLIENT_SECRET).trim();
  if (googleSecret) {
    return crypto.createHmac("sha256", "appgen-auth-v1").update(googleSecret).digest("hex");
  }
  return null;
}

export function googleConfigured() {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
      String(process.env.GOOGLE_CLIENT_ID).trim() &&
      process.env.GOOGLE_CLIENT_SECRET &&
      String(process.env.GOOGLE_CLIENT_SECRET).trim()
  );
}

export function requestOrigin(req) {
  const proto = String(req.headers["x-forwarded-proto"] || "https").split(",")[0].trim();
  let host = String(req.headers["x-forwarded-host"] || req.headers.host || "localhost:3000")
    .split(",")[0]
    .trim();
  host = host.replace(/\/+$/, "");
  if (!/^https?$/.test(proto)) {
    return "https://" + host;
  }
  return proto + "://" + host;
}

/** Path segment only — must match Google Cloud “Authorized redirect URIs” exactly. */
export const GOOGLE_OAUTH_CALLBACK_PATH = "/api/auth/google/callback";

export function googleRedirectUri(req) {
  const pinned = process.env.GOOGLE_REDIRECT_URI && String(process.env.GOOGLE_REDIRECT_URI).trim();
  if (pinned) return pinned.replace(/\/+$/, "");
  return requestOrigin(req) + GOOGLE_OAUTH_CALLBACK_PATH;
}

/** URIs to register in Google Cloud Console for the current deployment host. */
export function googleOAuthSetupHints(req) {
  const redirectUri = googleRedirectUri(req);
  const origin = requestOrigin(req);
  const clientId = process.env.GOOGLE_CLIENT_ID ? String(process.env.GOOGLE_CLIENT_ID).trim() : "";
  return {
    redirectUri,
    authorizedRedirectUris: [redirectUri],
    authorizedJavaScriptOrigins: [origin],
    clientId: clientId || null,
    credentialsConsole:
      "https://console.cloud.google.com/apis/credentials"
  };
}

function b64url(buf) {
  return Buffer.from(buf)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function b64urlJson(obj) {
  return b64url(JSON.stringify(obj));
}

function fromB64url(str) {
  const pad = str.length % 4 === 0 ? "" : "=".repeat(4 - (str.length % 4));
  const b64 = str.replace(/-/g, "+").replace(/_/g, "/") + pad;
  return Buffer.from(b64, "base64").toString("utf8");
}

export function signSession(payload, secret) {
  const body = b64urlJson(payload);
  const sig = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  return body + "." + sig;
}

export function verifySession(token, secret) {
  if (!token || typeof token !== "string" || !secret) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expected = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let payload;
  try {
    payload = JSON.parse(fromB64url(body));
  } catch (_) {
    return null;
  }
  if (!payload || typeof payload !== "object") return null;
  if (!payload.exp || Date.now() / 1000 > Number(payload.exp)) return null;
  return {
    sub: String(payload.sub || ""),
    email: typeof payload.email === "string" ? payload.email : "",
    name: typeof payload.name === "string" ? payload.name : "",
    picture: typeof payload.picture === "string" ? payload.picture : "",
    exp: Number(payload.exp)
  };
}

export function parseCookies(req) {
  const header = req.headers.cookie || req.headers.Cookie || "";
  const out = {};
  String(header)
    .split(";")
    .forEach((part) => {
      const idx = part.indexOf("=");
      if (idx < 0) return;
      const k = part.slice(0, idx).trim();
      const v = part.slice(idx + 1).trim();
      if (k) out[k] = decodeURIComponent(v);
    });
  return out;
}

export function readSessionUser(req) {
  const secret = getAuthSecret();
  if (!secret) return null;
  const cookies = parseCookies(req);
  return verifySession(cookies[SESSION_COOKIE], secret);
}

export function sessionCookieHeader(token, { maxAge = SESSION_TTL_SEC, clear = false } = {}) {
  const secure = process.env.VERCEL || process.env.NODE_ENV === "production";
  if (clear) {
    return (
      SESSION_COOKIE +
      "=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0" +
      (secure ? "; Secure" : "")
    );
  }
  return (
    SESSION_COOKIE +
    "=" +
    encodeURIComponent(token) +
    "; Path=/; HttpOnly; SameSite=Lax; Max-Age=" +
    maxAge +
    (secure ? "; Secure" : "")
  );
}

export function publicUser(session) {
  if (!session || !session.sub) return null;
  return {
    id: session.sub,
    email: session.email || null,
    name: session.name || null,
    picture: session.picture || null
  };
}
