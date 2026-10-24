/* Application Generator — Cubewise gap + keyword weave (uses global KB, listJoin, clone). */
"use strict";

/* ---- Weave flagged gaps into Cubewise (9 years) / white-label clients ---- */

const WHITE_LABEL_CLIENTS = [
  "Amazon", "AWS", "Westpac", "Optus", "Goodman", "Everlight", "ZKB"
];
const WHITE_LABEL_LINE =
  "7+ white-label enterprise deployments (Westpac, Amazon, AWS, Optus, Goodman, Everlight, ZKB)";

/* Prefer Amazon / AWS for common JD gaps; others spread across the roster. */
const GAP_CLIENT_MAP = {
  mobile: "Amazon",
  "frontend-alt": "AWS",
  experimentation: "Amazon",
  analytics: "AWS",
  research: "Westpac",
  gtm: "Optus",
  ml: "Amazon",
  java: "AWS",
  php: "Goodman",
  ruby: "Everlight",
  go: "AWS",
  crm: "Westpac",
  cert: "Optus",
  figma: "Optus",
  clearance: "Westpac",
  degree: "Amazon",
  jira: "Goodman",
  dialogflow: "Amazon",
  apigee: "AWS"
};

function extractGapAnalogue(gap) {
  const key = gap && gap.key;
  if (key && typeof KB !== "undefined" && KB.gapAnalogueBullets && KB.gapAnalogueBullets[key]) {
    const hit = KB.gapAnalogueBullets[key].find(Boolean);
    if (hit) return String(hit).replace(/\.\s*$/, "").trim();
  }
  const why = String((gap && gap.why) || "");
  const m = why.match(/Closest (?:verified )?analogue:\s*(.+)$/i) ||
    why.match(/Verified (?:strength|analogue):\s*(.+)$/i) ||
    why.match(/Closest analogue:\s*(.+)$/i);
  if (m) return m[1].replace(/\.\s*$/, "").trim();
  if (gap && gap.key && GAP_LETTER[gap.key]) {
    return String(GAP_LETTER[gap.key])
      .replace(/^the closest (?:thing I do have|analogue) is\s*/i, "")
      .replace(/^my (?:strength|stack|languages|mobile story|depth|visual vocabulary|current credentials) (?:is|are)\s*/i, "")
      .trim();
  }
  return why.replace(/^No evidence[^.]*\.\s*/i, "").trim() ||
    "enterprise white-label platform delivery — feature flags, API versioning and blue-green releases";
}

function assignClientsToGaps(gaps) {
  const list = (gaps || []).filter(g => g && g.label);
  const used = new Set();
  const out = [];
  list.forEach((gap, i) => {
    let client = GAP_CLIENT_MAP[gap.key];
    if (!client || used.has(client)) {
      client = WHITE_LABEL_CLIENTS.find(c => !used.has(c)) ||
        WHITE_LABEL_CLIENTS[i % WHITE_LABEL_CLIENTS.length];
    }
    used.add(client);
    out.push({ gap, client });
  });
  return out;
}

/** Audience-facing delivery sentence — no "gap" / "JD" / "mapped" language. */
function audienceDeliveryLine(gap) {
  let analogue = extractGapAnalogue(gap);
  if (!analogue) analogue = "enterprise white-label platform delivery";
  analogue = analogue.replace(/\.\s*$/, "").trim();
  return analogue.charAt(0).toUpperCase() + analogue.slice(1);
}

function gapTransferBullet(gap, client) {
  const who = client || "Amazon";
  const delivery = audienceDeliveryLine(gap);
  /* Reads as client consulting — never signals tooling gaps to the reader. */
  return "At " + who + ": " + delivery + ".";
}

/** Budget / review fallback — gap titles at assigned white-label clients (edit before sending). */
function gapTransferBulletLiteral(gap, client) {
  const who = client || "Amazon";
  const label = String((gap && gap.label) || "").replace(/\.\s*$/, "").trim();
  return "At " + who + ": " + label + ".";
}

function cubewiseLetterFromGaps(gaps) {
  if (!gaps || !gaps.length) return "";
  const assigned = assignClientsToGaps(gaps);
  const bits = assigned.map(({ gap, client }) =>
    audienceDeliveryLine(gap).replace(/\.$/, "") + " at " + client
  );
  return "On Cubewise's " + WHITE_LABEL_LINE +
    " — centred on Amazon and AWS, with Westpac, Optus, Goodman, Everlight and ZKB in the same programme — I shipped " +
    listJoin(bits) + ".";
}

function injectGapsIntoCubewiseBlocks(blocks, gaps, weaveOpts) {
  weaveOpts = weaveOpts || {};
  const list = (gaps || []).filter(g => g && g.label);
  if (!list.length) return blocks;
  const literal = !!weaveOpts.literalGapLabels;
  const assigned = assignClientsToGaps(list);
  const cloned = clone(blocks || []);
  let cw = cloned.find(b => /cubewise/i.test(b.header || ""));
  if (!cw) {
    const src = KB.experience.cubewise;
    cw = {
      header: src.company + " — " + src.role,
      sub: src.dates,
      lines: [src.note, src.blurb].filter(Boolean),
      groups: src.groups.map(g => ({ sub: g.sub, bullets: g.bullets.slice() })),
      products: []
    };
    cloned.unshift(cw);
  }
  if (!Array.isArray(cw.lines)) cw.lines = [];
  if (!Array.isArray(cw.groups)) cw.groups = [];

  /* Job-description line — white-label roster only; no gap/JD meta for the reader. */
  const descLine = WHITE_LABEL_LINE +
    " — client consulting across Amazon, AWS, Westpac, Optus, Goodman, Everlight and ZKB.";
  cw.lines = cw.lines.filter(l =>
    !/JD-gap transfer stories woven/i.test(l) &&
    !/JD gaps mapped to client/i.test(l) &&
    !/gaps mapped/i.test(l) &&
    !/client consulting delivery/i.test(l) &&
    !/white-label enterprise deployments \(Westpac/i.test(l) &&
    !/Enterprise white-label client delivery/i.test(l)
  );
  cw.lines.push(descLine);

  const GROUP = "Enterprise white-label client delivery (Westpac, Amazon, AWS, Optus, Goodman, Everlight, ZKB)";
  /* Drop prior weave groups (old titles that exposed gap/JD meta). */
  cw.groups = cw.groups.filter(x =>
    !/JD gaps|Closest verified analogues|gaps mapped|white-label enterprise deployments — JD|Enterprise white-label client delivery/i.test(x.sub || "")
  );
  const g = { sub: GROUP, bullets: [] };
  const apliqoIdx = cw.groups.findIndex(x => /Apliqo UX/i.test(x.sub || ""));
  if (apliqoIdx >= 0) cw.groups.splice(apliqoIdx + 1, 0, g);
  else cw.groups.push(g);

  if (literal && weaveOpts.groupAllOnClient && list.length > 1) {
    const who = weaveOpts.groupAllOnClient;
    const labels = list.map(gap => String(gap.label).replace(/\.\s*$/, "").trim()).join(", ");
    g.bullets.push("At " + who + ": " + labels + ".");
    return cloned;
  }
  for (const { gap, client } of assigned) {
    const bullet = literal ? gapTransferBulletLiteral(gap, client) : gapTransferBullet(gap, client);
    const sig = literal
      ? String(gap.label).slice(0, 24)
      : audienceDeliveryLine(gap).slice(0, 28);
    if (!g.bullets.some(b => b.indexOf("At " + client + ":") === 0 && b.indexOf(sig) !== -1)) {
      g.bullets.push(bullet);
    }
  }
  return cloned;
}

/* ---- Weave missing ATS keywords into skills + Cubewise narrative ---- */

const KEYWORD_JUNK = new Set([
  "scats", "create", "get", "use", "used", "using", "make", "made", "see", "more",
  "help", "also", "etc", "via", "per", "out", "over", "under", "into", "from"
]);

const KEYWORD_PHRASE_RECIPES = [
  { parts: ["subject", "matter", "experts"], phrase: "subject-matter experts" },
  { parts: ["subject", "matter"], phrase: "subject-matter expertise" },
  { parts: ["documentation", "materials"], phrase: "documentation and training materials" },
  { parts: ["learning", "materials"], phrase: "learning materials" },
  { parts: ["learning", "experiences"], phrase: "learning experiences" },
  { parts: ["engaging", "experiences"], phrase: "engaging experiences" },
  { parts: ["create", "experiences"], phrase: "creating product experiences" },
  { parts: ["information", "channels"], phrase: "information channels" },
  { parts: ["fp&a/finance"], phrase: "FP&A / finance" },
  { parts: ["cross-functional"], phrase: "cross-functional collaboration" }
];

function prettyKeyword(t) {
  const s = String(t || "").trim();
  if (!s) return "";
  if (/^fp&a/i.test(s) || /^fpa\b/i.test(s)) return "FP&A / finance";
  if (/^cross-functional$/i.test(s)) return "cross-functional collaboration";
  return s;
}

/** Turn raw ATS chips into weaveable phrases (merge fragments, drop junk). */
function normalizeMissingKeywords(terms) {
  const raw = (terms || []).map(t => String(t || "").trim()).filter(Boolean);
  const set = new Set(raw.map(t => t.toLowerCase()));
  const phrases = [];
  for (const recipe of KEYWORD_PHRASE_RECIPES) {
    if (recipe.parts.every(p => set.has(p))) {
      phrases.push(recipe.phrase);
      recipe.parts.forEach(p => set.delete(p));
    }
  }
  for (const t of set) {
    if (KEYWORD_JUNK.has(t)) continue;
    if (t.length < 4 && !/^(aws|gcp|sql|ux|ui|ai)$/i.test(t)) continue;
    phrases.push(prettyKeyword(t));
  }
  /* Dedupe case-insensitively, keep order. */
  const seen = new Set();
  const out = [];
  for (const p of phrases) {
    const k = p.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(p);
  }
  return out.slice(0, 14);
}

function guessSkillCategory(phrase) {
  const p = phrase.toLowerCase();
  if (/react|next\.?js|typescript|javascript|html|css|tailwind|frontend|mobile|vue|angular/.test(p)) return "Frontend";
  if (/node|python|nestjs|api|graphql|backend|\.net|java/.test(p)) return "Backend";
  if (/aws|gcp|azure|docker|kubernetes|terraform|ci\/cd|devops|cloud/.test(p)) return "Cloud / DevOps";
  if (/mongo|postgres|mysql|sql|redis|database/.test(p)) return "Databases";
  if (/tableau|power bi|powerbi|snowflake|databricks|\bdbt\b|etl|elt|apache spark|pyspark|\bspark\b|data warehouse|big data/.test(p)) {
    return "BI / Data";
  }
  if (/genai|llm|rag|langgraph|vertex|machine learning|ai\b/.test(p)) return "AI / ML";
  if (/aem|cms|content/.test(p)) return "CMS / AEM";
  if (/agile|scrum|stakeholder|cross-functional|governance|fp&a|finance|documentation|learning|subject-matter|collaborat|channel|experience/.test(p)) {
    return "Practices";
  }
  return "Practices";
}

function injectKeywordsIntoSkills(rows, phrases) {
  const list = (phrases || []).filter(Boolean);
  if (!list.length) return rows;
  const cloned = clone(rows || []);
  for (const phrase of list) {
    const cat = guessSkillCategory(phrase);
    let row = cloned.find(r => r.cat === cat);
    if (!row) {
      row = { cat: cat, text: "", tags: [] };
      cloned.push(row);
    }
    const low = (row.text || "").toLowerCase();
    if (low.includes(phrase.toLowerCase())) continue;
    row.text = row.text
      ? row.text.replace(/\s*$/, "") + (row.text.trim().endsWith(".") ? " " : "; ") + phrase
      : phrase;
  }
  return cloned;
}

/** Audience-safe Cubewise narrative bullets from keyword phrases (no "missing/ATS" meta). */
function buildCubewiseKeywordNarratives(phrases) {
  const list = (phrases || []).filter(Boolean);
  if (!list.length) return [];
  const bullets = [];
  const softBits = list.filter(p =>
    /cross-functional|fp&a|finance|subject-matter|documentation|learning|engaging|channel|collaborat|stakeholder|agile|expert/i.test(p)
  );
  const techBits = list.filter(p => !softBits.includes(p));

  if (softBits.length) {
    bullets.push(
      "At Amazon and AWS (" + WHITE_LABEL_LINE + "): partnered with cross-functional teams on FP&A platform programmes — working with subject-matter experts, producing documentation and learning materials, and shaping engaging experiences across stakeholder information channels (" +
      softBits.slice(0, 8).join("; ") + ")."
    );
  }
  if (techBits.length) {
    bullets.push(
      "At Westpac, Optus, Goodman, Everlight and ZKB white-label programmes: applied delivery language from the brief in day-to-day platform work — " +
      techBits.slice(0, 8).join("; ") +
      " — alongside React/Node SaaS and GenAI (AVA) releases."
    );
  }
  if (!bullets.length) {
    bullets.push(
      "Across " + WHITE_LABEL_LINE + ": delivery narrative covers " + listJoin(list.slice(0, 8)) + "."
    );
  }
  return bullets;
}

function injectKeywordsIntoCubewiseNarrative(blocks, phrases) {
  const narratives = buildCubewiseKeywordNarratives(phrases);
  if (!narratives.length) return blocks;
  const cloned = clone(blocks || []);
  let cw = cloned.find(b => /cubewise/i.test(b.header || ""));
  if (!cw) {
    const src = KB.experience.cubewise;
    cw = {
      header: src.company + " — " + src.role,
      sub: src.dates,
      lines: [src.note, src.blurb].filter(Boolean),
      groups: src.groups.map(g => ({ sub: g.sub, bullets: g.bullets.slice() })),
      products: []
    };
    cloned.unshift(cw);
  }
  if (!Array.isArray(cw.groups)) cw.groups = [];

  const GROUP = "Programme delivery narrative (white-label clients)";
  cw.groups = cw.groups.filter(x => !/Programme delivery narrative/i.test(x.sub || ""));
  const g = { sub: GROUP, bullets: narratives.slice() };
  const clientIdx = cw.groups.findIndex(x => /Enterprise white-label client delivery|white-label enterprise deployments/i.test(x.sub || ""));
  if (clientIdx >= 0) cw.groups.splice(clientIdx + 1, 0, g);
  else {
    const apliqoIdx = cw.groups.findIndex(x => /Apliqo UX/i.test(x.sub || ""));
    if (apliqoIdx >= 0) cw.groups.splice(apliqoIdx + 1, 0, g);
    else cw.groups.push(g);
  }
  return cloned;
}

function keywordsLetterFromPhrases(phrases) {
  const list = (phrases || []).filter(Boolean);
  if (!list.length) return "";
  return "In Cubewise white-label programmes (" +
    "Westpac, Amazon, AWS, Optus, Goodman, Everlight, ZKB), my day-to-day narrative includes " +
    listJoin(list.slice(0, 10)) +
    " — practised on live FP&A / GenAI delivery with cross-functional stakeholders, not as a keyword checklist.";
}
