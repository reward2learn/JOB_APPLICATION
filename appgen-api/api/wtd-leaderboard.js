// WTD cognitive demo — cross-device leaderboard (Vercel Blob).
//
//   GET  /api/wtd-leaderboard?level=all|inhibit|…&limit=25
//   POST /api/wtd-leaderboard  { player, levelId, timeMs, points, accuracyPct }
//
// Public read/write (demo scores only). Not gated by APPGEN_CODE.
// Storage: wtd/leaderboard.json (private blob).

import { put, get } from "@vercel/blob";
import crypto from "crypto";
import {
  validateWtdEntry,
  sanitizeWtdEntry,
  appendWtdEntry,
  filterAndSortLeaderboard,
  WTD_MAX_ENTRIES
} from "../lib/wtd-leaderboard.js";

const BLOB_PATH = "wtd/leaderboard.json";

async function blobResultToText(result) {
  if (result === undefined || result === null) return "";
  if (typeof result === "string") return result;
  /* @vercel/blob get() returns { statusCode, stream } (not Response.status / .text()). */
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

function json(res, status, obj) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(obj));
}

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  let raw = "";
  for await (const chunk of req) raw += chunk;
  if (!raw) return null;
  return JSON.parse(raw);
}

async function loadStore(getFn) {
  try {
    const text = await blobResultToText(await getFn(BLOB_PATH, { access: "private", useCache: false }));
    if (!text.trim()) return { version: 1, updatedAt: null, entries: [] };
    const parsed = JSON.parse(text);
    const entries = Array.isArray(parsed.entries) ? parsed.entries : [];
    const clean = entries
      .map((e, i) => sanitizeWtdEntry(e, "legacy-" + i, parsed.updatedAt))
      .filter(Boolean);
    return { version: 1, updatedAt: parsed.updatedAt || null, entries: clean };
  } catch (e) {
    if (isNotFound(e)) return { version: 1, updatedAt: null, entries: [] };
    throw e;
  }
}

async function saveStore(putFn, store) {
  const payload = {
    version: 1,
    updatedAt: new Date().toISOString(),
    entries: store.entries
  };
  await putFn(BLOB_PATH, JSON.stringify(payload), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json"
  });
  return payload.updatedAt;
}

export function createWtdLeaderboardHandler(deps) {
  const { put: putFn, get: getFn } = deps;

  return async function handler(req, res) {
    try {
      const method = (req.method || "GET").toUpperCase();
      const url = new URL(req.url, "http://localhost");

      if (method === "GET") {
        const store = await loadStore(getFn);
        const level = url.searchParams.get("level") || "all";
        const limit = url.searchParams.get("limit") || "25";
        const entries = filterAndSortLeaderboard(store.entries, level, limit);
        return json(res, 200, {
          ok: true,
          updatedAt: store.updatedAt,
          entries,
          total: store.entries.length
        });
      }

      if (method === "POST") {
        let body;
        try {
          body = await readBody(req);
        } catch (_) {
          return json(res, 400, { error: "Body is not valid JSON" });
        }
        const check = validateWtdEntry(body);
        if (!check.ok) return json(res, 400, { error: check.error });

        const id = Date.now().toString(36) + "-" + crypto.randomBytes(4).toString("hex");
        const at = new Date().toISOString();
        const entry = sanitizeWtdEntry({ ...check.entry, id, at }, id, at);

        const store = await loadStore(getFn);
        store.entries = appendWtdEntry(store.entries, entry, WTD_MAX_ENTRIES);
        const updatedAt = await saveStore(putFn, store);

        return json(res, 200, { ok: true, id: entry.id, at: entry.at, updatedAt });
      }

      return json(res, 405, { error: "Method not allowed" });
    } catch (e) {
      return json(res, 500, { error: "Server error: " + (e && e.message ? e.message : "unknown") });
    }
  };
}

export default createWtdLeaderboardHandler({ put, get });
