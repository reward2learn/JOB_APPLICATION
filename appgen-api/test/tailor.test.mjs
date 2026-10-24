// Golden-set eval harness (roadmap Phase 5) — node --test appgen-api/test/
//
// Runs the tailor pipeline against golden JDs with a MOCKED Anthropic client
// (no network). Asserts:
//   - requirements extraction includes the known Essentials per golden JD
//   - the entity guard strips injected fake tools ("FlubberJS") and passes KB entities
//   - schema-violating LLM responses are rejected (step error surfaces)
//   - caching: same request twice → second response cached:true with same result

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  createTailorHandler, entityGuard, upsertIndex, cacheKeyFor, coerceAts, coerceCritique, coerceEvidenceMap, coerceNarrative, coerceRequirements, inferRoleFromJd, normalizeAlign,
  parseLlmJson, repairTruncatedJson, repairJsonStringControlChars, cvToPlainText, guardTailorDocuments,
  revisionEntityDeltaWarnings, buildRevisionSuffix, COMPOSE_HONESTY_RULES,
  stripAudienceEvidenceIds, stripEvidenceIdsFromCv, normalizeAudiencePunctuation,
  normalizeComposerPayload, acceptComposedDocuments, fallbackComposeDocuments, resolveComposedDocuments,
  normalizeApplicationQuestions, buildApplicationAnswersForQuestions, ensureApplicationAnswersOnCv,
  cvReferencesFromProfile
} from "../api/tailor.js";
import {
  resolveModelPlan,
  normalizeLlmRequest,
  GATEWAY_FLASH,
  OPENCODE_MIMO,
  OPENCODE_NEMOTRON
} from "../api/llm-adapter.js";
import { normalizeLetterBodyHtml } from "../lib/normalize-letter-html.js";
import { mockBlobs, goldenKb, mockAnalyst } from "./mocks.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = JSON.parse(readFileSync(join(__dirname, "fixtures", "jds.json"), "utf8"));

function makeRes() {
  const res = {
    statusCode: 0, headers: {}, chunks: [], ended: false, _ct: "",
    get headersSent() { return this.chunks.length > 0; },
    getHeader(k) { return this.headers[k]; },
    setHeader(k, v) { this.headers[k] = v; this._ct = v; },
    write(c) { this.chunks.push(c); },
    end(b) { this.ended = true; if (b !== undefined) this.chunks.push(b); }
  };
  res.events = () => res.chunks.filter(c => c.startsWith("data: ")).map(c => JSON.parse(c.slice(6)));
  res.json = () => { try { return JSON.parse(res.chunks.join("")); } catch { return null; } };
  return res;
}
function makeReq(jd, kb, settings, llm) {
  const body = { jd, kb, settings, llm: llm || { provider: "anthropic" } };
  const req = { method: "POST", url: "/api/tailor", headers: {}, body };
  req[Symbol.asyncIterator] = async function* () { yield JSON.stringify(body); };
  return req;
}

const SETTINGS = { profile: { name: "Test User", location: "Sydney, Australia" }, content: {}, appearance: { layout: "classic" } };

test("golden set: NCS Australia JD extracts the known Essentials", async () => {
  const jd = FIXTURES.jds.find(j => j.id === "ncs-australia");
  const blobs = mockBlobs();
  const h = createTailorHandler({ anthropic: mockAnalyst(jd.text, goldenKb), ...blobs });
  process.env.ANTHROPIC_API_KEY = "test-key";
  const res = makeRes();
  await h(makeReq(jd.text, goldenKb, SETTINGS), res);
  delete process.env.ANTHROPIC_API_KEY;

  const done = res.events().find(e => e.step === "done");
  assert.ok(done, "pipeline must emit a done event");
  const reqs = done.data.requirements;
  const allText = JSON.stringify(reqs).toLowerCase();
  for (const essential of jd.expectedEssentials) {
    assert.ok(allText.includes(essential.toLowerCase()), "extracted requirements must mention: " + essential);
  }
  // schema-driven structure
  assert.ok(reqs.essentials.length >= 1 && reqs.essentials.length <= 8);
  assert.ok(done.data.themes.length >= 4 && done.data.themes.length <= 6);
  // entity guard clean for honest mock output
  assert.ok(done.data.entityGuard.clean, "entity guard violations: " + JSON.stringify(done.data.entityGuard.violations));
});

test("golden set: synthetic JDs all complete the pipeline", async () => {
  for (const jd of FIXTURES.jds.filter(j => j.id.startsWith("synthetic"))) {
    const blobs = mockBlobs();
    const h = createTailorHandler({ anthropic: mockAnalyst(jd.text, goldenKb), ...blobs });
    process.env.ANTHROPIC_API_KEY = "test-key";
    const res = makeRes();
    await h(makeReq(jd.text, goldenKb, SETTINGS), res);
    delete process.env.ANTHROPIC_API_KEY;
    const done = res.events().find(e => e.step === "done");
    assert.ok(done, "pipeline done event missing for " + jd.id);
    const allText = JSON.stringify(done.data.requirements).toLowerCase();
    for (const essential of jd.expectedEssentials) {
      assert.ok(allText.includes(essential.toLowerCase()), jd.id + " must extract: " + essential);
    }
    assert.ok(done.data.ats.coveragePercent >= 0 && done.data.ats.coveragePercent <= 100);
  }
});

test("entity guard: injected fake tool (FlubberJS) is stripped + flagged; KB entities pass", () => {
  const html = '<p>I built streaming UIs with React and LangGraph, plus a <strong>FlubberJS</strong> pipeline at Acme Corp. Vertex AI evaluation with Ragas.</p>';
  const out = entityGuard(html, goldenKb.entities);
  assert.ok(!out.clean, "flubber injection must be flagged");
  assert.ok(out.violations.includes("FlubberJS"), "violations must name FlubberJS: " + JSON.stringify(out.violations));
  assert.ok(!out.cleanedHtml.includes("FlubberJS"), "cleaned html must not contain FlubberJS");
  assert.ok(out.cleanedHtml.includes("React") && out.cleanedHtml.includes("LangGraph"), "KB entities must survive");
  assert.ok(entityGuard(html, goldenKb.entities.filter(e => e.name !== "FlubberJS")).clean === false);

  const honest = '<p>Nine years of React, TypeScript, Node.js, LangGraph, Ragas/LangSmith evaluation at Cubewise (Amazon, AWS, ZKB). Apliqo UX Certified Professional. TAFE NSW Advanced Diploma of Graphic Design.</p>';
  const clean = entityGuard(honest, goldenKb.entities);
  assert.ok(clean.clean, "honest KB entities must pass: " + JSON.stringify(clean.violations));
});

test("entity guard: honest gap mentions are allowed (no-fabrication exception)", () => {
  const gap = '<p>To be direct: no Dialogflow CX experience, and no tools like FlubberJS were used.</p>';
  const out = entityGuard(gap, goldenKb.entities);
  assert.ok(out.clean === false ? out.violations.every(v => v !== "DialogflowCX") : true, "gap-named KB tool must not be flagged");
});

test("guardTailorDocuments: scans CV bullets and flags revision entity deltas", () => {
  const cv = {
    summaryParas: ["Senior engineer at Cubewise."],
    experienceBlocks: [{
      header: "Freelance",
      groups: [{ sub: "Products", bullets: ["Shipped FlubberJS analytics at Acme Corp."] }]
    }]
  };
  const letter = "<p>React and LangGraph at Cubewise.</p>";
  const out = guardTailorDocuments(letter, cv, goldenKb.entities);
  assert.ok(out.violations.includes("FlubberJS"), "CV fake tool must be flagged");
  assert.ok(out.warnings.some(w => /CV mentions unverified entity/i.test(w)), "CV-only violation must warn");

  const pre = "<p>React at Cubewise.</p>";
  const post = "<p>React and <strong>FlubberJS</strong> at Cubewise.</p>";
  const deltas = revisionEntityDeltaWarnings(pre, post, goldenKb.entities);
  assert.ok(deltas.some(w => /Critic revision introduced/i.test(w)), "revision delta warnings: " + JSON.stringify(deltas));
});

test("normalizeAudiencePunctuation collapses double commas", () => {
  assert.equal(normalizeAudiencePunctuation("foo,, bar"), "foo, bar");
  assert.equal(normalizeAudiencePunctuation("a, , b"), "a, b");
  assert.equal(
    stripAudienceEvidenceIds("PostgreSQL proficiency, (EV-7, EV-14), and SQL."),
    "PostgreSQL proficiency, and SQL."
  );
});

test("stripAudienceEvidenceIds removes EV citations from audience copy", () => {
  const raw =
    "PostgreSQL proficiency (EV-7, EV-14) and enterprise deployments (EV-8). Also EV-4 alone.";
  const out = stripAudienceEvidenceIds(raw);
  assert.ok(!/EV-\d+/i.test(out), "expected no EV ids: " + out);
  assert.ok(out.includes("PostgreSQL proficiency"));
  const cv = stripEvidenceIdsFromCv({
    summaryParas: ["Built AVA (EV-4) and CI/CD (EV-9)."],
    skillsRows: [{ cat: "Backend", text: "NestJS (EV-13)" }]
  });
  assert.ok(!/EV-\d+/i.test(cv.summaryParas[0]));
  assert.ok(!/EV-\d+/i.test(cv.skillsRows[0].text));
});

test("guardTailorDocuments strips EV ids from letter and cv", () => {
  const letter = "<p>Skills (EV-3) and more (EV-4, EV-5).</p>";
  const cv = { summaryParas: ["Summary (EV-1)."] };
  const out = guardTailorDocuments(letter, cv, goldenKb.entities);
  assert.ok(!/EV-\d+/i.test(out.cleanedHtml));
  assert.ok(!/EV-\d+/i.test(out.cleanedCv.summaryParas[0]));
});

test("buildRevisionSuffix includes honesty rules and gapStories hook", () => {
  const suffix = buildRevisionSuffix(
    { needsRevision: true, revisionNotes: "fix tone" },
    { gapStories: [{ gapTool: "Dialogflow", transferStory: "Adjacent LangGraph work.", evidenceIds: ["EV-1"] }] },
    new Set(["EV-1", "EV-2"]),
    "- [EV-1] sample"
  );
  assert.ok(suffix.includes(COMPOSE_HONESTY_RULES.slice(0, 40)));
  assert.ok(suffix.includes("EV-1") && suffix.includes("Dialogflow"));
  assert.ok(suffix.includes("GAP STORIES"));
});

test("cvToPlainText flattens experience bullets", () => {
  const text = cvToPlainText({
    experienceBlocks: [{ groups: [{ bullets: ["Built AVA on LangGraph."] }] }]
  });
  assert.ok(text.includes("LangGraph"));
});

test("entity guard: .NET / ASP.NET / C# paths are not over-stripped", () => {
  const samples = [
    '<p>Backend: Node.js, NestJS, Python, C#/.NET 8 (controllers, DI, EF Core).</p>',
    '<p>Microsoft .NET minimal APIs and ASP.NET Core.</p>',
    '<p>Built WTE Navigator and ManaPoseGP on GCP.</p>'
  ];
  for (const html of samples) {
    const out = entityGuard(html, goldenKb.entities);
    assert.ok(out.clean, "must not strip KB-honest stack tokens: " + JSON.stringify(out.violations) + " in " + html.slice(0, 60));
  }
});

test("503 on step 1 emits paused with checkpoint (Continue pipeline)", async () => {
  const jd = FIXTURES.jds[0];
  const blobs = mockBlobs();
  let attempts = 0;
  const h = createTailorHandler({
    ...blobs,
    createLlmAdapter: () => ({
      provider: "test",
      modelForTier: () => "test-model",
      complete: async () => {
        attempts++;
        throw new Error("HTTP 503 temporarily unavailable");
      }
    })
  });
  process.env.ANTHROPIC_API_KEY = "test-key";
  const res = makeRes();
  await h(makeReq(jd.text, goldenKb, SETTINGS), res);
  delete process.env.ANTHROPIC_API_KEY;
  assert.ok(attempts >= 1, "LLM must be invoked");
  const paused = res.events().find(e => e.step === "paused");
  assert.ok(paused, "503 must emit paused, not hard error");
  assert.equal(paused.data.resumeFromStep, 1);
  assert.ok(paused.data.checkpoint && typeof paused.data.checkpoint === "object");
  assert.ok(!res.events().some(e => e.step === "done"), "must not complete on 503");
});

test("coerceRequirements: missing role inferred from JD first line", () => {
  const jd = "Principal Developer\n\nEssentials\n- Python experience";
  const out = coerceRequirements({ seniority: "senior", essentials: [{ id: "R1", text: "Python", keywords: [] }] }, jd);
  assert.equal(out.role, "Principal Developer");
  assert.equal(out.seniority, "senior");
});

test("coerceRequirements: nested requirements + title alias", () => {
  const jd = "Some long JD body";
  const out = coerceRequirements({
    requirements: {
      title: "Cloud Engineer",
      essentials: ["Terraform", { text: "AWS", keywords: ["AWS"] }]
    }
  }, jd);
  assert.equal(out.role, "Cloud Engineer");
  assert.equal(out.essentials.length, 2);
  assert.equal(out.essentials[0].id, "R1");
  assert.equal(out.essentials[1].text, "AWS");
});

test("coerceEvidenceMap: >8 evidenceIds per mapping are truncated to 8", () => {
  const ids = Array.from({ length: 12 }, (_, i) => "EV-" + (i + 1));
  const out = coerceEvidenceMap({
    mappings: [{ requirementId: "R1", verdict: "strong", evidenceIds: ids, note: "ok" }]
  });
  assert.equal(out.mappings.length, 1);
  assert.equal(out.mappings[0].evidenceIds.length, 8);
  assert.equal(out.mappings[0].evidenceIds[0], "EV-1");
  assert.equal(out.mappings[0].evidenceIds[7], "EV-8");
});

test("coerceEvidenceMap: empty mappings backfill from requirements (Nemotron empty-array case)", () => {
  const requirements = {
    essentials: [{ id: "R1", text: "Python", keywords: [] }, { id: "R2", text: "AWS", keywords: [] }],
    desirable: [{ id: "D1", text: "React", keywords: [] }]
  };
  const out = coerceEvidenceMap({ mappings: [] }, requirements);
  assert.equal(out.mappings.length, 3);
  assert.deepEqual(out.mappings.map(m => m.requirementId), ["R1", "R2", "D1"]);
  assert.ok(out.mappings.every(m => m.verdict === "gap" && m.evidenceIds.length === 0));
});

test("coerceEvidenceMap: accepts id alias for requirementId and mapping key alias", () => {
  const requirements = {
    essentials: [{ id: "R1", text: "Python", keywords: [] }],
    desirable: []
  };
  const out = coerceEvidenceMap({
    mapping: [{ id: "R1", verdict: "partial", evidenceIds: ["EV-1"], note: "adjacent" }]
  }, requirements);
  assert.equal(out.mappings.length, 1);
  assert.equal(out.mappings[0].requirementId, "R1");
  assert.equal(out.mappings[0].verdict, "partial");
});

test("coerceNarrative: gapStories evidenceIds >6 and themes evidenceIds >8 are truncated", () => {
  const gapIds = Array.from({ length: 10 }, (_, i) => "EV-" + (i + 1));
  const themeIds = Array.from({ length: 12 }, (_, i) => "EV-" + (i + 1));
  const out = coerceNarrative({
    positioning: "Lead AI Architect",
    metaLine: "Sydney · AVA",
    openingHook: "Built production GenAI at Cubewise.",
    themes: [
      { title: "Enterprise GenAI", evidenceIds: themeIds },
      { title: "Streaming UX", evidenceIds: ["EV-6"] },
      { title: "Backend APIs", evidenceIds: ["EV-7"] },
      { title: "Extra theme 4", evidenceIds: ["EV-1"] },
      { title: "Extra theme 5", evidenceIds: ["EV-2"] },
      { title: "Extra theme 6", evidenceIds: ["EV-3"] },
      { title: "Extra theme 7", evidenceIds: ["EV-4"] },
      { title: "Extra theme 8", evidenceIds: ["EV-5"] },
      { title: "Extra theme 9 dropped", evidenceIds: ["EV-8"] }
    ],
    gapStories: [
      { gapTool: "Dialogflow CX", transferStory: "Adjacent LangGraph work.", evidenceIds: gapIds },
      { gapTool: "Snowflake", transferStory: "Same warehouse patterns.", evidenceIds: gapIds.slice(0, 3) }
    ]
  });
  assert.equal(out.themes.length, 8);
  assert.equal(out.themes[0].evidenceIds.length, 8);
  assert.equal(out.themes[0].evidenceIds[7], "EV-8");
  assert.equal(out.gapStories.length, 2);
  assert.equal(out.gapStories[0].evidenceIds.length, 6);
  assert.equal(out.gapStories[0].evidenceIds[5], "EV-6");
  assert.equal(out.gapStories[1].evidenceIds.length, 3);
});

test("coerceAts: oversized matchedTerms/missingTerms are truncated to schema caps", () => {
  const matched = Array.from({ length: 55 }, (_, i) => "Term" + i);
  const missing = Array.from({ length: 50 }, (_, i) => "Miss" + i);
  const out = coerceAts({
    coveragePercent: 92,
    matchedTerms: matched,
    missingTerms: missing,
    warnings: Array.from({ length: 20 }, (_, i) => "w" + i)
  });
  assert.equal(out.matchedTerms.length, 40);
  assert.equal(out.missingTerms.length, 40);
  assert.equal(out.warnings.length, 10);
  assert.equal(out.coveragePercent, 92);
  assert.equal(out.matchedTerms[0], "Term0");
  assert.equal(out.matchedTerms[39], "Term39");
});

test("coerceCritique: overlong coverageIssues/weakClaims are truncated to 400 chars", () => {
  const long = "x".repeat(520);
  const out = coerceCritique({
    coverageIssues: [long, "ok"],
    weakClaims: [long],
    toneOk: true,
    needsRevision: true,
    revisionNotes: "y".repeat(3000)
  });
  assert.equal(out.coverageIssues[0].length, 400);
  assert.equal(out.coverageIssues[1], "ok");
  assert.equal(out.weakClaims[0].length, 400);
  assert.equal(out.revisionNotes.length, 2500);
  assert.equal(out.needsRevision, true);
});

test("parseLlmJson repairs truncated unterminated ATS JSON", () => {
  const truncated = '{"coveragePercent": 72, "matchedTerms": ["React", "TypeScript", "LangGra';
  const repaired = repairTruncatedJson(truncated);
  assert.ok(repaired.includes("]"));
  assert.ok(repaired.endsWith("}"));
  const obj = parseLlmJson(truncated);
  assert.ok(obj && typeof obj === "object");
  assert.equal(obj.coveragePercent, 72);
  assert.equal(obj.matchedTerms[2], "LangGra");
});

test("normalizeApplicationQuestions parses numbered lines", () => {
  const qs = normalizeApplicationQuestions("1. Why this role?\n2) Work rights\n\n");
  assert.equal(qs.length, 2);
  assert.equal(qs[0], "Why this role?");
});

test("ensureApplicationAnswersOnCv fills missing answers from narrative", () => {
  const cv = ensureApplicationAnswersOnCv(
    { summaryParas: ["Hi"] },
    ["Why do you want this job?"],
    { openingHook: "I ship production AI.", positioning: "Senior IC." },
    goldenKb
  );
  assert.equal(cv.applicationAnswers.length, 1);
  assert.match(cv.applicationAnswers[0].answer, /production AI/i);
});

test("normalizeLetterBodyHtml removes literal backslash-n between tags", () => {
  const raw =
    '<p class="salutation">Dear Hiring Team,</p>\\n<p>Intro</p>\\n<h2>What I bring to the role</h2>\\n<ol><li><strong class="num">1. A</strong><p class="body">Body</p></li></ol>';
  const out = normalizeLetterBodyHtml(raw);
  assert.ok(!out.includes("\\n"));
  assert.match(out, /Dear Hiring Team/);
  assert.match(out, /<p>Intro<\/p><h2>/);
});

test("repairJsonStringControlChars + parseLlmJson recover HTML with raw newlines", () => {
  const ugly = '{\n  "letterBodyHTML": "<p>Hello\nWorld</p>",\n  "cv": {"summaryParas": ["ok"], "metaLine": ""}\n}';
  const fixed = repairJsonStringControlChars(ugly);
  assert.ok(fixed.includes("\\n"));
  const obj = parseLlmJson(ugly);
  assert.ok(obj && obj.cv);
  assert.match(obj.letterBodyHTML, /Hello/);
});

test("normalizeComposerPayload maps alternate keys and nested wrappers", () => {
  const norm = normalizeComposerPayload({
    documents: {
      letter: "<p>Hi</p>",
      cvData: { summaryParas: ["A"], metaLine: "m" }
    }
  });
  assert.equal(norm.letterBodyHTML, "<p>Hi</p>");
  assert.equal(norm.cv.summaryParas[0], "A");
});

test("acceptComposedDocuments accepts flat CV fields with letterBodyHTML", () => {
  const raw = JSON.stringify({
    letterBodyHTML: "<p class=\"salutation\">Dear Hiring Team,</p><p>Body</p>",
    summaryParas: ["Senior engineer"],
    metaLine: "GenAI",
    experienceBlocks: [{ header: "CUBEWISE", lines: ["Shipped AVA"] }]
  });
  const accepted = acceptComposedDocuments(raw);
  assert.equal(accepted.ok, true);
  assert.ok(accepted.composed.cv.summaryParas.length);
});

test("fallbackComposeDocuments builds letter+cv from narrative evidence only", () => {
  const narrative = {
    positioning: "Production GenAI engineer.",
    metaLine: "React · Vertex AI",
    openingHook: "I ship production conversational AI.",
    themes: [
      { title: "Enterprise GenAI", evidenceIds: ["EV-2", "EV-3"] },
      { title: "Streaming UX", evidenceIds: ["EV-6"] },
      { title: "Backend APIs", evidenceIds: ["EV-7"] }
    ],
    gapStories: [
      { gapTool: "Dialogflow CX", transferStory: "Same agent patterns on Vertex AI.", evidenceIds: ["EV-2"] }
    ]
  };
  const out = fallbackComposeDocuments(narrative, goldenKb, SETTINGS);
  assert.match(out.letterBodyHTML, /Dear Hiring Team/);
  assert.match(out.letterBodyHTML, /Enterprise GenAI/);
  assert.match(out.letterBodyHTML, /Dialogflow CX/);
  assert.ok(out.cv.experienceBlocks.length);
  assert.ok(out.cv.summaryParas.length);
  // Honesty: theme body must come from cited evidence text
  assert.match(out.letterBodyHTML, /AVA|LangGraph|Vertex/i);
});

test("Document Composer soft-fails to deterministic fallback so pipeline completes", async () => {
  const jd = FIXTURES.jds[0];
  const blobs = mockBlobs();
  const base = mockAnalyst(jd.text, goldenKb);
  let composerCalls = 0;
  const badComposer = {
    messages: {
      create: async (params) => {
        const res = await base.messages.create(params);
        const sys = (params.system || "");
        if (sys.startsWith("You are a document composer")) {
          composerCalls++;
          return { content: [{ type: "text", text: "NOT JSON at all {{{ leftover" }] };
        }
        return res;
      }
    }
  };
  const h = createTailorHandler({ anthropic: () => badComposer, ...blobs });
  process.env.ANTHROPIC_API_KEY = "test-key";
  const res = makeRes();
  await h(makeReq(jd.text, goldenKb, SETTINGS), res);
  delete process.env.ANTHROPIC_API_KEY;
  const errEvent = res.events().find(e => e.step === "error");
  assert.equal(errEvent, undefined, "composer failure must not emit pipeline error");
  const step4Soft = res.events().find(e => e.step === "step4" && e.data && e.data.softFail);
  assert.ok(step4Soft, "step4 softFail event expected");
  const done = res.events().find(e => e.step === "done");
  assert.ok(done, "pipeline must complete with composer soft-fail");
  assert.equal(done.data.composerSoftFail, true);
  assert.ok(done.data.letterBodyHTML, "fallback letter required");
  assert.ok(done.data.cv, "fallback cv required");
  assert.ok((done.data.entityGuard.warnings || []).some(w => /Document Composer/i.test(w)));
  assert.ok(composerCalls >= 1, "composer must have been attempted");
});

test("resolveComposedDocuments keeps valid LLM letter when only cv missing", () => {
  const narrative = {
    positioning: "P", metaLine: "M", openingHook: "Hook",
    themes: [{ title: "T1", evidenceIds: ["EV-1"] }, { title: "T2", evidenceIds: ["EV-2"] }, { title: "T3", evidenceIds: ["EV-3"] }],
    gapStories: []
  };
  const attempt = {
    ok: false,
    reason: "missing cv",
    partial: { letterBodyHTML: "<p class=\"salutation\">Dear Hiring Team,</p><p>Kept from model</p>" }
  };
  const resolved = resolveComposedDocuments(attempt, narrative, goldenKb, SETTINGS);
  assert.equal(resolved.softFail, true);
  assert.match(resolved.composed.letterBodyHTML, /Kept from model/);
  assert.ok(resolved.composed.cv.experienceBlocks.length);
});

test("ATS Simulator soft-fails on unrecoverable JSON so pipeline completes", async () => {
  const jd = FIXTURES.jds[0];
  const blobs = mockBlobs();
  const base = mockAnalyst(jd.text, goldenKb);
  const badAts = {
    messages: {
      create: async (params) => {
        const res = await base.messages.create(params);
        const sys = (params.system || "");
        if (sys.startsWith("You are an ATS simulator")) {
          return { content: [{ type: "text", text: "TOTALLY NOT JSON {{{ leftover" }] };
        }
        return res;
      }
    }
  };
  const h = createTailorHandler({ anthropic: () => badAts, ...blobs });
  process.env.ANTHROPIC_API_KEY = "test-key";
  const res = makeRes();
  await h(makeReq(jd.text, goldenKb, SETTINGS), res);
  delete process.env.ANTHROPIC_API_KEY;
  const errEvent = res.events().find(e => e.step === "error");
  assert.equal(errEvent, undefined, "ATS parse failure must not emit pipeline error");
  const done = res.events().find(e => e.step === "done");
  assert.ok(done, "pipeline must complete with soft-fail ATS");
  assert.ok(done.data.letterBodyHTML, "composed letter must survive ATS soft-fail");
  assert.ok(done.data.cv, "composed CV must survive ATS soft-fail");
  assert.equal(done.data.ats.coveragePercent, 0);
  assert.ok((done.data.ats.warnings || []).some(w => /ATS scoring incomplete/i.test(w)));
});

test("ATS Simulator: >40 matchedTerms from the model does not fail the pipeline", async () => {
  const jd = FIXTURES.jds[0];
  const blobs = mockBlobs();
  const base = mockAnalyst(jd.text, goldenKb);
  const fatClient = {
    messages: {
      create: async (params) => {
        const res = await base.messages.create(params);
        const sys = (params.system || "");
        if (sys.startsWith("You are an ATS simulator")) {
          const fat = Array.from({ length: 48 }, (_, i) => "Keyword" + i);
          return { content: [{ type: "text", text: JSON.stringify({
            coveragePercent: 88,
            matchedTerms: fat,
            missingTerms: ["Kubernetes"],
            warnings: []
          }) }] };
        }
        return res;
      }
    }
  };
  const h = createTailorHandler({ anthropic: () => fatClient, ...blobs });
  process.env.ANTHROPIC_API_KEY = "test-key";
  const res = makeRes();
  await h(makeReq(jd.text, goldenKb, SETTINGS), res);
  delete process.env.ANTHROPIC_API_KEY;
  const done = res.events().find(e => e.step === "done");
  assert.ok(done, "pipeline must complete despite oversized ATS arrays");
  assert.ok(done.data.ats.matchedTerms.length <= 40);
  assert.equal(done.data.ats.coveragePercent, 88);
});

test("schema violation: malformed LLM output surfaces a step error event, never a crash", async () => {
  const jd = FIXTURES.jds[0];
  const blobs = mockBlobs();
  const badClient = {
    messages: { create: async () => ({ content: [{ type: "text", text: "this is not JSON at all" }] }) }
  };
  const h = createTailorHandler({ anthropic: () => badClient, ...blobs });
  process.env.ANTHROPIC_API_KEY = "test-key";
  const res = makeRes();
  await h(makeReq(jd.text, goldenKb, SETTINGS), res);
  delete process.env.ANTHROPIC_API_KEY;
  const errEvent = res.events().find(e => e.step === "error");
  if (errEvent) {
    assert.match(errEvent.data.message, /not valid JSON|schema/i);
  } else {
    // step-1 failure happens before SSE starts → structured JSON error is correct
    assert.equal(res.statusCode, 500, "pre-SSE failure must be a structured JSON 500");
    assert.match(res.json().error, /not valid JSON|schema/i);
    assert.equal(res.json().schemaViolation, true);
  }
});

test("caching: identical request twice → second response is a cache hit with the same result", async () => {
  const jd = FIXTURES.jds.find(j => j.id === "synthetic-fpna-frontend");
  const blobs = mockBlobs();
  let llmCalls = 0;
  const countingClient = mockAnalyst(jd.text, goldenKb, () => llmCalls++);
  const h = createTailorHandler({ anthropic: countingClient, ...blobs });
  process.env.ANTHROPIC_API_KEY = "test-key";

  const res1 = makeRes();
  await h(makeReq(jd.text, goldenKb, SETTINGS), res1);
  const done1 = res1.events().find(e => e.step === "done");
  assert.ok(done1 && done1.data.cached === false);

  const res2 = makeRes();
  await h(makeReq(jd.text, goldenKb, SETTINGS), res2);

  assert.equal(res2.headers["Content-Type"], "application/json", "cache hit returns JSON, not SSE");
  assert.equal(res2.json().cached, true);
  assert.deepEqual(res2.json().result.ats, done1.data.ats);
  assert.equal(res2.json().result.letterBodyHTML, done1.data.letterBodyHTML);

  // different settings hash → different cache key → fresh run
  const res3 = makeRes();
  await h(makeReq(jd.text, goldenKb, { ...SETTINGS, profile: { name: "Someone Else" } }), res3);
  assert.ok(res3.events().find(e => e.step === "done"), "changed settings must not hit the old cache");
  delete process.env.ANTHROPIC_API_KEY;
});

test("upsertIndex keeps one entry per dedupeKey, newest first", () => {
  let idx = [];
  idx = upsertIndex(idx, { id: "a", ts: 100, dedupeKey: "k1" });
  idx = upsertIndex(idx, { id: "b", ts: 200, dedupeKey: "k2" });
  idx = upsertIndex(idx, { id: "c", ts: 300, dedupeKey: "k1" });   // replaces a
  assert.deepEqual(idx.map(e => e.id), ["c", "b"]);
});

test("cvReferencesFromProfile prefers settings.content.references over KB", () => {
  const kb = { references: "KB refs line" };
  assert.equal(cvReferencesFromProfile(kb, { content: { references: "  Custom refs  " } }), "Custom refs");
  assert.equal(cvReferencesFromProfile(kb, { content: { references: "" } }), "KB refs line");
  assert.equal(cvReferencesFromProfile({}, {}), "Available on request.");
});

test("cache key changes with jd, kb version and settings hash", () => {
  const k1 = cacheKeyFor("jd-a", "kb-1", "s1");
  const k2 = cacheKeyFor("jd-b", "kb-1", "s1");
  const k3 = cacheKeyFor("jd-a", "kb-2", "s1");
  const k4 = cacheKeyFor("jd-a", "kb-1", "s2");
  assert.notEqual(k1, k2); assert.notEqual(k1, k3); assert.notEqual(k1, k4);
  assert.equal(k1, cacheKeyFor("jd-a", "kb-1", "s1"));
  assert.notEqual(k1, cacheKeyFor("jd-a", "kb-1", "s1", "align1"));
  assert.notEqual(k1, cacheKeyFor("jd-a", "kb-1", "s1", "", "llm-opencode"));
});

test("default llm request is auto (Vercel → OpenCode)", () => {
  assert.equal(normalizeLlmRequest(null).provider, "auto");
});

test("Vercel Gateway model plan: all tiers pinned to Nemotron Lightning", () => {
  const plan = resolveModelPlan(normalizeLlmRequest({ provider: "vercel" }));
  assert.equal(plan.cheap, GATEWAY_FLASH);
  assert.equal(plan.mid, GATEWAY_FLASH);
  assert.equal(plan.strong, GATEWAY_FLASH);
  assert.equal(plan.cheap, "nvidia/nemotron-3.5-lightning-free");
  assert.equal(plan.strong, plan.mid);
});

test("auto Gateway model plan matches vercel pin (all Nemotron)", () => {
  const plan = resolveModelPlan(normalizeLlmRequest({ provider: "auto" }));
  assert.equal(plan.provider, "auto");
  assert.equal(plan.cheap, GATEWAY_FLASH);
  assert.equal(plan.mid, GATEWAY_FLASH);
  assert.equal(plan.strong, GATEWAY_FLASH);
});

test("OpenCode model plan: MiMo for cheap/mid, Nemotron for strong", () => {
  const plan = resolveModelPlan(normalizeLlmRequest({ provider: "opencode" }));
  assert.equal(plan.provider, "opencode");
  assert.equal(plan.cheap, OPENCODE_MIMO);
  assert.equal(plan.mid, OPENCODE_MIMO);
  assert.equal(plan.strong, OPENCODE_NEMOTRON);
});

test("OpenCode provider without OPENCODE_API_KEY returns 501", async () => {
  const jd = FIXTURES.jds[0];
  const blobs = mockBlobs();
  const h = createTailorHandler({ anthropic: mockAnalyst(jd.text, goldenKb), ...blobs });
  delete process.env.OPENCODE_API_KEY;
  const res = makeRes();
  await h(makeReq(jd.text, goldenKb, SETTINGS, { provider: "opencode" }), res);
  assert.equal(res.statusCode, 501);
  assert.match(res.json().error, /OPENCODE_API_KEY/i);
});

test("auto provider without gateway or opencode keys returns 501", async () => {
  const jd = FIXTURES.jds[0];
  const blobs = mockBlobs();
  const h = createTailorHandler({ anthropic: mockAnalyst(jd.text, goldenKb), ...blobs });
  delete process.env.OPENCODE_API_KEY;
  delete process.env.VERCEL_AI_GATEWAY_API_KEY;
  delete process.env.AI_GATEWAY_API_KEY;
  const res = makeRes();
  await h(makeReq(jd.text, goldenKb, SETTINGS, { provider: "auto" }), res);
  assert.equal(res.statusCode, 501);
  assert.match(res.json().error, /VERCEL_AI_GATEWAY_API_KEY|OPENCODE_API_KEY/i);
});

test("normalizeAlign: caps keywords/gaps and drops empty payloads", () => {
  assert.equal(normalizeAlign(null), null);
  assert.equal(normalizeAlign({ keywords: [], gaps: [] }), null);
  const a = normalizeAlign({
    keywords: ["Docker", "  Kubernetes  ", ...Array.from({ length: 50 }, (_, i) => "k" + i)],
    gaps: [{ label: "Appian", why: "no evidence" }, "bare string", { label: "" }]
  });
  assert.equal(a.keywords.length, 40);
  assert.equal(a.keywords[0], "Docker");
  assert.equal(a.keywords[1], "Kubernetes");
  assert.equal(a.gaps.length, 2);
  assert.equal(a.gaps[0].label, "Appian");
  assert.equal(a.gaps[1].label, "bare string");
});
