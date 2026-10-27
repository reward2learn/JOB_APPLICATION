/**
 * Application Generator admin gate — same email as client `appgen-auth.js`.
 * Admin comes from the hard-coded owner email OR the `Admin` security group
 * an admin grants in Users & Access.
 */
import { readUserRecord } from "./user-directory.js";
import { hasGrant } from "./security-groups.js";
import { loadGroupGrants } from "./group-grants.js";

export const APPGEN_ADMIN_EMAIL = "reward2learn@gmail.com";

export function isAppAdminEmail(email) {
  if (!email) return false;
  return String(email).trim().toLowerCase() === APPGEN_ADMIN_EMAIL.toLowerCase();
}

export function isAppAdminSession(session) {
  return !!(session && isAppAdminEmail(session.email));
}

/** Async: owner email, or a user whose groups grant `admin`. */
export async function isAdminIdentity(sub, email) {
  if (isAppAdminEmail(email)) return true;
  if (!sub) return false;
  try { await loadGroupGrants(); } catch (_) { /* fall back to defaults */ }
  try {
    const rec = await readUserRecord(sub);
    return !!(rec && hasGrant(rec.groups, "admin"));
  } catch (_) {
    return false;
  }
}
