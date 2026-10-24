# GitHub repository summaries — CV & cover letter weave source

Generated via `gh` CLI against authenticated account **reward2learn** (2026-10-17).  
Use **live URLs** in applications when public; for **private** repos, cite product name + stack + your role (code on request).

Raw machine JSON: `GITHUB_REPO_EVAL.json`

---

## How to weave into a JD

1. Extract JD keywords (cloud, AI/RAG, payments, mobile, Web3, etc.).
2. Pick 2–4 repos from the **Skill → repo index** at the bottom.
3. Drop **Suggested CV bullet** lines into Experience → Freelance or Projects; pair with **Live** URL when listed in `appgen-kb.js`.

---

## Platform & AI-native product line (2025–2026)

### reward2learn/tokenizmyapp
- **GitHub:** https://github.com/reward2learn/tokenizmyapp · **Public**
- **Product:** TokenizMyApp (TMA) — multi-tenant “tenant factory” / root config app; parameterized templates spawn business apps.
- **Stack:** Next.js, TypeScript, Prisma/Neon, ZenStack, Redux RTK, MUI, Stripe, Reown AppKit (SIWE/wallets), x402, Vercel AI SDK, multi-tenant `@tenants/shared`.
- **Live (KB):** https://tokenizmyapp.vercel.app/ · Finance variant: https://tokenizmyapp-finance.vercel.app/
- **JD keywords:** SaaS, multi-tenancy, Next.js, PostgreSQL, Stripe, Web3 auth, AI chat, dashboards.
- **CV bullet:** Built and shipped TokenizMyApp, a multi-tenant SaaS factory (Next.js, Prisma, ZenStack, Stripe, wallet/SIWE) with provisioning, metrics dashboards, and AI-assisted workflows on Vercel.

### reward2learn/Rosalita
- **GitHub:** https://github.com/reward2learn/Rosalita · **Public**
- **Product:** Revenue evaluation and business efficiency / tracking application (foundation stack for ManaposeGP).
- **Stack:** TypeScript, Rust (components), Make/shell tooling.
- **Live:** (no homepage on repo — pair with ManaposeGP)
- **JD keywords:** analytics, dashboards, TypeScript, full-stack.
- **CV bullet:** Developed Rosalita, a revenue and operational efficiency tracking platform that became the reference architecture for subsequent Next.js/ZenStack products.

### reward2learn/ManaposeGP
- **GitHub:** https://github.com/reward2learn/ManaposeGP · **Public**
- **Product:** Business operations dashboard + AI chatbot (health/decision-maker UX).
- **Stack:** Next.js 16 App Router, ZenStack + PostgreSQL, MUI v7, Redux RTK Query, JWT auth, charts (Chart.js), Puppeteer.
- **Live (KB):** https://manaposegp.vercel.app/
- **JD keywords:** Next.js, PostgreSQL, RBAC, dashboards, AI chat, enterprise UX.
- **CV bullet:** Shipped ManaposeGP — operations dashboard and AI chat on Next.js 16, ZenStack/Postgres, MUI, and RTK Query with enforced Redux patterns and CI checks.

### reward2learn/GoFetch
- **GitHub:** https://github.com/reward2learn/GoFetch · **Public**
- **Product:** Decentralized P2P cross-border shopping — travelers deliver goods; smart-contract escrow + stablecoin settlement.
- **Stack:** TypeScript (primary), Python services, Solidity, Next.js-style frontend.
- **Live:** https://gofetchapp.vercel.app
- **JD keywords:** marketplace, Web3, Solidity, escrows, fintech, TypeScript.
- **CV bullet:** Built GoFetch, a cross-border marketplace combining TypeScript frontend, Python backend services, and Solidity escrow flows with a live Vercel deployment.

### reward2learn/GAINEWISE
- **GitHub:** https://github.com/reward2learn/GAINEWISE · **Private**
- **Product:** Gainwise AWS account audit — VPC/Lightsail inventory scripts + client security assessment docs + Next.js/Webflow DevLink frontend.
- **Stack:** Python (AWS CLI inventory), Next.js `web/`, TypeScript.
- **Live:** https://gainwise-door-investigation.vercel.app · **KB:** https://gainwise-aws-inventory-report.vercel.app/
- **JD keywords:** AWS, security assessment, VPC, inventory, Next.js, compliance narrative.
- **CV bullet:** Delivered Gainwise AWS tooling: Python collectors across EC2/VPC and Lightsail planes, client-ready security findings, and a Next.js reporting UI.

### reward2learn/wte (wte-copilot/)
- **GitHub:** https://github.com/reward2learn/wte · **Public** (monorepo; app in `wte-copilot/`)
- **Product:** WTE Navigator — Indonesia Waste-to-Energy regulatory & financing copilot.
- **Stack:** Python 3.12, FastAPI, LangGraph supervisor + specialists, Chroma RAG, Vertex AI embeddings/Gemini, Firestore, Cloud Run, Ragas eval, SSE streaming, TTS.
- **Live:** https://wte-copilot-670560975972.us-central1.run.app/ (KB / Cloud Run).
- **JD keywords:** LangGraph, RAG, GCP, Vertex AI, FastAPI, agent routing, evals.
- **CV bullet:** Productionized WTE Navigator on GCP: LangGraph-routed specialists, section-aware Chroma RAG, FastAPI SSE streaming, Firestore history, and Ragas quality gates on Cloud Run.

### reward2learn/prestixvip-portal
- **GitHub:** https://github.com/reward2learn/prestixvip-portal · **Private**
- **Product:** PRESTIX VIP venue portal — high-volume booking, cart, table reservations (companion to prestix.app).
- **Stack:** TypeScript, ZenStack, Neon Postgres, Reown AppKit/ethers, MUI, Vercel Blob, Python/shell ops, Docker.
- **Live (KB):** https://prestix.vip/
- **JD keywords:** Stripe/payments ecosystem, MongoDB/Postgres, transactional web, VIP/hospitality.
- **CV bullet:** Engineered PRESTIX.VIP portal — transactional venue booking and ordering at scale (TypeScript, ZenStack, wallet auth, blob storage, containerized deploys).

### tokenizin/prestix.app
- **GitHub:** https://github.com/tokenizin/prestix.app · **Private**
- **Product:** Prestix consumer app + modular **AppKit SIWE** auth (email OTP, Google OAuth, JWT sessions, 2FA, rate limiting).
- **Stack:** Next.js, TypeScript, Prisma/ZenStack, Reown AppKit SIWE, Solidity contracts, Docker.
- **Live:** https://prestixapp.vercel.app
- **JD keywords:** OAuth, SIWE, Web3 login, session security, Next.js.
- **CV bullet:** Built prestix.app with production-grade SIWE/OAuth session module, multi-wallet accounts, and hardened cookie/CSRF patterns on Next.js.

### tokenizin/prestix-mp
- **GitHub:** https://github.com/tokenizin/prestix-mp · **Private**
- **Product:** Large Prestix monorepo / marketplace platform variant (MDX content, Solidity, extensive TS surface).
- **Stack:** TypeScript, Solidity, Docker, MDX, Shell automation.
- **JD keywords:** monorepo, Web3, content-driven product, scale.
- **CV bullet:** Maintained Prestix multi-package platform (TypeScript + Solidity) with Dockerized services and documentation-heavy MDX surfaces.

### tokenizin/prestix-deck
- **GitHub:** https://github.com/tokenizin/prestix-deck · **Private**
- **Product:** Investor / elevator pitch site for Prestix.
- **Stack:** Static HTML.
- **Live:** https://prestix-elevator-pitch.vercel.app
- **JD keywords:** storytelling, product marketing, landing pages.
- **CV bullet:** Published Prestix pitch deck as a focused Vercel landing experience for stakeholder demos.

### reward2learn/simple-online-store-with-stripe
- **GitHub:** https://github.com/reward2learn/simple-online-store-with-stripe · **Private**
- **Product:** Reference e-commerce storefront with Stripe checkout.
- **Stack:** Next.js, TypeScript, Radix UI, shadcn-style components, Stripe.js, Vercel Analytics.
- **Live:** https://simple-online-store-with-stripe-five-rho.vercel.app
- **JD keywords:** Stripe, e-commerce, Next.js, payments integration POC.
- **CV bullet:** Demonstrated end-to-end Stripe commerce flow (cart, checkout, webhooks pattern) in a deployable Next.js reference store.

---

## AI agents, dev tooling & monorepos

### tokenizin/contracts
- **GitHub:** https://github.com/tokenizin/contracts · **Private**
- **Product:** StarGuard / Tokenizin contracts monorepo — multi-app workspace (AI gateway, 3D/React Three, CodeNomad integration, Web3, Python tooling). Homepage points to Starguard demo.
- **Stack:** TypeScript (large), Solidity, Python, MUI, React Three Fiber, Deepgram agents, Neon, Reown AppKit, Docker.
- **Live:** https://starguard.vercel.app
- **JD keywords:** monorepo, Web3, 3D web, voice AI, full-stack breadth.
- **CV bullet:** Led Tokenizin contracts monorepo spanning Web3, 3D visualization, voice/AI SDK integrations, and shared auth/data layers with production Vercel targets.

### tokenizin/CodeNomad
- **GitHub:** https://github.com/tokenizin/CodeNomad · **Public** (fork)
- **Product:** CodeNomad — desktop “AI coding cockpit” for OpenCode (multi-instance, voice, git worktrees, remote access).
- **Stack:** TypeScript, Rust, CSS, Electron-style desktop patterns.
- **JD keywords:** developer tools, AI IDE, Rust/TS, productivity.
- **CV bullet:** Contributed to CodeNomad, an OpenCode desktop cockpit adding multi-session AI coding, voice input, and git worktree workflows.

### reward2learn/CodeNomad
- **GitHub:** https://github.com/reward2learn/CodeNomad · **Public**
- **Product:** Downstream / customized CodeNomad fork (active push 2026-06).
- **Stack:** TypeScript, Rust, JavaScript.
- **JD keywords:** same as above — cite your fork for ownership narrative.
- **CV bullet:** Maintained a production fork of CodeNomad with ongoing TypeScript/Rust feature work for AI-native development sessions.

### tokenizin/ide-agent-plugin
- **GitHub:** https://github.com/tokenizin/ide-agent-plugin · **Private**
- **Product:** NomadWorks Agent Collective — portable Cursor/VS Code plugin: 36 agents, 14 policies, 13 skills, MCP, scaffolding CLI.
- **Stack:** TypeScript, Shell, Go templates, Smarty.
- **JD keywords:** Cursor, MCP, agent orchestration, platform engineering, dApp scaffolding.
- **CV bullet:** Authored NomadWorks IDE plugin packaging 36 specialized agents, policy hooks, MCP servers, and one-command project scaffolding for AI-assisted delivery.

### tokenizin/app-skeleton
- **GitHub:** https://github.com/tokenizin/app-skeleton · **Private**
- **Product:** OAuth-ready Next.js web app skeleton (Prisma, Auth.js patterns, Radix UI).
- **Stack:** Next.js, TypeScript, Prisma, Radix, Headless UI.
- **Live:** https://app-oauth-tokenizin-projects.vercel.app
- **JD keywords:** starter kits, OAuth, Next.js, accelerate greenfield.
- **CV bullet:** Created reusable Next.js/Prisma OAuth app skeleton to standardize greenfield client deliveries on Vercel.

### reward2learn/ili-assistant
- **GitHub:** https://github.com/reward2learn/ili-assistant · **Private**
- **Product:** Compyle-style multi-agent assistant — LangChain, Bedrock, Google GenAI, flow UI, Mongo auth adapter.
- **Stack:** Next.js, LangChain (+ AWS/Google providers), MUI, Radix, Redux, XYFlow, MongoDB.
- **JD keywords:** LLM orchestration, multi-provider, agent UI, RAG/chat products.
- **CV bullet:** Built ili-assistant combining LangChain multi-provider routing, visual agent flows (XYFlow), and Next.js UX for internal AI copilot experiments.

### reward2learn/aws-chatbot
- **GitHub:** https://github.com/reward2learn/aws-chatbot · **Private**
- **Product:** AWS Bedrock chat — FastAPI backend, React frontend, MongoDB persistence, Chrome extension.
- **Stack:** Python FastAPI, React 18, MongoDB, AWS Bedrock (Claude).
- **JD keywords:** AWS Bedrock, streaming chat, full-stack, browser extension.
- **CV bullet:** Implemented AWS Bedrock streaming chatbot (FastAPI + React) with session persistence and a Chrome extension for in-browser access.

### reward2learn/extixs
- **GitHub:** https://github.com/reward2learn/extixs · **Private**
- **Product:** Front-end web property (marketing/site — JS/HTML/CSS heavy).
- **Stack:** JavaScript, HTML, CSS.
- **JD keywords:** marketing sites, legacy JS stack.
- **CV bullet:** Delivered extixs marketing web experience (responsive HTML/CSS/JS).

---

## Infrastructure, backup & niche platforms

### tokenizin/reviveAPP
- **GitHub:** https://github.com/tokenizin/reviveAPP · **Private**
- **Product:** Employee backup automation — Google Workspace + Synology (macOS Time Machine / Windows Active Backup scripts).
- **Stack:** TypeScript tooling, Shell/PowerShell, Docker, Go utilities.
- **JD keywords:** IT automation, bash/PowerShell, NAS, enterprise desktop ops.
- **CV bullet:** Automated employee backup rollout (macOS/Windows) integrating Google Drive sync with Synology NAS and diagnostic reporting.

### tokenizin/qnap-nextjs-app
- **GitHub:** https://github.com/tokenizin/qnap-nextjs-app · **Private**
- **Product:** Next.js app packaged for QNAP / self-hosted deployment (Docker, large HTML/MDX docs surface).
- **Stack:** TypeScript, Docker, Python helpers, Shell.
- **JD keywords:** self-hosted, Docker, edge/NAS deployment.
- **CV bullet:** Packaged Next.js workloads for QNAP/self-hosted Docker environments with operational shell tooling.

### sonofthematrix/Meridian-TMS
- **GitHub:** https://github.com/sonofthematrix/Meridian-TMS · **Private**
- **Product:** Meridian TMS — lean intermodal transport management (planning repo: Ops Inbox, document/email intake, extraction, timelines, fee-risk alerts).
- **Stack:** TypeScript, Solidity (legacy/archive), Shell, Hardhat-adjacent tooling.
- **JD keywords:** logistics, TMS, document AI intake, operator UX.
- **CV bullet:** Defined and scaffolded Meridian TMS — operator-first shipment intelligence (document intake, human-in-the-loop extraction, fee-risk alerts).

### sonofthematrix/devlynx
- **GitHub:** https://github.com/sonofthematrix/devlynx · **Public**
- **Product:** DevLynx / DevLens — Chrome extension + feed server (AI-assisted browsing/productivity).
- **Stack:** JavaScript, Vercel Blob, OpenAI, JWT, Sharp, obfuscation/packaging scripts.
- **Live:** https://devlynx-black.vercel.app
- **JD keywords:** Chrome extension, SaaS feed server, OpenAI integration.
- **CV bullet:** Shipped DevLynx — Chrome extension and Vercel-backed feed server using OpenAI and secure JWT/session patterns.

---

## Tokenizin agency & personal brand (2024–2025)

### tokenizin-agency/tokenizin-site
- **GitHub:** https://github.com/tokenizin-agency/tokenizin-site · **Private**
- **Product:** Tokenizin agency marketing site (2024).
- **Stack:** Vite, React, TypeScript, Tailwind, Framer Motion, Puppeteer screenshots.
- **Live:** https://tokenizin-site.vercel.app
- **JD keywords:** React, animation, marketing, performance.
- **CV bullet:** Built Tokenizin agency site (Vite/React/Tailwind) with motion design and automated screenshot testing.

### tokenizin-agency/tiger
- **GitHub:** https://github.com/tokenizin-agency/tiger · **Private**
- **Product:** Tiger Palace venue experience with SSO.
- **Stack:** TypeScript, React.
- **JD keywords:** SSO, hospitality, authenticated web apps.
- **CV bullet:** Developed Tiger Palace web app with SSO integration for venue guest flows.

### tokenizin/moonoii
- **GitHub:** https://github.com/tokenizin/moonoii · **Private**
- **Product:** Moonoii Pearls — product/catalog experience.
- **Stack:** TypeScript, CSS.
- **JD keywords:** e-commerce UI, brand sites.
- **CV bullet:** Implemented Moonoii Pearls customer-facing TypeScript storefront UI.

### reward2learn/TokenizinSite
- **GitHub:** https://github.com/reward2learn/TokenizinSite · **Private**
- **Product:** Alternate Tokenizin site iteration.
- **Stack:** TypeScript, React patterns.
- **JD keywords:** same as agency site — pick one for CV to avoid duplication.
- **CV bullet:** Iterated Tokenizin public web presence (TypeScript/React) for service positioning.

### alexishapiro/tokenizin-app-engine
- **GitHub:** https://github.com/alexishapiro/tokenizin-app-engine · **Private**
- **Product:** Tokenizin application engine / generator experiments.
- **Stack:** TypeScript (primary).
- **JD keywords:** platform engineering, app generation (precursor to TMA).
- **CV bullet:** Prototyped Tokenizin app-engine patterns that informed later multi-tenant TokenizMyApp architecture.

---

## Web3, 3D & experiential (2024)

### alexishapiro/living-museum-auto
- **GitHub:** https://github.com/alexishapiro/living-museum-auto · **Private**
- **Product:** Living Museum — automated Next.js museum experience with analytics charts.
- **Stack:** Next.js, ZenStack, Prisma, NextAuth, Radix, Nivo charts, TanStack Query, T3 env.
- **Live:** https://living-museum-master.vercel.app
- **JD keywords:** Next.js, data viz, cultural/edtech, auth.
- **CV bullet:** Delivered Living Museum auto-generated Next.js experience with ZenStack data layer, auth, and Nivo analytics dashboards.

### tokenizin-agency/living-museum-poc
- **GitHub:** https://github.com/tokenizin-agency/living-museum-poc · **Private**
- **Product:** Living Museum proof-of-concept demo.
- **Stack:** TypeScript, SCSS.
- **JD keywords:** POC, rapid prototyping.
- **CV bullet:** Built Living Museum POC validating immersive web UX before production auto-gen stack.

### tokenizin-agency/marketPLAI
- **GitHub:** https://github.com/tokenizin-agency/marketPLAI · **Private**
- **Product:** Marketplace AI experiment (minimal TS footprint — early spike).
- **Stack:** TypeScript.
- **JD keywords:** AI marketplace concept.
- **CV bullet:** Spiked MarketPLAI — AI-assisted marketplace concept in TypeScript.

### tokenizin-agency/ProductPriceScraper
- **GitHub:** https://github.com/tokenizin-agency/ProductPriceScraper · **Private**
- **Product:** Product price scraping utility.
- **Stack:** Python.
- **JD keywords:** scraping, data acquisition, pricing intelligence.
- **CV bullet:** Wrote Python price-scraper for competitive product intelligence pipelines.

### tokenizin-agency/craco-react-three-scene
- **GitHub:** https://github.com/tokenizin-agency/craco-react-three-scene · **Public**
- **Product:** CRACO + React Three.js scene starter.
- **Stack:** TypeScript, React Three, CSS.
- **JD keywords:** WebGL, 3D, React Three Fiber ecosystem.
- **CV bullet:** Published CRACO/React-Three scene starter for 3D web prototypes.

### alexishapiro/lets-play-fair-ai-website
- **GitHub:** https://github.com/alexishapiro/lets-play-fair-ai-website · **Private**
- **Product:** Let’s Play Fair AI — Web3-enabled marketing site.
- **Stack:** JavaScript, SCSS/CSS.
- **JD keywords:** Web3 marketing, brand site.
- **CV bullet:** Built Web3-enabled Let’s Play Fair AI public website (SCSS/JS).

### alexishapiro/rubicon
- **GitHub:** https://github.com/alexishapiro/rubicon · **Private**
- **Product:** Rubicon brand website.
- **Stack:** CSS, JavaScript, TypeScript, HTML.
- **JD keywords:** corporate site, design systems.
- **CV bullet:** Delivered Rubicon responsive marketing site with mixed TS/JS component patterns.

### tokenizin-agency/kclub-ionic-react
- **GitHub:** https://github.com/tokenizin-agency/kclub-ionic-react · **Private**
- **Product:** K-Club mobile/hybrid app — Ionic React, Capacitor iOS/Android, Firebase auth, GraphQL/Apollo, Flowise embed.
- **Stack:** Ionic, Capacitor, TypeScript, Firebase, Apollo, XState, Vite.
- **Live:** https://kclubapp.vercel.app
- **JD keywords:** mobile, Ionic, Capacitor, Firebase, GraphQL.
- **CV bullet:** Shipped K-Club Ionic/Capacitor app with Firebase auth, Apollo GraphQL, and embedded Flowise AI chat on iOS/Android targets.

### elix1er/tailwind-ui-components
- **GitHub:** https://github.com/elix1er/tailwind-ui-components · **Private**
- **Product:** Tailwind UI component library / design system assets.
- **Stack:** HTML, JavaScript, CSS (Tailwind).
- **JD keywords:** design systems, Tailwind, component libraries.
- **CV bullet:** Assembled Tailwind UI component library accelerating agency delivery timelines.

### alexishapiro/wise-websites
- **GitHub:** https://github.com/alexishapiro/wise-websites · **Private**
- **Product:** PoolWise & TradeWise sites for Wise Group (placeholder/shell repo — minimal code).
- **Stack:** n/a (empty language stats).
- **JD keywords:** client websites, financial services branding.
- **CV bullet:** Supported Wise Group web properties (PoolWise/TradeWise) — coordinate with client-facing narrative if code depth is questioned.

---

## Ekta / K-Club client work (2022–2024)

### ekta-dev-team/daoble-website
- **GitHub:** https://github.com/ekta-dev-team/daoble-website · **Private**
- **Product:** Daoble marketing website.
- **Stack:** JavaScript, SCSS.
- **JD keywords:** marketing, Web3 brand sites.
- **CV bullet:** Built Daoble marketing site (JS/SCSS) for Ekta ecosystem branding.

### kclubdigital/kabanatribe-frontend
- **GitHub:** https://github.com/kclubdigital/kabanatribe-frontend · **Private**
- **Product:** Kabana Tribe frontend.
- **Stack:** CSS, TypeScript, JavaScript, HTML.
- **JD keywords:** community web apps, responsive UI.
- **CV bullet:** Developed Kabana Tribe frontend (TS/JS) for community engagement flows.

### ekta-dev-team/wekta-dapp
- **GitHub:** https://github.com/ekta-dev-team/wekta-dapp · **Private**
- **Product:** Wekta dApp (empty/stub repository — no substantive code history).
- **Stack:** n/a
- **CV bullet:** *Omit or list only if you have non-GitHub delivery evidence* — repo is a stub.

### ekta-dev-team/ekta-claiming-app
- **GitHub:** https://github.com/ekta-dev-team/ekta-claiming-app · **Private**
- **Product:** Token claiming web app for Ekta drops.
- **Stack:** JavaScript, SCSS, HTML.
- **JD keywords:** Web3 claiming, wallet UX.
- **CV bullet:** Implemented Ekta token claiming web app with wallet-connected UX (JS/SCSS).

### ekta-dev-team/ekta-portal-site
- **GitHub:** https://github.com/ekta-dev-team/ekta-portal-site · **Private**
- **Product:** Ekta portal website (ekta.io/portal).
- **Stack:** JavaScript, HTML, SCSS.
- **JD keywords:** portal, Web3 community.
- **CV bullet:** Delivered Ekta portal marketing site powering ekta.io/portal experiences.

### ekta-dev-team/ekta-portal-collection
- **GitHub:** https://github.com/ekta-dev-team/ekta-portal-collection · **Private**
- **Product:** Solidity contracts for portal NFT/collection mechanics.
- **Stack:** Solidity, JavaScript tooling.
- **JD keywords:** smart contracts, NFT, Web3.
- **CV bullet:** Authored Ekta portal collection smart contracts (Solidity) with JS deployment tooling.

### ekta-dev-team/ekta-know-your-ekta
- **GitHub:** https://github.com/ekta-dev-team/ekta-know-your-ekta · **Private**
- **Product:** Know Your Ekta product development repo.
- **Stack:** JavaScript (large), CSS, some TypeScript.
- **JD keywords:** KYC-style flows, Web3 identity, product engineering.
- **CV bullet:** Built Know Your Ekta product flows (JS/TS) for ecosystem identity/onboarding.

### reward2learn/mint
- **GitHub:** https://github.com/reward2learn/mint · **Private**
- **Product:** Early NFT mint app (minimal HTML — legacy spike).
- **Stack:** HTML.
- **JD keywords:** NFT minting (historical).
- **CV bullet:** *Optional historical line:* prototyped early NFT mint UI (2022) — pair with stronger Web3 repos (GoFetch, prestix, ekta-portal-collection) for credibility.

---

## Skill → repository quick index (for JD matching)

| JD theme | Lead with these repos / live URLs |
|----------|-----------------------------------|
| **LangGraph / RAG / GCP** | `reward2learn/wte`, KB WTE Navigator |
| **Multi-tenant SaaS / Next.js** | `tokenizmyapp`, `ManaposeGP`, `Rosalita` |
| **Stripe / commerce** | `simple-online-store-with-stripe`, PRESTIX (KB) |
| **AWS (Bedrock, inventory, security)** | `aws-chatbot`, `GAINEWISE` |
| **Web3 / SIWE / Solidity** | `GoFetch`, `prestix.app`, `tokenizin/contracts`, `ekta-portal-collection` |
| **Cursor / agents / MCP** | `ide-agent-plugin`, `CodeNomad` forks |
| **Mobile (Ionic/Capacitor)** | `kclub-ionic-react` |
| **3D / React Three** | `craco-react-three-scene`, `tokenizin/contracts` |
| **Logistics / TMS** | `Meridian-TMS` |
| **DevTools / extensions** | `devlynx` |
| **IT automation / scripts** | `reviveAPP`, `GAINEWISE` scripts |
| **Agency / marketing sites** | `tokenizin-site`, `daoble-website`, `rubicon`, `lets-play-fair-ai-website` |

---

## Notes for Application Generator KB

- Prefer **KB live URLs** (`appgen/assets/appgen-kb.js` freelance.products) when they differ from GitHub `homepage` fields.
- Do not claim public GitHub links for **private** repos unless the employer has access; use product name + live demo URL instead.
- `wekta-dapp` and `wise-websites` are weak code proofs — de-prioritize in honesty-guarded output.
