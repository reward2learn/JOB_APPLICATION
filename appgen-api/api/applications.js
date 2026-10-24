// Vercel serverless function: saved applications backed by Vercel Blob (per signed-in user).
//
//   GET    /api/applications            -> index array (session required)
//   GET    /api/applications?id=<id>    -> full record (404 if missing / not owned)
//   POST   /api/applications            -> create/upsert by dedupeKey -> {ok, id, ts}
//   DELETE /api/applications?id=<id>    -> delete record + index entry -> {ok:true}
//
// Auth: Google OAuth session cookie (same as /api/user-settings).
// Legacy global `applications/index.json` is migrated once to the first signed-in user
// who lists applications after deploy (marker blob prevents double migration).
// Storage: BLOB_READ_WRITE_TOKEN.

import { put, get, del } from "@vercel/blob";
import crypto from "crypto";
import { publicUser, readSessionUser } from "../lib/auth-session.js";
import {
  LEGACY_INDEX_PATH,
  LEGACY_MIGRATION_MARKER,
  legacyRecordPath,
  userApplicationsPaths
} from "../lib/user-applications.js";
import {
  makeShareToken,
  buildShareDocUrls,
  publishPublicShare,
  revokePublicShare,
  requestOrigin
} from "../lib/application-share.js";

const MAX_HTML_BYTES = 200 * 1024; // ~200KB per document
const MAX_FIELDS = {
  dedupeKey: 200,
  jd: 100 * 1024,
  matchLine: 300,
  matchSub: 500
};

/* ------------------------------------------------------------------ utils */

export function makeId(now = Date.now()) {
  return now.toString(36) + "-" + crypto.randomBytes(4).toString("hex");
}

/** Must match client hashStr(jd) for duplicate-JD reuse lookups. */
export function jdContentHash(jd) {
  let h = 5381;
  const str = String(jd || "");
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}

function isString(v) { return typeof v === "string"; }

function strLimit(v, max) {
  return isString(v) && v.length <= max;
}

export function validatePayload(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Body must be a JSON object" };
  }
  if (!strLimit(body.dedupeKey, MAX_FIELDS.dedupeKey) || !body.dedupeKey.trim()) {
    return { ok: false, error: "dedupeKey (string, <= " + MAX_FIELDS.dedupeKey + " chars) is required" };
  }
  const job = body.job;
  if (!job || typeof job !== "object" || Array.isArray(job)) {
    return { ok: false, error: "job object is required" };
  }
  for (const k of ["title", "company", "location", "salutation", "tone"]) {
    if (job[k] !== undefined && !isString(job[k])) {
      return { ok: false, error: "job." + k + " must be a string" };
    }
  }
  if (!strLimit(job.title, 300) || !job.title.trim()) {
    return { ok: false, error: "job.title (string, <= 300 chars) is required" };
  }
  for (const k of ["jd", "matchLine", "matchSub"]) {
    if (body[k] !== undefined && !strLimit(body[k], MAX_FIELDS[k])) {
      return { ok: false, error: k + " must be a string <= " + MAX_FIELDS[k] + " chars" };
    }
  }
  for (const k of ["letterHTML", "cvHTML"]) {
    if (!strLimit(body[k], MAX_HTML_BYTES)) {
      return { ok: false, error: k + " must be a string <= " + MAX_HTML_BYTES + " bytes" };
    }
  }
  if (body.gapItems !== undefined) {
    if (!Array.isArray(body.gapItems)) return { ok: false, error: "gapItems must be an array" };
    for (const g of body.gapItems) {
      if (!g || typeof g !== "object" || !isString(g.label) || !isString(g.why)) {
        return { ok: false, error: "gapItems entries must be {label, why} strings" };
      }
    }
  }
  if (body.appearance !== undefined) {
    if (!body.appearance || typeof body.appearance !== "object" || Array.isArray(body.appearance)) {
      return { ok: false, error: "appearance must be an object" };
    }
  }
  if (body.content !== undefined) {
    if (!body.content || typeof body.content !== "object" || Array.isArray(body.content)) {
      return { ok: false, error: "content must be an object" };
    }
    for (const k of ["letterThemes", "openingTemplate"]) {
      if (body.content[k] !== undefined && !isString(body.content[k])) {
        return { ok: false, error: "content." + k + " must be a string" };
      }
    }
  }
  return { ok: true };
}

/* Pure index operations (unit-tested; no blob I/O). */

export function upsertIndex(index, entry) {
  const filtered = (Array.isArray(index) ? index : []).filter(
    e => e && e.id !== entry.id && e.dedupeKey !== entry.dedupeKey
  );
  return [entry, ...filtered].sort((a, b) => (b.ts || 0) - (a.ts || 0));
}

export function removeFromIndex(index, id) {
  return (Array.isArray(index) ? index : []).filter(e => e && e.id !== id);
}

export function sanitizeIndex(index) {
  return (Array.isArray(index) ? index : [])
    .filter(e => e && typeof e === "object" && e.id && e.ts)
    .map(e => ({
      id: String(e.id),
      ts: Number(e.ts) || 0,
      dedupeKey: isString(e.dedupeKey) ? e.dedupeKey : "",
      jdHash: isString(e.jdHash) ? e.jdHash : "",
      jobTitle: isString(e.jobTitle) ? e.jobTitle : "",
      company: isString(e.company) ? e.company : "",
      matchLine: isString(e.matchLine) ? e.matchLine : "",
      hasGaps: !!e.hasGaps,
      shareToken: isString(e.shareToken) ? e.shareToken : ""
    }))
    .sort((a, b) => b.ts - a.ts);
}

async function shareTokenForDedupe(getFn, paths, index, dedupeKey) {
  const prev = (Array.isArray(index) ? index : []).find(e => e && e.dedupeKey === dedupeKey);
  if (prev && isString(prev.shareToken) && prev.shareToken.trim()) {
    return prev.shareToken.trim();
  }
  if (prev && prev.id) {
    try {
      const text = await blobResultToText(
        await getFn(paths.recordPath(prev.id), { access: "private", useCache: false })
      );
      const rec = JSON.parse(text);
      if (rec && isString(rec.shareToken) && rec.shareToken.trim()) {
        return rec.shareToken.trim();
      }
    } catch (e) {
      if (!isNotFound(e)) throw e;
    }
  }
  return makeShareToken();
}

/* ------------------------------------------------------------- blob layer */

async function blobResultToText(result) {
  if (result === undefined || result === null) return "";
  if (typeof result === "string") return result;
  const status =
    typeof result.statusCode === "number"
      ? result.statusCode
      : typeof result.status === "number"
        ? result.status
        : null;
  if (status !== null && status !== 200) {
    const err = new Error("Blob not found (HTTP " + status + ")");
    err.name = "BlobNotFoundError";
    throw err;
  }
  if (typeof result.text === "function") return await result.text();
  if (result.stream) {
    const reader = result.stream.getReader();
    const dec = new TextDecoder();
    let out = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      out += dec.decode(value, { stream: true });
    }
    return out + dec.decode();
  }
  return "";
}

function isNotFound(e) {
  if (!e) return false;
  if (e.name === "BlobNotFoundError" || e.code === "blob_not_found") return true;
  return /not[\s_-]?found/i.test(String(e.message || ""));
}

async function loadUserIndex(getFn, indexPath) {
  try {
    const text = await blobResultToText(await getFn(indexPath, { access: "private", useCache: false }));
    return text.trim() ? sanitizeIndex(JSON.parse(text)) : [];
  } catch (e) {
    if (isNotFound(e)) return [];
    throw e;
  }
}

async function maybeMigrateLegacyApps(deps, paths) {
  const { get: getFn, put: putFn } = deps;
  try {
    const markerText = await blobResultToText(
      await getFn(LEGACY_MIGRATION_MARKER, { access: "private", useCache: false })
    );
    if (markerText.trim()) return;
  } catch (e) {
    if (!isNotFound(e)) throw e;
  }

  let legacyIndex = [];
  try {
    const text = await blobResultToText(
      await getFn(LEGACY_INDEX_PATH, { access: "private", useCache: false })
    );
    legacyIndex = text.trim() ? sanitizeIndex(JSON.parse(text)) : [];
  } catch (e) {
    if (isNotFound(e)) return;
    throw e;
  }
  if (!legacyIndex.length) return;

  const existing = await loadUserIndex(getFn, paths.indexPath);
  if (existing.length) {
    await putFn(
      LEGACY_MIGRATION_MARKER,
      JSON.stringify({ migratedToUserHash: paths.hash, skippedBecauseUserHadData: true, at: Date.now() }),
      {
        access: "private",
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: "application/json"
      }
    );
    return;
  }

  const migratedIndex = [];
  for (const entry of legacyIndex) {
    if (!entry || !entry.id) continue;
    try {
      const recText = await blobResultToText(
        await getFn(legacyRecordPath(entry.id), { access: "private", useCache: false })
      );
      if (!recText.trim()) continue;
      await putFn(paths.recordPath(entry.id), recText, {
        access: "private",
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: "application/json"
      });
      migratedIndex.push(entry);
    } catch (e) {
      if (!isNotFound(e)) throw e;
    }
  }

  if (migratedIndex.length) {
    await putFn(paths.indexPath, JSON.stringify(sanitizeIndex(migratedIndex)), {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json"
    });
  }

  await putFn(
    LEGACY_MIGRATION_MARKER,
    JSON.stringify({ migratedToUserHash: paths.hash, at: Date.now(), count: migratedIndex.length }),
    {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json"
    }
  );
}

/* ---------------------------------------------------------------- handler */

function json(res, status, obj) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(obj));
}

function requireUser(req, res) {
  const session = readSessionUser(req);
  const user = publicUser(session);
  if (!user || !user.id) {
    json(res, 401, { ok: false, error: "Sign in required" });
    return null;
  }
  const paths = userApplicationsPaths(user.id);
  if (!paths) {
    json(res, 401, { ok: false, error: "Invalid session" });
    return null;
  }
  return { user, paths };
}

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  let raw = "";
  for await (const chunk of req) raw += chunk;
  if (!raw) return null;
  return JSON.parse(raw);
}

export function createHandler(deps) {
  const { put: putFn, get: getFn, del: delFn } = deps;

  return async function handler(req, res) {
    let method;
    try {
      method = (req.method || "GET").toUpperCase();
      const auth = requireUser(req, res);
      if (!auth) return;
      const { paths } = auth;

      if (method === "GET") {
        await maybeMigrateLegacyApps({ get: getFn, put: putFn }, paths);
        const url = new URL(req.url, "http://localhost");
        const id = url.searchParams.get("id");
        if (id) {
          const index = await loadUserIndex(getFn, paths.indexPath);
          const owned = index.some(e => e && e.id === id);
          if (!owned) return json(res, 404, { error: "Application not found" });
          try {
            const text = await blobResultToText(
              await getFn(paths.recordPath(id), { access: "private", useCache: false })
            );
            if (!text.trim()) return json(res, 404, { error: "Application not found" });
            return json(res, 200, JSON.parse(text));
          } catch (e) {
            if (isNotFound(e)) return json(res, 404, { error: "Application not found" });
            throw e;
          }
        }
        const index = await loadUserIndex(getFn, paths.indexPath);
        return json(res, 200, index);
      }

      if (method === "POST") {
        let body;
        try {
          body = await readBody(req);
        } catch (e) {
          return json(res, 400, { error: "Body is not valid JSON" });
        }
        const check = validatePayload(body);
        if (!check.ok) return json(res, 400, { error: check.error });

        const ts = Date.now();
        const id = makeId(ts);
        const dedupeKey = body.dedupeKey.trim();
        let index = await loadUserIndex(getFn, paths.indexPath);
        const shareToken = await shareTokenForDedupe(getFn, paths, index, dedupeKey);
        const record = {
          id, ts, dedupeKey, shareToken,
          job: body.job || {},
          jd: body.jd || "",
          letterHTML: body.letterHTML,
          cvHTML: body.cvHTML,
          matchLine: body.matchLine || "",
          matchSub: body.matchSub || "",
          gapItems: body.gapItems || [],
          appearance: body.appearance || {},
          content: body.content || {}
        };

        const previous = index.filter(e => e.dedupeKey === dedupeKey);
        await putFn(paths.recordPath(id), JSON.stringify(record), {
          access: "private",
          addRandomSuffix: false,
          allowOverwrite: true,
          contentType: "application/json"
        });
        await publishPublicShare(putFn, shareToken, {
          v: 1,
          ts,
          job: { title: record.job.title || "", company: record.job.company || "" },
          letterHTML: record.letterHTML,
          cvHTML: record.cvHTML,
          appearance: record.appearance
        });
        const staleIds = previous.map(e => e.id).filter(oldId => oldId !== id);
        if (staleIds.length) {
          try {
            await delFn(staleIds.map(oldId => paths.recordPath(oldId)));
          } catch (e) { /* best-effort */ }
        }
        const nextIndex = upsertIndex(index, {
          id, ts, dedupeKey, shareToken,
          jdHash: jdContentHash(record.jd),
          jobTitle: record.job.title || "",
          company: record.job.company || "",
          matchLine: record.matchLine,
          hasGaps: (record.gapItems || []).length > 0
        });
        await putFn(paths.indexPath, JSON.stringify(nextIndex), {
          access: "private",
          addRandomSuffix: false,
          allowOverwrite: true,
          contentType: "application/json"
        });
        const origin = requestOrigin(req);
        const shareUrls = buildShareDocUrls(origin, shareToken);
        return json(res, 200, { ok: true, id, ts, shareToken, shareUrls });
      }

      if (method === "DELETE") {
        const url = new URL(req.url, "http://localhost");
        const id = url.searchParams.get("id");
        if (!id) return json(res, 400, { error: "id query parameter is required" });
        let index = await loadUserIndex(getFn, paths.indexPath);
        const idxEntry = index.find(e => e && e.id === id);
        if (!idxEntry) {
          return json(res, 404, { error: "Application not found" });
        }
        let shareTokenRevoke = isString(idxEntry.shareToken) ? idxEntry.shareToken.trim() : "";
        if (!shareTokenRevoke) {
          try {
            const text = await blobResultToText(
              await getFn(paths.recordPath(id), { access: "private", useCache: false })
            );
            const rec = JSON.parse(text);
            if (rec && isString(rec.shareToken)) shareTokenRevoke = rec.shareToken.trim();
          } catch (e) {
            if (!isNotFound(e)) throw e;
          }
        }
        try {
          await delFn(paths.recordPath(id));
        } catch (e) {
          if (!isNotFound(e)) throw e;
        }
        if (shareTokenRevoke) {
          try {
            await revokePublicShare(delFn, shareTokenRevoke);
          } catch (e) { /* best-effort */ }
        }
        await putFn(paths.indexPath, JSON.stringify(removeFromIndex(index, id)), {
          access: "private",
          addRandomSuffix: false,
          allowOverwrite: true,
          contentType: "application/json"
        });
        return json(res, 200, { ok: true });
      }

      return json(res, 405, { error: "Method not allowed" });
    } catch (e) {
      return json(res, 500, { error: "Server error: " + (e && e.message ? e.message : "unknown") });
    }
  };
}

export default createHandler({ put, get, del });
