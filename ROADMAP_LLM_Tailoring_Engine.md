# ROADMAP — LLM Tailoring Engine for the Application Generator

**Goal:** upgrade the Application Generator from template-placeholder population to a true LLM/agent
workflow that *derives* a tailored CV + cover letter per job description — deep JD analysis, evidence
mapping against the knowledge base, career-narrative derivation, and a pre-submission ATS check —
so every application maximises its chance of passing automated AI filtering and reaching shortlisting.

**Prime directive (non-negotiable):** the LLM may only *compose and connect* — never *invent*.
Every claim in generated output must trace to the knowledge base (KB) or user-provided content.
Gaps are named with transfer narratives, never papered over. Fabrication passes ATS and fails
the phone screen; it is also an integrity failure.

---

## Phase 0 — Baseline (DONE)
- Static single-file app: intake → rule-based JD matching (concepts/synonyms) → theme selection
  → rendered Cover Letter + CV; Settings (profile/content/appearance); saved applications
  (localStorage + Vercel Blob backend via `/api/applications`); print-to-PDF with dynamic filenames.

## Phase 1 — Deep JD Analysis Engine (rule-based, no LLM needed)
1. **Section-aware JD parser**: split JD into Responsibilities / Essential / Desirable / About;
   weight keywords by section (Essential ×3, Responsibilities ×2, Desirable ×1) and by heading
   proximity. Current engine treats the JD as flat text — this is the biggest accuracy win available.
2. **Expanded synonym map + acronym handling** (e.g. "CX" ↔ Dialogflow CX; "LLM eval" ↔ Ragas;
   "real-time" ↔ WebSockets/SSE) with word-boundary regex and negation guards ("no Java required").
3. **ATS keyword extraction**: top N terms by tf-idf-ish weighting; output a keyword-coverage
   checklist the generated documents must satisfy.
4. **Match report v2**: per-requirement verdict (strong / partial / gap) with the evidence bullet
   used — the analysis shown in this document, produced automatically.

## Phase 2 — LLM Workflow Step (the core upgrade)
Add an authenticated API route (`/api/tailor`) the app calls with {jd, kb, settings}. Server-side
agent pipeline (Node.js on Vercel Functions):

| Step | Agent | Input → Output | Guardrail |
|---|---|---|---|
| 1 | **JD Analyst** | JD → structured requirements JSON (role, seniority, essential/desirable, keywords, ATS terms) | Schema-validated output |
| 2 | **Evidence Mapper** | requirements + KB → per-requirement evidence mapping (matched / partial / gap) | May ONLY cite KB bullet IDs; unmapped = gap |
| 3 | **Narrative Architect** | evidence map → career narrative arc (headline, 4–6 theme titles mirroring JD phrasing, opening hook, gap-transfer stories) | Themes must reference evidence IDs |
| 4 | **Document Composer** | narrative + KB + settings → CV JSON + letter markdown | Every claim carries an evidence ID; composer drops uncited claims |
| 5 | **Critic / Evaluator** | draft + requirements → critique (coverage %, weak claims, tone, length) → revision loop (max 2 iterations) | Verifies no fabricated entity (entity-check against KB) |
| 6 | **ATS Simulator** | final docs + JD → keyword coverage score, missing terms, format risks | Threshold: warn below 80% coverage |

Model routing: cheap fast model for steps 1 & 6, strongest model for 3 & 4 (quality-critical),
mid for 2 & 5. Temperature 0–0.3 for 1/2/6; 0.5–0.7 for 3/4.

## Phase 3 — Career-Narrative Derivation
- Derive a **positioning statement** per application: role archetype (e.g. "production conversational-AI
  engineer"), 3 proof pillars, and the arc (origin → scale → AI leadership → this role).
- Narrative consistency check: letter, CV summary and themes must tell the SAME story.
- Tone calibration by seniority signal in the JD title (lead/principal → leadership voice).

## Phase 4 — Pre-Submission Quality Gate
- **Checklist UI**: keyword coverage, all Essential requirements addressed, gaps named, contact
  details canonical, dates consistent, file naming, length limits.
- One-click "Apply fixes" for mechanical issues (missing keyword with real evidence exists).

## Phase 5 — Evaluation Harness & Regression
- Golden-set of 5–10 JDs (incl. NCS Australia) with expected requirement extractions; run the
  pipeline on every engine change; assert coverage and no-fabrication invariants.
- Track shortlist/reply outcomes per application (manual input) → correlate with match scores
  to tune weighting over time.

---

## Additional Tech Stack (to deliver the above)

| Layer | Addition | Why |
|---|---|---|
| LLM provider | **Anthropic API (Claude)** primary; **OpenAI** secondary for routing/cost comparison | Strong structured-output + long-context; already the KB's stated daily tools |
| API routes | `/api/tailor` (POST, streaming SSE back to UI), `/api/evaluate` | App already has `/api/applications` pattern on Vercel Functions |
| Structured output | Zod schemas + provider-native JSON/structured output | Schema-validated agent steps; fail-fast on drift |
| Agent orchestration | **LangGraph.js** (or plain typed step pipeline) | Steps 1–6 as a graph with retry/revision loops; mirrors KB credibility (LangGraph) |
| Prompt regression | **Promptfoo** or custom golden-set runner in CI | Step 5/6 discipline applied to the engine itself |
| Entity guard | Deterministic post-processor: extract claimed tools/certs/dates → diff against KB | No-fabrication invariant, cheap and reliable |
| Caching & cost | Vercel Blob cache of JD-analysis + tailor results keyed by (jd-hash, kb-version); token budget caps | Same JD re-tailored cheaply; cost control |
| Secrets | `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` as Vercel env vars (never client-side) | Standard |
| Observability | LangSmith tracing on the tailor pipeline | Debugging + quality metrics; consistent with KB practice |
| UI | Streaming render of the tailor steps (user watches analysis → narrative → draft) | Trust + transparency; shows the work |
| Storage | Extend `/api/applications` records with `analysis` + `narrative` fields | Reload shows not just docs but the reasoning |

## Explicit non-goals
- No fabrication of experience, tools, certifications, degrees or metrics — ever.
- No guarantee of "bypassing" ATS filters; we maximise genuine match and keyword fidelity.
- No auto-submitting applications; a human reviews before sending.
