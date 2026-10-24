/**
 * WTD Chess PvP invites — one JSON blob per lobby (Vercel Blob).
 */
import crypto from "crypto";
import { Chess } from "chess.js";

export const CHESS_INVITE_PREFIX = "wtd/chess-invites/";
export const INVITE_TTL_MS = 24 * 60 * 60 * 1000;
export const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

const TOKEN_RE = /^[a-zA-Z0-9_-]{16,48}$/;

export function sanitizeInviteToken(raw) {
  const t = String(raw || "").trim();
  if (!TOKEN_RE.test(t)) return null;
  return t;
}

export function inviteBlobPath(token) {
  const safe = sanitizeInviteToken(token);
  if (!safe) return null;
  return CHESS_INVITE_PREFIX + safe + ".json";
}

export function newInviteToken() {
  return crypto.randomBytes(18).toString("base64url");
}

/** Share link — opener joins as guest (Black). Creator stays host (White) on `pvpSeat=host`. */
export function buildOpponentInviteUrl(origin, token) {
  const base = (origin || "").replace(/\/$/, "");
  const t = sanitizeInviteToken(token);
  if (!t) return "";
  return (
    base +
    "/#chess?chessInvite=" +
    encodeURIComponent(t) +
    "&pvpSeat=guest&joinRole=opponent"
  );
}

export function buildHostInviteUrl(origin, token) {
  const base = (origin || "").replace(/\/$/, "");
  const t = sanitizeInviteToken(token);
  if (!t) return "";
  return base + "/#chess?chessInvite=" + encodeURIComponent(t) + "&pvpSeat=host";
}

export function createInviteRecord({ token, hostId, hostName, origin }) {
  const now = Date.now();
  const path = inviteBlobPath(token);
  const url = buildOpponentInviteUrl(origin, token);
  return {
    version: 1,
    token,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + INVITE_TTL_MS).toISOString(),
    status: "waiting",
    host: {
      id: String(hostId || ""),
      name: String(hostName || "Host").trim().slice(0, 40)
    },
    guest: null,
    fen: START_FEN,
    moves: [],
    revision: 0,
    resignedBy: null,
    url
  };
}

export function inviteExpired(invite) {
  if (!invite || !invite.expiresAt) return true;
  return Date.now() > new Date(invite.expiresAt).getTime();
}

export function replayInviteMoves(invite) {
  const chess = new Chess();
  const moves = Array.isArray(invite.moves) ? invite.moves : [];
  for (const row of moves) {
    if (!row || typeof row !== "object") continue;
    const from = String(row.from || "");
    const to = String(row.to || "");
    if (!from || !to) continue;
    const promo = row.promotion ? String(row.promotion) : undefined;
    const result = chess.move({ from, to, promotion: promo });
    if (!result) break;
  }
  return chess;
}

/** Normalize client seat hint (`pvpSeat` / `joinRole` / color). */
export function normalizeSeatHint(raw) {
  const s = String(raw || "")
    .toLowerCase()
    .trim();
  if (s === "guest" || s === "opponent" || s === "black" || s === "b") return "guest";
  if (s === "host" || s === "white" || s === "w") return "host";
  return null;
}

function guestMatchesUser(invite, userId) {
  if (!invite || !invite.guest || !userId) return false;
  if (invite.guest.id === userId) return true;
  if (invite.guest.accountId && invite.guest.accountId === userId) return true;
  return false;
}

/**
 * Role for this request. When the same Google account holds both seats (dual-seat),
 * `seatHint` (`pvpSeat=guest|host`) selects which color — not account id alone.
 */
export function participantRole(invite, userId, seatHint) {
  const id = String(userId || "");
  if (!id || !invite) return null;
  const preferred = normalizeSeatHint(seatHint);
  const isHost = !!(invite.host && invite.host.id === id);
  const isGuest = guestMatchesUser(invite, id);

  if (preferred === "guest") {
    // Explicit Black-tab seat — dual-seat same account must not fall through to host.
    if (isGuest) return "guest";
    return null;
  }
  if (preferred === "host") {
    if (isHost) return "host";
    return null;
  }
  // No seat hint: dual-seat defaults to host (White tab / legacy clients).
  // Clients must send pvpSeat=guest on the opponent tab (sticky lock / hash).
  if (isHost && isGuest) return "host";
  if (isHost) return "host";
  if (isGuest) return "guest";
  return null;
}

export function colorForRole(role) {
  if (role === "host") return "w";
  if (role === "guest") return "b";
  return null;
}

export function roleForColor(color) {
  if (color === "w") return "host";
  if (color === "b") return "guest";
  return null;
}

export function publicInvitePayload(invite, userId, opts) {
  const seatHint =
    opts && typeof opts === "object"
      ? opts.seat || opts.pvpSeat || opts.joinRole
      : opts;
  const role = participantRole(invite, userId, seatHint);
  const chess = replayInviteMoves(invite);
  const turn = chess.turn();
  const myColor = colorForRole(role);
  const gameOver = chess.isGameOver();
  let outcome = null;
  if (gameOver) {
    if (chess.isCheckmate()) {
      outcome = chess.turn() === "w" ? "black_wins" : "white_wins";
    } else if (chess.isStalemate() || chess.isDraw()) {
      outcome = "draw";
    }
  }
  if (invite.resignedBy || invite.resignedByRole) {
    const resignedRole =
      invite.resignedByRole ||
      (invite.resignedBy === invite.host?.id && !invite.guest?.dualSeat
        ? "host"
        : invite.resignedBy === invite.guest?.id ||
            invite.resignedBy === invite.guest?.accountId
          ? "guest"
          : invite.resignedBy === invite.host?.id
            ? "host"
            : "guest");
    outcome = resignedRole === "host" ? "black_wins" : "white_wins";
  }
  const dualSeat = !!(invite.guest && invite.guest.dualSeat);
  return {
    token: invite.token,
    status: invite.status,
    createdAt: invite.createdAt,
    expiresAt: invite.expiresAt,
    expired: inviteExpired(invite),
    /** Opponent share link — opener joins as guest (Black). */
    url: invite.url || null,
    shareUrl: invite.url || null,
    host: invite.host
      ? { name: invite.host.name }
      : null,
    guest: invite.guest
      ? { name: invite.guest.name, dualSeat: !!invite.guest.dualSeat }
      : null,
    role,
    myColor,
    dualSeat,
    pvpSeat: role === "guest" ? "guest" : role === "host" ? "host" : null,
    fen: chess.fen(),
    moves: Array.isArray(invite.moves) ? invite.moves : [],
    revision: typeof invite.revision === "number" ? invite.revision : invite.moves?.length || 0,
    turn,
    isMyTurn: myColor ? turn === myColor && !gameOver && !invite.resignedBy : false,
    gameOver: gameOver || !!invite.resignedBy,
    outcome,
    resignedBy: invite.resignedBy || null,
    resignedByRole: invite.resignedByRole || null,
    pvp: invite.status === "active" || (invite.guest && invite.status !== "waiting")
  };
}

/**
 * Join as guest (Black). Same Google account as host is allowed (dual-seat /
 * local testing): guest.id may equal host.id; colors come from pvpSeat on each request.
 */
export function tryJoinInvite(invite, { guestId, guestName }) {
  if (inviteExpired(invite)) {
    return { ok: false, error: "Invite expired", code: "expired" };
  }
  const gid = String(guestId || "");
  const sameAsHost = !!(invite.host && invite.host.id === gid);
  if (invite.guest && !guestMatchesUser(invite, gid)) {
    return { ok: false, error: "Game already has a guest", code: "full" };
  }
  if (!invite.guest) {
    invite.guest = {
      id: gid,
      accountId: gid,
      name: String(guestName || (sameAsHost ? "You (Black)" : "Guest")).trim().slice(0, 40),
      dualSeat: sameAsHost
    };
    invite.status = "active";
    invite.fen = START_FEN;
    invite.moves = [];
    // Bump revision so host poll leaves waiting lobby (status change alone can share rev 0).
    invite.revision =
      (typeof invite.revision === "number" ? invite.revision : 0) + 1;
    invite.resignedBy = null;
    invite.resignedByRole = null;
  } else if (sameAsHost && invite.guest) {
    invite.guest.dualSeat = true;
    if (!invite.guest.accountId) invite.guest.accountId = gid;
  }
  return { ok: true, invite };
}

export function tryApplyMove(invite, userId, { from, to, promotion }, seatHint) {
  if (invite.status !== "active") {
    return { ok: false, error: "Game not active", code: "not_active" };
  }
  if (inviteExpired(invite)) {
    return { ok: false, error: "Invite expired", code: "expired" };
  }
  const role = participantRole(invite, userId, seatHint);
  if (!role) {
    return { ok: false, error: "Not a participant", code: "forbidden" };
  }
  const chess = replayInviteMoves(invite);
  if (chess.isGameOver()) {
    return { ok: false, error: "Game over", code: "game_over" };
  }
  const myColor = colorForRole(role);
  if (chess.turn() !== myColor) {
    return { ok: false, error: "Not your turn", code: "wrong_turn" };
  }
  let move;
  try {
    move = chess.move({
      from: String(from || ""),
      to: String(to || ""),
      promotion: promotion ? String(promotion) : undefined
    });
  } catch (_) {
    move = null;
  }
  if (!move) {
    return { ok: false, error: "Illegal move", code: "illegal_move" };
  }
  if (!Array.isArray(invite.moves)) invite.moves = [];
  invite.moves.push({
    from: move.from,
    to: move.to,
    san: move.san,
    promotion: move.promotion || undefined
  });
  invite.fen = chess.fen();
  invite.revision = (typeof invite.revision === "number" ? invite.revision : invite.moves.length - 1) + 1;
  if (chess.isGameOver()) {
    invite.status = "finished";
  }
  return { ok: true, invite, move };
}

export function tryResignInvite(invite, userId, seatHint) {
  const role = participantRole(invite, userId, seatHint);
  if (!role) {
    return { ok: false, error: "Not a participant", code: "forbidden" };
  }
  if (invite.status !== "active" && invite.status !== "waiting") {
    return { ok: false, error: "Game not in play", code: "not_active" };
  }
  invite.resignedBy = String(userId);
  invite.resignedByRole = role;
  invite.status = "finished";
  invite.revision =
    (typeof invite.revision === "number" ? invite.revision : invite.moves?.length || 0) + 1;
  return { ok: true, invite };
}
