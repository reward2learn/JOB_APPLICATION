# M3 — `apps/wtd-web` Next.js game shell

Scaffold for path routes **`/chess`** and **`/snakes-ladders`** without loading `Application_Generator.html`.

## Architecture

- **Static assets:** `scripts/sync-appgen-public.mjs` copies `appgen/assets` → `apps/wtd-web/public/appgen/assets` on `dev` / `build`.
- **Game runtime:** Same ESM modules as the monolith (`appgen-wtd-store.js`, `appgen-wtd-chess.js`, `appgen-wtd-snl.js`) loaded client-side with the same import map as `Application_Generator.html`.
- **DOM:** React components mirror required element ids from the monolith (`ChessIslandDom`, `SnlIslandDom`).
- **API:** `next.config.ts` rewrites `/api/*` to `WTD_API_PROXY` or `http://127.0.0.1:3000` (run `appgen-api` locally for auth + invites).

## Local dev

```bash
# Terminal A — API + static monolith (port 3000 default for vercel dev)
cd appgen-api && npx vercel dev --listen 3000

# Terminal B — Next game shell
cd apps/wtd-web && npm install && npm run dev
```

Open http://localhost:3001/chess or `/snakes-ladders`.

Optional: `WTD_API_PROXY=https://apply4job.vercel.app npm run dev` to hit prod APIs (cookies/auth may differ).

## Invite URLs

- Path form: `/chess?chessInvite=TOKEN`, `/snakes-ladders?snlInvite=TOKEN`
- `lib/wtd-invite-bridge.ts` mirrors query params into hash shape the monolith modules still read.
- Hub `/` runs `LegacyHashRedirect` for users landing with `/#chess` or `/#snakes-ladders`.

## Prod cutover (not done yet)

Today prod remains **appgen-api** + copied HTML. To promote this app:

1. Set Vercel project `rootDirectory` to `apps/wtd-web` (or monorepo build command).
2. Copy/sync `appgen/assets` in CI before `next build`.
3. Add rewrites so `/` can stay CV (proxy to legacy static) or split projects.

See [`BOARDGAMES_NEXTJS_ROADMAP.md`](./BOARDGAMES_NEXTJS_ROADMAP.md) §11 M3.
