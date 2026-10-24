/**
 * Optimistic concurrency for Blob-backed multiplayer invites (chess + SNL).
 * Clients send `baseRevision` (or If-Match) on mutating POSTs; server rejects stale writes.
 */

export function inviteRevision(invite) {
  if (!invite) return 0;
  if (typeof invite.revision === "number" && Number.isFinite(invite.revision)) {
    return invite.revision;
  }
  return 0;
}

/** @returns {number|null} null = omit CAS (backward compatible) */
export function parseBaseRevision(body, req) {
  const fromBody = body?.baseRevision ?? body?.base_revision;
  if (fromBody != null && fromBody !== "") {
    const n = Number(fromBody);
    if (Number.isFinite(n) && n >= 0) return Math.floor(n);
  }
  const headers = req?.headers || {};
  const ifMatch = headers["if-match"] || headers["If-Match"];
  if (ifMatch != null && String(ifMatch).trim() !== "") {
    const raw = String(ifMatch).trim().replace(/^W\//, "").replace(/"/g, "");
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0) return Math.floor(n);
  }
  return null;
}

/**
 * @returns {{ ok: true } | { ok: false, code: 'stale_revision', error: string, currentRevision: number }}
 */
export function assertRevisionMatch(invite, baseRevision) {
  if (baseRevision == null) return { ok: true };
  const current = inviteRevision(invite);
  if (baseRevision !== current) {
    return {
      ok: false,
      code: "stale_revision",
      error: "Room state changed — refresh and try again",
      currentRevision: current
    };
  }
  return { ok: true };
}
