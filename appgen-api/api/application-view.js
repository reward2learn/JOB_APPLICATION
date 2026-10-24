// GET /api/application-view?token=…&doc=letter|cv
// Public read-only HTML view of a saved application (no session).

import { get } from "@vercel/blob";
import { normalizeLetterBodyHtml } from "../lib/normalize-letter-html.js";
import { printShell } from "../lib/doc-html-shell.js";
import { isValidShareToken, publicSharePath } from "../lib/application-share.js";
import { blobResultToText } from "../lib/user-settings.js";

function html(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  res.end(body);
}

function errorPage(status, message) {
  const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="robots" content="noindex"><title>Not available</title></head><body style="font-family:system-ui,sans-serif;padding:2rem;color:#334"><h1>Document not available</h1><p>${esc(message)}</p></body></html>`;
}

export default async function handler(req, res) {
  if ((req.method || "GET").toUpperCase() !== "GET") {
    res.statusCode = 405;
    res.setHeader("Allow", "GET");
    return res.end("Method not allowed");
  }

  const url = new URL(req.url, "https://apply4job.vercel.app");
  const token = url.searchParams.get("token") || "";
  const doc = (url.searchParams.get("doc") || "letter").toLowerCase();

  if (!isValidShareToken(token)) {
    return html(res, 400, errorPage(400, "Invalid or missing link."));
  }
  if (doc !== "letter" && doc !== "cv") {
    return html(res, 400, errorPage(400, "Unknown document type."));
  }

  const path = publicSharePath(token);
  let text = "";
  try {
    // Private store: get() returns { statusCode, stream } — must drain stream (see blobResultToText).
    text = await blobResultToText(await get(path, { access: "private", useCache: false }));
  } catch (e) {
    return html(res, 404, errorPage(404, "This link may have expired or been removed."));
  }
  if (!text.trim()) {
    return html(res, 404, errorPage(404, "This link may have expired or been removed."));
  }

  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    return html(res, 500, errorPage(500, "Could not load this document."));
  }

  const job = payload.job && typeof payload.job === "object" ? payload.job : {};
  const company = job.company || "Application";
  const title = job.title || (doc === "letter" ? "Cover letter" : "CV");
  const appearance = payload.appearance || {};

  let innerHtml;
  let sheetClass;
  if (doc === "letter") {
    innerHtml = normalizeLetterBodyHtml(payload.letterHTML || "");
    sheetClass = "letter";
  } else {
    innerHtml = String(payload.cvHTML || "");
    sheetClass = "cv";
  }

  if (!innerHtml.trim()) {
    return html(res, 404, errorPage(404, "This document is empty."));
  }

  const pageTitle = doc === "letter" ? `${company} — Cover letter` : `${company} — CV (${title})`;
  return html(res, 200, printShell(pageTitle, sheetClass, innerHtml, appearance, { shareUi: true }));
}
