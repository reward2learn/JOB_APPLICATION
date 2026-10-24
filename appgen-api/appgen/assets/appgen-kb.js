/* Application Generator — knowledge base (global KB). */
"use strict";

/* KNOWLEDGE BASE — embedded, structured, keyword-tagged.
      CANONICAL OVERRIDES APPLIED (the source txt is stale in places):
        · Phone 0466 076 898 (never 0414 557 038 / +61 4XX)
        · Email reward2learn@gmail.com
        · GitHub github.com/reward2learn
        · Sydney, Australia (not Melbourne)
        · NO degree — TAFE NSW Advanced Diploma of Graphic Design + Apliqo cert
        · Cubewise: North Sydney NSW, Jan 2017 – Jan 2026 (role made redundant)
   ========================================================================== */

const KB = {
  profile: {
    name: "Ilia Shapiro",
    location: "Sydney, Australia",
    phone: "0466 076 898",
    email: "reward2learn@gmail.com",
    linkedin: "linkedin.com/in/iliashapiro",
    linkedinUrl: "https://linkedin.com/in/iliashapiro",
    github: "github.com/reward2learn",
    githubUrl: "https://github.com/reward2learn",
    workRights: "Unrestricted work rights in Australia (citizen)",
    availability: "Available immediately"
  },

  summary: {
    intro: "Full Stack Developer with 9 years' experience designing, building and operating enterprise-grade web applications end to end. Recently Lead AI Architect & Product Owner at Cubewise, where I took an enterprise GenAI assistant (AVA) from vision to production launch at Amazon, AWS and ZKB — React/Next.js front end, Node.js/Python services, MongoDB/PostgreSQL, GCP/AWS, LangGraph/LlamaIndex/RAG, Ragas/LangSmith evaluation, and full CI/CD with GitOps.",
    introPM: "Product Owner and Lead AI Architect with 9 years' experience taking enterprise products from vision to production. At Cubewise I owned the roadmap, backlog and stakeholder alignment for AVA — an enterprise GenAI assistant launched at Amazon, AWS and ZKB in September 2025 — while also architecting the platform end to end: React/Next.js front end, Node.js/Python services, MongoDB/PostgreSQL, GCP/AWS, LangGraph/LlamaIndex/RAG, Ragas/LangSmith evaluation, and full CI/CD with GitOps.",
    stack: "Core stack: React/Next.js, TypeScript, Node.js/NestJS, Python, C# (.NET fundamentals), MongoDB, PostgreSQL, MySQL, SQL, REST/GraphQL, Docker, Kubernetes (GKE/EKS), Terraform, GitHub Actions, Cloud Build, ArgoCD, Prometheus/Grafana/Sentry/Datadog.",
    aiAssisted: "AI-assisted delivery: daily practitioner of Claude Code, Cursor and Codex — shipped 5 live products AI-natively in 2024–25 (multi-tenant SaaS, OAuth/RBAC dashboards, booking platform, marketplace, LangGraph copilots). I write the specs, context and guardrails that make agents useful on real codebases.",
    seeking: "Seeking: {ROLE} at {COMPANY} to apply enterprise-grade craft across the full lifecycle — ticket to production, vision to launch."
  },

  skillsRows: [
    { cat: "Frontend", text: "Angular (Apliqo UX platform, 2017–2024), React, Next.js (App Router), TypeScript, JavaScript (ES6+), HTML5, CSS3, Tailwind, MUI, Redux Toolkit, RTK Query, WebSockets/SSE, responsive/mobile-first",
      tags: ["Angular", "React", "Next.js", "TypeScript", "JavaScript", "Frontend", "Tailwind", "Redux", "Full lifecycle"] },
    { cat: "Backend", text: "Java (Cubewise Arc and enterprise services), Node.js, NestJS, Express, Python (FastAPI, Flask), C# / .NET 8 (controllers, DI, EF Core, minimal APIs), REST, GraphQL, gRPC, SSE/WebSockets",
      tags: ["Java", "Node.js", "Python", "NestJS", "FastAPI", "REST APIs", "GraphQL", "gRPC", "Microservices", "C#/.NET"] },
    { cat: "Databases", text: "MongoDB (production at enterprise scale), PostgreSQL, MySQL, SQL (advanced), Prisma, EF Core, vector stores (pgvector), Redis",
      tags: ["MongoDB", "PostgreSQL", "MySQL", "SQL", "Redis", "Vector stores", "Data"] },
    { cat: "BI / Data", text: "Tableau, Power BI, Apache Spark, Snowflake, Databricks, dbt, ETL/ELT pipelines — BI and warehouse tooling alongside TM1/FP&A analytics context",
      tags: ["Tableau", "Power BI", "Spark", "Snowflake", "Databricks", "dbt", "ETL", "Data", "FP&A/Finance"] },
    { cat: "Cloud / DevOps", text: "AWS (ECS, Lambda, RDS, S3, CloudFront), GCP (Cloud Run, Vertex AI, Cloud Build), Azure (App Service, Functions), Docker, Kubernetes (GKE/EKS), Helm, Terraform, GitHub Actions, Cloud Build, ArgoCD (GitOps), feature flags, blue-green/canary, API versioning",
      tags: ["AWS", "GCP", "Azure", "Docker", "Kubernetes", "Terraform", "CI/CD", "GitOps", "DevOps", "Helm"] },
    { cat: "Observability", text: "Prometheus, Grafana, Sentry, Datadog, OpenTelemetry, structured logging, SLO-driven alerting",
      tags: ["Observability", "Performance", "Streaming"] },
    { cat: "AI / ML", text: "LangGraph, LangChain, LlamaIndex, RAG (grounded on enterprise data), Vertex AI, OpenAI/Anthropic APIs, Ragas, LangSmith, prompt engineering, eval pipelines",
      tags: ["GenAI", "LLM", "RAG", "AI agents", "Prompt engineering", "Vertex AI", "OpenAI/Anthropic APIs", "AI-assisted dev", "AI (general)", "Machine learning"] },
    { cat: "CMS / AEM", text: "AEM 6.5 / Cloud Service — component development (HTL/Sightly), Core Components, ClientLibs, OSGi services, Sling Models, Dispatcher config, content fragments, GraphQL API, Cloud Manager pipelines",
      tags: ["AEM", "CMS"] },
    { cat: "Practices", text: "TDD/unit/integration/e2e (Vitest, Jest, Playwright, xUnit), code review, Agile/Scrum, trunk-based development, ADRs, threat modeling, OWASP",
      tags: ["Testing", "Agile", "Security", "Governance", "Leadership", "Stakeholder management", "Product management", "Roadmap", "Cross-functional", "Design/UX", "SaaS", "Founder", "FP&A/Finance"] }
  ],

  experience: {
    cubewise: {
      company: "CUBEWISE",
      role: "Lead AI Architect & Product Owner (Apliqo UX / AVA)",
      dates: "Jan 2017 – Jan 2026 (9 years) · North Sydney, NSW",
      note: "Role made redundant — available immediately.",
      blurb: "Enterprise white-label FP&A SaaS (Angular/Java/Node, MongoDB) + AVA GenAI (React/Python on GCP)",
      groups: [
        { sub: "AVA — Enterprise GenAI Assistant (Product Owner + Lead Architect)", bullets: [
          "Designed and delivered AVA from vision to production (Sep 2025): LangGraph multi-step agent with human-in-the-loop gates, LlamaIndex RAG grounded on TM1 financial data, Vertex AI model selection, Ragas/LangSmith evaluation, responsible-AI controls.",
          "Deployed at Amazon, AWS, ZKB — passed governance reviews of three of the world's most demanding enterprise clients.",
          "Owned roadmap, backlog, stakeholder alignment; mentored 10+ developers on AI patterns; established AI-assisted development standards (Claude/Cursor/Codex)."
        ]},
        { sub: "Apliqo UX Platform (Full Stack + Platform Engineering)", bullets: [
          "Apliqo UX (2017–2024): developed the enterprise white-label FP&A SaaS platform — Angular front end, Java and Node.js services, MongoDB/PostgreSQL — deployed to 7+ clients (Westpac, Amazon, AWS, Optus, Goodman, Everlight, ZKB).",
          "Cubewise Arc and related Java applications: built and maintained TM1/Planning Analytics integration tooling and server-side components used in client delivery.",
          "Platform engineering on AWS/GCP — CI/CD (GitHub Actions + Cloud Build), Docker/K8s (GKE/EKS), Terraform, GitOps (ArgoCD), observability (Prometheus/Grafana/Sentry/Datadog).",
          "Zero-downtime releases via feature flags, API versioning and blue-green deployments; performance engineering on TM1-scale workloads (web server optimisation, SSE/WebSockets)."
        ]},
        { sub: "AEM / CMS Experience", bullets: [
          "Implemented AEM 6.5 component library (HTL, Core Components, ClientLibs, Sling Models) for marketing sites feeding into the SaaS platform.",
          "Configured Dispatcher/CDN caching, content fragments, GraphQL endpoints for headless consumption by React apps.",
          "Managed Cloud Manager pipelines for dev/stage/prod promotion."
        ]}
      ]
    },
    freelance: {
      company: "FREELANCE / AI-NATIVE PRODUCTS (Claude/Cursor/Codex)",
      role: "Founder / Lead Engineer",
      dates: "2023–2025 · Remote",
      blurb: "5 live products built AI-natively, end to end",
      products: [
        { name: "TMA (TokenizMyApp)", stack: "Next.js, TypeScript, PostgreSQL, Prisma, ZenStack, Stripe", highlights: "Multi-tenant SaaS factory: tenant provisioning, metrics dashboards, AI chat, wallet/SIWE (Reown AppKit), Stripe billing — root config for parameterized business apps", url: "https://tokenizmyapp.vercel.app/" },
        { name: "TMA Finance", stack: "Next.js, Node, PostgreSQL", highlights: "CEO dashboard, Google OAuth, OAuth/RBAC, staff-PIN RBAC, AI chat", url: "https://tokenizmyapp-finance.vercel.app/" },
        { name: "PRESTIX.VIP", stack: "Next.js, TypeScript, PostgreSQL/ZenStack, Stripe", highlights: "VIP venue booking, cart, table-reservation ordering, high-volume transactional flows; companion SIWE/OAuth auth module (email OTP, Google, JWT sessions, 2FA)", url: "https://prestix.vip/" },
        { name: "WTE — Indonesia Waste-to-Energy Copilot", stack: "Python 3.12, FastAPI, LangGraph, Vertex Gemini, Chroma, Firestore, Cloud Run", highlights: "Grounded copilot for Indonesia carbon & WTE market: LangGraph supervisor + specialists, section-aware Chroma RAG, FastAPI SSE streaming, Firestore history, Ragas eval on GCP Cloud Run", url: "https://wte-copilot-670560975972.us-central1.run.app/" },
        { name: "GoFetch", stack: "Next.js, TypeScript, Python, Solidity", highlights: "P2P cross-border marketplace: TypeScript UI, Python services, smart-contract escrows and stablecoin settlement", url: "https://gofetchapp.vercel.app/" }
      ],
      footer: "All products: CI/CD (GitHub Actions), Docker, feature flags, automated testing (Vitest/Playwright), deployed to Vercel/AWS/GCP."
    },
    early: {
      company: "SHAPIROGRAPHICS / TELSTRA / OPTUS",
      role: "Digital Design & Development",
      dates: "2012–2016 · Sydney/Melbourne",
      blurb: "Client-facing web design and development for enterprise telco accounts. Origin of craft: empty states, error messages, loading flickers — noticed without being asked."
    }
  },

  education: [
    "TAFE NSW — Advanced Diploma of Graphic Design (2002–2004)",
    "Apliqo UX Certified Professional",
    "Valid Employee Working With Children Check (VIC/NSW)",
    "National Police Check (current)",
    "Unrestricted work rights in Australia (Citizen)",
    "AWS Solutions Architect Associate (in progress)",
    "Google Cloud Professional Cloud Developer (in progress)"
  ],

  projectsNote: "All built AI-natively (Claude/Cursor/Codex), deployed to production, actively maintained.",

  references: "Available on request — former Cubewise CTO, client stakeholders (Amazon/AWS/ZKB contacts), engineering leads.",

  /** Generator templates — section titles / limits (not role-specific copy). */
  template: {
    portfolioGroupSub: "Selected engineering evidence (GitHub portfolio)",
    letterPortfolioMax: 4,
    portfolioSummaryDoc: "GITHUB_REPO_SUMMARIES.md"
  },

  /** Single source for supplementary CV bullets, letter themes, gap analogues, tailor evidence. */
  githubPortfolio: [
    { name: "TokenizMyApp", repo: "reward2learn/tokenizmyapp", tags: ["Next.js", "SaaS", "PostgreSQL", "Stripe", "Full lifecycle"], cvBullet: "Multi-tenant Next.js/Prisma/ZenStack factory with Stripe and wallet auth patterns.", url: "https://tokenizmyapp.vercel.app/" },
    { name: "WTE — Indonesia Waste-to-Energy Copilot", repo: "reward2learn/wte", tags: ["Python", "FastAPI", "LangGraph", "RAG", "GCP", "GenAI"], cvBullet: "LangGraph + Chroma RAG + FastAPI SSE on Cloud Run (WTE Navigator / wte-copilot/).", url: "https://wte-copilot-670560975972.us-central1.run.app/" },
    { name: "AWS Bedrock chat", repo: "reward2learn/aws-chatbot", tags: ["Python", "AWS", "React", "MongoDB", "GenAI"], cvBullet: "FastAPI streaming API, React client, MongoDB sessions, Chrome extension." },
    { name: "Stripe reference store", repo: "reward2learn/simple-online-store-with-stripe", tags: ["Next.js", "Stripe", "TypeScript"], cvBullet: "Deployable Stripe storefront (Next.js + Radix).", url: "https://simple-online-store-with-stripe-five-rho.vercel.app" },
    { name: "NomadWorks IDE plugin", repo: "tokenizin/ide-agent-plugin", tags: ["AI-assisted dev", "Cursor", "MCP", "DevOps"], cvBullet: "Agent policies, skills, MCP servers, Cursor/VS Code scaffolding." },
    { name: "DevLynx", repo: "sonofthematrix/devlynx", tags: ["JavaScript", "Full lifecycle"], cvBullet: "Chrome extension + Vercel feed server (OpenAI, JWT, Blob).", url: "https://devlynx-black.vercel.app" },
    { name: "K-Club app", repo: "tokenizin-agency/kclub-ionic-react", tags: ["React", "Frontend"], cvBullet: "Ionic/Capacitor, Firebase auth, Apollo GraphQL.", url: "https://kclubapp.vercel.app" },
    { name: "GoFetch", repo: "reward2learn/GoFetch", tags: ["Next.js", "TypeScript", "Full lifecycle"], cvBullet: "Marketplace UI with Python services and Solidity escrows.", url: "https://gofetchapp.vercel.app" },
    { name: "App skeleton", repo: "tokenizin/app-skeleton", tags: ["Next.js", "NestJS", "CI/CD"], cvBullet: "OAuth-ready Next.js/Prisma greenfield starter.", url: "https://app-oauth-tokenizin-projects.vercel.app" },
    { name: "Prestix app", repo: "tokenizin/prestix.app", tags: ["Next.js", "TypeScript", "Security"], cvBullet: "SIWE/OAuth module: email OTP, Google, JWT sessions, 2FA.", url: "https://prestixapp.vercel.app" },
    { name: "StarGuard monorepo", repo: "tokenizin/contracts", tags: ["TypeScript", "Full lifecycle"], cvBullet: "Web3, 3D, and voice/AI integrations in a production monorepo.", url: "https://starguard.vercel.app" },
    { name: "CodeNomad", repo: "reward2learn/CodeNomad", tags: ["AI-assisted dev", "TypeScript"], cvBullet: "OpenCode AI coding cockpit fork (TypeScript/Rust)." },
    { name: "Living Museum", repo: "alexishapiro/living-museum-auto", tags: ["Next.js", "TypeScript"], cvBullet: "ZenStack/Prisma Next.js with Nivo charts and auth.", url: "https://living-museum-master.vercel.app" },
    { name: "Tokenizin site", repo: "tokenizin-agency/tokenizin-site", tags: ["React", "Frontend"], cvBullet: "Vite/React/Tailwind agency site with motion and screenshot automation.", url: "https://tokenizin-site.vercel.app" }
  ],

  /** JD gap key → portfolio-backed analogue bullets (honest; no gap meta in weave output). */
  gapAnalogueBullets: {
    analytics: [
      "Shipped metrics dashboards in TokenizMyApp (live multi-tenant SaaS).",
      "TMA Finance CEO dashboard — OAuth/RBAC gated operational metrics."
    ],
    mobile: [
      "K-Club — Ionic React + Capacitor builds for iOS/Android with Firebase auth (https://kclubapp.vercel.app).",
      "Primary strength remains responsive, mobile-first React/Next.js web at enterprise and product scale."
    ],
    experimentation: [
      "Production experimentation via feature flags, API versioning, and blue-green releases across 7+ white-label deployments.",
      "Ragas evaluation harness on WTE — Indonesia Waste-to-Energy Copilot before Cloud Run promotion."
    ],
    ml: [
      "Applied GenAI engineering (LangGraph, RAG, Ragas/LangSmith) on AVA and WTE — Indonesia Waste-to-Energy Copilot — not classical model training.",
      "AWS Bedrock and Vertex AI integrations in production chat and copilot products."
    ],
    "frontend-alt": [
      "Production Angular on Apliqo UX (2017–2024) across 7+ enterprise deployments; React/Next.js on AVA and freelance products.",
      "Tokenizin agency site: Vite/React/Tailwind (https://tokenizin-site.vercel.app)."
    ],
    figma: [
      "TAFE NSW Advanced Diploma of Graphic Design; enterprise telco web design (Telstra/Optus) — visual systems before component libraries."
    ]
  },

  /** Bump when live product catalog changes — triggers client settings scrub. */
  liveCatalogRevision: 2,

  /** Gainwise / ManaposeGP deployments paused — exclude from CV, letters, and evidence. */
  isRetiredLiveProduct(name, url) {
    const hay = (String(name || "") + " " + String(url || "")).toLowerCase();
    return /gainwise|manaposegp|manapose-gp|manapose/.test(hay);
  }
};
