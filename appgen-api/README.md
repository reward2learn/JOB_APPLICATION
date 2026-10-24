# Application Generator (`appgen-api`)

Static UI + Vercel serverless API for Ilia’s cover-letter / CV generator.

**Production:** https://apply4job.vercel.app  
**Second brain (read first):** [`../APPGEN_SECOND_BRAIN.md`](../APPGEN_SECOND_BRAIN.md)

## Deploy

```bash
cp ../Application_Generator.html ./index.html
cp -r ../appgen/assets ./appgen/assets
unset VERCEL_TOKEN
vercel deploy --prod -y --scope team_7m5fwG2qKtVsGtgV35AB3nHi
```

Always sync `index.html` and `appgen/assets/` from the repo root before deploying.

## Env

| Var | Purpose |
|-----|---------|
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob (auto when store attached) |
| `VERCEL_AI_GATEWAY_API_KEY` | **Primary** — Vercel AI Gateway (also accepts `AI_GATEWAY_API_KEY`) |
| `OPENCODE_API_KEY` | **Fallback** when `llm.provider` is `auto`, or primary for `opencode` |
| `VERCEL_GATEWAY_MODEL` / `VERCEL_GATEWAY_MODEL_CHEAP` | Optional override for the single Gateway model used on **all** tiers (default: `nvidia/nemotron-3.5-lightning-free`) — must be on team **Provider Allowlist** |
| `ANTHROPIC_API_KEY` | When client sends `llm.provider: "anthropic"` only (optional; quota was exhausted until 2026-11-01) |
| `OPENCODE_INFERENCE_BASE` | Optional OpenCode Inference URL override |
| `TAILOR_STEP_DELAY_MS` | Pause between LLM calls (default `800`) to reduce burst rate limits |
| `TAILOR_LLM_RETRY_DELAYS` | Comma-separated ms delays before retry on 503/429 (default `2000,5000`) |
| `APPGEN_CODE` | Optional shared secret → `x-appgen-code` header |
| `ANTHROPIC_MODEL_CHEAP` / `_MID` / `_STRONG` | Optional model overrides (Anthropic provider only) |

## Endpoints

- `GET/POST/DELETE /api/applications` — saved applications (Blob)
- `POST /api/tailor` — 6-step LLM pipeline (SSE or cached JSON)

## Token / ops notes

- Anthropic quota was exhausted until **2026-11-01 00:00 UTC** — UI defaults to rule-based generate + weave.
- Tailor logs `tailor_usage` JSON lines (cacheHit, calls, maxCompletionBudget) to Vercel function logs.
- Result payload includes `usage` for the client pipeline panel.
- Prefer opening `APPGEN_SECOND_BRAIN.md` in new agent chats instead of full-reading `index.html` (~53k tokens).
