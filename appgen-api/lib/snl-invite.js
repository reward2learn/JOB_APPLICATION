/**
 * Snakes & Ladders multiplayer lobbies (2–4 players, 60s join window).
 * Levels: easy 6×6 / medium 8×8 / hard 10×10. Exact win, overshoot stays.
 * Voice: WebRTC mesh signaled via invite.voiceQueue.
 */
import crypto from "crypto";
import { levelConfig, portalMaps, sanitizeLevel, SNL_LEVELS } from "./snl-levels.js";
import { sanitizePresenceGeo } from "./wtd-presence.js";

export const SNL_INVITE_PREFIX = "wtd/snl-invites/";
export const INVITE_TTL_MS = 24 * 60 * 60 * 1000;
export const LOBBY_JOIN_MS = 60 * 1000;
export const MAX_PLAYERS = 4;
export const MIN_PLAYERS = 2;
/** @deprecated use levelConfig — hard board win square */
export const WIN_SQUARE = 100;

const TOKEN_RE = /^[a-zA-Z0-9_-]{16,48}$/;
/** Per-tab seat id (sessionStorage); same Google account may fill multiple slots. */
const PLAYER_KEY_RE = /^[a-zA-Z0-9_-]{8,64}$/;
const VOICE_QUEUE_MAX = 120;
const VOICE_SIGNAL_TTL_MS = 90 * 1000;

export { SNL_LEVELS, sanitizeLevel, levelConfig };

/** Hard-level tables (compat). */
export const LADDERS = SNL_LEVELS.hard.ladders;
export const SNAKES = SNL_LEVELS.hard.snakes;

function boardForInvite(invite) {
  return levelConfig(invite && invite.level ? invite.level : "hard");
}

/** Dynamic agent display names (randomized at fill time). */
const AGENT_NAME_POOL = [
  "Agent Nova",
  "Agent Pixel",
  "Agent Rex",
  "Agent Mira",
  "Agent Kai",
  "Agent Luna",
  "Agent Zig",
  "Agent Echo",
  "Agent Ember",
  "Agent Quill"
];

export const AGENT_ROLL_MIN_MS = 1400;

/** Chess piece tokens: pawn, knight, bishop, rook, queen, king */
export const PIECE_TYPES = ["p", "n", "b", "r", "q", "k"];
const DEFAULT_PIECE_BY_SLOT = ["p", "n", "b", "r"];

export function isAgentPlayer(player) {
  return !!(player && (player.isAgent || String(player.id || "").startsWith("agent:")));
}

export function sanitizePieceType(raw) {
  const t = String(raw || "").toLowerCase().trim();
  return PIECE_TYPES.includes(t) ? t : null;
}

export function defaultPieceForSlot(slot) {
  return DEFAULT_PIECE_BY_SLOT[Number(slot) % DEFAULT_PIECE_BY_SLOT.length] || "p";
}

export function randomPieceType() {
  return PIECE_TYPES[Math.floor(Math.random() * PIECE_TYPES.length)];
}

export function sanitizeInviteToken(raw) {
  const t = String(raw || "").trim();
  if (!TOKEN_RE.test(t)) return null;
  return t;
}

export function sanitizePlayerKey(raw) {
  const k = String(raw || "").trim();
  if (!PLAYER_KEY_RE.test(k)) return null;
  return k;
}

/** Human player belongs to this signed-in Google account (legacy rows use id === account). */
export function playerOwnedByAccount(player, accountId) {
  if (!player || isAgentPlayer(player)) return false;
  const uid = String(accountId || "");
  if (!uid) return false;
  if (player.accountId && String(player.accountId) === uid) return true;
  if (!player.accountId && String(player.id) === uid) return true;
  return false;
}

/**
 * Which seat this tab controls. With `playerKey`, same account can hold multiple slots (chess dual-seat pattern).
 */
export function resolvePlayerForClient(invite, accountId, playerKey) {
  const uid = String(accountId || "");
  const pk = sanitizePlayerKey(playerKey);
  if (pk) {
    const byKey = findPlayer(invite, pk);
    if (!byKey) return null;
    return playerOwnedByAccount(byKey, uid) ? byKey : null;
  }
  if (!uid) return null;
  const legacy = findPlayer(invite, uid);
  return legacy && playerOwnedByAccount(legacy, uid) ? legacy : null;
}

export function inviteBlobPath(token) {
  const safe = sanitizeInviteToken(token);
  if (!safe) return null;
  return SNL_INVITE_PREFIX + safe + ".json";
}

export function newInviteToken() {
  return crypto.randomBytes(18).toString("base64url");
}

export function snlRouteHash() {
  return "snakes-ladders";
}

export function createInviteRecord({ token, hostId, hostName, origin, level, playerKey }) {
  const now = Date.now();
  // Default hard 10×10 until level picker ships; explicit level still honored.
  const levelId = level != null && String(level).trim() ? sanitizeLevel(level) : "hard";
  const cfg = levelConfig(levelId);
  const url =
    (origin || "").replace(/\/$/, "") +
    "/#" +
    snlRouteHash() +
    "?snlInvite=" +
    encodeURIComponent(token);
  const accountId = String(hostId || "");
  const pk = sanitizePlayerKey(playerKey);
  const hostPlayer = {
    id: pk || accountId,
    ...(pk ? { accountId } : {}),
    name: String(hostName || "Host").trim().slice(0, 40),
    slot: 0,
    position: 0,
    piece: defaultPieceForSlot(0)
  };
  return {
    version: 2,
    token,
    level: levelId,
    grid: cfg.grid,
    winSquare: cfg.winSquare,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + INVITE_TTL_MS).toISOString(),
    lobbyEndsAt: new Date(now + LOBBY_JOIN_MS).toISOString(),
    status: "lobby",
    hostId: hostPlayer.id,
    players: [hostPlayer],
    turnOrder: [hostPlayer.id],
    currentTurnIndex: 0,
    lastRoll: null,
    turnHistory: [],
    voiceQueue: [],
    winnerId: null,
    revision: 0,
    url
  };
}

export function inviteExpired(invite) {
  if (!invite || !invite.expiresAt) return true;
  return Date.now() > new Date(invite.expiresAt).getTime();
}

export function lobbyJoinOpen(invite) {
  if (!invite || invite.status !== "lobby") return false;
  if (!invite.lobbyEndsAt) return false;
  return Date.now() <= new Date(invite.lobbyEndsAt).getTime();
}

export function findPlayer(invite, userId) {
  const id = String(userId || "");
  if (!id || !invite || !Array.isArray(invite.players)) return null;
  return invite.players.find((p) => p && String(p.id) === id) || null;
}

export function applySnakesLadders(position, inviteOrLevel) {
  const cfg =
    typeof inviteOrLevel === "object" && inviteOrLevel
      ? boardForInvite(inviteOrLevel)
      : levelConfig(inviteOrLevel || "hard");
  const { ladderFrom, snakeFrom } = portalMaps(cfg);
  let pos = position;
  if (ladderFrom.has(pos)) pos = ladderFrom.get(pos);
  else if (snakeFrom.has(pos)) pos = snakeFrom.get(pos);
  return pos;
}

/**
 * Resolve a die roll into walk squares + optional snake/ladder portal.
 * @param {number} position
 * @param {number} roll
 * @param {object | string} [inviteOrLevel]
 */
export function advanceFromPosition(position, roll, inviteOrLevel) {
  const cfg =
    typeof inviteOrLevel === "object" && inviteOrLevel
      ? boardForInvite(inviteOrLevel)
      : levelConfig(inviteOrLevel || "hard");
  const { ladderFrom, snakeFrom } = portalMaps(cfg);
  const winSquare = cfg.winSquare;
  const start = Number(position) || 0;
  const steps = Number(roll) || 0;
  if (steps < 1 || steps > 6) return { ok: false, error: "Invalid roll" };

  /** @type {number[]} */
  const walk = [];
  let land = start;

  if (start === 0) {
    for (let i = 1; i <= steps; i++) walk.push(i);
    land = steps;
  } else {
    const target = start + steps;
    if (target > winSquare) {
      return {
        ok: true,
        position: start,
        moved: false,
        reason: "overshoot",
        walk: [],
        path: [],
        portal: null,
        portalFrom: null,
        portalTo: null,
        fromSquare: start,
        won: false
      };
    }
    for (let i = 1; i <= steps; i++) walk.push(start + i);
    land = target;
  }

  if (land > winSquare) {
    return {
      ok: true,
      position: start,
      moved: false,
      reason: "overshoot",
      walk: [],
      path: [],
      portal: null,
      portalFrom: null,
      portalTo: null,
      fromSquare: start,
      won: false
    };
  }

  const afterPortals = ladderFrom.has(land)
    ? ladderFrom.get(land)
    : snakeFrom.has(land)
      ? snakeFrom.get(land)
      : land;
  const portal =
    afterPortals !== land
      ? ladderFrom.has(land)
        ? "ladder"
        : snakeFrom.has(land)
          ? "snake"
          : null
      : null;
  const path = portal ? walk.concat([afterPortals]) : walk.slice();
  const won = afterPortals === winSquare;
  return {
    ok: true,
    position: afterPortals,
    moved: true,
    walk,
    path,
    portal,
    portalFrom: portal ? land : null,
    portalTo: portal ? afterPortals : null,
    fromSquare: land,
    won
  };
}

function pruneVoiceQueue(invite) {
  const cutoff = Date.now() - VOICE_SIGNAL_TTL_MS;
  let q = Array.isArray(invite.voiceQueue) ? invite.voiceQueue : [];
  q = q.filter((s) => s && s.at > cutoff);
  if (q.length > VOICE_QUEUE_MAX) q = q.slice(-VOICE_QUEUE_MAX);
  invite.voiceQueue = q;
  return q;
}

/**
 * Enqueue a WebRTC signaling message for another human in the lobby.
 * @param {object} invite
 * @param {string} fromId
 * @param {string} toId
 * @param {{ type: string, sdp?: object, candidate?: object }} signal
 */
export function tryVoiceSignal(invite, fromId, toId, signal) {
  if (!invite || inviteExpired(invite)) {
    return { ok: false, error: "Invite expired", code: "expired" };
  }
  if (invite.status !== "lobby" && invite.status !== "playing") {
    return { ok: false, error: "Lobby not active", code: "not_active" };
  }
  const from = findPlayer(invite, fromId);
  const to = findPlayer(invite, toId);
  if (!from || isAgentPlayer(from)) {
    return { ok: false, error: "Not a player", code: "forbidden" };
  }
  if (!to || isAgentPlayer(to)) {
    return { ok: false, error: "Target not in lobby", code: "bad_peer" };
  }
  const type = String((signal && signal.type) || "").toLowerCase();
  if (type !== "offer" && type !== "answer" && type !== "ice") {
    return { ok: false, error: "Invalid signal type", code: "bad_signal" };
  }
  pruneVoiceQueue(invite);
  invite.voiceQueue.push({
    id: crypto.randomBytes(8).toString("hex"),
    fromId: String(fromId),
    toId: String(toId),
    type,
    sdp: signal.sdp || null,
    candidate: signal.candidate || null,
    at: Date.now()
  });
  pruneVoiceQueue(invite);
  // Do not bump revision — voice is out-of-band so game polls stay quiet.
  return { ok: true, invite };
}

function pickAgentName(usedNames) {
  const pool = AGENT_NAME_POOL.filter((n) => !usedNames.has(n));
  const pick =
    pool.length > 0
      ? pool[Math.floor(Math.random() * pool.length)]
      : "Agent " + crypto.randomBytes(2).toString("hex");
  usedNames.add(pick);
  return pick;
}

/** Fill empty seats with random agents up to MAX_PLAYERS (e.g. solo → +3 agents). */
export function fillAgentsToMax(invite) {
  if (!invite || !Array.isArray(invite.players)) return invite;
  const usedNames = new Set(invite.players.map((p) => p.name));
  while (invite.players.length < MAX_PLAYERS) {
    const usedSlots = new Set(invite.players.map((p) => p.slot));
    let slot = 0;
    while (usedSlots.has(slot) && slot < MAX_PLAYERS) slot++;
    const name = pickAgentName(usedNames);
    invite.players.push({
      id: "agent:" + invite.token + ":" + slot + ":" + crypto.randomBytes(4).toString("hex"),
      name,
      slot,
      position: 0,
      isAgent: true,
      piece: randomPieceType()
    });
  }
  return invite;
}

function beginPlaying(invite, { startedEarly = false } = {}) {
  fillAgentsToMax(invite);
  invite.status = "playing";
  invite.turnOrder = invite.players.map((p) => p.id);
  invite.currentTurnIndex = 0;
  invite.filledWithAgents = true;
  invite.startedEarly = !!startedEarly;
  invite.revision = (invite.revision || 0) + 1;
  return invite;
}

export function maybeCloseLobby(invite) {
  if (!invite || invite.status !== "lobby") return invite;
  if (lobbyJoinOpen(invite)) return invite;
  const humans = (invite.players || []).filter((p) => !isAgentPlayer(p));
  if (!humans.length) {
    invite.status = "cancelled";
    return invite;
  }
  // Solo (or short table): auto-fill remaining seats with agents so the game always starts.
  return beginPlaying(invite, { startedEarly: false });
}

/** Host starts the match before the join countdown ends. */
export function tryStartLobby(invite, userId) {
  if (!invite) return { ok: false, error: "Missing invite", code: "not_found" };
  if (inviteExpired(invite)) {
    return { ok: false, error: "Invite expired", code: "expired" };
  }
  if (invite.status !== "lobby") {
    return { ok: false, error: "Lobby already closed", code: "not_lobby" };
  }
  if (invite.hostId !== String(userId || "")) {
    return { ok: false, error: "Only the host can start", code: "forbidden" };
  }
  const humans = (invite.players || []).filter((p) => !isAgentPlayer(p));
  if (!humans.length) {
    return { ok: false, error: "No players to start", code: "empty" };
  }
  invite.lobbyEndsAt = new Date().toISOString();
  beginPlaying(invite, { startedEarly: true });
  return { ok: true, invite };
}

/** Update a human player's device location / timezone on the invite. */
export function tryPlayerPresence(invite, userId, geoRaw, playerKey) {
  if (!invite || inviteExpired(invite)) {
    return { ok: false, error: "Invite expired", code: "expired" };
  }
  if (invite.status !== "lobby" && invite.status !== "playing") {
    return { ok: false, error: "Not active", code: "not_active" };
  }
  const me = resolvePlayerForClient(invite, userId, playerKey);
  if (!me || isAgentPlayer(me)) {
    return { ok: false, error: "Not a player", code: "forbidden" };
  }
  const geo = sanitizePresenceGeo(geoRaw || {});
  if (geo.lat != null) me.lat = geo.lat;
  if (geo.lng != null) me.lng = geo.lng;
  if (geo.timezone) me.timezone = geo.timezone;
  me.presenceAt = new Date().toISOString();
  // Soft bump so other clients refresh presence without treating it as a game move.
  invite.presenceRevision = (invite.presenceRevision || 0) + 1;
  return { ok: true, invite };
}

/**
 * When the current turn is an agent, roll once (debounced) so play advances like a human.
 * @returns {{ invite: object, rolled: boolean, roll?: number }}
 */
export function maybeAdvanceAgentTurn(invite) {
  if (!invite || invite.status !== "playing") {
    return { invite, rolled: false };
  }
  const turnId = currentTurnPlayerId(invite);
  const player = (invite.players || []).find((p) => p && p.id === turnId);
  if (!player || !isAgentPlayer(player)) {
    return { invite, rolled: false };
  }
  const now = Date.now();
  if (
    invite.lastAgentRollAt &&
    now - new Date(invite.lastAgentRollAt).getTime() < AGENT_ROLL_MIN_MS
  ) {
    return { invite, rolled: false };
  }
  const result = tryRoll(invite, player.id, null);
  if (!result.ok) return { invite, rolled: false };
  invite.lastAgentRollAt = new Date(now).toISOString();
  return { invite: result.invite, rolled: true, roll: result.roll };
}

export function currentTurnPlayerId(invite) {
  if (!invite || invite.status !== "playing") return null;
  const order = invite.turnOrder || [];
  const idx = invite.currentTurnIndex || 0;
  return order[idx] || null;
}

export function publicInvitePayload(invite, userId, opts) {
  const playerKey =
    opts && typeof opts === "object" ? opts.playerKey : typeof opts === "string" ? opts : null;
  const me = resolvePlayerForClient(invite, userId, playerKey);
  const myPlayerId = me ? String(me.id) : "";
  const lobbyOpen = lobbyJoinOpen(invite);
  const turnId = currentTurnPlayerId(invite);
  const cfg = boardForInvite(invite);
  const uid = String(userId || "");
  pruneVoiceQueue(invite);
  const voiceSignals = (invite.voiceQueue || []).filter((s) => s && s.toId === myPlayerId);
  return {
    token: invite.token,
    status: invite.status,
    level: cfg.id,
    levelLabel: cfg.label,
    grid: cfg.grid,
    winSquare: cfg.winSquare,
    ladders: cfg.ladders,
    snakes: cfg.snakes,
    createdAt: invite.createdAt,
    expiresAt: invite.expiresAt,
    lobbyEndsAt: invite.lobbyEndsAt,
    lobbyOpen,
    lobbySecondsLeft: lobbyOpen
      ? Math.max(
          0,
          Math.ceil((new Date(invite.lobbyEndsAt).getTime() - Date.now()) / 1000)
        )
      : 0,
    expired: inviteExpired(invite),
    url: invite.url || null,
    hostId: invite.hostId,
    players: (invite.players || []).map((p) => ({
      slot: p.slot,
      name: p.name,
      position: p.position,
      piece: sanitizePieceType(p.piece) || defaultPieceForSlot(p.slot),
      isAgent: isAgentPlayer(p),
      isYou: myPlayerId !== "" && String(p.id) === myPlayerId,
      /** Stable id for WebRTC voice mesh (humans only). */
      peerId: isAgentPlayer(p) ? null : p.id,
      lat: isAgentPlayer(p) ? null : p.lat ?? null,
      lng: isAgentPlayer(p) ? null : p.lng ?? null,
      timezone: isAgentPlayer(p) ? null : p.timezone || null,
      presenceAt: isAgentPlayer(p) ? null : p.presenceAt || null
    })),
    presenceRevision:
      typeof invite.presenceRevision === "number" ? invite.presenceRevision : 0,
    startedEarly: !!invite.startedEarly,
    myPeerId: me && !isAgentPlayer(me) ? me.id : null,
    mySlot: me ? me.slot : null,
    myPiece: me
      ? sanitizePieceType(me.piece) || defaultPieceForSlot(me.slot)
      : null,
    isHost: invite.hostId === uid,
    turnPlayerSlot:
      turnId && invite.players
        ? (invite.players.find((p) => p.id === turnId) || {}).slot
        : null,
    turnIsAgent: (() => {
      const tp = (invite.players || []).find((p) => p && p.id === turnId);
      return isAgentPlayer(tp);
    })(),
    isMyTurn: myPlayerId !== "" && turnId === myPlayerId,
    dualSeat:
      !!me &&
      (invite.players || []).some(
        (p) => p && p !== me && !isAgentPlayer(p) && playerOwnedByAccount(p, uid)
      ),
    lastRoll: invite.lastRoll || null,
    turnHistory: Array.isArray(invite.turnHistory) ? invite.turnHistory.slice(-12) : [],
    voiceSignals,
    filledWithAgents: !!invite.filledWithAgents,
    winnerSlot:
      invite.winnerId && invite.players
        ? (invite.players.find((p) => p.id === invite.winnerId) || {}).slot
        : null,
    revision: typeof invite.revision === "number" ? invite.revision : 0,
    maxPlayers: MAX_PLAYERS,
    rules: {
      winSquare: cfg.winSquare,
      grid: cfg.grid,
      level: cfg.id,
      exactWin: true,
      overshootStays: true,
      shareSquares: true,
      dice: "1d6"
    }
  };
}

export function tryJoinInvite(invite, { userId, userName, playerKey }) {
  if (inviteExpired(invite)) {
    return { ok: false, error: "Invite expired", code: "expired" };
  }
  const accountId = String(userId || "");
  const pk = sanitizePlayerKey(playerKey);

  if (pk) {
    const seated = findPlayer(invite, pk);
    if (seated) {
      if (!playerOwnedByAccount(seated, accountId)) {
        return { ok: false, error: "Not your seat", code: "forbidden" };
      }
      return { ok: true, invite };
    }
  } else {
    const legacy = findPlayer(invite, accountId);
    if (legacy && playerOwnedByAccount(legacy, accountId)) {
      return { ok: true, invite };
    }
  }

  maybeCloseLobby(invite);
  if (invite.status !== "lobby") {
    const me = pk ? findPlayer(invite, pk) : findPlayer(invite, accountId);
    if (me && playerOwnedByAccount(me, accountId)) return { ok: true, invite };
    return { ok: false, error: "Lobby closed", code: "lobby_closed" };
  }
  if (!lobbyJoinOpen(invite)) {
    maybeCloseLobby(invite);
    const me = pk ? findPlayer(invite, pk) : findPlayer(invite, accountId);
    if (me && playerOwnedByAccount(me, accountId)) return { ok: true, invite };
    return { ok: false, error: "Join window ended", code: "lobby_closed" };
  }
  if (!Array.isArray(invite.players)) invite.players = [];
  if (invite.players.length >= MAX_PLAYERS) {
    return { ok: false, error: "Game is full (4 players max)", code: "full" };
  }
  const used = new Set(invite.players.map((p) => p.slot));
  let slot = 0;
  while (used.has(slot) && slot < MAX_PLAYERS) slot++;
  const newId = pk || accountId;
  invite.players.push({
    id: newId,
    ...(pk ? { accountId } : {}),
    name: String(userName || "Player").trim().slice(0, 40),
    slot,
    position: 0,
    piece: defaultPieceForSlot(slot)
  });
  invite.revision = (invite.revision || 0) + 1;
  return { ok: true, invite };
}

export function trySetPiece(invite, userId, pieceRaw, playerKey) {
  if (inviteExpired(invite)) {
    return { ok: false, error: "Invite expired", code: "expired" };
  }
  if (invite.status !== "lobby" && invite.status !== "playing") {
    return { ok: false, error: "Cannot change piece now", code: "not_active" };
  }
  const me = resolvePlayerForClient(invite, userId, playerKey);
  if (!me || isAgentPlayer(me)) {
    return { ok: false, error: "Not a player", code: "forbidden" };
  }
  const piece = sanitizePieceType(pieceRaw);
  if (!piece) {
    return { ok: false, error: "Invalid piece (use p/n/b/r/q/k)", code: "bad_piece" };
  }
  me.piece = piece;
  invite.revision = (invite.revision || 0) + 1;
  return { ok: true, invite };
}

export function tryRoll(invite, userId, rollValue, playerKey) {
  maybeCloseLobby(invite);
  if (invite.status !== "playing") {
    return { ok: false, error: "Game not in play", code: "not_playing" };
  }
  if (inviteExpired(invite)) {
    return { ok: false, error: "Invite expired", code: "expired" };
  }
  const me = resolvePlayerForClient(invite, userId, playerKey);
  if (!me) {
    return { ok: false, error: "Not a player", code: "forbidden" };
  }
  const turnId = currentTurnPlayerId(invite);
  if (turnId !== String(me.id)) {
    return { ok: false, error: "Not your turn", code: "wrong_turn" };
  }
  if (!me) {
    return { ok: false, error: "Not a player", code: "forbidden" };
  }
  const roll =
    typeof rollValue === "number" && rollValue >= 1 && rollValue <= 6
      ? rollValue
      : 1 + Math.floor(Math.random() * 6);

  const before = me.position;
  const result = advanceFromPosition(before, roll, invite);
  if (!result.ok) {
    return { ok: false, error: result.error || "Move failed", code: "bad_roll" };
  }
  if (result.moved) me.position = result.position;

  invite.lastRoll = {
    playerSlot: me.slot,
    playerName: me.name,
    piece: sanitizePieceType(me.piece) || defaultPieceForSlot(me.slot),
    value: roll,
    from: before,
    to: me.position,
    walk: result.walk || [],
    path: result.path || [],
    portal: result.portal || null,
    portalFrom: result.portalFrom ?? null,
    portalTo: result.portalTo ?? null,
    fromSquare: result.fromSquare ?? null,
    overshoot: result.reason === "overshoot"
  };
  invite.turnHistory = Array.isArray(invite.turnHistory) ? invite.turnHistory : [];
  invite.turnHistory.push({ ...invite.lastRoll, at: Date.now() });
  if (invite.turnHistory.length > 16) {
    invite.turnHistory = invite.turnHistory.slice(-16);
  }

  if (result.won) {
    invite.winnerId = me.id;
    invite.status = "finished";
  } else {
    const order = invite.turnOrder || [];
    invite.currentTurnIndex =
      ((invite.currentTurnIndex || 0) + 1) % Math.max(order.length, 1);
  }

  invite.revision = (invite.revision || 0) + 1;
  return { ok: true, invite, roll };
}
