// GET /api/auth/google/config — public OAuth setup hints (no secrets).
import { googleConfigured, googleOAuthSetupHints } from "../../../lib/auth-session.js";

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

  const hints = googleOAuthSetupHints(req);
  const localRedirect = "http://localhost:3000/api/auth/google/callback";
  const prodRedirect = "https://apply4job.vercel.app/api/auth/google/callback";

  const suggestedRedirectUris = [...new Set([hints.redirectUri, prodRedirect, localRedirect])];
  const suggestedOrigins = [
    ...new Set([
      hints.authorizedJavaScriptOrigins[0],
      "https://apply4job.vercel.app",
      "http://localhost:3000"
    ].filter(Boolean))
  ];

  return json(res, 200, {
    ok: true,
    googleConfigured: googleConfigured(),
    clientId: hints.clientId,
    redirectUriUsedByThisDeployment: hints.redirectUri,
    googleCloudConsole: {
      credentialsUrl: hints.credentialsConsole,
      editClientHint: hints.clientId
        ? "Open Credentials → OAuth 2.0 Client IDs → " +
          (hints.clientId.split(".")[0] || hints.clientId)
        : "Set GOOGLE_CLIENT_ID on Vercel first",
      authorizedRedirectUris: suggestedRedirectUris,
      authorizedJavaScriptOrigins: suggestedOrigins,
      notes: [
        "Authorized redirect URIs must match character-for-character (scheme, host, path; no trailing slash).",
        "redirect_uri_mismatch means the URI below is missing from that OAuth client’s redirect list.",
        "Use Web application client type (not Desktop or iOS)."
      ]
    }
  });
}
