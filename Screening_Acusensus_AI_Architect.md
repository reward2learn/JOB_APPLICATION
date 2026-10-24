# Acusensus — AI Architect · Screening answers

Ilia Shapiro · Sydney · Paste-ready. Adjust salary figure before submit.

---

## 1. What attracts you to this role with Acusensus?

What attracts me is the combination of mission and mandate. Acusensus builds technology that changes behaviour and saves lives — deployed with governments who rightly demand the highest standards of security and reliability. The AI Architect role sits at exactly the intersection I have been working: being the bridge between what the business needs and what good engineering looks like, so AI tools are secure, connected, documented and built to last.

At Cubewise I took an enterprise GenAI assistant (AVA) from concept to production across Amazon, AWS and ZKB, and established the architecture, governance and mentoring practices that keep it maintainable. Owning a central AI asset register, shaping vendor assessment with Legal, lifting employee-built tools out of shadow-IT into production-grade standards, and enabling colleagues of mixed technical depth — that is the work I want to do next, for a company whose outcomes matter beyond the organisation itself.

I am also drawn to the hybrid Sydney/Melbourne setup, global collaboration, and a culture that treats responsible AI as a delivery requirement, not a slide deck.

---

## 2. What is your standard notice period or earliest available start date?

I am available to start within two weeks of offer (or sooner by mutual agreement). I am not under a long notice period.

*(If you prefer a fixed date: "Earliest start: [DD Month 2026]. Standard notice otherwise: 2 weeks.")*

---

## 3. What is your base salary expectation (per annum, excluding super)?

**≤127 characters — pick one and edit the number:**

```
$200,000 – $220,000 base p.a. (ex super); open to discuss for the right scope.
```
*(97 characters)*

```
$210,000 base p.a. excluding super; flexible for total package and role scope.
```
*(89 characters)*

```
Open to market for AI Architect in Sydney; targeting ~$200–220k base (ex super).
```
*(90 characters)*

> Replace with your real floor before submitting. Market for hands-on AI Architect / Lead AI in AU commonly sits ~$180–240k base depending on company stage and scope.

---

## 4. Are you based in Melbourne or Sydney?

**≤127 characters:**

```
Sydney, Australia — happy with hybrid and occasional travel to Melbourne / nationally.
```
*(88 characters)*

---

## 5. Tell me about a time when you reviewed or took over an AI tool, automation or system built by someone less technical, and found security, data or maintainability problems. What did you do, and what was the outcome?

During the build-out of AVA and related AI experiments on the Apliqo UX platform, several early prototypes and internal automations had been stood up by product and engineering colleagues who were strong domain experts but newer to LLM-specific risks. On review I found recurring issues: API keys and prompts living in client-side or loosely scoped config; retrieval paths that could surface data beyond the user’s intended TM1 security context; little or no grounding/citation so users could not verify answers; and one-off scripts with no ownership, tests, or runbooks — classic maintainability debt that becomes shadow IT the moment the author changes role.

I treated it as enablement, not a shutdown. I documented the risks in plain language, paired with the builders to remediate: move secrets server-side, enforce auth and data-scope checks at the service boundary, add citation/grounding displays and evaluation hooks (Ragas/LangSmith), wrap the flow in a shared LangGraph pattern with human-in-the-loop gates where actions mattered, and capture decisions in ADRs plus a short runbook so the tool was transferable. Where a prototype was not ready for enterprise clients, we kept it in a governed sandbox until it met the bar.

Outcome: the patterns became the platform standard; AVA shipped to Amazon, AWS and ZKB with responsible-AI controls that passed their governance reviews; and less-technical builders had a clear checklist and mentoring path instead of being blocked. The organisation kept innovating, but the tools were secure, documented and owned.

---

## 6. What are your top tips on using AI for new users?

1. **Start with a clear job, not a chat.** State the goal, audience, and what “good” looks like (e.g. “draft a 5-bullet status update for non-technical stakeholders”). Vague prompts produce vague answers.

2. **Never paste secrets or regulated data into consumer tools.** Prefer approved enterprise workspaces; assume prompts and uploads may be retained. When in doubt, redact or use a sanctioned internal agent.

3. **Verify before you trust.** Treat AI as a junior analyst: check facts, citations, and numbers against source systems. For anything customer-, safety-, or compliance-facing, human review is mandatory.

4. **Iterate in small loops.** Ask for an outline → critique → revise. Provide examples of the tone or format you want. One long “perfect prompt” is less effective than three short refinements.

5. **Keep ownership of the outcome.** You remain accountable for what ships. Save useful prompts, document how the tool was used, and escalate when the model is guessing — especially on legal, security, or safety content.

6. **Learn one approved tool deeply first.** Master prompting, file upload, and citation features in the company-standard assistant before spreading across many apps — that reduces shadow IT and data sprawl.

---

## 7. Describe an AI agent or tool that you recently built or architected. What problem did it solve, what technologies were used, and what was its impact on the organization or users?

**AVA** — the enterprise GenAI assistant for Cubewise’s Apliqo UX FP&A platform.

**Problem:** Finance and planning users needed to query, explore and act on complex TM1 / IBM Planning Analytics data in natural language, without exporting sensitive enterprise data into unmanaged tools or waiting on specialist report builders. The business also needed a governed, production-grade agent — not a demo chatbot — that would pass security review at major clients.

**What I architected / owned:** End-to-end vision, architecture, backlog and delivery as Lead AI Architect and Product Owner — conversational UI with streaming responses, citation displays, document search, RAG grounded on enterprise TM1 data, and multi-step agent workflows with human-in-the-loop gates for consequential actions.

**Technologies:** Python; LangGraph (agent orchestration) and LangChain; LlamaIndex (retrieval); OpenAI / Anthropic APIs and GCP Vertex AI; vector search (pgvector); evaluation and tracing with Ragas and LangSmith; integrated with React/TypeScript front ends and enterprise auth; delivered with Docker/K8s, Terraform, and CI/CD on AWS/GCP patterns as applicable.

**Impact:** Launched September 2025 and deployed at **Amazon, AWS and ZKB**, with responsible-AI controls that cleared their governance processes. It gave client users a trusted path to AI-assisted planning analytics, established reusable architecture standards and mentoring for 10+ developers, and replaced ad-hoc experiments with a maintainable, monitored product capability.

---

## 8. Provide details or examples of any AI projects you have built or worked on (if non-confidential and shareable).

**Enterprise (Cubewise / Apliqo UX)**  
- **AVA** — production multi-agent GenAI assistant (details above); RAG over enterprise planning data; evaluation pipelines; governance for Amazon, AWS, ZKB. Client-specific internals remain confidential; architecture patterns and public-facing outcomes are shareable as above.

**AI-native products I built end-to-end (live, shareable):**  
- **TMA (TokenizMyApp)** — multi-tenant SaaS with AI chat and resource optimisation · https://tokenizmyapp.vercel.app/  
- **TMA Finance** — ops dashboard with OAuth/RBAC and AI chat · https://tokenizmyapp-finance.vercel.app/  
- **PRESTIX.VIP** — VIP venue booking platform · https://prestix.vip/  
- **GoFetch** — marketplace frontend · https://gofetchapp.vercel.app/  
- **Gainwise** — AWS inventory reporting with gated admin · https://gainwise-aws-inventory-report.vercel.app/  
- **ManaposeGP** — health dashboard module · https://manaposegp.vercel.app/  

Stack across these: Next.js, TypeScript, Node, PostgreSQL/MongoDB, AWS where relevant; conversational AI features; shipped with Claude/Cursor/Codex-assisted delivery, CI/CD, and production hosting on Vercel/AWS.

Happy to walk through architecture diagrams, evaluation approach, or a live demo of the public products in interview.

---

## 9. Is there anything else we should know about your application?

A few practical points that may help with screening:

- **Location & work rights:** Based in Sydney; Australian citizen with unrestricted work rights. Comfortable with hybrid arrangements, occasional early/late hours for global collaboration, and short-notice national travel (including Melbourne).
- **Clearances:** Current National Police Check available; happy to complete any additional police or driving-history checks Acusensus requires.
- **Availability:** Can start within two weeks of offer (or sooner by agreement).
- **Portfolio:** Several live AI-native products are shareable for demo (links in the previous answer); enterprise AVA client internals remain confidential, but architecture patterns, governance approach and outcomes are discussable in interview.
- **Motivation:** I am specifically targeting AI Architect / platform-governance roles where enablement and responsible AI are both in scope — Acusensus’s mission and this mandate are a deliberate fit, not a speculative apply.
