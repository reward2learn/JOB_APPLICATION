import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  parseJobUrlsFromText,
  companyFromDocumentTitle,
  parseJobPostingFromHtml,
  parseSeekListingFromHtml,
  normalizeJobFetchUrl,
  isSeekJobUrl,
  looksLikeCloudflareChallenge,
  extractSeekEmployerQuestions,
  parseSeekGraphqlJob,
  parseEmploymentHeroJobData,
  parseEmploymentHeroListingFromHtml,
  isEmploymentHeroJobUrl,
  looksLikeEmploymentHeroSignIn
} from "../lib/scrape-jd.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const seekFixture = readFileSync(join(__dirname, "fixtures/seek-job.html"), "utf8");
const ehFixture = readFileSync(join(__dirname, "fixtures/employmenthero-next-data.html"), "utf8");

test("parseJobUrlsFromText handles numbered lines and commas", () => {
  const text = `
1.https://www.viewjobs.com.au/listing/aaa ,
2. https://www.viewjobs.com.au/listing/bbb
https://example.com/job/1
`;
  const urls = parseJobUrlsFromText(text);
  assert.equal(urls.length, 3);
  assert.ok(urls[0].includes("aaa"));
});

test("parseJobUrlsFromText handles quoted comma-separated lists", () => {
  const text =
    '"https://www.viewjobs.com.au/listing/aaa", "https://www.viewjobs.com.au/listing/bbb", ' +
    '"https://www.viewjobs.com.au/listing/ccc"';
  const urls = parseJobUrlsFromText(text);
  assert.equal(urls.length, 3);
  assert.ok(urls.every(u => /^https:\/\/www\.viewjobs\.com\.au\/listing\//.test(u)));
});

test("parseJobUrlsFromText strips curly quotes around URLs", () => {
  const text = "\u201chttps://www.viewjobs.com.au/listing/x\u201d, \u201chttps://example.com/y\u201d";
  const urls = parseJobUrlsFromText(text);
  assert.deepEqual(urls, [
    "https://www.viewjobs.com.au/listing/x",
    "https://example.com/y"
  ]);
});

test("companyFromDocumentTitle parses ViewJobs title", () => {
  assert.equal(
    companyFromDocumentTitle("AI Developer — ISS Facility Services | ViewJobs"),
    "ISS Facility Services"
  );
});

test("parseJobPostingFromHtml extracts JobPosting fields", () => {
  const html = `<html><head><title>Senior Dev — Acme Pty Ltd | ViewJobs</title>
<script type="application/ld+json">{"@type":"JobPosting","title":"Senior Dev","description":"<p>Build things with Python and SQL every day.</p>","hiringOrganization":{"name":"Acme Pty Ltd"},"jobLocation":{"address":{"addressLocality":"Sydney","addressRegion":"NSW"}},"employmentType":"FULL_TIME"}</script></head></html>`;
  const r = parseJobPostingFromHtml(html, "https://example.com/x");
  assert.equal(r.ok, true);
  assert.equal(r.title, "Senior Dev");
  assert.equal(r.company, "Acme Pty Ltd");
  assert.ok(r.location.includes("Sydney"));
  assert.match(r.jd, /Python and SQL/);
});

test("normalizeJobFetchUrl canonicalizes SEEK hosts to au.seek.com/job/{id}", () => {
  assert.equal(
    normalizeJobFetchUrl("https://www.seek.com.au/job/95314583?ref=search&type=standard#anchor"),
    "https://au.seek.com/job/95314583"
  );
  assert.equal(
    normalizeJobFetchUrl("https://au.seek.com/job/95314583?tracking=ILC"),
    "https://au.seek.com/job/95314583"
  );
  assert.equal(isSeekJobUrl("https://www.seek.com.au/job/1"), true);
  assert.equal(isSeekJobUrl("https://www.viewjobs.com.au/listing/x"), false);
});

test("parseSeekListingFromHtml reads data-automation fields + employer questions", () => {
  const r = parseSeekListingFromHtml(seekFixture, "https://au.seek.com/job/95314583");
  assert.equal(r.ok, true);
  assert.equal(r.title, "Full Stack Developer");
  assert.equal(r.company, "Wirrigan Group");
  assert.match(r.location, /Sydney NSW/);
  assert.match(r.jd, /Full Stack Developer/);
  assert.match(r.jd, /Vue\.js/);
  assert.ok(Array.isArray(r.applicationQuestions));
  assert.equal(r.applicationQuestions.length, 2);
  assert.match(r.applicationQuestions[0], /right to work in Australia/);
  assert.match(r.applicationQuestions[1], /AWS Lambda/);
});

test("parseJobPostingFromHtml prefers SEEK HTML over empty JobPosting JSON-LD", () => {
  const r = parseJobPostingFromHtml(seekFixture, "https://www.seek.com.au/job/95314583");
  assert.equal(r.ok, true);
  assert.equal(r.title, "Full Stack Developer");
  assert.equal(r.company, "Wirrigan Group");
  assert.equal(r.source, "seek-html");
  assert.ok(r.applicationQuestions.length >= 1);
});

test("extractSeekEmployerQuestions finds list under heading", () => {
  const qs = extractSeekEmployerQuestions(seekFixture);
  assert.equal(qs.length, 2);
});

test("looksLikeCloudflareChallenge detects CF interstitial", () => {
  const challenge =
    '<html><title>SEEK</title><span>Help us keep SEEK secure, confirm you are human.</span>' +
    '<script>window._cf_chl_opt={}</script></html>';
  assert.equal(looksLikeCloudflareChallenge(challenge), true);
  assert.equal(looksLikeCloudflareChallenge(seekFixture), false);
});

test("isEmploymentHeroJobUrl detects SmartMatch career job links", () => {
  assert.equal(
    isEmploymentHeroJobUrl(
      "https://jobs.employmenthero.com/AU/sm_career_jobs/e76b180a-32fe-4d03-93ff-41c128557e48?token=x"
    ),
    true
  );
  assert.equal(isEmploymentHeroJobUrl("https://www.seek.com.au/job/1"), false);
});

test("parseEmploymentHeroListingFromHtml reads __NEXT_DATA__.jobData", () => {
  const url =
    "https://jobs.employmenthero.com/AU/sm_career_jobs/e76b180a-32fe-4d03-93ff-41c128557e48";
  const r = parseEmploymentHeroListingFromHtml(ehFixture, url);
  assert.equal(r.ok, true);
  assert.equal(r.title, "Senior Software Engineer (Remote, Indonesia)");
  assert.equal(r.company, "Employment Hero");
  assert.match(r.location, /Indonesia/);
  assert.match(r.jd, /RESTful APIs/);
  assert.match(r.jd, /Company Overview/);
  assert.equal(r.source, "employmenthero-next-data");
});

test("parseEmploymentHeroJobData maps jobData object", () => {
  const r = parseEmploymentHeroJobData(
    {
      title: "Engineer",
      organisation_name: "Acme",
      vendor_location_name: "Sydney",
      description: "<p>Ship features with Ruby and PostgreSQL every week.</p>"
    },
    "https://jobs.employmenthero.com/AU/sm_career_jobs/00000000-0000-4000-8000-000000000001"
  );
  assert.ok(r && r.ok);
  assert.match(r.jd, /Ruby and PostgreSQL/);
});

test("looksLikeEmploymentHeroSignIn detects sign-in interstitial", () => {
  const signIn =
    '<html><script id="__NEXT_DATA__" type="application/json">{"page":"/sign_in"}</script>' +
    "<h2>Meet your job match</h2></html>";
  assert.equal(looksLikeEmploymentHeroSignIn(signIn), true);
  assert.equal(looksLikeEmploymentHeroSignIn(ehFixture), false);
});

test("parseSeekGraphqlJob maps GraphQL job payload", () => {
  const r = parseSeekGraphqlJob(
    {
      title: "Full Stack Developer",
      content: "<p>Build apps with Vue.js and Node.js every day on AWS Lambda.</p>",
      advertiser: { name: "Wirrigan Group" },
      location: { label: "Sydney NSW" },
      workTypes: { label: "Contract/Temp" },
      products: {
        questionnaire: {
          questions: ["Which of the following statements best describes your right to work in Australia?"]
        }
      }
    },
    "https://au.seek.com/job/95314583"
  );
  assert.ok(r && r.ok);
  assert.equal(r.title, "Full Stack Developer");
  assert.equal(r.company, "Wirrigan Group");
  assert.equal(r.location, "Sydney NSW");
  assert.match(r.jd, /Vue\.js/);
  assert.equal(r.applicationQuestions.length, 1);
  assert.equal(r.source, "seek-graphql");
});
