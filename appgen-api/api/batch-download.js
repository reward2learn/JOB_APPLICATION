// POST /api/batch-download
// Body: { items: [{ slug, title, company, jd, letterHtml, cvHtml, sourceUrl? }], appearance? }
// Returns application/zip with {Company-Title}-cover-letter.pdf + {Company-Title}-cv.pdf + job-description.txt per role.

import archiver from "archiver";
import { PassThrough } from "stream";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";
import { normalizeLetterBodyHtml } from "../lib/normalize-letter-html.js";
import { printShell } from "../lib/doc-html-shell.js";

const MAX_ITEMS = 20;
const MAX_HTML = 220 * 1024;
const MAX_JD = 120 * 1024;
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

function safeSlug(s, fallback) {
  const t = String(s || fallback || "job")
    .replace(/[\\/:*?"<>|\n\r\t]+/g, " ")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 72);
  return t || "job";
}

/** Folder + PDF basename: Company-JobTitle (matches client fileSafe(company)-fileSafe(title)). */
function applicationBaseName(it, index) {
  return safeSlug(it.slug, (it.company || "") + "-" + (it.title || "job-" + (index + 1)));
}

function validateItems(body) {
  if (!body || !Array.isArray(body.items) || !body.items.length) {
    return { ok: false, error: "items[] is required" };
  }
  if (body.items.length > MAX_ITEMS) {
    return { ok: false, error: "Max " + MAX_ITEMS + " items per batch" };
  }
  for (const it of body.items) {
    if (!it || typeof it !== "object") return { ok: false, error: "Each item must be an object" };
    if (typeof it.letterHtml !== "string" || it.letterHtml.length > MAX_HTML) {
      return { ok: false, error: "letterHtml required (max " + MAX_HTML + " bytes)" };
    }
    if (typeof it.cvHtml !== "string" || it.cvHtml.length > MAX_HTML) {
      return { ok: false, error: "cvHtml required (max " + MAX_HTML + " bytes)" };
    }
    if (it.jd !== undefined && (typeof it.jd !== "string" || it.jd.length > MAX_JD)) {
      return { ok: false, error: "jd must be a string <= " + MAX_JD };
    }
  }
  return { ok: true };
}

async function launchBrowser() {
  const executablePath =
    process.env.PUPPETEER_EXECUTABLE_PATH || (await chromium.executablePath());
  return puppeteer.launch({
    args: chromium.args,
    defaultViewport: { width: 1240, height: 1754, deviceScaleFactor: 1 },
    executablePath,
    headless: true,
  });
}

async function htmlToPdf(browser, html) {
  const page = await browser.newPage();
  try {
    await page.emulateMediaType("print");
    await page.setContent(html, { waitUntil: "networkidle0", timeout: 60000 });
    await page.evaluate(async () => {
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
    });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" }
    });
    return Buffer.from(pdf);
  } finally {
    await page.close().catch(() => {});
  }
}

function zipBuffers(entries) {
  return new Promise((resolve, reject) => {
    const archive = archiver("zip", { zlib: { level: 6 } });
    const stream = new PassThrough();
    const chunks = [];
    stream.on("data", c => chunks.push(c));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
    archive.on("error", reject);
    archive.pipe(stream);
    for (const e of entries) {
      archive.append(e.data, { name: e.name });
    }
    archive.finalize();
  });
}

async function buildZipWithPdfs(items, appearance) {
  const browser = await launchBrowser();
  const zipEntries = [];
  try {
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const base = applicationBaseName(it, i);
      const prefix = base + "/";
      const jdText = [
        it.title ? "Title: " + it.title : "",
        it.company ? "Company: " + it.company : "",
        it.sourceUrl ? "URL: " + it.sourceUrl : "",
        "",
        it.jd || ""
      ]
        .join("\n")
        .trim();
      zipEntries.push({ name: prefix + "job-description.txt", data: jdText + "\n" });

      const letterTitle = [it.title, it.company, "Cover Letter"].filter(Boolean).join(" — ");
      const cvTitle = [it.title, it.company, "CV"].filter(Boolean).join(" — ");
      const letterHtml = normalizeLetterBodyHtml(it.letterHtml);
      const letterPdf = await htmlToPdf(
        browser,
        printShell(letterTitle, "letter", letterHtml, appearance)
      );
      const cvPdf = await htmlToPdf(browser, printShell(cvTitle, "cv", it.cvHtml, appearance));
      zipEntries.push({ name: prefix + base + "-cover-letter.pdf", data: letterPdf });
      zipEntries.push({ name: prefix + base + "-cv.pdf", data: cvPdf });
    }
    zipEntries.push({
      name: "README.txt",
      data:
        "Each folder has {Company-Title}-cover-letter.pdf, {Company-Title}-cv.pdf, and job-description.txt.\n" +
        "PDFs are A4 print exports (appgen-doc.css + appgen-print.css, same as Print → Save as PDF).\n"
    });
  } finally {
    await browser.close().catch(() => {});
  }
  return zipBuffers(zipEntries);
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
      return json(res, 400, { error: "Invalid JSON" });
    }
    const v = validateItems(body);
    if (!v.ok) return json(res, 400, { error: v.error });

    const buf = await buildZipWithPdfs(body.items, body.appearance);
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", 'attachment; filename="application-batch.zip"');
    res.end(buf);
  } catch (e) {
    console.error("batch-download PDF zip failed:", e && e.message ? e.message : e);
    return json(res, 500, { error: e.message || "ZIP / PDF generation failed" });
  }
}
