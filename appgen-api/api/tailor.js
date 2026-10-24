// Vercel serverless function: LLM tailoring pipeline (roadmap Phase 2).
//
//   POST /api/tailor  { jd, kb, settings }  -> SSE event stream (or cached JSON)
//
// Pipeline (plain typed step pipeline — roadmap Phase 2):
//   All steps use tier "mid" (Gateway: nvidia/nemotron-3.5-lightning-free for every call).
//   1 JD Analyst      -> requirements JSON (zod-validated)
//   2 Evidence Mapper -> per-requirement verdict + KB evidence IDs ONLY
//   3 Narrative Arch. -> positioning + themes + opening + gap stories
//   4 Document Composer -> letterBodyHTML + cvData (claims carry evidence IDs)
//   5 Critic          -> critique; ONE revision loop max (re-runs step 4 if needed)
//   6 ATS Simulator   -> keyword coverage %, missing terms, warnings
//
// Deterministic no-fabrication backstop: entityGuard() runs on all LLM output;
// any entity not present in the caller-supplied KB payload is stripped + flagged.
//
// Caching: full result cached in Vercel Blob keyed by
// sha256(jd + kbVersion + settings-hash). Cache hit -> JSON {cached:true, result}.
// Auth: APPGEN_CODE (if set) required on all requests via x-appgen-code.
// If ANTHROPIC_API_KEY is missing -> 501 {error:"LLM tailoring not configured"}.

import { put, get } from "@vercel/blob";
import { z } from "zod";
import crypto from "crypto";
import {
  normalizeLlmRequest,
  buildPipelineAdapter,
  llmCacheHash,
  assertLlmConfigured,
  isPausableLlmError,
  sleep
} from "./llm-adapter.js";
import { normalizeLetterBodyHtml } from "../lib/normalize-letter-html.js";

const STEP_DELAY_MS = Math.max(0, parseInt(process.env.TAILOR_STEP_DELAY_MS || "800", 10) || 0);
const PAUSE_RETRY_DELAYS_MS = (process.env.TAILOR_LLM_RETRY_DELAYS || "2000,5000")
  .split(",")
  .map(s => parseInt(s.trim(), 10))
  .filter(n => Number.isFinite(n) && n > 0);
const STEP_BUDGET = { 1: 2500, 2: 3000, 3: 4500, 4: 12000, 5: 2200, 6: 2800 };
const MAX_LLM_CALLS = 8;          // hard total-call budget per request
const MAX_REVISIONS = 1;          // roadmap: "one revision loop max" in this phase
const TEMPS = { 1: 0.2, 2: 0.2, 3: 0.6, 4: 0.5, 5: 0.2, 6: 0.2 };

const CACHE_PREFIX = "tailor-cache/";
const MAX_HTML_BYTES = 200 * 1024;

/* ------------------------------------------------------------------ utils */

export function makeId(now = Date.now()) {
  return now.toString(36) + "-" + crypto.randomBytes(4).toString("hex");
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
      jobTitle: isString(e.jobTitle) ? e.jobTitle : "",
      company: isString(e.company) ? e.company : "",
      matchLine: isString(e.matchLine) ? e.matchLine : "",
      hasGaps: !!e.hasGaps
    }))
    .sort((a, b) => b.ts - a.ts);
}

/* ------------------------------------------------------------------ schemas */

const RequirementsSchema = z.object({
  role: z.string().max(300),
  seniority: z.enum(["junior", "mid", "senior", "lead", "principal", "unknown"]).default("senior"),
  essentials: z.array(z.object({
    id: z.string().max(24),
    text: z.string().max(800),
    keywords: z.array(z.string().max(80)).max(20).default([])
  }).default({ id: "", text: "", keywords: [] })).default([]),
  desirable: z.array(z.object({
    id: z.string().max(24),
    text: z.string().max(800),
    keywords: z.array(z.string().max(80)).max(20).default([])
  }).default({ id: "", text: "", keywords: [] })).default([]),
  atsTerms: z.array(z.string().max(80)).max(50).default([])
});

const EvidenceMapSchema = z.object({
  mappings: z.array(z.object({
    requirementId: z.string().max(24),
    verdict: z.enum(["strong", "partial", "gap"]),
    evidenceIds: z.array(z.string().max(24)).max(8).default([]),
    note: z.string().max(600).default("")
  })).min(1)
});

const NarrativeSchema = z.object({
  positioning: z.string().max(1500),
  metaLine: z.string().max(400).default(""),
  openingHook: z.string().max(2000),
  themes: z.array(z.object({
    title: z.string().max(300),
    evidenceIds: z.array(z.string().max(24)).max(8).default([])
  })).min(3).max(8),
  gapStories: z.array(z.object({
    gapTool: z.string().max(120),
    transferStory: z.string().max(900),
    evidenceIds: z.array(z.string().max(24)).max(6).default([])
  })).max(8).optional().default([])
});

const CvDataSchema = z.object({
  summaryParas: z.array(z.string().max(2500)).max(8).default([]),
  metaLine: z.string().max(400).default(""),
  skillsRows: z.array(z.object({ cat: z.string().max(100), text: z.string().max(2000) })).max(12).default([]),
  techRows: z.array(z.object({ cat: z.string().max(100), chips: z.array(z.string().max(200)).max(24) })).max(12).default([]),
  experienceBlocks: z.array(z.object({
    header: z.string().max(300),
    sub: z.string().max(500).default(""),
    lines: z.array(z.string().max(1000)).max(10).default([]),
    groups: z.array(z.object({ sub: z.string().max(300), bullets: z.array(z.string().max(1200)).max(14) })).max(8).default([]),
    products: z.array(z.object({
      name: z.string().max(200), stack: z.string().max(500),
      highlights: z.string().max(1200), url: z.string().max(400).default("")
    })).max(10).default([])
  })).max(6).default([]),
  education: z.array(z.string().max(400)).max(14).default([]),
  projects: z.array(z.object({ name: z.string().max(200), url: z.string().max(400) })).max(12).default([]),
  references: z.string().max(1000).default(""),
  applicationAnswers: z.array(z.object({
    question: z.string().max(500),
    answer: z.string().max(2500)
  })).max(12).optional().default([])
});

const AtsSchema = z.object({
  coveragePercent: z.number().min(0).max(100),
  matchedTerms: z.array(z.string().max(60)).max(40),
  missingTerms: z.array(z.string().max(60)).max(40),
  warnings: z.array(z.string().max(300)).max(10)
});

/* -------------------------------------------------- deterministic entity guard */

// Words that are never "entities" (HTML, CSS, generic English, doc chrome).
const STOPWORDS = new Set(("the a an and or of for with in on to at by from as is are be been was " +
  "our your their his her my its this that these those i we you they he she it not no but if then " +
  "span div p h1 h2 h3 ul ol li table thead tbody tr td th strong em b br hr class data id src href " +
  "http https www mailto true false justify hyphens auto inline block none flex grid center left " +
  "right bold italic serif sans normal weight color background border margin padding width height " +
  "font size line family head title role meta contact letter body sheet themes signoff attachments " +
  "summary experience education certifications projects references skills technologies preferred " +
  "professional technical key evidence available request invalid undefined " +
  // salutations / signoffs / cert-and-prose generics that must never read as entities
  "dear hiring team kind regards yours sincerely faithfully certified certification design designs " +
  "graphic advanced diploma check checks police national developer cloud google platform solutions " +
  "architect associate planning financial finance senior junior lead principal engineer engineering " +
  "systems system product manager managers owner ownership visualisation dashboard analytics apis api " +
  "built deployed shipped delivered launched designed developed created microsoft minimal controllers"
  ).split(" "));

function extractEntities(html) {
  const text = String(html || "")
    .replace(/<style[\s\S]*?<\/style>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, " ");
  const found = new Set();
  // Dotted / compound stack tokens first (avoid ".NET" → spurious "NET" acronym).
  for (const m of text.matchAll(/\b(?:Node\.js|Next\.js|NestJS|ASP\.NET(?:\s+Core)?)\b/gi)) found.add(m[0]);
  for (const m of text.matchAll(/(?<![A-Za-z0-9])\.NET(?:\s+\d+(?:\.\d+)?)?\b/gi)) found.add(m[0]);
  // CamelCase tokens (FlubberJS, TokenizMyApp) and suffixed tech tokens (x.js, xJS, C#, .NET, C++)
  for (const m of text.matchAll(/\b([A-Z][a-z]+(?:[A-Z][a-zA-Z0-9]+)+)\b/g)) found.add(m[1]);
  for (const m of text.matchAll(/\b([A-Za-z][A-Za-z0-9]*\.(?:js|ts|net|vip|io|ai))\b/gi)) found.add(m[1]);
  for (const m of text.matchAll(/\b([A-Z]{2,}[0-9]*[A-Z0-9]*)\b/g)) {
    if (m[1].length >= 3 && !(m.index > 0 && text[m.index - 1] === ".")) found.add(m[1]);
  }
  for (const m of text.matchAll(/\b([A-Z][a-zA-Z0-9]*[+#])\b/g)) found.add(m[1]);
  // Capitalised multi-word sequences (potential product/cert names), 2–3 words
  for (const m of text.matchAll(/\b([A-Z][a-zA-Z0-9]+(?:\s+[A-Z][a-zA-Z0-9]+){1,2})\b/g)) {
    const seq = m[1];
    if (!seq.split(" ").every(w => STOPWORDS.has(w.toLowerCase()))) found.add(seq);
  }
  return [...found];
}

function normaliseEntity(s) {
  return s.toLowerCase().replace(/[^a-z0-9.+# ]/g, "").replace(/\s+/g, " ").trim();
}

/**
 * Deterministic no-fabrication backstop.
 * @param {string} html        - LLM-generated document fragment
 * @param {Array}  kbEntities  - [{name, aliases?}] from the caller's KB payload
 * @returns {{clean: boolean, violations: string[], cleanedHtml: string}}
 */
/* Generic tech vocabulary — appears in honest prose but is not a fabricated
   tool. Never treat these as violations (e.g. "production GenAI assistant"). */
const GENERIC_TERMS = new Set([
  "genai", "llm", "llms", "ml", "nlp", "api", "apis", "saas", "paas", "iaas",
  "sso", "rbac", "oauth", "saml", "cicd", "devops", "etl", "sql", "nosql",
  "ui", "ux", "cdn", "sdk", "http", "https", "json", "xml", "orm", "mvc",
  "oop", "tdd", "bdd", "qa", "sla", "slo", "kpi", "hr", "crm", "cms", "seo",
  "db", "dbms", "rdbms", "tcp", "udp", "dns", "tls", "ssl", "vpn", "vm",
  "cpu", "gpu", "ram", "assistant", "assistants", "platform", "platforms",
  "pipeline", "pipelines", "dashboard", "dashboards", "cloud", "backend",
  "frontend", "fullstack", "microservices", "microservice", "container",
  "containers", "orchestration", "streaming", "realtime", "webhooks",
  "webhook", "deployment", "deployments", "release", "releases", "gateway",
  "gateways", "framework", "frameworks", "library", "libraries", "runtime",
  "database", "databases", "cache", "caching", "queue", "queues", "testing",
  "monitoring", "observability", "automation", "integration", "integrations",
  "evaluation", "guardrails", "agent", "agents", "agentic", "workflow",
  "workflows", "chatbot", "chatbots", "copilot", "governance", "compliance",
  "gcp", "azure", "navigator"
]);

function entityInDict(n, dict, html) {
  if (dict.has(n)) return true;
  if (n === "net" && (dict.has(".net") || /\.net\b/i.test(html))) return true;
  if (n === "asp" && (dict.has("asp.net") || /\basp\.net\b/i.test(html))) return true;
  return false;
}

export function entityGuard(html, kbEntities) {
  const dict = new Set();
  const addWord = (s) => {
    const n = normaliseEntity(s);
    if (n.length >= 3 && !STOPWORDS.has(n)) dict.add(n);
  };
  for (const e of (kbEntities || [])) {
    if (!e || !e.name) continue;
    dict.add(normaliseEntity(e.name));
    // sub-words of multi-word entities ("TAFE NSW" → "tafe", "nsw") so partial
    // mentions and cross-boundary sequences ("Apliqo UX Certified") don't flag
    for (const w of normaliseEntity(e.name).split(" ")) addWord(w);
    for (const a of (e.aliases || [])) {
      dict.add(normaliseEntity(a));
      for (const w of normaliseEntity(a).split(" ")) addWord(w);
    }
  }
  const candidates = extractEntities(html);
  const violations = [];
  let cleanedHtml = String(html || "");
  for (const cand of candidates) {
    const n = normaliseEntity(cand);
    if (!n || n.length < 3) continue;
    if (STOPWORDS.has(n) || GENERIC_TERMS.has(n)) continue;
    const words = n.split(" ");
    if (words.length > 1) {
      /* multi-word sequence: flag only when NO word traces to the KB */
      if (dict.has(n) || words.some(w => entityInDict(w, dict, html) || STOPWORDS.has(w) || GENERIC_TERMS.has(w))) continue;
    } else if (entityInDict(n, dict, html)) {
      continue;
    }
    // allow entity mentioned as a GAP (named honestly) — "no FlubberJS experience"
    const gapMention = new RegExp("(?:no|not used|haven'?t used|haven'?t worked in|never used|gap[cs]?:?)\\s+(?:in\\s+|with\\s+|tools like\\s+)?" + cand.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&"), "i").test(html);
    if (gapMention) continue;
    violations.push(cand);
    cleanedHtml = cleanedHtml
      .replace(new RegExp("\\s*\\b" + cand.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&") + "\\b\\s*", "g"), " ")
      .replace(/(<>|< [^>]*>|\{\s*\}\s*)/g, " ")
      .replace(/\s{2,}/g, " ");
  }
  return { clean: violations.length === 0, violations, cleanedHtml };
}

/** Shared composer/revision honesty rules — keep in sync with step 4 + critic revision suffix. */
export const COMPOSE_HONESTY_RULES =
  "NEVER invent tools, certifications, employers, client deployments, dates, metrics, or degrees. " +
  "Reuse the candidate's real data verbatim from EVIDENCE; reorder and emphasise toward the job only. " +
  "Do not close JD gaps except by restating gapStories transfer text grounded in cited evidence — never imply production use of a gap tool. " +
  "NEVER put evidence IDs (EV-1, EV-2, …) in letterBodyHTML or cv text — IDs are internal to the pipeline only; audience copy is plain prose.";

const EVIDENCE_ID_RE = "EV-\\d+";

/** Fix orphaned commas after evidence/entity stripping (`,,` → `,`). */
export function normalizeAudiencePunctuation(text) {
  if (text === undefined || text === null) return text;
  if (typeof text !== "string") return text;
  let s = text;
  for (let i = 0; i < 6; i++) {
    const next = s
      .replace(/,\s*,+/g, ",")
      .replace(/,{2,}/g, ",")
      .replace(/,\s*([.;:!?])/g, "$1")
      .replace(/,\s*([)\]])/g, "$1")
      .replace(/([(\[])\s*,/g, "$1");
    if (next === s) break;
    s = next;
  }
  s = s.replace(/\s+([,.;:])/g, "$1");
  s = s.replace(/\s{2,}/g, " ");
  return s;
}

/** Remove internal KB evidence IDs from recruiter-facing letter/CV copy. */
export function stripAudienceEvidenceIds(text) {
  if (text === undefined || text === null) return text;
  if (typeof text !== "string") return text;
  let s = text;
  s = s.replace(
    new RegExp(`\\(\\s*${EVIDENCE_ID_RE}(?:\\s*,\\s*${EVIDENCE_ID_RE})*\\s*\\)`, "gi"),
    ""
  );
  s = s.replace(
    new RegExp(`\\[\\s*${EVIDENCE_ID_RE}(?:\\s*,\\s*${EVIDENCE_ID_RE})*\\s*\\]`, "gi"),
    ""
  );
  s = s.replace(new RegExp(`\\b${EVIDENCE_ID_RE}\\b`, "gi"), "");
  s = s.replace(/\(\s*\)/g, "");
  s = normalizeAudiencePunctuation(s);
  return s.trim();
}

export function stripEvidenceIdsFromCv(cv) {
  if (!cv || typeof cv !== "object") return cv;
  const walk = v => {
    if (typeof v === "string") return stripAudienceEvidenceIds(v);
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") {
      const o = {};
      for (const [k, val] of Object.entries(v)) o[k] = walk(val);
      return o;
    }
    return v;
  };
  return walk(cv);
}

/** Flatten composed CV JSON (for tests / debugging). */
export function cvToPlainText(cv) {
  return cvGuardChunks(cv).join(" ");
}

/** One chunk per CV field so entity extract does not span unrelated lines (avoids false positives). */
export function cvGuardChunks(cv) {
  if (!cv || typeof cv !== "object") return [];
  const chunks = [];
  const push = (s) => {
    const t = String(s || "").trim();
    if (t) chunks.push(t);
  };
  if (Array.isArray(cv.summaryParas)) cv.summaryParas.forEach(push);
  push(cv.metaLine);
  if (Array.isArray(cv.skillsRows)) {
    for (const r of cv.skillsRows) {
      if (!r) continue;
      push(r.cat);
      push(r.text);
    }
  }
  if (Array.isArray(cv.techRows)) {
    for (const r of cv.techRows) {
      if (!r) continue;
      push(r.cat);
      if (Array.isArray(r.chips)) r.chips.forEach(push);
    }
  }
  if (Array.isArray(cv.experienceBlocks)) {
    for (const b of cv.experienceBlocks) {
      if (!b || typeof b !== "object") continue;
      push(b.header);
      push(b.sub);
      if (Array.isArray(b.lines)) b.lines.forEach(push);
      if (Array.isArray(b.groups)) {
        for (const g of b.groups) {
          if (!g) continue;
          push(g.sub);
          if (Array.isArray(g.bullets)) g.bullets.forEach(push);
        }
      }
      if (Array.isArray(b.products)) {
        for (const p of b.products) {
          if (!p || typeof p !== "object") continue;
          push(p.name);
          push(p.stack);
          push(p.highlights);
          push(p.url);
        }
      }
    }
  }
  if (Array.isArray(cv.education)) cv.education.forEach(push);
  if (Array.isArray(cv.projects)) {
    for (const p of cv.projects) {
      if (!p) continue;
      push(p.name);
      push(p.url);
    }
  }
  if (Array.isArray(cv.applicationAnswers)) {
    for (const a of cv.applicationAnswers) {
      if (!a || typeof a !== "object") continue;
      push(a.question);
      push(a.answer);
    }
  }
  push(cv.references);
  return chunks;
}

/** CV References line — always from caller settings / KB, never from composer evidence IDs. */
export function cvReferencesFromProfile(kb, settings) {
  const fromSettings =
    settings && settings.content && typeof settings.content.references === "string"
      ? settings.content.references.trim()
      : "";
  const fromKb = kb && typeof kb.references === "string" ? kb.references.trim() : "";
  const text = fromSettings || fromKb || "Available on request.";
  return text.slice(0, 1000);
}

/** Caller KB entities + profile name/location (+ Sydney office aliases) for guard dictionary. */
export function kbEntitiesForGuard(kb, settings) {
  const list = [...(Array.isArray(kb && kb.entities) ? kb.entities : [])];
  const profileName = (kb && kb.profile && kb.profile.name) || (settings && settings.profile && settings.profile.name) || "";
  if (profileName) list.push({ name: profileName });
  const loc = (kb && kb.profile && kb.profile.location) || (settings && settings.profile && settings.profile.location) || "";
  if (loc) {
    const entry = { name: loc, aliases: [] };
    if (/sydney/i.test(loc)) entry.aliases.push("North Sydney", "NSW", "Sydney");
    list.push(entry);
  }
  if (kb && Array.isArray(kb.projects)) {
    for (const p of kb.projects) {
      if (p && p.name) list.push({ name: p.name });
    }
  }
  return list;
}

function entityGuardCv(cv, kbEntities) {
  const violations = [];
  for (const chunk of cvGuardChunks(cv)) {
    const g = entityGuard(chunk, kbEntities);
    for (const v of g.violations) {
      if (!violations.includes(v)) violations.push(v);
    }
  }
  return violations;
}

/** Warnings when critic revision introduces entities not present in the pre-revision draft. */
export function revisionEntityDeltaWarnings(preLetterHtml, postLetterHtml, kbEntities) {
  if (!preLetterHtml || preLetterHtml === postLetterHtml) return [];
  const preNorm = new Set(entityGuard(preLetterHtml, kbEntities).violations.map(normaliseEntity));
  const postViol = entityGuard(postLetterHtml, kbEntities).violations;
  const warnings = [];
  for (const v of postViol) {
    if (!preNorm.has(normaliseEntity(v))) {
      warnings.push(
        "Critic revision introduced unverified entity \"" + v + "\" (stripped from letter) — review before send."
      );
    }
  }
  return warnings;
}

/**
 * Entity guard on letter (strip unknown entities) + full CV text (flag only).
 * @param {{ preRevisionLetter?: string }} opts — when set, diff revision deltas into warnings
 */
export function guardTailorDocuments(letterHtml, cv, kbEntities, opts) {
  const letterG = entityGuard(letterHtml, kbEntities);
  const cvViolations = entityGuardCv(cv, kbEntities);
  const violations = [...new Set([...letterG.violations, ...cvViolations])];
  const warnings = [];
  for (const v of cvViolations) {
    if (!letterG.violations.includes(v)) {
      warnings.push("CV mentions unverified entity \"" + v + "\" — review before send.");
    }
  }
  const pre = opts && opts.preRevisionLetter;
  if (pre) warnings.push(...revisionEntityDeltaWarnings(pre, letterG.cleanedHtml, kbEntities));
  const cleanedHtml = normalizeAudiencePunctuation(
    stripAudienceEvidenceIds(normalizeLetterBodyHtml(letterG.cleanedHtml))
  );
  const cleanedCv = stripEvidenceIdsFromCv(cv);
  return {
    clean: violations.length === 0,
    violations,
    warnings,
    cleanedHtml,
    cleanedCv
  };
}

/** One-shot suffix for the single critic-driven re-compose (step 4). */
export function buildRevisionSuffix(critique, narrative, legalEvidenceIdSet, evidenceText) {
  const legalIds = [...(legalEvidenceIdSet || [])].sort().join(", ");
  const gapBlock = JSON.stringify((narrative && narrative.gapStories) || []).slice(0, 2000);
  return "\n\nREVISE per this critique (one revision only):\n" + JSON.stringify(critique).slice(0, 1500) +
    "\n\nREVISION RULES (mandatory):\n" + COMPOSE_HONESTY_RULES +
    "\nYou may ONLY restate facts from NARRATIVE, GAP STORIES, and EVIDENCE below — no new employers, dates, metrics, or gap closures." +
    "\nLegal evidence IDs (do not cite others): " + (legalIds || "(none)") +
    "\nGAP STORIES (only honest gap closures allowed):\n" + gapBlock +
    "\nEVIDENCE (authoritative):\n" + String(evidenceText || "").slice(0, 8000);
}

/* ------------------------------------------------------------------ LLM glue */

function sse(send, step, data, done = false) {
  send(`data: ${JSON.stringify({ step, data, done })}\n\n`);
}

async function callLlm(adapter, tier, system, userMsg, maxTokens, temperature, jsonMode) {
  return adapter.complete({
    tier,
    system,
    user: userMsg,
    maxTokens,
    temperature,
    jsonMode: !!jsonMode
  });
}

/** Strip fences and slice to outermost `{...}` (or full text if no braces). */
export function extractJsonText(raw) {
  let t = String(raw || "")
    .replace(/^```(?:json)?\s*/im, "")
    .replace(/```\s*$/m, "")
    .replace(/```(?:json)?\s*/gi, "")
    .trim();
  const first = t.indexOf("{");
  if (first === -1) return t;
  // Prefer last `}` when present; if truncated mid-object, keep from first `{`.
  const last = t.lastIndexOf("}");
  if (last > first) return t.slice(first, last + 1);
  return t.slice(first);
}

/** Close unterminated strings / missing } ] after truncation so JSON.parse can succeed. */
export function repairTruncatedJson(text) {
  let out = String(text || "").trim();
  if (!out) return out;
  let inString = false;
  let escape = false;
  const stack = [];
  for (let i = 0; i < out.length; i++) {
    const c = out[i];
    if (inString) {
      if (escape) { escape = false; continue; }
      if (c === "\\") { escape = true; continue; }
      if (c === "\"") inString = false;
      continue;
    }
    if (c === "\"") { inString = true; continue; }
    if (c === "{" || c === "[") stack.push(c === "{" ? "}" : "]");
    else if ((c === "}" || c === "]") && stack.length) stack.pop();
  }
  if (inString) out += "\"";
  out = out.replace(/,\s*$/, "");
  while (stack.length) out += stack.pop();
  return out;
}

/**
 * Escape raw control characters inside JSON string literals (common when models
 * emit HTML with real newlines inside "letterBodyHTML").
 */
export function repairJsonStringControlChars(text) {
  let out = "";
  let inString = false;
  let escape = false;
  const s = String(text || "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inString) {
      if (escape) { out += c; escape = false; continue; }
      if (c === "\\") { out += c; escape = true; continue; }
      if (c === "\"") { inString = false; out += c; continue; }
      if (c === "\n") { out += "\\n"; continue; }
      if (c === "\r") { out += "\\r"; continue; }
      if (c === "\t") { out += "\\t"; continue; }
      const code = c.charCodeAt(0);
      if (code < 0x20) {
        out += "\\u" + code.toString(16).padStart(4, "0");
        continue;
      }
      out += c;
      continue;
    }
    if (c === "\"") inString = true;
    out += c;
  }
  return out;
}

/** Parse LLM JSON: fences → parse → control-char repair → truncate repair. Returns null on failure. */
export function parseLlmJson(raw) {
  const extracted = extractJsonText(raw);
  const attempts = [
    extracted,
    repairJsonStringControlChars(extracted),
    repairTruncatedJson(extracted),
    repairTruncatedJson(repairJsonStringControlChars(extracted))
  ];
  for (const candidate of attempts) {
    try {
      const obj = JSON.parse(candidate);
      if (obj !== null && typeof obj === "object") return obj;
    } catch (_) { /* next */ }
  }
  return null;
}

async function callLlmJson(adapter, tier, system, userMsg, maxTokens, temperature, schema, stepName, send, coerce) {
  const parseOrThrow = (raw) => {
    const obj = parseLlmJson(raw);
    if (obj !== null && typeof obj === "object") return obj;
    try {
      JSON.parse(extractJsonText(raw));
    } catch (e) {
      throw e;
    }
    throw new Error("response was not a JSON object");
  };
  const jsonRetrySystem = system + "\n\nIMPORTANT: your previous reply was not parseable as JSON. Return ONLY the raw JSON object — no prose, no markdown fences.";
  const tryParse = async (useFallback) => {
    const fn = useFallback && adapter.completeFallback ? adapter.completeFallback.bind(adapter) : adapter.complete.bind(adapter);
    let raw = await fn({
      tier,
      system,
      user: userMsg,
      maxTokens,
      temperature,
      jsonMode: true
    });
    const first = parseLlmJson(raw);
    if (first) return first;
    raw = await fn({
      tier,
      system: jsonRetrySystem,
      user: "Return ONLY valid JSON. No markdown. No trailing commentary.",
      maxTokens,
      temperature,
      jsonMode: true
    });
    return parseOrThrow(raw);
  };

  let parsed;
  try {
    parsed = await tryParse(false);
  } catch (e1) {
    const e1msg = e1 && e1.message ? e1.message : String(e1);
    if (adapter.hasFallback && adapter.completeFallback) {
      try {
        parsed = await tryParse(true);
      } catch (e2) {
        const err = new Error(stepName + ": response was not valid JSON after Gateway + OpenCode fallback — " + (e2.message || e1msg));
        err.step = stepName;
        throw err;
      }
    } else if (/allowlist|restricted access to this provider|HTTP 403/i.test(e1msg)) {
      const err = new Error(
        stepName + ": Vercel AI Gateway blocked this model provider (team allowlist). " +
        "Allow the provider in AI Gateway settings, set VERCEL_GATEWAY_MODEL_CHEAP to an allowed model, " +
        "or add OPENCODE_API_KEY for automatic fallback. Detail: " + e1msg.slice(0, 220)
      );
      err.step = stepName;
      throw err;
    } else {
      const err = new Error(stepName + ": response was not valid JSON — " + e1msg);
      err.step = stepName;
      throw err;
    }
  }
  const candidate = typeof coerce === "function" ? coerce(parsed) : parsed;
  const check = schema.safeParse(candidate);
  if (!check.success) {
    const err = new Error(stepName + ": schema violation — " + check.error.issues.slice(0, 3).map(i => i.path.join(".") + " " + i.message).join("; "));
    err.step = stepName;
    err.schemaViolation = true;
    throw err;
  }
  return check.data;
}

function sha256(s) {
  return crypto.createHash("sha256").update(s).digest("hex");
}

/* ------------------------------------------------------- KB evidence helpers */

function kbEvidenceList(kb) {
  return (kb && Array.isArray(kb.evidence)) ? kb.evidence.filter(e => e && e.id && typeof e.text === "string") : [];
}

function legalEvidenceIds(kb) {
  return new Set(kbEvidenceList(kb).map(e => e.id));
}

/** Drop any evidence ID not present in the caller's KB payload. */
function enforceEvidenceIds(obj, legal) {
  if (Array.isArray(obj.evidenceIds)) obj.evidenceIds = obj.evidenceIds.filter(id => legal.has(id));
  if (Array.isArray(obj.themes)) obj.themes.forEach(t => { if (Array.isArray(t.evidenceIds)) t.evidenceIds = t.evidenceIds.filter(id => legal.has(id)); });
  if (Array.isArray(obj.gapStories)) obj.gapStories.forEach(g => { if (Array.isArray(g.evidenceIds)) g.evidenceIds = g.evidenceIds.filter(id => legal.has(id)); });
  return obj;
}

/* ------------------------------------------------------------- main pipeline */

/** One screening question per line from intake (max 12). */
export function normalizeApplicationQuestions(raw) {
  if (raw === undefined || raw === null) return [];
  const text = Array.isArray(raw) ? raw.join("\n") : String(raw);
  return text.split("\n")
    .map(line => line.replace(/^\s*\d+[\).:\-]\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 12);
}

/** Evidence-grounded fallback when composer omits applicationAnswers. */
export function buildApplicationAnswersForQuestions(questions, narrative, kb) {
  const qs = normalizeApplicationQuestions(questions);
  if (!qs.length) return [];
  const hook = pickFirstString(narrative && narrative.openingHook, narrative && narrative.positioning).slice(0, 800);
  const positioning = pickFirstString(narrative && narrative.positioning).slice(0, 800);
  const ev0 = (kbEvidenceList(kb)[0] && kbEvidenceList(kb)[0].text) || "";
  return qs.map(q => {
    const ql = q.toLowerCase();
    let answer;
    if (/salary|compensation|pay|package|remuneration|rate/.test(ql)) {
      answer = "I am open to discussing compensation aligned with the role scope and market rates for senior engineering work in Sydney.";
    } else if (/right to work|visa|sponsorship|citizen|eligible to work|work permit/.test(ql)) {
      answer = "I have full work rights in Australia and do not require visa sponsorship.";
    } else if (/notice|start date|availability|when can you/.test(ql)) {
      answer = "I can discuss a start date that works for both of us; I am motivated to move quickly for the right role.";
    } else if (/why|motivat|interest|attract|join|this company|this role|work here/.test(ql)) {
      answer = [hook, positioning].filter(Boolean).join(" ").trim();
    } else {
      answer = (hook || positioning || ev0).trim();
    }
    return { question: q.slice(0, 500), answer: answer.slice(0, 2500) };
  });
}

export function ensureApplicationAnswersOnCv(cv, applicationQuestions, narrative, kb) {
  if (!cv || typeof cv !== "object") return cv;
  const qs = normalizeApplicationQuestions(applicationQuestions);
  if (!qs.length) return cv;
  const existing = Array.isArray(cv.applicationAnswers) ? cv.applicationAnswers : [];
  if (existing.length) return cv;
  return Object.assign({}, cv, {
    applicationAnswers: buildApplicationAnswersForQuestions(qs, narrative, kb)
  });
}

function buildPrompts(jd, kb, settings, align, applicationQuestions) {
  const evidenceText = kbEvidenceList(kb)
    .map(e => `- [${e.id}] ${e.text}`)
    .join("\n");
  const profile = JSON.stringify((settings && settings.profile) || {}, null, 0);
  const alignNote = alignDirective(align);
  const appQs = normalizeApplicationQuestions(applicationQuestions);
  const appQBlock = appQs.length
    ? "\n\nAPPLICATION QUESTIONS (mandatory on cv only): Include \"applicationAnswers\": [{\"question\": string, \"answer\": string}] with one entry per question below — exact question text, concise evidence-based answers. Do NOT put these answers in letterBodyHTML.\n" +
      appQs.map((q, i) => (i + 1) + ". " + q).join("\n")
    : "";

  const step1 = `You are a precise technical recruiter. Analyse the job description and return ONLY JSON matching this shape:
{"role": string, "seniority": "junior"|"mid"|"senior"|"lead"|"principal"|"unknown",
 "essentials": [{"id":"R1","text": string,"keywords": string[]}...],
 "desirable": [{"id":"D1",...}...],
 "atsTerms": string[]}
Rules: essentials = must-have requirements; desirable = nice-to-have. Max 8 essentials, 6 desirable.
IDs must be R1..Rn and D1..Dn. atsTerms = concrete ATS keywords/tools from the JD (max 25).
The top-level "role" field is REQUIRED (job title from the JD — never omit it).
JOB DESCRIPTION:\n${jd}`;

  const step2 = (requirements) => `You map candidate evidence to job requirements. You may ONLY cite evidence IDs from the list below — never invent IDs or evidence.
For each requirement return verdict "strong" (cited evidence clearly satisfies it), "partial" (adjacent experience), or "gap" (no honest evidence — do NOT stretch).
Return ONLY JSON: {"mappings":[{"requirementId":"R1"|"D1"|...,"verdict":"strong"|"partial"|"gap","evidenceIds":["EV-1",...],"note": string}]}
You MUST include one mapping object for every requirement id in REQUIREMENTS (essentials + desirable). requirementId must exactly match each requirement's "id" field (R1..Rn, D1..Dn). Never return an empty mappings array.
REQUIREMENTS: ${JSON.stringify(requirements)}
CANDIDATE EVIDENCE (IDs are authoritative):\n${evidenceText}${alignNote}`;

  const step3 = (requirements, mappings) => `You are a career-narrative architect. Using ONLY the evidence map provided (cite evidence IDs), produce:
{"positioning": string, "metaLine": string, "openingHook": string,
 "themes": [{"title": string, "evidenceIds": [...]}],  // 4-6 themes; titles MIRROR the job description's own phrasing
 "gapStories": [{"gapTool": string, "transferStory": string, "evidenceIds": [...]}]}  // for every gap verdict
Tone: confident senior individual contributor. Never fabricate. Gaps named plainly with transfer stories grounded in cited evidence.
JOB: ${JSON.stringify(requirements)}
EVIDENCE MAP: ${JSON.stringify(mappings)}${alignNote}`;

  const step4 = (narrative, kb, settings) => `You are a document composer. Using ONLY the cited evidence (IDs below), compose ONE JSON object with EXACTLY these top-level keys (no others):
{"letterBodyHTML": string, "cv": object}
letterBodyHTML: the cover letter BODY ONLY (no <html>/<body>/hero/contact block): salutation "<p class=\\"salutation\\">Dear Hiring Team,</p>", one opening paragraph (start from the opening hook), "<h2>What I bring to the role</h2>", "<ol class=\\"themes\\">" with one <li> per theme (title in <strong class=\\"num\\">n. Title</strong> then <p class=\\"body\\">), any gap paragraph as a plain <p>, closing paragraph, then "<div class=\\"signoff\\"><p>Kind regards,</p><p class=\\"name\\">${(settings.profile && settings.profile.name) || ""}</p></div>". Use only p/h2/ol/li/strong/em/div tags. Continuous HTML only — no literal backslash-n (\\n) text between tags. JSON may use escaped newlines between tags, but the parsed HTML must never contain visible \\n characters. Do NOT include evidence IDs (EV-1, etc.) anywhere in letterBodyHTML or cv strings.
cv MUST be nested under the "cv" key: {"summaryParas": string[], "metaLine": string, "skillsRows": [{"cat","text"}], "techRows": [{"cat","chips":[]}], "experienceBlocks": [{"header","sub","lines","groups":[{"sub","bullets"}],"products":[{"name","stack","highlights","url"}]}], "education": string[], "projects": [{"name","url"}], "references": string, "applicationAnswers": [{"question": string, "answer": string}]}
Keep the whole reply under ~10000 characters. Prefer fewer experience bullets over truncation mid-JSON. Reuse the candidate's real data verbatim from the evidence; reorder/emphasise toward the job. ${COMPOSE_HONESTY_RULES}
NARRATIVE: ${JSON.stringify(narrative)}
EVIDENCE (authoritative):\n${evidenceText}
PROFILE: ${profile}${alignNote}${appQBlock}`;

  const step5 = (composed, requirements) => `You are a ruthless application critic. Compare the draft against the requirements and return ONLY JSON:
{"coverageIssues": string[], "weakClaims": string[], "toneOk": boolean, "needsRevision": boolean, "revisionNotes": string}
Limits: coverageIssues <= 10 items, weakClaims <= 10 items; each string <= 400 characters; revisionNotes <= 2500 chars. Prefer short, punchy flags.
Flag: unaddressed essential requirements, unsupported claims, tone mismatches for a senior IC, length problems. needsRevision=true only for material problems.
When needsRevision=true, revisionNotes must NOT ask the composer to invent employers, dates, metrics, certifications, degrees, or production use of gap tools — prefer naming gaps honestly and strengthening already-cited evidence only.
REQUIREMENTS: ${JSON.stringify(requirements)}
DRAFT: ${JSON.stringify(composed).slice(0, 6000)}${alignNote}`;

  const step6 = (finalDocs, requirements) => `You are an ATS simulator. Score keyword coverage of the final documents against the job description's ATS terms. Return ONLY JSON:
{"coveragePercent": number, "matchedTerms": string[], "missingTerms": string[], "warnings": string[]}
Limits: matchedTerms <= 40, missingTerms <= 40, warnings <= 10; each term/warning string <= 60 / 60 / 300 chars. Prefer the most important ATS keywords when truncating.
Only count terms the documents genuinely contain. Warn (do not fail) below 80%.
JD: ${jd.slice(0, 3000)}
DOCS: ${JSON.stringify(finalDocs).slice(0, 8000)}`;

  return { step1, step2, step3, step4, step5, step6 };
}

/* ------------------------------------------------- cv coercion (LLM output) */

/* LLMs routinely return arrays where strings are expected (and vice versa).
   Coerce the composed CV into the schema's shape before validating: join
   arrays into strings, stringify scalars, drop nulls — then truncate. */
function coerceStr(v, max) {
  if (v === undefined || v === null) return "";
  if (Array.isArray(v)) v = v.filter(x => x !== null && x !== undefined).map(x => String(x)).join("; ");
  else if (typeof v === "object") v = JSON.stringify(v);
  else v = String(v);
  return v.slice(0, max);
}
function coerceArr(v, itemFn, max) {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) v = [v];
  return v.slice(0, max).map(itemFn).filter(Boolean);
}
function coerceCv(cv) {
  if (!cv || typeof cv !== "object") return {};
  return {
    summaryParas: coerceArr(cv.summaryParas, s => coerceStr(s, 2500) || null, 8).filter(Boolean),
    metaLine: coerceStr(cv.metaLine, 400),
    skillsRows: coerceArr(cv.skillsRows, r => (r && typeof r === "object") ? {
      cat: coerceStr(r.cat, 100), text: coerceStr(r.text, 2000)
    } : null, 12).filter(Boolean),
    techRows: coerceArr(cv.techRows, r => (r && typeof r === "object") ? {
      cat: coerceStr(r.cat, 100),
      chips: coerceArr(r.chips, c => coerceStr(c, 200) || null, 24).filter(Boolean)
    } : null, 12).filter(Boolean),
    experienceBlocks: coerceArr(cv.experienceBlocks, b => (b && typeof b === "object") ? {
      header: coerceStr(b.header, 300),
      sub: coerceStr(b.sub, 500),
      lines: coerceArr(b.lines, l => coerceStr(l, 1000) || null, 10).filter(Boolean),
      groups: coerceArr(b.groups, g => (g && typeof g === "object") ? {
        sub: coerceStr(g.sub, 300),
        bullets: coerceArr(g.bullets, x => coerceStr(x, 1200) || null, 14).filter(Boolean)
      } : null, 8).filter(Boolean),
      products: coerceArr(b.products, p => (p && typeof p === "object") ? {
        name: coerceStr(p.name, 200), stack: coerceStr(p.stack, 500),
        highlights: coerceStr(p.highlights, 1200), url: coerceStr(p.url, 400)
      } : null, 10).filter(Boolean)
    } : null, 6).filter(Boolean),
    education: coerceArr(cv.education, e => coerceStr(e, 400) || null, 14).filter(Boolean),
    projects: coerceArr(cv.projects, p => (p && typeof p === "object") ? {
      name: coerceStr(p.name, 200), url: coerceStr(p.url, 400)
    } : null, 12).filter(Boolean),
    references: coerceStr(cv.references, 1000),
    applicationAnswers: coerceArr(cv.applicationAnswers, a => (a && typeof a === "object") ? {
      question: coerceStr(a.question, 500),
      answer: coerceStr(a.answer, 2500)
    } : null, 12).filter(x => x && x.question && x.answer)
  };
}

function pickFirstString(...candidates) {
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c;
    if (c !== undefined && c !== null && typeof c !== "object") {
      const s = String(c).trim();
      if (s) return s;
    }
  }
  return "";
}

/**
 * Map alternate / nested composer keys from free models onto { letterBodyHTML, cv }.
 * Does not invent content — only relocates fields the model already emitted.
 */
export function normalizeComposerPayload(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;
  let root = obj;
  if (obj.documents && typeof obj.documents === "object" && !Array.isArray(obj.documents)) root = obj.documents;
  else if (obj.result && typeof obj.result === "object" && !Array.isArray(obj.result)) root = obj.result;
  else if (obj.data && typeof obj.data === "object" && !Array.isArray(obj.data) &&
    (obj.data.cv || obj.data.letterBodyHTML || obj.data.summaryParas)) root = obj.data;

  let letter = pickFirstString(
    root.letterBodyHTML, root.letter_body_html, root.letterHtml, root.letterHTML,
    root.letter, root.coverLetter, root.cover_letter, root.bodyHTML, root.bodyHtml, root.body
  );
  let cv = root.cv ?? root.cvData ?? root.CV ?? root.resume ?? root.curriculumVitae ?? null;
  if ((!cv || typeof cv !== "object") &&
    (root.summaryParas || root.experienceBlocks || root.skillsRows || root.techRows)) {
    cv = {
      summaryParas: root.summaryParas,
      metaLine: root.metaLine,
      skillsRows: root.skillsRows,
      techRows: root.techRows,
      experienceBlocks: root.experienceBlocks,
      education: root.education,
      projects: root.projects,
      references: root.references
    };
  }
  if (cv && typeof cv !== "object") cv = null;
  if (letter.length > MAX_HTML_BYTES) letter = letter.slice(0, MAX_HTML_BYTES);
  letter = normalizeLetterBodyHtml(letter);
  return { letterBodyHTML: letter, cv };
}

/**
 * Parse + normalize + coerce + Zod-validate composer output.
 * @returns {{ ok: true, composed: {letterBodyHTML, cv} } | { ok: false, reason: string, issues?: unknown, partial?: {letterBodyHTML?: string, cv?: object} }}
 */
export function acceptComposedDocuments(raw) {
  const parsed = typeof raw === "string" || Buffer.isBuffer(raw) ? parseLlmJson(raw) : raw;
  if (!parsed || typeof parsed !== "object") {
    return { ok: false, reason: "unparseable JSON" };
  }
  const norm = normalizeComposerPayload(parsed);
  if (!norm) return { ok: false, reason: "empty payload" };

  const partial = {};
  if (norm.letterBodyHTML && norm.letterBodyHTML.trim()) partial.letterBodyHTML = norm.letterBodyHTML;
  if (norm.cv && typeof norm.cv === "object") {
    const softCv = CvDataSchema.safeParse(coerceCv(norm.cv));
    if (softCv.success) partial.cv = softCv.data;
  }

  if (!norm.cv) {
    return { ok: false, reason: "missing cv", partial };
  }
  const cvCheck = CvDataSchema.safeParse(coerceCv(norm.cv));
  if (!cvCheck.success) {
    return {
      ok: false,
      reason: "cv schema violation",
      issues: cvCheck.error.issues.slice(0, 6),
      partial
    };
  }
  if (!norm.letterBodyHTML || !norm.letterBodyHTML.trim()) {
    return { ok: false, reason: "letterBodyHTML missing", partial: { ...partial, cv: cvCheck.data } };
  }
  if (norm.letterBodyHTML.length > MAX_HTML_BYTES) {
    return { ok: false, reason: "letterBodyHTML too large", partial };
  }
  return {
    ok: true,
    composed: { letterBodyHTML: norm.letterBodyHTML, cv: cvCheck.data }
  };
}

function escHtmlText(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function evidenceById(kb) {
  const map = new Map();
  for (const e of kbEvidenceList(kb)) map.set(e.id, e.text);
  return map;
}

function textsForEvidenceIds(kb, ids, maxChars) {
  const map = evidenceById(kb);
  const parts = [];
  let used = 0;
  for (const id of (Array.isArray(ids) ? ids : [])) {
    const t = map.get(id);
    if (!t) continue;
    const slice = t.slice(0, Math.max(0, (maxChars || 900) - used));
    if (!slice) break;
    parts.push(slice);
    used += slice.length + 1;
    if (used >= (maxChars || 900)) break;
  }
  return parts;
}

/**
 * Deterministic composer from narrative + KB evidence only (no invented facts).
 * Used when the LLM composer fails schema / JSON after repair + one retry.
 */
export function fallbackComposeDocuments(narrative, kb, settings) {
  const name = pickFirstString(
    settings && settings.profile && settings.profile.name,
    kb && kb.profile && kb.profile.name
  ) || "";
  const themes = Array.isArray(narrative && narrative.themes) ? narrative.themes : [];
  const gaps = Array.isArray(narrative && narrative.gapStories) ? narrative.gapStories : [];
  const hook = pickFirstString(narrative && narrative.openingHook, narrative && narrative.positioning)
    .slice(0, 2000);
  const meta = pickFirstString(narrative && narrative.metaLine).slice(0, 400);
  const positioning = pickFirstString(narrative && narrative.positioning).slice(0, 1500);

  const themeLis = themes.slice(0, 6).map((t, i) => {
    const title = pickFirstString(t && t.title, "Theme").slice(0, 300);
    const bodyBits = textsForEvidenceIds(kb, t && t.evidenceIds, 700);
    const body = (bodyBits.join(" ") || title).slice(0, 800);
    return "<li><strong class=\"num\">" + (i + 1) + ". " + escHtmlText(title) +
      "</strong><p class=\"body\">" + escHtmlText(body) + "</p></li>";
  }).join("");

  const gapParas = gaps.slice(0, 4).map(g => {
    const tool = pickFirstString(g && g.gapTool).slice(0, 120);
    const story = pickFirstString(g && g.transferStory).slice(0, 900);
    const ev = textsForEvidenceIds(kb, g && g.evidenceIds, 400).join(" ");
    const text = [tool ? ("Regarding " + tool + ":") : "", story, ev].filter(Boolean).join(" ").trim();
    return text ? "<p>" + escHtmlText(text.slice(0, 1200)) + "</p>" : "";
  }).filter(Boolean).join("");

  const letterBodyHTML = [
    "<p class=\"salutation\">Dear Hiring Team,</p>",
    hook ? "<p>" + escHtmlText(hook) + "</p>" : "",
    "<h2>What I bring to the role</h2>",
    "<ol class=\"themes\">" + (themeLis || "<li><strong class=\"num\">1. Experience</strong><p class=\"body\">" +
      escHtmlText((kbEvidenceList(kb)[0] && kbEvidenceList(kb)[0].text || "").slice(0, 800)) +
      "</p></li>") + "</ol>",
    gapParas,
    "<p>I would welcome the chance to discuss how this experience maps to your needs.</p>",
    "<div class=\"signoff\"><p>Kind regards,</p><p class=\"name\">" + escHtmlText(name) + "</p></div>"
  ].filter(Boolean).join("");

  const evList = kbEvidenceList(kb);
  const summaryParas = [hook, positioning].filter(Boolean).map(s => s.slice(0, 2500)).slice(0, 4);
  if (!summaryParas.length && evList[0]) summaryParas.push(evList[0].text.slice(0, 2500));

  const edu = evList
    .filter(e => /education|diploma|certified|certification|TAFE/i.test(e.text))
    .map(e => e.text.slice(0, 400))
    .slice(0, 6);
  const refs = evList.find(e => /available on request|references/i.test(e.text));

  const lines = evList.slice(0, 8).map(e => e.text.slice(0, 1000));
  const cv = coerceCv({
    summaryParas,
    metaLine: meta,
    skillsRows: [],
    techRows: [],
    experienceBlocks: [{
      header: "Professional experience",
      sub: "",
      lines,
      groups: themes.slice(0, 5).map(t => ({
        sub: pickFirstString(t && t.title).slice(0, 300),
        bullets: textsForEvidenceIds(kb, t && t.evidenceIds, 1100).slice(0, 6)
      })).filter(g => g.sub && g.bullets.length),
      products: []
    }],
    education: edu.length ? edu : [],
    projects: [],
    references: refs ? refs.text.slice(0, 1000) : "Available on request."
  });
  const cvCheck = CvDataSchema.safeParse(cv);
  return {
    letterBodyHTML,
    cv: cvCheck.success ? cvCheck.data : cv
  };
}

/**
 * Merge partial LLM composer output with deterministic fallback (KB/narrative only).
 */
export function resolveComposedDocuments(attempt, narrative, kb, settings, applicationQuestions) {
  if (attempt && attempt.ok && attempt.composed) {
    const cv = ensureApplicationAnswersOnCv(attempt.composed.cv, applicationQuestions, narrative, kb);
    return { composed: { letterBodyHTML: attempt.composed.letterBodyHTML, cv }, softFail: false, reason: null };
  }
  const fb = fallbackComposeDocuments(narrative, kb, settings);
  const partial = (attempt && attempt.partial) || {};
  let letter = (partial.letterBodyHTML && partial.letterBodyHTML.trim())
    ? partial.letterBodyHTML
    : fb.letterBodyHTML;
  if (letter.length > MAX_HTML_BYTES) letter = letter.slice(0, MAX_HTML_BYTES);
  let cv = partial.cv || fb.cv;
  cv = ensureApplicationAnswersOnCv(cv, applicationQuestions, narrative, kb);
  const cvCheck = CvDataSchema.safeParse(coerceCv(cv));
  if (cvCheck.success) cv = cvCheck.data;
  else cv = ensureApplicationAnswersOnCv(fb.cv, applicationQuestions, narrative, kb);
  return {
    composed: { letterBodyHTML: letter, cv },
    softFail: true,
    reason: (attempt && attempt.reason) || "composer failed"
  };
}

const SENIORITY_LEVELS = new Set(["junior", "mid", "senior", "lead", "principal", "unknown"]);

/** First plausible job title line when the model omits `role`. */
export function inferRoleFromJd(jd) {
  const text = String(jd || "").trim();
  if (!text) return "Role";
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  for (const line of lines.slice(0, 10)) {
    if (line.length > 300) continue;
    if (/^(essential|desirable|about|overview|requirements|qualifications|responsibilities|what you|who you)/i.test(line)) continue;
    if (line.length >= 3) return line.slice(0, 300);
  }
  return (lines[0] || "Role").slice(0, 300);
}

function unwrapRequirementsRoot(obj) {
  if (!obj || typeof obj !== "object") return {};
  if (obj.role !== undefined || obj.essentials !== undefined || obj.desirable !== undefined) return obj;
  if (obj.requirements && typeof obj.requirements === "object") return obj.requirements;
  if (obj.job && typeof obj.job === "object") return obj.job;
  return obj;
}

function coerceRequirementItem(item, prefix, index) {
  if (item === undefined || item === null) return null;
  if (typeof item === "string") {
    const text = item.trim().slice(0, 800);
    return text ? { id: prefix + index, text, keywords: [] } : null;
  }
  if (typeof item !== "object") return null;
  const text = pickFirstString(item.text, item.requirement, item.description, item.label).slice(0, 800);
  if (!text) return null;
  let id = typeof item.id === "string" ? item.id.trim().slice(0, 24) : "";
  if (!id) id = prefix + index;
  const keywords = Array.isArray(item.keywords)
    ? item.keywords
      .filter(k => typeof k === "string" && k.trim())
      .map(k => k.trim().slice(0, 80))
      .slice(0, 20)
    : [];
  return { id, text, keywords };
}

function coerceRequirementList(raw, prefix, max) {
  let arr = raw;
  if (!Array.isArray(arr) && typeof arr === "string") {
    arr = arr.split(/\n/).map(l => l.replace(/^\s*[-*•]\s*/, "").trim()).filter(Boolean);
  }
  if (!Array.isArray(arr)) return [];
  const out = [];
  let n = 0;
  for (const item of arr) {
    if (out.length >= max) break;
    const row = coerceRequirementItem(item, prefix, ++n);
    if (row) out.push(row);
  }
  return out;
}

function inferSeniorityFromJd(jd) {
  const j = String(jd || "").toLowerCase();
  if (/principal/.test(j)) return "principal";
  if (/\blead\b/.test(j)) return "lead";
  if (/senior/.test(j)) return "senior";
  if (/junior/.test(j)) return "junior";
  if (/\bmid[- ]level\b/.test(j)) return "mid";
  return "unknown";
}

/** Normalize JD Analyst JSON before Zod — Nemotron often omits `role` or nests under `requirements`. */
export function coerceRequirements(obj, jd) {
  const root = unwrapRequirementsRoot(obj);
  let role = pickFirstString(root.role, root.title, root.jobTitle, root.position, root.job_title);
  if (!role) role = inferRoleFromJd(jd);

  let seniority = typeof root.seniority === "string" ? root.seniority.toLowerCase().trim() : "";
  if (!SENIORITY_LEVELS.has(seniority)) seniority = inferSeniorityFromJd(jd);

  const essentials = coerceRequirementList(
    root.essentials ?? root.mustHaves ?? root.must_haves ?? root.required ?? root.mustHave,
    "R",
    8
  );
  const desirable = coerceRequirementList(
    root.desirable ?? root.niceToHave ?? root.nice_to_have ?? root.preferred ?? root.optional,
    "D",
    6
  );

  let atsTerms = coerceArr(root.atsTerms ?? root.ats_terms ?? root.keywords, t => coerceStr(t, 80) || null, 50).filter(Boolean);
  if (!atsTerms.length) {
    atsTerms = [...new Set(
      essentials.concat(desirable).flatMap(r => (r.keywords || []).concat(
        r.text.split(/[\s,/]+/).filter(w => w.length > 2)
      ))
    )].map(t => t.slice(0, 80)).slice(0, 25);
  }

  return {
    role: role.slice(0, 300),
    seniority,
    essentials,
    desirable,
    atsTerms: atsTerms.slice(0, 50)
  };
}

/** Ordered R1..Rn / D1..Dn ids from step-1 requirements (for mapper backfill). */
export function requirementIdsFromRequirements(requirements) {
  if (!requirements || typeof requirements !== "object") return [];
  const essentials = Array.isArray(requirements.essentials) ? requirements.essentials : [];
  const desirable = Array.isArray(requirements.desirable) ? requirements.desirable : [];
  return essentials.concat(desirable)
    .map(r => (r && typeof r.id === "string" ? r.id.trim().slice(0, 24) : ""))
    .filter(Boolean);
}

function pickEvidenceMappingRequirementId(m) {
  if (!m || typeof m !== "object") return "";
  const candidates = [m.requirementId, m.id, m.reqId, m.requirement_id];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim().slice(0, 24);
  }
  return "";
}

/** One mapping per JD requirement; missing LLM rows become honest gaps. */
export function fillMissingEvidenceMappings(mappings, requirements) {
  const needed = requirementIdsFromRequirements(requirements);
  if (!needed.length) return mappings;
  const byId = new Map();
  for (const m of mappings) {
    if (m && m.requirementId) byId.set(m.requirementId, m);
  }
  return needed.map(id => byId.get(id) || {
    requirementId: id,
    verdict: "gap",
    evidenceIds: [],
    note: ""
  });
}

function coerceEvidenceIdList(ids, max) {
  if (!Array.isArray(ids)) return [];
  return ids
    .filter(id => typeof id === "string" && id.trim())
    .map(id => id.trim().slice(0, 24))
    .slice(0, max);
}

/** Cap evidence mapper arrays — models often return >8 evidenceIds per requirement. */
export function coerceEvidenceMap(obj, requirements) {
  if (!obj || typeof obj !== "object") obj = {};
  let raw = obj.mappings;
  if (!Array.isArray(raw) && Array.isArray(obj.mapping)) raw = obj.mapping;
  if (!Array.isArray(raw)) raw = [];
  const mappings = raw.map(m => {
    if (!m || typeof m !== "object") {
      return { requirementId: "", verdict: "gap", evidenceIds: [], note: "" };
    }
    let verdict = m.verdict;
    if (verdict !== "strong" && verdict !== "partial" && verdict !== "gap") verdict = "gap";
    return {
      requirementId: pickEvidenceMappingRequirementId(m),
      verdict,
      evidenceIds: coerceEvidenceIdList(m.evidenceIds, 8),
      note: typeof m.note === "string" ? m.note.slice(0, 600) : ""
    };
  }).filter(m => m.requirementId);
  const filled = requirements
    ? fillMissingEvidenceMappings(mappings, requirements)
    : mappings;
  return { mappings: filled };
}

/**
 * Cap Narrative Architect arrays before Zod — Nemotron often returns
 * gapStories[].evidenceIds >6 and themes[].evidenceIds >8.
 */
export function coerceNarrative(obj) {
  if (!obj || typeof obj !== "object") obj = {};
  let themes = obj.themes;
  if (!Array.isArray(themes) && Array.isArray(obj.theme)) themes = obj.theme;
  if (!Array.isArray(themes)) themes = [];
  themes = themes
    .filter(t => t && typeof t === "object")
    .map(t => ({
      title: coerceStr(t.title, 300),
      evidenceIds: coerceEvidenceIdList(t.evidenceIds, 8)
    }))
    .filter(t => t.title)
    .slice(0, 8);

  let gapStories = obj.gapStories;
  if (!Array.isArray(gapStories) && Array.isArray(obj.gap_stories)) gapStories = obj.gap_stories;
  if (!Array.isArray(gapStories)) gapStories = [];
  gapStories = gapStories
    .filter(g => g && typeof g === "object")
    .map(g => ({
      gapTool: coerceStr(g.gapTool != null ? g.gapTool : g.tool, 120),
      transferStory: coerceStr(g.transferStory != null ? g.transferStory : g.story, 900),
      evidenceIds: coerceEvidenceIdList(g.evidenceIds, 6)
    }))
    .filter(g => g.gapTool || g.transferStory)
    .slice(0, 8);

  return {
    positioning: coerceStr(obj.positioning, 1500),
    metaLine: coerceStr(obj.metaLine, 400),
    openingHook: coerceStr(obj.openingHook, 2000),
    themes,
    gapStories
  };
}

/** Truncate/normalize ATS simulator JSON before Zod — models often overshoot array caps. */
export function coerceAts(ats) {
  if (!ats || typeof ats !== "object") return {};
  let coverage = Number(ats.coveragePercent);
  if (!Number.isFinite(coverage)) coverage = 0;
  coverage = Math.max(0, Math.min(100, coverage));
  return {
    coveragePercent: coverage,
    matchedTerms: coerceArr(ats.matchedTerms, t => coerceStr(t, 60) || null, 40).filter(Boolean),
    missingTerms: coerceArr(ats.missingTerms, t => coerceStr(t, 60) || null, 40).filter(Boolean),
    warnings: coerceArr(ats.warnings, t => coerceStr(t, 300) || null, 10).filter(Boolean)
  };
}

/** Critic soft-caps — Nemotron often emits coverageIssues/weakClaims >400 chars. */
export function coerceCritique(c) {
  if (!c || typeof c !== "object") return {};
  return {
    coverageIssues: coerceArr(c.coverageIssues, s => coerceStr(s, 400) || null, 10).filter(Boolean),
    weakClaims: coerceArr(c.weakClaims, s => coerceStr(s, 400) || null, 10).filter(Boolean),
    toneOk: !!c.toneOk,
    needsRevision: !!c.needsRevision,
    revisionNotes: coerceStr(c.revisionNotes, 2500)
  };
}

/* -------------------------------------------------------------- HTTP layer */

function json(res, status, obj) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(obj));
}

function checkPasscode(req, res) {
  const code = process.env.APPGEN_CODE;
  if (!code) return true;
  if (req.headers && req.headers["x-appgen-code"] === code) return true;
  json(res, 401, { error: "Unauthorized" });
  return false;
}

export function cacheKeyFor(jd, kbVersion, settingsHash, alignHash = "", llmHash = "", appQHash = "") {
  return CACHE_PREFIX + sha256(
    jd + "|" + kbVersion + "|" + settingsHash +
    (alignHash ? "|" + alignHash : "") +
    (llmHash ? "|" + llmHash : "") +
    (appQHash ? "|aq:" + appQHash : "")
  ) + ".json";
}

/** Optional alignment pass — user-selected missing keywords / gaps to emphasise honestly. */
export function normalizeAlign(align) {
  if (!align || typeof align !== "object" || Array.isArray(align)) return null;
  const keywords = Array.isArray(align.keywords)
    ? align.keywords.filter(k => typeof k === "string" && k.trim()).map(k => k.trim().slice(0, 80)).slice(0, 40)
    : [];
  const gaps = [];
  if (Array.isArray(align.gaps)) {
    for (const g of align.gaps) {
      if (typeof g === "string" && g.trim()) {
        gaps.push({ label: g.trim().slice(0, 200), why: "" });
      } else if (g && typeof g === "object" && typeof g.label === "string" && g.label.trim()) {
        gaps.push({
          label: g.label.trim().slice(0, 200),
          why: typeof g.why === "string" ? g.why.trim().slice(0, 500) : ""
        });
      }
      if (gaps.length >= 20) break;
    }
  }
  if (!keywords.length && !gaps.length) return null;
  return { keywords, gaps };
}

function alignDirective(align) {
  if (!align) return "";
  return `

ALIGNMENT PASS (user-selected — apply honestly, never fabricate):
- Weave KEYWORDS into the letter and CV ONLY where cited evidence truly supports them (same tool/stack, not a stretch). Parenthetical context like "(Appian deployment)" means the base term may be used in the candidate's real stack context — do NOT claim Appian platform experience unless evidence says so.
- For KEYWORDS with no supporting evidence (platform-specific tools, certifications, sector claims): name them as gaps; do not invent years, certs, or production work.
- For GAPS: keep an explicit gap paragraph (or strengthen the existing one) covering each selected gap with a verified transfer story — never bluff equivalence.
KEYWORDS TO COVER: ${JSON.stringify(align.keywords)}
GAPS TO ADDRESS: ${JSON.stringify(align.gaps)}`;
}

async function readCached(key, getFn) {
  try {
    const result = await getFn(key, { useCache: false });
    if (typeof result.text === "function") return JSON.parse(await result.text());
    return null;
  } catch (e) {
    return null; // any cache read problem = cache miss
  }
}

/* Test seam: inject the Anthropic client + blob fns. */
export function createTailorHandler(deps) {
  const anthropic = deps.anthropic;
  const putFn = deps.put || put;
  const getFn = deps.get || get;

  return async function tailorHandler(req, res) {
    try {
      if ((req.method || "GET").toUpperCase() !== "POST") {
        return json(res, 405, { error: "Method not allowed — POST only" });
      }
      if (!checkPasscode(req, res)) return;

      let body;
      try {
        body = typeof req.body === "object" && req.body ? req.body : JSON.parse(await readRawBody(req));
      } catch (e) {
        return json(res, 400, { error: "Body is not valid JSON" });
      }
      const jd = body && typeof body.jd === "string" ? body.jd : "";
      const kb = body && typeof body.kb === "object" && body.kb ? body.kb : {};
      const settings = body && typeof body.settings === "object" && body.settings ? body.settings : {};
      const align = normalizeAlign(body && body.align);
      const checkpoint = (body.checkpoint && typeof body.checkpoint === "object" && !Array.isArray(body.checkpoint))
        ? body.checkpoint
        : null;
      let resumeFrom = Math.max(1, Math.min(6, parseInt(body.resumeFromStep, 10) || 1));
      if (!jd.trim()) return json(res, 400, { error: "jd is required" });
      if (resumeFrom > 1 && !checkpoint) {
        return json(res, 400, { error: "checkpoint is required when resumeFromStep > 1" });
      }
      if (resumeFrom > 1 && resumeFrom <= 2 && !checkpoint.requirements) {
        return json(res, 400, { error: "checkpoint.requirements missing for resume" });
      }
      if (resumeFrom > 2 && resumeFrom <= 3 && !checkpoint.mappings) {
        return json(res, 400, { error: "checkpoint.mappings missing for resume" });
      }
      if (resumeFrom > 3 && resumeFrom <= 4 && !checkpoint.narrative) {
        return json(res, 400, { error: "checkpoint.narrative missing for resume" });
      }
      if (resumeFrom > 4 && resumeFrom <= 5 && !checkpoint.composed) {
        return json(res, 400, { error: "checkpoint.composed missing for resume" });
      }
      if (resumeFrom > 5 && !checkpoint.critique) {
        return json(res, 400, { error: "checkpoint.critique missing for resume" });
      }
      if (jd.length > 100 * 1024) return json(res, 400, { error: "jd too large (100KB max)" });
      if (!kbEvidenceList(kb).length) return json(res, 400, { error: "kb.evidence with stable IDs is required" });
      const applicationQuestions = normalizeApplicationQuestions(body && body.applicationQuestions);

      const llmPrefs = normalizeLlmRequest(body && body.llm);
      const configErr = assertLlmConfigured(llmPrefs, deps);
      if (configErr) return json(res, 501, { error: configErr });
      const llmHash = sha256(llmCacheHash(llmPrefs)).slice(0, 16);

      const kbVersion = kb.version || "kb-unversioned";
      const settingsHash = sha256(JSON.stringify(settings)).slice(0, 16);
      const alignHash = align ? sha256(JSON.stringify(align)).slice(0, 16) : "";
      const appQHash = applicationQuestions.length
        ? sha256(applicationQuestions.join("\0")).slice(0, 16)
        : "";
      const key = cacheKeyFor(jd, kbVersion, settingsHash, alignHash, llmHash, appQHash);
      const cached = await readCached(key, getFn);
      if (cached) {
        const hit = Object.assign({}, cached, {
          cached: true,
          usage: { cacheHit: true, calls: 0, revised: !!cached.revised, maxCalls: MAX_LLM_CALLS }
        });
        if (hit.cv && typeof hit.cv === "object") {
          hit.cv = { ...hit.cv, references: cvReferencesFromProfile(kb, settings) };
        }
        console.log(JSON.stringify({
          event: "tailor_usage", cacheHit: true, calls: 0,
          jdChars: jd.length, kbVersion
        }));
        return json(res, 200, { cached: true, result: hit });
      }

      // ---- SSE setup ----
      res.statusCode = 200;
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      const send = (s) => res.write(s);
      const pipeline = deps.createLlmAdapter
        ? { adapter: deps.createLlmAdapter(llmPrefs), modelPlan: deps.modelPlan || {}, effectiveProvider: llmPrefs.provider }
        : buildPipelineAdapter(llmPrefs, deps);
      const { adapter, modelPlan, effectiveProvider } = pipeline;

      sse(send, "start", {
        message: resumeFrom > 1 ? "Pipeline resumed from step " + resumeFrom : "Pipeline started",
        provider: effectiveProvider,
        llm: llmPrefs.provider,
        resumeFromStep: resumeFrom
      });

      let calls = checkpoint ? Math.max(0, Number(checkpoint.callsUsed) || 0) : 0;
      let failedStep = resumeFrom;
      const callLog = [];
      let requirements = checkpoint && checkpoint.requirements ? checkpoint.requirements : null;
      let mappings = checkpoint && checkpoint.mappings ? checkpoint.mappings : null;
      let narrative = checkpoint && checkpoint.narrative ? checkpoint.narrative : null;
      let composed = checkpoint && checkpoint.composed ? checkpoint.composed : null;
      let critique = checkpoint && checkpoint.critique ? checkpoint.critique : null;

      const packCheckpoint = () => ({
        callsUsed: calls,
        requirements: requirements || undefined,
        mappings: mappings || undefined,
        narrative: narrative || undefined,
        composed: composed || undefined,
        critique: critique || undefined
      });
      const emitCheckpoint = (nextStep) => {
        sse(send, "checkpoint", { resumeFromStep: nextStep, checkpoint: packCheckpoint() });
      };
      const invokeWithBackoff = async (fn) => {
        let lastErr;
        const attempts = Math.max(1, PAUSE_RETRY_DELAYS_MS.length + 1);
        for (let a = 0; a < attempts; a++) {
          if (a > 0) await sleep(PAUSE_RETRY_DELAYS_MS[a - 1] || 2000);
          try {
            return await fn();
          } catch (e) {
            lastErr = e;
            if (!isPausableLlmError(e) || a >= attempts - 1) throw e;
          }
        }
        throw lastErr;
      };

      const withSseKeepalive = async (fn) => {
        const heartbeat = setInterval(() => {
          try { send(": keepalive\n\n"); } catch (e) { /* connection gone */ }
        }, 12000);
        try {
          return await fn();
        } finally {
          clearInterval(heartbeat);
        }
      };

      const budgeted = async (tier, system, msg, step) => {
        if (STEP_DELAY_MS && calls > 0) await sleep(STEP_DELAY_MS);
        if (++calls > MAX_LLM_CALLS) {
          const err = new Error("Token/call budget exceeded");
          err.step = "budget";
          throw err;
        }
        failedStep = step;
        const model = adapter.modelForTier ? adapter.modelForTier(tier) : modelPlan[tier];
        sse(send, "step" + step, { status: "running", model, tier, provider: effectiveProvider });
        callLog.push({ step, tier, model, provider: effectiveProvider, maxOut: STEP_BUDGET[step] });
        // All pipeline steps return JSON; jsonMode helps Gateway/Nemotron stay on-schema.
        const out = await withSseKeepalive(() => invokeWithBackoff(() =>
          callLlm(adapter, tier, system, msg, STEP_BUDGET[step], TEMPS[step], true)));
        return out;
      };
      const budgetedJson = async (tier, system, msg, step, schema, name, coerce) => {
        if (STEP_DELAY_MS && calls > 0) await sleep(STEP_DELAY_MS);
        if (++calls > MAX_LLM_CALLS) {
          const err = new Error("Token/call budget exceeded");
          err.step = "budget";
          throw err;
        }
        failedStep = step;
        const model = adapter.modelForTier ? adapter.modelForTier(tier) : modelPlan[tier];
        sse(send, "step" + step, { status: "running", model, tier, provider: effectiveProvider });
        callLog.push({ step, tier, model, provider: effectiveProvider, maxOut: STEP_BUDGET[step], name: name || ("step" + step) });
        const out = await withSseKeepalive(() => invokeWithBackoff(() =>
          callLlmJson(adapter, tier, system, msg, STEP_BUDGET[step], TEMPS[step], schema, name, send, coerce)));
        sse(send, "step" + step, { status: "done" });
        return out;
      };

      const P = buildPrompts(jd, kb, settings, align, applicationQuestions);
      const legal = legalEvidenceIds(kb);

      try {
      // Step 1 — JD Analyst
      if (resumeFrom <= 1) {
        requirements = await budgetedJson("mid", P.step1, "Analyse the job description above and return the requirements JSON now.", 1, RequirementsSchema, "JD Analyst", (parsed) => coerceRequirements(parsed, jd));
        emitCheckpoint(2);
      }

      // Step 2 — Evidence Mapper
      if (resumeFrom <= 2) {
        mappings = await budgetedJson("mid", P.step2(requirements), "Map each requirement to the candidate evidence above and return the mapping JSON now.", 2, EvidenceMapSchema, "Evidence Mapper", (parsed) => coerceEvidenceMap(parsed, requirements));
        mappings.mappings.forEach(m => { m.evidenceIds = m.evidenceIds.filter(x => legal.has(x)); });
        emitCheckpoint(3);
      }

      // Step 3 — Narrative Architect
      if (resumeFrom <= 3) {
        const narrativeRaw = await budgeted("mid", P.step3(requirements, mappings), "Produce the career-narrative JSON now, citing only the evidence IDs provided.", 3);
        {
          let check = NarrativeSchema.safeParse(coerceNarrative(safeJson(narrativeRaw)));
          if (!check.success) {
            const retryRaw = await budgeted("mid",
              P.step3(requirements, mappings) + "\n\nYour previous reply failed schema validation: " +
              JSON.stringify(check.error.issues.slice(0, 6)) +
              "\nReturn ONLY the corrected JSON object — no prose, no markdown fences.",
              "Return the corrected narrative JSON now.", 3);
            check = NarrativeSchema.safeParse(coerceNarrative(safeJson(retryRaw)));
          }
          if (!check.success) {
            const err = new Error("Narrative Architect: schema violation — issues: " +
              JSON.stringify(check.error.issues.slice(0, 6)) +
              " | raw sample: " + String(narrativeRaw).slice(0, 400));
            err.step = "narrative"; err.schemaViolation = true;
            throw err;
          }
          narrative = enforceEvidenceIds(check.data, legal);
        }
        sse(send, "step3", { status: "done" });
        emitCheckpoint(4);
      }

      // Step 4 — Document Composer (+ repair/normalize/retry + deterministic fallback)
      const composePrompt = () => P.step4(narrative, kb, settings);
      let composerSoftFail = false;
      let composerSoftReason = "";
      if (resumeFrom <= 4) {
        const composedRaw = await budgeted("mid", composePrompt(), "Compose the cover letter and CV JSON now, citing only the evidence provided.", 4);
        let attempt = acceptComposedDocuments(composedRaw);
        if (!attempt.ok && calls < MAX_LLM_CALLS) {
          const issueHint = attempt.reason +
            (attempt.issues ? " — " + JSON.stringify(attempt.issues).slice(0, 400) : "");
          const retryRaw = await budgeted("mid",
            composePrompt() +
            "\n\nYour previous reply failed validation (" + issueHint + "). " +
            "Return ONLY a single JSON object with exactly two keys: " +
            "\"letterBodyHTML\" (string HTML body) and \"cv\" (object with summaryParas, metaLine, skillsRows, techRows, experienceBlocks, education, projects, references). " +
            "No markdown fences, no prose. Keep letterBodyHTML under 10000 characters. Cite only provided evidence.",
            "Return the corrected documents JSON now.", 4);
          attempt = acceptComposedDocuments(retryRaw);
        }
        const resolved = resolveComposedDocuments(attempt, narrative, kb, settings, applicationQuestions);
        composed = resolved.composed;
        if (resolved.softFail) {
          composerSoftFail = true;
          composerSoftReason = resolved.reason || "schema violation";
          sse(send, "step4", {
            status: "done",
            softFail: true,
            reason: composerSoftReason
          });
        } else {
          sse(send, "step4", { status: "done" });
        }
        emitCheckpoint(5);
      }

      // Step 5 — Critic (+ one revision loop max)
      if (resumeFrom <= 5 || !critique) {
        critique = await budgetedJson("mid", P.step5(composed, requirements), "Return the critique JSON now.", 5, z.object({
          coverageIssues: z.array(z.string().max(400)).max(10),
          weakClaims: z.array(z.string().max(400)).max(10),
          toneOk: z.boolean(),
          needsRevision: z.boolean(),
          revisionNotes: z.string().max(2500).default("")
        }), "Critic", coerceCritique);
        emitCheckpoint(6);
      }

      let revised = false;
      const preRevisionLetter = composed.letterBodyHTML;
      const evidenceTextForGuard = kbEvidenceList(kb)
        .map(e => `- [${e.id}] ${e.text}`)
        .join("\n");
      if (critique.needsRevision && calls < MAX_LLM_CALLS && resumeFrom <= 5) {
        const revMsg = composePrompt() + buildRevisionSuffix(critique, narrative, legal, evidenceTextForGuard);
        const revisedRaw = await budgeted("mid", revMsg, "Apply the revision notes and return the revised documents JSON now. Cite only legal evidence IDs; do not invent facts.", 4);
        const revisedAttempt = acceptComposedDocuments(revisedRaw);
        if (revisedAttempt.ok && revisedAttempt.composed) {
          composed = revisedAttempt.composed;
          revised = true;
        }
        emitCheckpoint(6);
      }

      // Entity guard — deterministic, on final documents. The candidate's own
      // name (kb.profile / settings.profile) is part of the legal dictionary.
      const kbEntities = kbEntitiesForGuard(kb, settings);
      const docGuard = guardTailorDocuments(composed.letterBodyHTML, composed.cv, kbEntities, {
        preRevisionLetter: revised ? preRevisionLetter : undefined
      });
      const violations = docGuard.violations;
      const guardWarnings = docGuard.warnings.slice();
      if (composerSoftFail) {
        guardWarnings.push(
          "Document Composer used repair/fallback (" + composerSoftReason +
          ") — review letter and CV before send; claims still limited to KB evidence."
        );
      }
      const finalLetter = docGuard.cleanedHtml;
      composed.cv = docGuard.cleanedCv;

      // Step 6 — ATS Simulator (coerceAts soft-caps; truncated JSON → repair → retry → soft-fail)
      let ats;
      if (resumeFrom <= 6) {
        try {
          ats = await budgetedJson("mid", P.step6({ letter: finalLetter, cv: composed.cv }, requirements), "Score the keyword coverage of the documents above and return the ATS JSON now.", 6, AtsSchema, "ATS Simulator", coerceAts);
        } catch (atsErr) {
          const detail = (atsErr && atsErr.message ? atsErr.message : String(atsErr)).slice(0, 140);
          ats = {
            coveragePercent: 0,
            matchedTerms: [],
            missingTerms: [],
            warnings: ["ATS scoring incomplete — " + detail + " — CV and letter are still usable"]
          };
          sse(send, "step6", { status: "done", softFail: true });
        }
      } else {
        ats = { coveragePercent: 0, matchedTerms: [], missingTerms: [], warnings: ["ATS step skipped on resume"] };
      }

      const usage = {
        cacheHit: false,
        calls,
        revised: !!revised,
        composerSoftFail: !!composerSoftFail,
        maxCalls: MAX_LLM_CALLS,
        provider: effectiveProvider,
        llmPreference: llmPrefs.provider,
        models: { cheap: modelPlan.cheap, mid: modelPlan.mid, strong: modelPlan.strong },
        maxCompletionBudget: callLog.reduce((s, c) => s + (c.maxOut || 0), 0),
        steps: callLog
      };
      const cvOut = {
        ...composed.cv,
        references: cvReferencesFromProfile(kb, settings)
      };
      const result = {
        requirements,
        mappings: mappings.mappings,
        positioning: narrative.positioning,
        metaLine: cvOut.metaLine || narrative.metaLine,
        openingHook: narrative.openingHook,
        themes: narrative.themes,
        gapStories: narrative.gapStories,
        letterBodyHTML: finalLetter,
        cv: cvOut,
        critique,
        revised,
        composerSoftFail: !!composerSoftFail,
        ats,
        entityGuard: {
          clean: violations.length === 0 && guardWarnings.length === 0,
          violations,
          warnings: guardWarnings
        },
        cached: false,
        usage
      };

      console.log(JSON.stringify({
        event: "tailor_usage", cacheHit: false, calls, revised: !!revised,
        maxCompletionBudget: usage.maxCompletionBudget, jdChars: jd.length, kbVersion
      }));

      // Cache write (best-effort; allowOverwrite semantics via addRandomSuffix:false)
      try {
        await putFn(key, JSON.stringify(result), { access: "private", addRandomSuffix: false, contentType: "application/json" });
      } catch (e) { /* cache write failure is non-fatal */ }

      sse(send, "done", result, true);
      res.end();
      } catch (e) {
        /* Rate-limits AND Zod/schema failures pause with checkpoint so client can Continue. */
        if (isPausableLlmError(e) || e.schemaViolation) {
          sse(send, "paused", {
            message: e.message,
            failedStep: failedStep,
            resumeFromStep: failedStep,
            retryable: true,
            schemaViolation: !!e.schemaViolation,
            checkpoint: packCheckpoint()
          }, true);
          res.end();
          return;
        }
        throw e;
      }
    } catch (e) {
      // If SSE already started we must emit the error as an event, not a JSON page.
      if (res.headersSent && res.getHeader("Content-Type") === "text/event-stream") {
        res.write(`data: ${JSON.stringify({ step: "error", data: { message: e.message, step: e.step, schemaViolation: !!e.schemaViolation }, done: true })}\n\n`);
        res.end();
      } else {
        json(res, 500, { error: e.message || "Pipeline error", step: e.step, schemaViolation: !!e.schemaViolation });
      }
    }
  };
}

function safeJson(raw) {
  return parseLlmJson(raw);
}

async function readRawBody(req) {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  return raw;
}

import Anthropic from "@anthropic-ai/sdk";
export default createTailorHandler({
  anthropic: () => new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }),
  put, get
});
