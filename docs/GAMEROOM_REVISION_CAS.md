# GameRoom revision CAS (Blob invites)

**Status:** Implemented for chess + SNL mutating POSTs (2026-10-22).  
**Roadmap:** M2 in `docs/BOARDGAMES_NEXTJS_ROADMAP.md`.

## Protocol

- Every invite JSON carries monotonic integer **`revision`** (game state).
- SNL also has **`presenceRevision`** for geo/presence only (no CAS on game revision).
- **Mutating POST** (join, setPiece, roll, start, move, resign): optional body field  
  `baseRevision: <number>` or header `If-Match: "<revision>"`.
- If `baseRevision` is **omitted**, the server applies the mutation (legacy clients).
- If `baseRevision` **≠** current `revision`, respond **409** with  
  `{ ok: false, code: "stale_revision", revision: <current>, invite?: … }`.
- Clients should **ignore GET snapshots** where `revision < lastSeenRevision`.
- After 409, **GET** the invite and retry once with the new `baseRevision`.

## Actions

| Game | CAS actions | No CAS |
|------|-------------|--------|
| SNL | join, setPiece, roll, start | create, presence, GET |
| Chess | join, move, resign | create, GET |

## Implementation

- Shared helper: `appgen-api/lib/game-room-cas.js`
- Handlers: `api/snl-invite.js`, `api/chess-invite.js`
- Clients: `appgen-wtd-snl.js` (`apiFetch`), `appgen-wtd-chess.js` (`chessInviteFetch`)
