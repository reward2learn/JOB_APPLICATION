// POST /api/scrape-jd  { urls: string[] } | { text: string } | { html: string, url?: string }
// Fetches each job listing (or parses pasted HTML) and returns title, company, location, jd,
// and optional applicationQuestions[].

import {
  parseJobUrlsFromText,
  parseJobPostingFromHtml,
  scrapeJobUrls
} from "../lib/scrape-jd.js";

const MAX_URLS = 100;
const MAX_HTML_CHARS = 2_000_000;

function json(res, status, obj) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(obj));
}

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  let raw = "";
  for await (const chunk of req) raw += chunk;
  if (!raw) return null;
  return JSON.parse(raw);
}

export default async function handler(req, res) {
  try {
    if ((req.method || "GET").toUpperCase() !== "POST") {
      return json(res, 405, { error: "Method not allowed" });
    }
    let body;
    try {
      body = await readBody(req);
    } catch {
      return json(res, 400, { error: "Invalid JSON body" });
    }

    if (body && typeof body.html === "string" && body.html.trim()) {
      const html = body.html.slice(0, MAX_HTML_CHARS);
      const sourceUrl =
        typeof body.url === "string" && body.url.trim()
          ? body.url.trim()
          : "pasted://html";
      const job = parseJobPostingFromHtml(html, sourceUrl);
      return json(res, 200, { ok: true, count: 1, jobs: [job], mode: "html" });
    }

    let urls = [];
    if (body && Array.isArray(body.urls)) urls = body.urls.map(String);
    else if (body && typeof body.text === "string") urls = parseJobUrlsFromText(body.text);
    urls = urls.filter(u => /^https?:\/\//i.test(u)).slice(0, MAX_URLS);
    if (!urls.length) {
      return json(res, 400, {
        error:
          "Provide urls[], text with at least one http(s) URL (max " +
          MAX_URLS +
          "), or html (pasted listing source)."
      });
    }
    const jobs = await scrapeJobUrls(urls);
    return json(res, 200, { ok: true, count: jobs.length, jobs });
  } catch (e) {
    return json(res, 500, { error: e.message || "Scrape failed" });
  }
}
