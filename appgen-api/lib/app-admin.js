/**
 * Application Generator admin gate — same email as client `appgen-auth.js`.
 */

export const APPGEN_ADMIN_EMAIL = "reward2learn@gmail.com";

export function isAppAdminEmail(email) {
  if (!email) return false;
  return String(email).trim().toLowerCase() === APPGEN_ADMIN_EMAIL.toLowerCase();
}

export function isAppAdminSession(session) {
  return !!(session && isAppAdminEmail(session.email));
}
