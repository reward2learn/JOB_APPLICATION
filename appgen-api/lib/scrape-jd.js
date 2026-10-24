/**
 * Fetch a job listing URL and extract title, company, location, and plain-text JD.
 * ViewJobs and most boards expose schema.org JobPosting in application/ld+json.
 * SEEK (au.seek.com) serves SSR HTML with data-automation attrs; www.seek.com.au
 * is Cloudflare-challenged for non-browser / datacenter clients.
 * Employment Hero (jobs.employmenthero.com) embeds job payloads in __NEXT_DATA__
 * (SmartMatch links need token query params; bare UUID paths hit a sign-in gate).
 */

const FETCH_TIMEOUT_MS = 25_000;
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const JUNK_ORG = /privacy|copyright|disclaimer|terms/i;

/** Trailing chars often pasted with CSV / JSON URL lists (ASCII + curly quotes). */
const URL_TRAILING_JUNK = /[\s"'`'\u201C\u201D\u2018\u2019),.;:\]]+$/;

/** Scan entire blob — one-per-line, comma-separated, or `"url", "url"` arrays. */
const URL_IN_TEXT_RE =
  /https?:\/\/[^\s<>"'`'\u201C\u201D\u2018\u2019[\]{}]+/gi;

const SEEK_HOST_RE = /(?:^|\.)seek\.com(?:\.au)?$/i;
const SEEK_JOB_PATH_RE = /\/job\/(\d+)/i;

const EH_JOBS_HOST_RE = /(?:^|\.)jobs\.employmenthero\.com$/i;
const EH_CAREER_JOB_PATH_RE =
  /\/(?:[A-Za-z]{2}\/)?(?:sm_)?career_jobs\/([0-9a-f-]{36})/i;

const CF_CHALLENGE_RE =
  /confirm you are human|cf-browser-verification|__cf_chl|challenge-platform|Attention Required! \| Cloudflare/i;

function normalizeExtractedJobUrl(candidate) {
  let url = String(candidate || "").trim();
  while (URL_TRAILING_JUNK.test(url)) url = url.replace(URL_TRAILING_JUNK, "");
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.href;
  } catch {
    return null;
  }
}

export function parseJobUrlsFromText(raw) {
  if (!raw || typeof raw !== "string") return [];
  const text = raw.replace(/^\uFEFF/, "");
  const seen = new Set();
  const out = [];
  for (const m of text.matchAll(URL_IN_TEXT_RE)) {
    const href = normalizeExtractedJobUrl(m[0]);
    if (!href || seen.has(href)) continue;
    seen.add(href);
    out.push(href);
  }
  return out;
}

/**
 * Prefer au.seek.com/job/{id} (SSR HTML). Strip tracking query/hash.
 * www.seek.com.au often returns Cloudflare 403 to server fetches.
 */
export function normalizeJobFetchUrl(rawUrl) {
  const href = normalizeExtractedJobUrl(rawUrl);
  if (!href) return null;
  try {
    const u = new URL(href);
    if (SEEK_HOST_RE.test(u.hostname)) {
      const m = u.pathname.match(SEEK_JOB_PATH_RE);
      if (m) return `https://au.seek.com/job/${m[1]}`;
    }
    return u.href;
  } catch {
    return href;
  }
}

export function isSeekJobUrl(url) {
  try {
    const u = new URL(String(url || ""));
    return SEEK_HOST_RE.test(u.hostname) && SEEK_JOB_PATH_RE.test(u.pathname);
  } catch {
    return false;
  }
}

export function isEmploymentHeroJobUrl(url) {
  try {
    const u = new URL(String(url || ""));
    return EH_JOBS_HOST_RE.test(u.hostname) && EH_CAREER_JOB_PATH_RE.test(u.pathname);
  } catch {
    return false;
  }
}

function employmentHeroHintsInHtml(html, sourceUrl) {
  if (!html || typeof html !== "string") return isEmploymentHeroJobUrl(sourceUrl);
  return (
    isEmploymentHeroJobUrl(sourceUrl) ||
    /JobOverview__StyledDescription|RoleCard__JobTitle|__NEXT_DATA__/.test(html)
  );
}

function extractNextData(html) {
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
  if (!m) return null;
  try {
    return JSON.parse(m[1].trim());
  } catch {
    return null;
  }
}

export function looksLikeEmploymentHeroSignIn(html) {
  if (!html || typeof html !== "string") return false;
  if (/Meet your job match|Sign up or log in to unlock your career potential/i.test(html)) {
    return true;
  }
  const next = extractNextData(html);
  return !!(next && next.page === "/sign_in");
}

/** Map Employment Hero `pageProps.jobData` → scrape result (unit-testable). */
export function parseEmploymentHeroJobData(jobData, sourceUrl) {
  if (!jobData || typeof jobData !== "object") return null;
  const title = String(jobData.title || "").trim();
  if (!title) return null;

  const company = String(jobData.organisation_name || "").trim();
  let location = String(jobData.vendor_location_name || "").trim();
  if (!location && jobData.country_code) {
    location = String(jobData.country_code).trim();
  }
  const humanizeEhToken = s =>
    String(s || "")
      .replace(/_/g, " ")
      .replace(/\b\w/g, c => c.toUpperCase())
      .trim();
  const metaBits = [
    jobData.employment_type_name,
    jobData.workplace_type ? humanizeEhToken(jobData.workplace_type) : "",
    jobData.experience_level_name
  ]
    .map(x => String(x || "").trim())
    .filter(Boolean);
  if (metaBits.length) {
    const meta = [...new Set(metaBits)].join(", ");
    location = location ? `${location} (${meta})` : meta;
  }

  let jd = stripHtml(jobData.description || "");
  const overview = stripHtml(jobData.company_overview || "");
  if (overview && overview.length > 48) {
    const head = overview.slice(0, 48);
    if (!jd.includes(head)) {
      jd = jd ? `${jd}\n\nCompany Overview\n${overview}` : overview;
    }
  }

  if (!jd || jd.length < 24) return null;

  return {
    ok: true,
    url: sourceUrl,
    title,
    company,
    location,
    jd,
    applicationQuestions: [],
    employmentType: jobData.employment_type_name || null,
    source: "employmenthero-next-data"
  };
}

function extractInnerHtmlByClassFragment(html, classFragment) {
  const esc = classFragment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const openRe = new RegExp(`<([a-zA-Z0-9]+)([^>]*class=["'][^"']*${esc}[^"']*["'][^>]*)>`, "i");
  const m = openRe.exec(html);
  if (!m) return null;
  const tag = m[1].toLowerCase();
  const start = m.index + m[0].length;
  if (/\/>$/.test(m[0])) return "";
  const openTag = new RegExp(`<${tag}\\b`, "gi");
  const closeTag = new RegExp(`</${tag}\\s*>`, "gi");
  let depth = 1;
  let i = start;
  while (i < html.length && depth > 0) {
    openTag.lastIndex = i;
    closeTag.lastIndex = i;
    const nextOpen = openTag.exec(html);
    const nextClose = closeTag.exec(html);
    if (!nextClose) break;
    if (nextOpen && nextOpen.index < nextClose.index) {
      depth += 1;
      i = nextOpen.index + nextOpen[0].length;
    } else {
      depth -= 1;
      if (depth === 0) return html.slice(start, nextClose.index);
      i = nextClose.index + nextClose[0].length;
    }
  }
  return null;
}

function firstMatchGroup(html, re) {
  const m = re.exec(html);
  return m ? decodeHtmlEntities(stripHtml(m[1])) : "";
}

export function parseEmploymentHeroListingFromHtml(html, sourceUrl) {
  const next = extractNextData(html);
  if (next) {
    if (looksLikeEmploymentHeroSignIn(html)) {
      return emptyFail(
        sourceUrl,
        "Employment Hero returned the sign-in gate (use the full SmartMatch email link with token params, paste saved page HTML, or set FIRECRAWL_API_KEY)."
      );
    }
    const jobData = next.props && next.props.pageProps && next.props.pageProps.jobData;
    const fromNext = parseEmploymentHeroJobData(jobData, sourceUrl);
    if (fromNext) return fromNext;
  }

  const title =
    firstMatchGroup(html, /RoleCard__JobTitle[^>]*>([\s\S]*?)<\//i) ||
    firstMatchGroup(html, /<h4[^>]*StyledTitle[^>]*>([\s\S]*?)<\//i);
  const company = firstMatchGroup(
    html,
    /CompanyNameLink__CompanyNameText[^>]*>([\s\S]*?)<\//i
  );
  const location = firstMatchGroup(
    html,
    /<span class="StyledText__StyledSpanInline-sc-1df99pf-2[^"]*"[^>]*>([\s\S]*?)<\//i
  );
  const descInner = extractInnerHtmlByClassFragment(html, "JobOverview__StyledDescription");
  let jd = descInner != null ? stripHtml(descInner) : "";
  if (/Company Overview/i.test(html)) {
    const idx = html.search(/>\s*Company Overview\s*<\//i);
    if (idx >= 0) {
      const tail = html.slice(idx);
      const boxInner = extractInnerHtmlByClassFragment(tail, "ejcheS");
      if (boxInner) {
        const overview = stripHtml(boxInner);
        if (overview.length > 48 && !jd.includes(overview.slice(0, 48))) {
          jd = jd ? `${jd}\n\nCompany Overview\n${overview}` : overview;
        }
      }
    }
  }

  if (!title && !jd) {
    return emptyFail(
      sourceUrl,
      "Employment Hero page did not include __NEXT_DATA__.jobData or JobOverview description markup."
    );
  }
  if (!jd || jd.length < 24) {
    return {
      ok: false,
      url: sourceUrl,
      error: "Job description text was empty after Employment Hero HTML parse.",
      title,
      company,
      location,
      jd: jd || "",
      applicationQuestions: []
    };
  }
  return {
    ok: true,
    url: sourceUrl,
    title,
    company,
    location,
    jd,
    applicationQuestions: [],
    source: "employmenthero-html"
  };
}

function stripHtml(html) {
  if (!html) return "";
  let s = String(html);
  s = s.replace(/<script[\s\S]*?<\/script>/gi, " ");
  s = s.replace(/<style[\s\S]*?<\/style>/gi, " ");
  s = s.replace(/<\/(p|div|h[1-6]|li|tr|br)>/gi, "\n");
  s = s.replace(/<br\s*\/?>/gi, "\n");
  s = s.replace(/<[^>]+>/g, " ");
  s = s.replace(/&nbsp;/gi, " ");
  s = s.replace(/&amp;/gi, "&");
  s = s.replace(/&lt;/gi, "<");
  s = s.replace(/&gt;/gi, ">");
  s = s.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
  s = s.replace(/\u003c/gi, "<").replace(/\u003e/gi, ">");
  return s.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").replace(/[ \t]{2,}/g, " ").trim();
}

function decodeHtmlEntities(s) {
  return String(s || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/<!--\s*-->/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractJsonLdJobPosting(html) {
  const re = /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    try {
      const parsed = JSON.parse(m[1].trim());
      const nodes = Array.isArray(parsed) ? parsed : [parsed];
      for (const node of nodes) {
        if (!node || typeof node !== "object") continue;
        const type = node["@type"];
        const types = Array.isArray(type) ? type : [type];
        if (types.some(t => String(t).toLowerCase() === "jobposting")) return node;
        if (node["@graph"]) {
          for (const g of node["@graph"]) {
            const gt = g && g["@type"];
            const gts = Array.isArray(gt) ? gt : [gt];
            if (gts.some(t => String(t).toLowerCase() === "jobposting")) return g;
          }
        }
      }
    } catch {
      /* next block */
    }
  }
  return null;
}

function parseTitleTag(html) {
  const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return m ? m[1].trim() : "";
}

/** "AI Developer — ISS Facility Services | ViewJobs" */
export function companyFromDocumentTitle(pageTitle) {
  if (!pageTitle) return "";
  const left = pageTitle.split("|")[0].trim();
  const parts = left.split(/\s+[—–-]\s+/);
  if (parts.length >= 2) return parts[parts.length - 1].trim();
  return "";
}

function orgNameFromPosting(posting) {
  const org = posting.hiringOrganization;
  if (!org) return "";
  if (typeof org === "string") return org.trim();
  if (typeof org.name === "string") return org.name.trim();
  return "";
}

function locationFromPosting(posting) {
  const loc = posting.jobLocation;
  const places = Array.isArray(loc) ? loc : loc ? [loc] : [];
  const bits = [];
  for (const place of places) {
    const addr = place && place.address;
    if (!addr) continue;
    if (addr.addressLocality) bits.push(String(addr.addressLocality));
    if (addr.addressRegion) bits.push(String(addr.addressRegion));
    if (addr.addressCountry && String(addr.addressCountry).length <= 3) {
      bits.push(String(addr.addressCountry));
    }
  }
  let text = [...new Set(bits)].join(", ");
  const emp = posting.employmentType;
  if (emp) {
    const label = String(emp).replace(/_/g, " ").toLowerCase();
    const nice = label.replace(/\b\w/g, c => c.toUpperCase());
    text = text ? text + " (" + nice + ")" : nice;
  }
  return text;
}

function resolveCompany(posting, pageTitle) {
  let company = orgNameFromPosting(posting);
  if (!company || JUNK_ORG.test(company) || company.length > 120) {
    company = companyFromDocumentTitle(pageTitle) || company;
  }
  return company.replace(/\s+/g, " ").trim();
}

export function looksLikeCloudflareChallenge(html) {
  if (!html || typeof html !== "string") return false;
  if (html.length > 80_000 && /data-automation="job-detail-title"|data-automation="jobAdDetails"/i.test(html)) {
    return false;
  }
  return CF_CHALLENGE_RE.test(html);
}

/**
 * Extract inner HTML for the first element with data-automation="{attr}".
 * Handles nested tags via a simple depth walk from the opening tag.
 */
export function extractDataAutomationInnerHtml(html, attr) {
  const openRe = new RegExp(
    `<([a-zA-Z0-9]+)([^>]*\\sdata-automation=["']${attr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'][^>]*)>`,
    "i"
  );
  const m = openRe.exec(html);
  if (!m) return null;
  const tag = m[1].toLowerCase();
  const start = m.index + m[0].length;
  if (/\/>$/.test(m[0])) return "";
  const voidTags = new Set(["img", "br", "hr", "input", "meta", "link"]);
  if (voidTags.has(tag)) return "";

  const openTag = new RegExp(`<${tag}\\b`, "gi");
  const closeTag = new RegExp(`</${tag}\\s*>`, "gi");
  let depth = 1;
  let i = start;
  while (i < html.length && depth > 0) {
    openTag.lastIndex = i;
    closeTag.lastIndex = i;
    const nextOpen = openTag.exec(html);
    const nextClose = closeTag.exec(html);
    if (!nextClose) break;
    if (nextOpen && nextOpen.index < nextClose.index) {
      depth += 1;
      i = nextOpen.index + nextOpen[0].length;
    } else {
      depth -= 1;
      if (depth === 0) return html.slice(start, nextClose.index);
      i = nextClose.index + nextClose[0].length;
    }
  }
  return null;
}

function textFromDataAutomation(html, attr) {
  const inner = extractDataAutomationInnerHtml(html, attr);
  if (inner == null) return "";
  return decodeHtmlEntities(stripHtml(inner));
}

/** Employer questions under SEEK "Employer questions" heading. */
export function extractSeekEmployerQuestions(html) {
  if (!html) return [];
  const headingRe = /<h2[^>]*>\s*Employer questions\s*<\/h2>/i;
  const hm = headingRe.exec(html);
  if (!hm) return [];
  const after = html.slice(hm.index + hm[0].length);
  const nextSection = after.search(/<\/section>|<h2\b/i);
  const chunk = nextSection >= 0 ? after.slice(0, nextSection) : after.slice(0, 8_000);
  const questions = [];
  const liRe = /<li\b[^>]*>([\s\S]*?)<\/li>/gi;
  let lm;
  while ((lm = liRe.exec(chunk))) {
    const t = decodeHtmlEntities(stripHtml(lm[1]));
    if (!t || t.length < 8) continue;
    if (/report this job|your email|reason for reporting/i.test(t)) continue;
    questions.push(t);
  }
  return [...new Set(questions)];
}

export function parseSeekListingFromHtml(html, sourceUrl) {
  const title = textFromDataAutomation(html, "job-detail-title");
  const company = textFromDataAutomation(html, "advertiser-name");
  let location = textFromDataAutomation(html, "job-detail-location");
  const jdInner = extractDataAutomationInnerHtml(html, "jobAdDetails");
  const jd = jdInner != null ? stripHtml(jdInner) : "";
  const applicationQuestions = extractSeekEmployerQuestions(html);
  const workType = textFromDataAutomation(html, "job-detail-work-type");

  if (!title && !jd) {
    return {
      ok: false,
      url: sourceUrl,
      error: "SEEK page did not include job-detail-title / jobAdDetails markup.",
      title: "",
      company: "",
      location: "",
      jd: "",
      applicationQuestions: []
    };
  }
  if (!jd || jd.length < 24) {
    return {
      ok: false,
      url: sourceUrl,
      error: "Job description text was empty after SEEK HTML parse.",
      title,
      company,
      location,
      jd: jd || "",
      applicationQuestions
    };
  }
  return {
    ok: true,
    url: sourceUrl,
    title,
    company,
    location,
    jd,
    applicationQuestions,
    employmentType: workType || null,
    source: "seek-html"
  };
}

function emptyFail(url, error) {
  return {
    ok: false,
    url,
    error,
    title: "",
    company: "",
    location: "",
    jd: "",
    applicationQuestions: []
  };
}

function withQuestions(result, questions) {
  if (!result || typeof result !== "object") return result;
  const qs = Array.isArray(questions)
    ? questions
    : Array.isArray(result.applicationQuestions)
      ? result.applicationQuestions
      : [];
  return { ...result, applicationQuestions: qs };
}

export function parseJobPostingFromHtml(html, sourceUrl) {
  const pageTitle = parseTitleTag(html);
  const ehHints = employmentHeroHintsInHtml(html, sourceUrl);
  const seekHints =
    /data-automation="job-detail-title"|data-automation="jobAdDetails"|au\.seek\.com/i.test(html || "") ||
    isSeekJobUrl(sourceUrl);

  if (looksLikeCloudflareChallenge(html)) {
    return emptyFail(
      sourceUrl,
      "SEEK blocked this request (Cloudflare challenge). Paste the JD manually, or POST html to /api/scrape-jd."
    );
  }

  if (seekHints) {
    const seek = parseSeekListingFromHtml(html, sourceUrl);
    if (seek.ok) return seek;
    /* fall through to JSON-LD if SEEK markup incomplete */
  }

  if (ehHints) {
    const eh = parseEmploymentHeroListingFromHtml(html, sourceUrl);
    if (eh.ok) return eh;
    if (isEmploymentHeroJobUrl(sourceUrl) || looksLikeEmploymentHeroSignIn(html)) {
      return withQuestions(eh, []);
    }
  }

  const posting = extractJsonLdJobPosting(html);
  if (!posting) {
    if (seekHints) {
      return withQuestions(
        {
          ok: false,
          url: sourceUrl,
          error: "No SEEK data-automation fields or JobPosting JSON-LD found on this page.",
          title: "",
          company: "",
          location: "",
          jd: ""
        },
        []
      );
    }
    return withQuestions(
      {
        ok: false,
        url: sourceUrl,
        error: "No schema.org JobPosting JSON-LD found on this page.",
        title: companyFromDocumentTitle(pageTitle)
          ? pageTitle.split("|")[0].split(/—/)[0].trim()
          : "",
        company: companyFromDocumentTitle(pageTitle),
        location: "",
        jd: stripHtml(html).slice(0, 120_000)
      },
      []
    );
  }
  const title =
    (posting.title || posting.name || "").toString().trim() ||
    pageTitle.split("|")[0].split(/[—–-]/)[0].trim();
  const company = resolveCompany(posting, pageTitle);
  const location = locationFromPosting(posting);
  const descHtml = posting.description || posting.summary || "";
  const jd = stripHtml(descHtml) || stripHtml(html).slice(0, 80_000);
  const applicationQuestions = seekHints ? extractSeekEmployerQuestions(html) : [];
  if (!jd || jd.length < 24) {
    return withQuestions(
      {
        ok: false,
        url: sourceUrl,
        error: "Job description text was empty after parsing.",
        title,
        company,
        location,
        jd: jd || ""
      },
      applicationQuestions
    );
  }
  return withQuestions(
    {
      ok: true,
      url: sourceUrl,
      title,
      company,
      location,
      jd,
      employmentType: posting.employmentType || null,
      source: "json-ld"
    },
    applicationQuestions
  );
}

function browserFetchHeaders(fetchUrl) {
  let referer = "https://www.google.com/";
  try {
    const u = new URL(fetchUrl);
    if (SEEK_HOST_RE.test(u.hostname)) referer = "https://au.seek.com/";
    else if (EH_JOBS_HOST_RE.test(u.hostname)) referer = "https://jobs.employmenthero.com/";
  } catch {
    /* keep google */
  }
  return {
    "User-Agent": BROWSER_UA,
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-AU,en;q=0.9",
    "Cache-Control": "no-cache",
    Pragma: "no-cache",
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    Referer: referer
  };
}

async function fetchHtmlDirect(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: browserFetchHeaders(url),
      redirect: "follow"
    });
    const html = await res.text();
    return { status: res.status, ok: res.ok, html };
  } finally {
    clearTimeout(timer);
  }
}

/** Optional Firecrawl scrape when direct fetch is blocked (needs FIRECRAWL_API_KEY). */
export async function fetchHtmlViaFirecrawl(url) {
  const key = process.env.FIRECRAWL_API_KEY;
  if (!key) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: "Bearer " + key,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        url,
        formats: ["rawHtml", "html"],
        onlyMainContent: false
      })
    });
    if (!res.ok) return null;
    const data = await res.json();
    const html =
      (data && data.data && (data.data.rawHtml || data.data.html)) ||
      (data && (data.rawHtml || data.html)) ||
      "";
    if (!html || typeof html !== "string") return null;
    return html;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function seekJobIdFromUrl(url) {
  try {
    const m = new URL(String(url || "")).pathname.match(SEEK_JOB_PATH_RE);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

const SEEK_GQL_QUERY = `query JobDetails($jobId: ID!) {
  jobDetails(id: $jobId) {
    job {
      id
      title
      content
      abstract
      advertiser { name }
      location { label }
      workTypes { label }
      salary { label }
      products { questionnaire { questions } }
    }
  }
}`;

/** Map SEEK GraphQL `jobDetails.job` payload → scrape result (unit-testable). */
export function parseSeekGraphqlJob(job, sourceUrl) {
  if (!job || !job.title) return null;
  const company = (job.advertiser && job.advertiser.name) || "";
  const location = (job.location && job.location.label) || "";
  const jd = stripHtml(job.content || "") || String(job.abstract || "").trim();
  const qsRaw =
    job.products && job.products.questionnaire && job.products.questionnaire.questions;
  const applicationQuestions = Array.isArray(qsRaw)
    ? qsRaw.map(q => String(q || "").trim()).filter(Boolean)
    : [];
  if (!jd || jd.length < 24) return null;
  return {
    ok: true,
    url: sourceUrl,
    title: String(job.title || "").trim(),
    company: String(company).trim(),
    location: String(location).trim(),
    jd,
    applicationQuestions,
    employmentType: (job.workTypes && job.workTypes.label) || null,
    source: "seek-graphql"
  };
}

/**
 * SEEK public GraphQL — often reachable when www HTML is Cloudflare-blocked.
 * Prefer au.seek.com/graphql with browser-like Origin/Referer.
 */
export async function fetchSeekViaGraphql(jobId) {
  const id = String(jobId || "").trim();
  if (!/^\d+$/.test(id)) return null;
  const endpoints = [
    "https://au.seek.com/graphql",
    "https://www.seek.com.au/graphql"
  ];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    for (const endpoint of endpoints) {
      const origin = endpoint.includes("www.seek.com.au")
        ? "https://www.seek.com.au"
        : "https://au.seek.com";
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          signal: controller.signal,
          headers: {
            "User-Agent": BROWSER_UA,
            Accept: "application/json",
            "Content-Type": "application/json",
            "Accept-Language": "en-AU,en;q=0.9",
            Origin: origin,
            Referer: origin + "/job/" + id
          },
          body: JSON.stringify({
            operationName: "JobDetails",
            variables: { jobId: id },
            query: SEEK_GQL_QUERY
          })
        });
        if (!res.ok) continue;
        const data = await res.json();
        const job = data && data.data && data.data.jobDetails && data.data.jobDetails.job;
        const parsed = parseSeekGraphqlJob(job, origin + "/job/" + id);
        if (parsed) return parsed;
      } catch {
        /* try next endpoint */
      }
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function seekBlockError(url, status) {
  const hasFc = !!process.env.FIRECRAWL_API_KEY;
  return emptyFail(
    url,
    `HTTP ${status || 403} fetching listing` +
      (isSeekJobUrl(url)
        ? ". SEEK blocks automated fetches from this server" +
          (hasFc
            ? " (Firecrawl fallback also failed)."
            : ". Paste the JD (or page HTML via { html }) manually, or set FIRECRAWL_API_KEY.")
        : "")
  );
}

export async function fetchAndParseJobUrl(url) {
  const original = String(url || "").trim();
  const fetchUrl = normalizeJobFetchUrl(original) || original;
  try {
    /* SEEK: try GraphQL first — bypasses Cloudflare HTML challenges on Vercel egress. */
    if (isSeekJobUrl(fetchUrl) || isSeekJobUrl(original)) {
      const jobId = seekJobIdFromUrl(fetchUrl) || seekJobIdFromUrl(original);
      if (jobId) {
        const gql = await fetchSeekViaGraphql(jobId);
        if (gql && gql.ok) return { ...gql, url: original, fetchUrl };
      }
    }

    const direct = await fetchHtmlDirect(fetchUrl);
    let html = direct.html || "";
    const blocked =
      !direct.ok ||
      looksLikeCloudflareChallenge(html) ||
      direct.status === 403;

    const ehUrl = isEmploymentHeroJobUrl(fetchUrl) || isEmploymentHeroJobUrl(original);

    if (!blocked) {
      const parsed = parseJobPostingFromHtml(html, original);
      if (parsed.ok) return { ...parsed, fetchUrl };
      if (!isSeekJobUrl(fetchUrl) && !ehUrl) return { ...parsed, fetchUrl };
      if (ehUrl && !looksLikeEmploymentHeroSignIn(html)) {
        return { ...parsed, fetchUrl };
      }
    }

    if (isSeekJobUrl(fetchUrl) || ehUrl || blocked) {
      const fcHtml = await fetchHtmlViaFirecrawl(fetchUrl);
      if (fcHtml && !looksLikeCloudflareChallenge(fcHtml)) {
        const parsed = parseJobPostingFromHtml(fcHtml, original);
        if (parsed.ok) return { ...parsed, fetchUrl, source: parsed.source || "firecrawl" };
        if (ehUrl) return { ...parsed, fetchUrl };
      }
      if (blocked) return { ...seekBlockError(original, direct.status || 403), fetchUrl };
      if (ehUrl) {
        return {
          ...parseJobPostingFromHtml(html, original),
          fetchUrl
        };
      }
      return {
        ...parseJobPostingFromHtml(html, original),
        fetchUrl
      };
    }

    return {
      ...emptyFail(original, "HTTP " + direct.status + " fetching listing"),
      fetchUrl
    };
  } catch (e) {
    const msg = e && e.name === "AbortError" ? "Request timed out" : e.message || "Fetch failed";
    return emptyFail(original, msg);
  }
}

export async function scrapeJobUrls(urls, { concurrency = 3 } = {}) {
  const list = Array.isArray(urls) ? urls.filter(Boolean) : [];
  const results = new Array(list.length);
  let i = 0;
  async function worker() {
    for (;;) {
      const idx = i++;
      if (idx >= list.length) break;
      results[idx] = await fetchAndParseJobUrl(list[idx]);
    }
  }
  const workers = Math.min(concurrency, list.length || 1);
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return results;
}
