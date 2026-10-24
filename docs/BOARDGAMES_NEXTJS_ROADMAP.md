# Boardgames platform → Next.js + schema + Redux

**Status:** Planning only — **no application runtime code changed in this pass** (2026-10-22).  
**Audience:** Agents and humans executing the migration later.  
**Canonical product today:** https://apply4job.vercel.app · Vercel team `tokenizin-projects` · project `application-generator` · Engram project `job-application`.

---

## 1. Executive summary & goals

### Goals

1. **W3 / JSON Schema (schema.org-style) boardgame types** — declare chess, snakes-and-ladders, and extensible generics (grid, turn, pieces, win, multiplayer, 3D studio) as machine-readable contracts.
2. **Schema → prebuilt game packages → Vercel** — generate or assemble deployable game apps from schema + shared runtime, not by copy-pasting monolith modules.
3. **Redux as single source of truth (SSoT)** — first *inside* the current Walk the Dragon (WTD) / chess / SNL clients (replace module-scoped `let` state), then as the platform store for Next.js apps.
4. **Complexity & file-size impact** — know what shrinks (monolith HTML, duplicated invite libs) vs grows (framework, codegen, Redux boilerplate, monorepo tooling).
5. **Server-side multiplayer path** — analyze Blob + poll today; design a shared `GameRoom` abstraction; decide when to keep Blob vs move to SSE / WebSocket / Ably.

### Non-goals (this roadmap / near term)

- No rewrite of the CV tailor pipeline in the same PR as games.
- No new game genres until chess + SNL schemas + one codegen path are proven.
- No realtime vendor commitment until Blob CAS/revision limits are measured in prod.
- No “big bang” cutover — Redux-in-monolith precedes Next.js app shell.

### Success criteria (later execution)

- Chess and SNL game state readable from Redux DevTools; no critical `let` game/session/lobby state left as write-side SSoT.
- At least one schema document validated by AJV (or Zod-from-JSON-Schema) drives package metadata + room payload shape.
- Next.js app (or monorepo package) can mount chess and SNL without loading all of `Application_Generator.html`.
- Multiplayer invite APIs share a documented `GameRoom` contract (even if Blob storage remains).

---

## 2. Current architecture map

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Application_Generator.html (~345 KB / ~7.8k lines)                      │
│  · CV/letter intake, settings, weave UI, hash routing                   │
│  · Loads appgen/assets/*.js (KB, weave, WTD shell, games)               │
└────────────────────────────┬────────────────────────────────────────────┘
                             │
         ┌───────────────────┼───────────────────┐
         ▼                   ▼                   ▼
┌─────────────────┐ ┌─────────────────┐ ┌──────────────────────────────┐
│ CV tailor       │ │ WTD shell       │ │ Games (Three.js labs)        │
│ appgen-kb.js    │ │ appgen-wtd.js   │ │ chess + snl + 3d + rainbow   │
│ appgen-weave.js │ │ studio/session  │ │ + many chess-* / snl-* mods  │
│ tailor API SSE  │ │ PWA / presence  │ │ module-scoped let state      │
└────────┬────────┘ └────────┬────────┘ └──────────────┬───────────────┘
         │                   │                         │
         ▼                   ▼                         ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ appgen-api (Vercel serverless)                                          │
│  Auth: Google session cookies (lib/auth-session.js)                     │
│  Tailor / applications / scrape / batch PDF                             │
│  Chess MP: api+lib/chess-invite.js (Blob, chess.js, revision, poll)     │
│  SNL MP:   api+lib/snl-invite.js (Blob, agents, levels, voice queue)    │
│  Chess settings blob, coach, leaderboard, presence                      │
└─────────────────────────────────────────────────────────────────────────┘
         Deploy today: cp HTML+assets → appgen-api → vercel --prod
```

| Surface | Role | Key paths |
|--------|------|-----------|
| **CV tailor** | JD → CV/letter; honesty guard; Blob saved apps | `Application_Generator.html`, `appgen-{kb,weave}.js`, `api/tailor.js` |
| **WTD shell** | Mode switch (`chess` / `snl` / `3d` / `rainbow`), labs, PWA, studio shared prefs | `appgen-wtd.js`, `appgen-wtd-studio.js`, `appgen-wtd.css` |
| **Chess lab** | 3D chess, curriculum, coach, PvP invite, env settings cloud sync | `appgen-wtd-chess.js` + chess-* modules, `api/chess-invite`, `api/chess-settings`, `api/wtd-chess-coach` |
| **SNL lab** | 3D Snakes & Ladders, lobby+agents, physics dice, path anim, voice queue | `appgen-wtd-snl.js` + snl-* modules, `api/snl-invite`, `lib/snl-levels.js` |
| **Auth** | Google OAuth → HMAC session cookie | `lib/auth-session.js`, `api/auth/*` |
| **Deploy** | Static HTML + assets copied into API project | `cp Application_Generator.html appgen-api/index.html` + `rsync`/`cp` assets |

**Routing today (hash):** `/#chess` (canonical; `#wtd` legacy), `/#snakes-ladders`, plus CV app routes inside the same HTML document.

---

## 3. File size / complexity baseline

Measured 2026-10-22 (`wc -c -l`). Bytes ≈ on-disk UTF-8; lines include blanks/comments.

### Core monolith & labs

| File | Lines | Bytes | Role |
|------|------:|------:|------|
| `Application_Generator.html` | 7 827 | 345 119 | CV UI + shell host |
| `appgen/assets/appgen-wtd-chess.js` | 4 464 | 141 899 | Chess lab SSoT (today: `let`) |
| `appgen/assets/appgen-wtd-snl.js` | 2 565 | 79 001 | SNL lab SSoT |
| `appgen/assets/appgen-wtd.css` | 3 689 | 76 397 | Shared WTD/chess/SNL styles |
| `appgen/assets/appgen-wtd.js` | 1 516 | 51 223 | Shell / mode / routing |
| `appgen/assets/appgen-wtd-3d.js` | 1 291 | 39 908 | 3D playground |
| `appgen/assets/appgen-wtd-rainbow.js` | 636 | 19 731 | Rainbow mode |
| `appgen/assets/appgen-kb.js` | 179 | 16 319 | CV knowledge base |
| `appgen/assets/appgen-weave.js` | 330 | 13 256 | Gap weave |

### Chess satellite modules

| File | Lines | Bytes |
|------|------:|------:|
| `appgen-wtd-chess-strategies.js` | 398 | 11 495 |
| `appgen-wtd-chess-scene-bg.js` | 492 | 16 073 |
| `appgen-wtd-chess-101.js` | 531 | 14 809 |
| `appgen-wtd-chess-settings.js` | 214 | 7 594 |
| `appgen-wtd-chess-golden-rules.js` | 273 | 8 916 |
| `appgen-wtd-chess-lesson-templates.js` | 159 | 5 097 |
| `appgen-wtd-chess-board-theme.js` | 149 | 5 161 |
| `appgen-wtd-chess-scene-light.js` | 54 | 1 639 |
| **Chess suite subtotal (main + satellites)** | **~6 734** | **~212 683** |

### SNL satellite modules

| File | Lines | Bytes |
|------|------:|------:|
| `appgen-wtd-snl-dice.js` | 561 | 15 962 |
| `appgen-wtd-snl-board.js` | 174 | 4 864 |
| `appgen-wtd-snl-pieces.js` | 133 | 4 260 |
| `appgen-wtd-snl-levels.js` | 75 | 1 590 |
| **SNL suite subtotal (main + satellites)** | **~3 508** | **~105 677** |

### Shared WTD extras

| File | Lines | Bytes |
|------|------:|------:|
| `appgen-wtd-studio.js` | 211 | 6 787 |
| `appgen-wtd-session-modal.js` | 140 | 4 706 |

### Multiplayer + auth (server)

| File | Lines | Bytes |
|------|------:|------:|
| `appgen-api/lib/snl-invite.js` | 627 | 20 175 |
| `appgen-api/api/snl-invite.js` | 251 | 8 068 |
| `appgen-api/lib/chess-invite.js` | 220 | 6 610 |
| `appgen-api/api/chess-invite.js` | 206 | 6 326 |
| `appgen-api/lib/auth-session.js` | 164 | 5 226 |
| **MP invite surface (chess+snl api+lib)** | **~1 304** | **~41 179** |

### Aggregate (order of magnitude)

| Bucket | Approx. lines | Approx. bytes |
|--------|-------------:|--------------:|
| HTML host | 7.8k | 345 KB |
| All `appgen-wtd*.js` + CSS | ~19k | ~593 KB (from combined `wc` of listed assets earlier ~593 KB total with kb/weave) |
| WTD JS+CSS alone (games shell) | ~18.5k | ~642 KB (earlier `appgen-wtd*` + css sum) |
| `appgen/assets` tree on disk | — | **~1.4 MB** (includes images / PWA icons) |
| `appgen-api` tree | — | **~137 MB** (node_modules / chromium / build artifacts — not shipped as static JS) |

**Hot spots for migration cost:** `Application_Generator.html` (routing + CV + asset graph), `appgen-wtd-chess.js` (largest single game module), `appgen-wtd-snl.js` + `lib/snl-invite.js` (richest multiplayer semantics), `appgen-wtd.css` (tightly coupled layout).

---

## 4. Complexity impact of Next.js migration

### What shrinks

| Area | Why |
|------|-----|
| Per-route JS payload | App Router / dynamic `import()` can load chess or SNL without the CV tailor UI |
| Duplicate invite patterns | Shared `GameRoom` + one storage adapter vs parallel chess/snl Blob libs |
| Hash-routing glue in HTML | Next.js file routes (`/chess`, `/snakes-ladders`, `/apply`) |
| Manual `cp` deploy drift | App lives *in* the Vercel project; fewer nested `assets/assets/` pitfalls |
| Agent token load | Small route modules + docs; stop full-reading 345 KB HTML |

### What grows

| Area | Rough add |
|------|-----------|
| Next.js + React + React-Redux | Framework + hydration (~tens–hundreds KB gzipped depending on RSC boundaries) |
| Redux Toolkit slices / middleware | Boilerplate + persistence adapters; **net LOC up** before chess/snl shrink |
| JSON Schema + codegen tooling | `schemas/`, generators, CI validate step |
| Monorepo (optional) | `pnpm`/`turbo` workspace, shared packages — process overhead |
| TypeScript (recommended) | Types for schema + store; migrate cost then safety gain |
| Three.js still heavy | 3D labs do **not** get smaller because of Next — only better code-split |

### Bundle-splitting strategy (target)

1. **Route groups:** `(apply)` CV tailor · `(games)` chess/SNL · `(labs)` 3d/rainbow.  
2. **Client-only islands:** Three.js canvases as `"use client"` with dynamic import `ssr: false`.  
3. **Shared packages:** `@appgen/auth`, `@appgen/game-room`, `@appgen/studio-prefs`, `@appgen/schemas`.  
4. **CSS:** split `appgen-wtd.css` into shell / chess / snl; purge unused for CV routes.

### Monorepo options

| Option | Pros | Cons | Recommendation |
|--------|------|------|----------------|
| **A. Single Next app** under `appgen-api` or new `apps/web` | Fastest path; one deploy | CV + games still one repo project | **Start here** |
| **B. Turborepo:** `apps/web`, `apps/apply` (CV), `packages/*` | Clear ownership; independent deploys later | More CI/tooling | Phase 2 after Redux+schema |
| **C. Separate Vercel projects per game** | True game packages from schema | Auth/cookie sharing harder; ops cost | Only after schema codegen proven |

### Complexity verdict

- **Migration does not reduce chess/SNL algorithmic complexity** — it relocates it.  
- **Expected net LOC increase for 1–2 milestones** (Redux + Next shell), then decrease when HTML is split and invite libs merge.  
- **Biggest win is operational:** route-level bundles, typed SSoT, schema-driven new games, safer multiplayer concurrency.

---

## 5. Proposed W3 / JSON Schema for boardgame types

Use **JSON Schema draft 2020-12** with optional **JSON-LD `@context`** mapping to schema.org-ish terms (`Game`, `PlayAction`, `Person`) where useful for SEO/export — runtime validation stays on JSON Schema / Zod.

### 5.1 Shared generics

```json
{
  "$id": "https://apply4job.vercel.app/schemas/boardgame/v1/core.json",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "BoardgameCore",
  "type": "object",
  "required": ["@type", "id", "version", "grid", "turn", "win", "players"],
  "properties": {
    "@type": { "const": "BoardGameDefinition" },
    "@context": { "type": "string" },
    "id": { "type": "string", "pattern": "^[a-z0-9][a-z0-9-]{1,63}$" },
    "version": { "type": "string" },
    "name": { "type": "string" },
    "grid": { "$ref": "#/$defs/Grid" },
    "turn": { "$ref": "#/$defs/TurnModel" },
    "pieces": { "$ref": "#/$defs/PieceCatalog" },
    "win": { "$ref": "#/$defs/WinCondition" },
    "multiplayer": { "$ref": "#/$defs/Multiplayer" },
    "studio": { "$ref": "#/$defs/Studio3D" },
    "presentation": {
      "type": "object",
      "properties": {
        "route": { "type": "string" },
        "manifest": { "type": "string" },
        "offlineCapable": { "type": "boolean" }
      }
    }
  },
  "$defs": {
    "Grid": {
      "type": "object",
      "required": ["kind", "width", "height"],
      "properties": {
        "kind": { "enum": ["rect", "path", "graph"] },
        "width": { "type": "integer", "minimum": 1 },
        "height": { "type": "integer", "minimum": 1 },
        "indexing": { "enum": ["chess-file-rank", "boustrophedon-1n", "row-major-0"] },
        "cells": { "type": "integer", "minimum": 1 },
        "portals": {
          "type": "array",
          "items": {
            "type": "object",
            "required": ["from", "to", "kind"],
            "properties": {
              "from": { "type": "integer" },
              "to": { "type": "integer" },
              "kind": { "enum": ["ladder", "snake", "warp"] }
            }
          }
        }
      }
    },
    "TurnModel": {
      "type": "object",
      "required": ["order", "actions"],
      "properties": {
        "order": { "enum": ["alternating", "simultaneous", "seat-order"] },
        "actions": {
          "type": "array",
          "items": { "enum": ["move", "roll", "resign", "setPiece", "pass"] }
        },
        "clock": { "type": ["object", "null"] }
      }
    },
    "PieceCatalog": {
      "type": "object",
      "additionalProperties": {
        "type": "object",
        "properties": {
          "role": { "type": "string" },
          "mesh": { "enum": ["chess-set", "token", "abstract"] },
          "rulesEngine": { "enum": ["chess.js", "snl-path", "custom"] }
        }
      }
    },
    "WinCondition": {
      "type": "object",
      "required": ["kind"],
      "properties": {
        "kind": { "enum": ["checkmate", "resign", "reach-cell", "last-standing", "custom"] },
        "targetCell": { "type": "integer" },
        "exactLanding": { "type": "boolean" }
      }
    },
    "Multiplayer": {
      "type": "object",
      "properties": {
        "minPlayers": { "type": "integer", "minimum": 1 },
        "maxPlayers": { "type": "integer", "minimum": 1 },
        "lobbyJoinMs": { "type": "integer" },
        "agents": {
          "type": "object",
          "properties": {
            "fillToMax": { "type": "boolean" },
            "rollMinMs": { "type": "integer" }
          }
        },
        "transport": { "enum": ["blob-poll", "sse", "websocket", "ably"] },
        "revisionField": { "const": "revision" },
        "voiceQueue": { "type": "boolean" }
      }
    },
    "Studio3D": {
      "type": "object",
      "properties": {
        "backdrop": { "type": "boolean" },
        "boardTextures": { "type": "boolean" },
        "lighting": { "type": "boolean" },
        "settingsBundleKind": { "type": "string" }
      }
    }
  }
}
```

### 5.2 Chess instance (sketch)

```json
{
  "@type": "BoardGameDefinition",
  "id": "wtd-chess",
  "version": "1.0.0",
  "name": "Walk the Dragon Chess",
  "grid": { "kind": "rect", "width": 8, "height": 8, "indexing": "chess-file-rank" },
  "turn": { "order": "alternating", "actions": ["move", "resign"] },
  "pieces": {
    "p": { "role": "pawn", "mesh": "chess-set", "rulesEngine": "chess.js" },
    "n": { "role": "knight", "mesh": "chess-set", "rulesEngine": "chess.js" },
    "k": { "role": "king", "mesh": "chess-set", "rulesEngine": "chess.js" }
  },
  "win": { "kind": "checkmate" },
  "multiplayer": {
    "minPlayers": 2,
    "maxPlayers": 2,
    "transport": "blob-poll",
    "agents": { "fillToMax": false }
  },
  "studio": {
    "backdrop": true,
    "boardTextures": true,
    "lighting": true,
    "settingsBundleKind": "appgen-wtd-chess-settings"
  },
  "presentation": {
    "route": "/chess",
    "manifest": "manifest-chess.webmanifest",
    "offlineCapable": true
  }
}
```

### 5.3 Snakes & Ladders instance (sketch)

```json
{
  "@type": "BoardGameDefinition",
  "id": "wtd-snl",
  "version": "1.0.0",
  "name": "Snakes & Ladders",
  "grid": {
    "kind": "path",
    "width": 10,
    "height": 10,
    "cells": 100,
    "indexing": "boustrophedon-1n",
    "portals": []
  },
  "turn": { "order": "seat-order", "actions": ["roll", "setPiece"] },
  "pieces": {
    "p": { "role": "token", "mesh": "chess-set", "rulesEngine": "snl-path" }
  },
  "win": { "kind": "reach-cell", "targetCell": 100, "exactLanding": true },
  "multiplayer": {
    "minPlayers": 2,
    "maxPlayers": 4,
    "lobbyJoinMs": 60000,
    "transport": "blob-poll",
    "agents": { "fillToMax": true, "rollMinMs": 1400 },
    "voiceQueue": true
  },
  "studio": { "backdrop": true, "boardTextures": true, "lighting": true },
  "presentation": {
    "route": "/snakes-ladders",
    "manifest": "manifest-snl.webmanifest",
    "offlineCapable": false
  }
}
```

Levels (`easy` 6×6 / `medium` 8×8 / `hard` 10×10) are **schema variants** or a `levels[]` array on the same document — mirror `lib/snl-levels.js` into schema, generate client+server level tables from one source.

### 5.4 Extensibility

New games = new JSON document + optional `rulesEngine` plugin ID. Generics cover:

| Generic | Covers |
|---------|--------|
| `grid` | Chess board, SNL path, future graph boards |
| `turn` | Alternating vs seat-order vs simultaneous |
| `pieces` | Catalog + mesh + engine binding |
| `win` | Checkmate, reach-cell, custom hooks |
| `multiplayer` | Seats, lobby, agents, transport |
| `studio` | Shared 3D env / texture / light prefs |

---

## 6. Schema → prebuilt packages → Vercel deploy

### Pipeline sketch

```
schemas/boardgames/*.game.json
        │
        ▼
  validate (AJV) ──► fail CI
        │
        ▼
  codegen (node script)
        ├─► packages/game-<id>/package.json  (name, exports)
        ├─► packages/game-<id>/definition.ts (typed const)
        ├─► packages/game-<id>/routes.meta.json (Next route + PWA)
        └─► apps/web/app/(games)/[gameId]/page.tsx stub (or static routes)
        │
        ▼
  build: next build (dynamic import runtime + Three island)
        │
        ▼
  vercel deploy --prod (same team; project may stay application-generator
                        or split later)
```

### Prebuilt vs runtime-interpreted

| Mode | When |
|------|------|
| **Prebuilt package** | Chess/SNL — heavy Three + curriculum; schema drives metadata + room shape + level tables |
| **Interpreted** | Future simple grid games — thin renderer reads schema at runtime |

**Recommendation:** Prebuilt for chess/SNL; keep schema as **contract + codegen input**, not a full rules interpreter (chess.js / SNL path math stay in code).

### Deploy mapping (future)

| Today | Tomorrow |
|-------|----------|
| `cp` HTML + assets into `appgen-api` | Next app is the deploy root (or `apps/web` → Vercel rootDirectory) |
| Hash routes `#chess` | Path routes `/chess` with redirects from `/#chess` |
| Manual cache `?v=` query on scripts | Content hashes from bundler |

---

## 7. Redux store design (SSoT)

### Principles

1. **Redux owns durable game/session/lobby/UI prefs that multiple views read.**  
2. **Three.js objects stay outside Redux** (renderer, meshes, orbit controls) — store *serializable* camera prefs / selected square / anim keys only.  
3. **Server invite JSON is authoritative for multiplayer**; Redux mirrors `revision` and rejects stale writes.  
4. **chess.js `Game` instance** may live in a non-serializable ref middleware or adapter; Redux holds FEN + move list + selection derived from it.

### Suggested slice map

| Slice | Maps from today | Contents (serializable) |
|-------|-----------------|-------------------------|
| `wtdShell` | `appgen-wtd.js` `currentWtdMode`, lab flags | `mode`, `mobileChessLab`, route helpers |
| `chessGame` | `game`, FEN, `selectedSquare`, `legalTargets`, `lastMove*`, `playMode`, `myColor` | Position + selection + mode |
| `chessSession` | `session`, curriculum, `practiceDrill`, coach flags, `lessonMode`, `beginnerHints` | Tutor progress + coaching toggles |
| `chessOrbit` | orbit target prefs / king-follow flag (not OrbitControls object) | `followHumanKing`, zoom/polar limits metadata |
| `chessEnv` | `sceneBgPrefs`, `boardThemePrefs`, `sceneLightPrefs`, drafts, modal open | Studio bundle (align with cloud settings) |
| `chessMultiplayer` | `pvpInvite`, `lastSyncedRevision`, `pvpSendingMove`, `inviteResumeState` | Lobby + revision |
| `snlLobby` | `lobbyInvite`, `lastRevision`, presence snapshot | Invite + seats + level |
| `snlPlay` | dice busy keys, `pathAnim` busy/slot/gen (not meshes), `animInFlightKey`, settings | Turn visuals coordination |
| `snlSettings` | `snlSettings` / draft / modal | Colors, difficulty |
| `auth` | session user from cookies / access-change | `sub`, name, signedIn |
| `studio` | shared studio handle prefs | Cross-game backdrop/board/light |

### Mapping from module-scoped `let` (chess)

| Current `let` / concern | Redux home |
|-------------------------|------------|
| `game`, move highlights, `selectedSquare`, `legalTargets` | `chessGame` |
| `session`, drills, coach recommend, golden rules focus | `chessSession` |
| `orbit` object | **keep imperative**; `chessOrbit` for policy flags |
| `sceneBgPrefs`, `boardThemePrefs`, `sceneLightPrefs`, env drafts | `chessEnv` |
| `pvpInvite`, `lastSyncedRevision`, poll timers | `chessMultiplayer` (+ timer outside store) |
| `renderer` / `scene` / `camera` / meshes | **never in Redux** |

### Mapping from module-scoped `let` (SNL)

| Current `let` / concern | Redux home |
|-------------------------|------------|
| `lobbyInvite`, `lastRevision` | `snlLobby` |
| `pollTimer`, `presenceTimer` | side-effect middleware / thunks |
| `pathAnim`, `animInFlightKey`, `lastAnimatedRollKey` | `snlPlay` |
| `dice` / cannon world | **imperative**; `diceBusy` in `snlPlay` |
| `snlSettings*` | `snlSettings` |
| Three board/token meshes | **never in Redux** |

### WTD shell

| Current | Redux |
|---------|-------|
| `currentWtdMode` / `setWtdMode` | `wtdShell.mode` + listener middleware to call game `init`/`onClose` once during bridge period |

---

## 8. Step-by-step Redux refactor phases (no code in this pass)

### Phase 0 — Instrumentation (½–1 day)

- Inventory every write to chess/SNL `let` state (grep + table).  
- Decide RTK vs plain Redux; recommend **Redux Toolkit + listener middleware**.  
- Add Redux DevTools in local/static build only.

### Phase 1 — Shell slice in monolith (1–2 days)

- Introduce store on `window` or ES module; mount from `appgen-wtd.js`.  
- Move `currentWtdMode` only; keep games untouched.  
- Prove no regression on `#chess` / `#snakes-ladders` routing.

### Phase 2 — Chess multiplayer + env slices (3–5 days)

- Lift `pvpInvite` / `lastSyncedRevision` / sending flags.  
- Lift `chessEnv` prefs (already have cloud bundle shape).  
- Leave Three engine + `game` object as-is.

### Phase 3 — Chess game/session slices (1–2 weeks)

- FEN/move list/selection/session/curriculum into Redux.  
- Adapter: chess.js mutations → dispatch; subscribers sync meshes.  
- Highest risk phase — ship behind feature flag if needed.

### Phase 4 — SNL lobby + play coordination (1 week)

- `lobbyInvite` + revision + settings into Redux.  
- Path-anim / dice busy keys into `snlPlay` (fix walk races via store invariants).  
- Keep cannon-es / meshes imperative.

### Phase 5 — Shared patterns + tests (3–5 days)

- Normalize invite mirror: `applyServerSnapshot(revision, payload)`.  
- Unit tests for reducers (revision CAS, game-over, lobby timeout).  

### Phase 6 — Next.js adoption (after Phase 3 or 4)

- Scaffold Next app; move CV route later or iframe/static export interim.  
- Port store as shared package; hydrate from server session cookie.  

### Phase 7 — Schema codegen + package extract

- Freeze chess/SNL JSON Schema; generate level tables + route meta.  
- Optional second Vercel project for pure games.

**Do not start Phase 6 before Phase 2** — otherwise you migrate spaghetti twice.

---

## 9. Server multiplayer analysis

### Today

| | Chess | SNL |
|--|-------|-----|
| Storage | Vercel Blob JSON per token | Same |
| Prefix | `wtd/chess-invites/` | `wtd/snl-invites/` |
| Client poll | ~1500 ms | ~1200 ms |
| Authority | Server validates moves via chess.js | Server rolls, portals, win, agents |
| Revision | Increment on move / reset | Increment on lobby/game events; voice queue **does not** bump |
| Seats | Host + guest (2) | 2–4; lobby 60s; agents fill |
| Extras | Resign, FEN + moves[] | Levels, pieces, turnHistory, walk path, WebRTC voiceQueue |
| Auth | Google session | Google session |

### Blob polling limitations

1. **No true CAS** — read-modify-write races if two writers interleave (mitigate with revision checks on POST; still TOCTOU under concurrency).  
2. **Latency** — 1.2–1.5s polls; agent turns feel OK; fast chess blitz does not.  
3. **Cost / churn** — frequent GET + JSON rewrite per move.  
4. **No push** — clients burn polls while idle in lobby.  
5. **Voice** — out-of-band queue on same blob without revision bump (good for game noise; easy to miss signals if poll skips fields).  
6. **TTL / expiry** — 24h invites; no presence-driven room GC beyond expiry helpers.

### Revision / CAS recommendations

- Every mutating API: `If-Match: <revision>` or body `baseRevision`; reject 409 on mismatch.  
- Store `revision` monotonically; never reuse.  
- Optional: Blob conditional writes if platform supports ETag — verify before relying.  
- Client Redux: ignore snapshots with `revision < lastRevision` (already partially true via `lastSyncedRevision` / `lastRevision`).

### Agent turns (SNL)

- Server `maybeAdvanceAgentTurn` on GET/roll — **authoritative simulation**.  
- Redux must treat agent rolls like human snapshots (animate from `lastRoll` / walk path).  
- Chess has no seat agents today (coach AI is client/API coach, not invite blob agents).

### Path to shared `GameRoom` abstraction

```
GameRoom<TState> {
  token, gameId, revision, status, players[], expiresAt,
  state: TState,           // chess: fen/moves; snl: positions/turn/lastRoll
  applyAction(actor, action, baseRevision) -> Result<TState>
}
StorageAdapter: BlobGameRoomStore | RedisStore | AblyChannel
Transport: poll | sse | ws
```

Refactor order: extract shared token/TTL/auth helpers → unify revision CAS → generics for chess/snl state schemas → keep separate `applyAction` engines.

### Realtime options vs keep Blob

| Option | Fit | Cost / ops | Verdict |
|--------|-----|------------|---------|
| **Keep Blob + poll** | Lobby games, low QPS | Lowest | **Default until CAS solid** |
| **SSE from serverless** | Push revisions; still need durable store | Medium; connection limits | Good interim for lobby |
| **WebSocket (separate process)** | Best for blitz | Needs always-on (not classic Vercel FN) | Later / external |
| **Ably / Pusher** | Fastest path to push + presence | Vendor $$ | Consider when >N concurrent rooms |

**Recommendation:** Keep Blob for durability; add **revision CAS** + optional **SSE notify** channel keyed by token; postpone Ably until metrics show poll pain.

---

## 10. Risks, sequencing, milestones, non-goals

### Risks

| Risk | Mitigation |
|------|------------|
| Chess `let` tangle during Redux Phase 3 | Feature-flag; mesh sync tests; smaller PRs |
| Next.js + Three SSR crashes | `dynamic(..., { ssr: false })` |
| Dual deploy (HTML cp + Next) confusion | One deploy root before deleting cp script |
| Schema over-ambition (full rules in JSON) | Schema = contract + levels + metadata only |
| Auth cookie across path/domains | Stay same origin; document cookie paths |
| Agent rewrite of HTML without reading this doc | Cursor rule points here |

### Sequencing (summary)

1. Redux shell → chess MP/env → chess game → SNL  
2. GameRoom CAS on existing Blob APIs  
3. Next.js shell + code-split games  
4. JSON Schema + codegen  
5. Optional realtime upgrade  

### Milestones (recommended first three — see §11)

See **§11 Recommended first 3 milestones**.

### Non-goals (repeat)

- No runtime code in the planning pass that produced this document.  
- No CV tailor rewrite.  
- No new board games until schema path works for SNL levels.  
- No mandatory Ably/WebSocket in v1.

---

## 11. Recommended first 3 milestones

1. **M1 — Redux SSoT in monolith (chess MP + env + wtdShell)**  
   Store + DevTools; `currentWtdMode`, chess invite revision mirror, chess env prefs. No Next.js yet.

2. **M2 — GameRoom revision CAS on Blob invites** *(partial — 2026-10-22)*  
   Shared helper for chess+SNL; 409 on stale `baseRevision`; see `docs/GAMEROOM_REVISION_CAS.md`. Client stale GET ignore (Redux mirror still TODO in M1).

3. **M3 — Next.js app shell + dynamic game islands** *(scaffold — 2026-10-22)*  
   Routes `/chess` and `/snakes-ladders` load current modules (or thin wrappers) without CV HTML; keep APIs; redirects from hash URLs.  
   **Implementation:** [`apps/wtd-web`](../apps/wtd-web) + [`docs/M3_WTD_WEB.md`](./M3_WTD_WEB.md). Prod cutover pending.

   **Pre-flight (2026-10-22 — not blockers for scaffold):**

   | Gap | Notes |
   |-----|--------|
   | ~~`chessOrbit`~~ | **Done (2026-10-22)** — policy in Redux; OrbitControls imperative |
   | Coaching UX | `lessonMode`, `beginnerHints` still module + localStorage |
   | Hint / recommend | `hintMove`, `coachRecommendMove` not in Redux |
   | `snlPlay` / `snlSettings` | Path-anim, dice busy, settings modal not migrated |
   | FEN subscriber | Push-on-move today; optional read-from-store on hydrate |
   | Stale GET ignore | Lobby/MP mirrors use CAS in store; spot-check any poll path still writing module state without revision guard |

   **Readiness:** M1 slice 5 (`chessGame` + `chessSession`) + MP/lobby mirrors — sufficient to start M3 with dynamic chess/SNL islands; complete remaining slices in monolith before deleting HTML cp deploy.

*(Then M4: orbit/coaching/SNL play Redux + shared invite tests; M5: schema codegen for levels + package meta.)*

---

## 12. Explicit planning disclaimer

> **Planning only — no code changed in this pass.**  
> This document, `APPGEN_SECOND_BRAIN.md`, `.cursor/rules/appgen-second-brain.mdc`, and Engram memory were updated to record the roadmap.  
> Application runtime (`Application_Generator.html`, game JS, API handlers) was **not** modified for migration work here.

---

## 13. Related docs & memory

| Artifact | Role |
|----------|------|
| `APPGEN_SECOND_BRAIN.md` | Product second brain; links here under Platform roadmap |
| `.cursor/rules/appgen-second-brain.mdc` | Agents must read this roadmap before Next/Redux/schema proposals |
| Engram `architecture/boardgames-nextjs-platform` | Durable decision pointer |
| Prod | https://apply4job.vercel.app |
