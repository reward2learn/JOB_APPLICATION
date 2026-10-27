/**
 * Application Generator security groups (RBAC).
 *
 * Four groups, assigned by an admin in Users & Access:
 *
 *   Admin           — full access (CV app, cognitive training, games, admin panel)
 *   ApplicantGroup  — the CV / cover-letter generator
 *   CognitiveGroup  — Cognitive Training hub (+ its games)
 *   PlayerGroup     — the game apps — DEFAULT for every new sign-in
 *
 * A user holds an ARRAY of groups; their capability set is the union of the
 * grants of every group they hold, so "Admin + PlayerGroup" is legal.
 *
 * Grants (the words the client asks for):
 *   admin     — admin panel / user management
 *   applicant — Applications (CV + cover letters)
 *   cognitive — Cognitive Training hub (incl. Memory Trainer)
 *   game      — game apps (Chess tutor, Snakes & ladders, Mini Games, Memory)
 */

export const SECURITY_GROUPS = ["Admin", "ApplicantGroup", "CognitiveGroup", "PlayerGroup"];
export const DEFAULT_GROUPS = ["PlayerGroup"];

/** group -> grants */
export const GROUP_GRANTS = {
  Admin: ["admin", "applicant", "cognitive", "game"],
  ApplicantGroup: ["applicant"],
  CognitiveGroup: ["cognitive", "game"],
  PlayerGroup: ["game"]
};

export const ALL_GRANTS = ["admin", "applicant", "cognitive", "game"];

/** Human labels for the admin permissions UI. */
export const GRANT_LABELS = {
  admin: "Admin panel & user management",
  applicant: "Applications (CV + cover letters)",
  cognitive: "Cognitive Training hub",
  game: "Game apps (Chess, Snakes & ladders, Mini Games)"
};

export const GROUP_LABELS = {
  Admin: "Admin — full access",
  ApplicantGroup: "Applicant Group — CV / cover letters",
  CognitiveGroup: "Cognitive Group — training",
  PlayerGroup: "Player Group — games (default for new sign-ins)"
};

/* Admin-configurable override (loaded from Vercel Blob by lib/group-grants.js).
   Null = use the built-in GROUP_GRANTS above. */
let groupGrantsOverride = null;

export function setGroupGrantsOverride(map) {
  groupGrantsOverride = map && typeof map === "object" ? map : null;
}

export function getGroupGrantsOverride() {
  return groupGrantsOverride;
}

/** The matrix currently in force (override if set, else the default). */
export function effectiveGroupGrants() {
  if (!groupGrantsOverride) return GROUP_GRANTS;
  const out = {};
  for (const g of SECURITY_GROUPS) {
    const list = Array.isArray(groupGrantsOverride[g]) ? groupGrantsOverride[g] : GROUP_GRANTS[g];
    out[g] = list.filter((x) => ALL_GRANTS.includes(x));
  }
  return out;
}

export function isValidGroup(g) {
  return SECURITY_GROUPS.includes(g);
}

/** Accepts an array or comma string; drops unknowns/dupes; empty -> DEFAULT_GROUPS. */
export function normalizeGroups(input) {
  let list = [];
  if (Array.isArray(input)) list = input;
  else if (typeof input === "string") list = input.split(/[\s,]+/);
  else if (input && typeof input === "object") list = Object.keys(input).filter((k) => input[k]);
  list = list.map((g) => String(g || "").trim()).filter((g) => isValidGroup(g));
  const out = [];
  for (const g of list) if (!out.includes(g)) out.push(g);
  return out.length ? out : [...DEFAULT_GROUPS];
}

export function grantsFor(groups) {
  const matrix = effectiveGroupGrants();
  const out = [];
  for (const g of normalizeGroups(groups)) {
    for (const grant of matrix[g] || []) if (!out.includes(grant)) out.push(grant);
  }
  return out;
}

export function hasGrant(groups, grant) {
  return grantsFor(groups).includes(grant);
}

/**
 * Groups a brand-new Google sign-in starts with.
 * The owner account keeps its legacy admin behaviour without a manual grant.
 */
export function groupsForNewUser(email) {
  const admin = String(email || "").trim().toLowerCase();
  if (admin && admin === "reward2learn@gmail.com") return ["Admin", "PlayerGroup"];
  return [...DEFAULT_GROUPS];
}

/** True when the group list actually grants something the default does not. */
export function isNonDefaultGroups(groups) {
  const g = normalizeGroups(groups);
  if (g.length !== DEFAULT_GROUPS.length) return true;
  return g.some((x) => !DEFAULT_GROUPS.includes(x));
}
