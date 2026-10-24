// Shared mocks for the tailor test harness (no network, no real Anthropic SDK).

import crypto from "crypto";
export function sha256(s) { return crypto.createHash("sha256").update(s).digest("hex"); }

/** In-memory blob store mock with the put/get/del surface tailor.js expects. */
export function mockBlobs() {
  const store = new Map();
  return {
    store,
    put: async (path, body) => { store.set(path, body); return { pathname: path, url: "https://blob/" + path }; },
    get: async (path) => {
      if (!store.has(path)) { const e = new Error("Blob not found"); e.name = "BlobNotFoundError"; throw e; }
      return { text: async () => store.get(path) };
    },
    del: async (paths) => {
      for (const p of (Array.isArray(paths) ? paths : [paths])) store.delete(p);
    }
  };
}

/** A golden KB payload (mini version of the frontend's buildKbPayload output). */
export const goldenKb = {
  version: "kb-golden-1",
  profile: { name: "Test User", location: "Sydney, Australia" },
  evidence: [
    { id: "EV-1", text: "Nine years at Cubewise (Jan 2017 – Jan 2026, North Sydney NSW) as Lead AI Architect & Product Owner: enterprise white-label FP&A SaaS (React/Node/MongoDB) + GenAI assistant (Python/TypeScript on GCP)." },
    { id: "EV-2", text: "Designed and delivered AVA from vision to production (Sep 2025): LangGraph multi-step agent with human-in-the-loop gates, LlamaIndex RAG grounded on TM1 financial data, Vertex AI model selection, Ragas/LangSmith evaluation, responsible-AI controls." },
    { id: "EV-3", text: "Deployed at Amazon, AWS, ZKB — passed governance reviews of three of the world's most demanding enterprise clients." },
    { id: "EV-4", text: "Owned roadmap, backlog, stakeholder alignment; mentored 10+ developers; established AI-assisted development standards (Claude/Cursor/Codex)." },
    { id: "EV-5", text: "React front end, Node.js/NestJS services, MongoDB/PostgreSQL on AWS/GCP; 7+ white-label enterprise deployments (Westpac, Amazon, AWS, Optus, Goodman, Everlight, ZKB) with zero-downtime releases." },
    { id: "EV-6", text: "Streaming via SSE/WebSockets on TM1-scale analytics workloads; Tailwind-based UI craft; digital design foundation (ShapiroGraphics/Telstra/Optus)." },
    { id: "EV-7", text: "Backend services: Node.js/NestJS, Python (FastAPI, Flask), REST/GraphQL, C#/.NET fundamentals; production REST ownership end to end — auth, rate limits, versioning, outage response." },
    { id: "EV-8", text: "CI/CD (GitHub Actions, Cloud Build), Docker/K8s (GKE/EKS), Terraform, GitOps (ArgoCD), observability (Prometheus/Grafana/Sentry/Datadog); Google Cloud: Cloud Run, Vertex AI, Cloud Build." },
    { id: "EV-9", text: "Education: TAFE NSW Advanced Diploma of Graphic Design (2002–2004); Apliqo UX Certified Professional; National Police Check (current); Australian citizen with full working rights." }
  ],
  entities: [
    { name: "React" }, { name: "TypeScript" }, { name: "Node.js", aliases: ["NodeJS"] },
    { name: "NestJS" }, { name: "Python" }, { name: "FastAPI" }, { name: "Flask" },
    { name: "LangGraph" }, { name: "LangChain" }, { name: "LlamaIndex" }, { name: "RAG" },
    { name: "Vertex AI" }, { name: "Ragas" }, { name: "LangSmith" }, { name: "Cloud Run" },
    { name: "Cloud Build" }, { name: "GCP" }, { name: "AWS", aliases: ["Amazon Web Services"] },
    { name: "Docker" }, { name: "Kubernetes", aliases: ["GKE", "EKS"] }, { name: "Terraform" },
    { name: "ArgoCD" }, { name: "GitHub Actions" }, { name: "Prometheus" }, { name: "Grafana" },
    { name: "Sentry" }, { name: "Datadog" }, { name: "MongoDB" }, { name: "PostgreSQL" },
    { name: "Redis" }, { name: "pgvector" }, { name: "GraphQL" }, { name: "gRPC" },
    { name: "SSE" }, { name: "WebSockets" }, { name: "REST" },
    { name: "Google Cloud", aliases: ["Google Cloud Platform", "Google"] }, { name: "Tailwind", aliases: ["Tailwind CSS"] },
    { name: "MUI" }, { name: "Next.js" }, { name: "Express" }, { name: "C#", aliases: [".NET", ".NET 8", "NET"] },
    { name: ".NET", aliases: [".NET 8", "NET", "ASP.NET", "ASP.NET Core"] },
    { name: "ASP.NET", aliases: ["ASP.NET Core", "ASP"] },
    { name: "WTE", aliases: ["WTE Navigator"] },
    { name: "ManaposeGP", aliases: ["ManaPoseGP"] },
    { name: "JavaScript" }, { name: "HTML5" }, { name: "CSS3" }, { name: "Redux" },
    { name: "Prisma" }, { name: "EF Core" }, { name: "OpenTelemetry" }, { name: "Jest" },
    { name: "Vitest" }, { name: "Playwright" }, { name: "xUnit" },
    { name: "AVA" }, { name: "Apliqo UX" }, { name: "TM1" }, { name: "Cubewise" },
    { name: "Westpac" }, { name: "Amazon" }, { name: "Optus" }, { name: "Goodman" },
    { name: "Everlight" }, { name: "ZKB" }, { name: "Telstra" }, { name: "ShapiroGraphics" },
    { name: "Stripe" }, { name: "Cognito" }, { name: "Vercel" },
    { name: "Claude", aliases: ["Claude Code"] }, { name: "Cursor" }, { name: "Codex" },
    { name: "OpenAI" }, { name: "Anthropic" },
    { name: "TAFE NSW", aliases: ["TAFE"] }, { name: "Advanced Diploma of Graphic Design" },
    { name: "Apliqo UX Certified Professional" }, { name: "National Police Check" },
    { name: "Working With Children Check" }, { name: "AWS Solutions Architect Associate" },
    { name: "Google Cloud Professional Cloud Developer" },
    { name: "TokenizMyApp", aliases: ["TMA"] }
  ]
};

/**
 * Deterministic mock Anthropic client: simulates the 6-step pipeline without
 * network. The "analyst" is a simple rule-based extractor over the JD so the
 * golden-set assertions test the HARNESS + GUARDS (not LLM quality).
 * onCall (optional) counts LLM invocations.
 */
export function mockAnalyst(jd, kb, onCall) {
  let calls = 0;
  const text = (t) => ({ content: [{ type: "text", text: t }] });
  const extract = (jdText) => {
    const lines = jdText.split("\n").map(l => l.trim());
    const essentials = [], desirable = [];
    let bucket = essentials;
    let n = 0, d = 0;
    for (const line of lines) {
      if (/^essential/i.test(line)) { bucket = essentials; continue; }
      if (/^(desirable|preferred)/i.test(line)) { bucket = desirable; continue; }
      if (!line.startsWith("-")) continue;
      const item = { id: (bucket === essentials ? "R" : "D") + (bucket === essentials ? ++n : ++d), text: line.slice(1, 400), keywords: line.split(/[\s,]+/).slice(1, 6) };
      if (bucket === essentials && essentials.length < 8) essentials.push(item);
      else if (bucket === desirable && desirable.length < 6) desirable.push(item);
    }
    const ats = (jdText.match(/\b(React|TypeScript|Node\.js|Java|Kubernetes|Terraform|Vertex AI|Dialogflow CX|Apigee|WebSockets|Vite|Tailwind|Storybook|Python|RAG|LLM)\b/g) || []);
    return {
      role: (jdText.split("\n")[0] || "Role").slice(0, 200),
      seniority: /senior|lead|principal/i.test(jdText) ? "senior" : "unknown",
      essentials: essentials.map(e => ({ id: e.id, text: e.text, keywords: e.keywords })),
      desirable: desirable.map(e => ({ id: e.id, text: e.text, keywords: e.keywords })),
      atsTerms: [...new Set(ats)].slice(0, 20)
    };
  };

  return {
    messages: {
      create: async (params) => {
        calls++;
        if (onCall) onCall();
        const sys = params.system || "";
        if (sys.startsWith("You are a precise technical recruiter")) {
          return text(JSON.stringify(extract(jd)));
        }
        if (sys.startsWith("You map candidate evidence")) {
          const reqs = JSON.parse(/REQUIREMENTS: (\{[\s\S]*\})/.exec(sys)[1]);
          const evIds = kb.evidence.map(e => e.id);
          return text(JSON.stringify({
            mappings: reqs.essentials.concat(reqs.desirable).map(r => {
              const lower = r.text.toLowerCase();
              // deliberate fabrication probe: a requirement mentioning a fake tool gets a FAKE evidence id
              const fabricated = /flubber/i.test(r.text);
              return {
                requirementId: r.id,
                verdict: fabricated ? "strong" : /java|apigee|dialogflow|vite|storybook|agentstudio/i.test(lower) ? "gap" : "strong",
                evidenceIds: fabricated ? ["EV-FAKE-999"].concat(evIds.slice(0, 2)) : evIds.slice(0, 2),
                note: fabricated ? "cites evidence that does not exist" : "mapped from KB"
              };
            })
          }));
        }
        if (sys.startsWith("You are a career-narrative architect")) {
          return text(JSON.stringify({
            positioning: "Production conversational-AI engineer who ships to enterprise scale.",
            metaLine: "Production GenAI · React/TypeScript streaming · GCP/Vertex AI",
            openingHook: "I ship production conversational AI — most recently AVA, live at Amazon, AWS and ZKB.",
            themes: [
              { title: "Production conversational and generative AI features at enterprise scale.", evidenceIds: ["EV-1", "EV-2", "EV-3"] },
              { title: "AI quality: testing non-deterministic model behaviour in production.", evidenceIds: ["EV-2"] },
              { title: "Real-time streaming front ends in React and TypeScript.", evidenceIds: ["EV-5", "EV-6"] },
              { title: "Backend services and API integration end to end.", evidenceIds: ["EV-7"] },
              { title: "Cross-functional delivery on Google Cloud.", evidenceIds: ["EV-8", "EV-4"] }
            ],
            gapStories: [
              { gapTool: "Dialogflow CX", transferStory: "same flow/intent/fulfilment concepts already built on Vertex AI and LangGraph.", evidenceIds: ["EV-2"] }
            ]
          }));
        }
        if (sys.startsWith("You are a document composer")) {
          return text(JSON.stringify({
            letterBodyHTML: '<p class="salutation">Dear Hiring Team,</p><p>I ship production conversational AI with React, TypeScript, LangGraph, Vertex AI and Ragas evaluation at Cubewise — deployed at Amazon, AWS and ZKB.</p><h2>What I bring to the role</h2><ol class="themes"><li><strong class="num">1. Production conversational and generative AI.</strong><p class="body">LangGraph agent, LlamaIndex RAG, Vertex AI — launched September 2025.</p></li><li><strong class="num">2. AI quality.</strong><p class="body">Ragas faithfulness, LangSmith tracing, prompt regression testing.</p></li><li><strong class="num">3. Streaming front end.</strong><p class="body">React/TypeScript streaming UX over SSE/WebSockets.</p></li><li><strong class="num">4. Backend and API integration.</strong><p class="body">Node.js, Python, REST ownership end to end.</p></li></ol><p>I am Sydney-based with full working rights.</p><div class="signoff"><p>Kind regards,</p><p class="name">Test User</p></div>',
            cv: {
              summaryParas: [
                "Senior full stack engineer specialising in conversational systems and generative AI features in production — AVA shipped to Amazon, AWS and ZKB.",
                "React/TypeScript streaming UX plus Node.js/Python services on Google Cloud."
              ],
              metaLine: "Production GenAI · React/TypeScript streaming · GCP",
              skillsRows: [
                { cat: "AI / ML", text: "LangGraph, LangChain, LlamaIndex, RAG, Vertex AI, Ragas, LangSmith" },
                { cat: "Frontend", text: "React, TypeScript, Next.js, Tailwind" },
                { cat: "Backend", text: "Node.js, NestJS, Python (FastAPI), REST, GraphQL" }
              ],
              techRows: [
                { cat: "Front-end frameworks", chips: ["React", "TypeScript"] },
                { cat: "AI / ML", chips: ["LangGraph", "Vertex AI"] }
              ],
              experienceBlocks: [
                { header: "CUBEWISE — Lead AI Architect & Product Owner", sub: "Jan 2017 – Jan 2026 · North Sydney, NSW", lines: [], groups: [{ sub: "AVA — Enterprise GenAI Assistant", bullets: ["Designed and delivered AVA from vision to production (Sep 2025)."] }], products: [] }
              ],
              education: ["TAFE NSW — Advanced Diploma of Graphic Design (2002–2004)", "Apliqo UX Certified Professional"],
              projects: [{ name: "TMA", url: "https://tokenizmyapp.vercel.app/" }],
              references: "Available on request."
            }
          }));
        }
        if (sys.startsWith("You are a ruthless application critic")) {
          return text(JSON.stringify({ coverageIssues: [], weakClaims: [], toneOk: true, needsRevision: false, revisionNotes: "" }));
        }
        if (sys.startsWith("You are an ATS simulator")) {
          return text(JSON.stringify({
            coveragePercent: 85,
            matchedTerms: ["React", "TypeScript", "Node.js"],
            missingTerms: ["Kubernetes"],
            warnings: []
          }));
        }
        return text("{}");
      }
    }
  };
}
