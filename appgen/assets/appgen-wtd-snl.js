/**
 * WTD Snakes & Ladders — 2–4 player online lobby (60s join), Three.js board + physics dice.
 */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  CELL,
  TOKEN_Y,
  boardCenterHalf,
  boardGridCenterWorld,
  getGrid,
  getWinSquare,
  portalCurveMid,
  portalSegments,
  playerColorHex,
  reconstructMoveRoute,
  setActiveBoardLevel,
  squareToRowCol,
  squareToWorld,
  syncBoardFromInviteMeta,
  tokenWorldPosition
} from "./appgen-wtd-snl-board.js";
import { SNL_LEVELS, levelConfig, sanitizeLevel } from "./appgen-wtd-snl-levels.js";
import { createSnLDice } from "./appgen-wtd-snl-dice.js";
import {
  applyBoardOrbitLimits,
  createOrbitFreeExplore
} from "./appgen-wtd-orbit-free.js";
import {
  SNL_PIECE_GLYPHS,
  SNL_PIECE_LABELS,
  SNL_PIECE_TYPES,
  createSnLPieceToken,
  defaultPieceForSlot,
  disposeSnLPieceToken,
  sanitizePieceType
} from "./appgen-wtd-snl-pieces.js";
import {
  attachWtdStudioEnvironment,
  createStudioSquareMaterial,
  ensureStudioSettingsSynced,
  loadStudioBoardTextures,
  refreshStudioSquareMaterial
} from "./appgen-wtd-studio.js";
import { DEFAULT_STUDIO_COLOR } from "./appgen-wtd-chess-scene-bg.js";
import {
  store as wtdStore,
  dispatch as wtdDispatch,
  applySnlInviteSnapshot,
  setSnlLobbyInvite,
  clearSnlLobby,
  selectSnlLobbyInvite,
  selectSnlLastRevision,
  selectSnlLastPresenceRevision
} from "./appgen-wtd-store.js?v=20261025-remove-rainbow-v1";

const SNL_INVITE_API = "/api/snl-invite";
const PRESENCE_API = "/api/wtd-presence";
const POLL_MS = 1200;
const PRESENCE_HEARTBEAT_MS = 45 * 1000;
const PENDING_KEY = "wtdSnLInvitePending";
const TAB_PLAYER_KEY_PREFIX = "wtdSnLTabPlayerKey:";
const PIECE_PREF_KEY = "wtdSnLPreferredPiece";
const SNL_SETTINGS_KEY = "wtdSnLSettings";
const TOKEN_RE = /^[a-zA-Z0-9_-]{16,48}$/;
/** Defaults: blue ladders (up), red snakes (down). */
const DEFAULT_SNL_SETTINGS = {
  ladderColor: "#2563eb",
  snakeColor: "#dc2626",
  level: "hard"
};
const SNL_COG_SVG =
  '<svg class="wtd-chess-btn-svg" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">' +
  '<path fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/>' +
  '<path fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/>' +
  "</svg>";

let boardHost = null;
let renderer = null;
let scene = null;
let camera = null;
let orbit = null;
let animId = 0;
let resizeObs = null;
let tokenMeshes = new Map();
let pollTimer = null;
let pollActiveToken = "";
let pollInFlight = false;
let joinLobbyInFlight = null;
/** Dedupe joinFromHash (openWtd + init + hashchange + auth retry). */
let joinFromHashInFlight = null;
let initialized = false;
/** @type {ReturnType<typeof createSnLDice> | null} */
let dice = null;
let diceBusy = false;
let lastAnimatedRollKey = "";
/** Dedupes playTurnVisual; cleared when walk animation finishes. */
let animInFlightKey = "";
/** Roll whose token must stay at `lastRoll.from` until path anim completes. */
let pendingPathRollKey = "";
/** Shared promise so roller + poll never skip awaiting the same path anim. */
/** @type {Promise<void> | null} */
let inflightTurnVisualPromise = null;
/** @type {string} */
let inflightTurnVisualKey = "";
/** Skip remote dice shake when this client already shook for the roll key. */
let skipDiceForRollKey = "";
/** Server invite with final positions — applied to Redux only after path anim. */
/** @type {object | null} */
let inviteTruthPendingCommit = null;
let lastTick = 0;
let pointerBound = false;
const pointerNdc = new THREE.Vector2();
const diceRaycaster = new THREE.Raycaster();
const screenCenterNdc = new THREE.Vector2(0, 0);
const boardPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.055);
const boardPlaneHit = new THREE.Vector3();
const cameraTargetDesired = new THREE.Vector3();
const CAM_TARGET_LERP = 3.2;
const snlOrbitFree = createOrbitFreeExplore();
/** Orbit offset from focus point while following your piece. */
const PIECE_CAM_OFFSET = new THREE.Vector3(0.42, 4.85, 3.35);
/** @type {{ mesh: THREE.Mesh, isLight: boolean }[]} */
let squareTiles = [];
/** @type {{ mesh: THREE.Mesh, kind: "ladder"|"snake", extras: THREE.Mesh[] }[]} */
let portalMeshes = [];
/** @type {THREE.Group | null} */
let boardRoot = null;
/** @type {ReturnType<typeof attachWtdStudioEnvironment> | null} */
let studioHandle = null;
let studioAccessBound = false;
/** @type {{ busy: boolean, slot: number | null, gen: number }} */
let pathAnim = { busy: false, slot: null, gen: 0 };
/** @type {THREE.Object3D[]} */
let pathMarkers = [];
let piecePickerExpanded = false;
/** Turn route log is collapsed by default to keep the board visible. */
let turnLogExpanded = false;
/** @type {typeof DEFAULT_SNL_SETTINGS} */
let snlSettings = { ...DEFAULT_SNL_SETTINGS };
/** @type {typeof DEFAULT_SNL_SETTINGS | null} */
let snlSettingsDraft = null;
let snlSettingsOpen = false;
let snlSettingsBound = false;
let snlGameOverBound = false;
let snlRollDiceBtnBound = false;
/** Draft piece while SNL settings modal is open. */
let snlPieceDraft = "p";
let onlineInviteModalOpen = false;
let onlineInviteModalBound = false;
let inboxModalOpen = false;
let inboxModalBound = false;
/** @type {object | null} */
let activeInboxItem = null;
/** @type {{ lat: number|null, lng: number|null, timezone: string|null }} */
let deviceGeo = { lat: null, lng: null, timezone: null };
/** @type {object[]} */
let activeLabUsers = [];
let presenceTimer = null;
/** @type {object[]} */
let pendingInboxInvites = [];
/** @type {Set<string>} */
const seenInboxIds = new Set();
/** @type {Set<string>} */
const notifiedInboxIds = new Set();
let labPresenceTimer = null;
/** Lobby token we already heartbeat for — avoid re-arming on every poll/re-render. */
let presenceHeartbeatToken = null;
let flipTimerId = 0;
/** @type {string | null} */
let activeBoardLevelKey = null;

/** SNL lobby SSoT — Redux `snlLobby` (invite / revision / presence). */
function getLobbyInvite() {
  return selectSnlLobbyInvite(wtdStore.getState());
}
function getLastRevision() {
  return selectSnlLastRevision(wtdStore.getState());
}
function getLastPresenceRevision() {
  return selectSnlLastPresenceRevision(wtdStore.getState());
}
function mirrorSnlInvite(inv) {
  wtdDispatch(applySnlInviteSnapshot(inv));
}

function rollPlayerSlot(lr) {
  if (!lr) return null;
  const s = Number(lr.playerSlot);
  return Number.isFinite(s) ? s : null;
}

/** Redux mirror with mover still on `lastRoll.from` until walk anim commits. */
function inviteWithRollStartPositions(inv) {
  const lr = inv && inv.lastRoll;
  const slot = rollPlayerSlot(lr);
  if (!lr || lr.overshoot || slot == null || !Array.isArray(inv.players)) return inv;
  const from = typeof lr.from === "number" ? lr.from : Number(lr.from) || 0;
  return {
    ...inv,
    players: inv.players.map((p) =>
      Number(p.slot) === slot ? { ...p, position: from } : { ...p }
    )
  };
}

/**
 * @param {object} inv
 * @param {{ skipPositionDefer?: boolean, commitPositions?: boolean }} [opts]
 */
function mirrorInviteState(inv, opts) {
  if (!inv) return;
  if (opts && opts.commitPositions) {
    if (inviteTruthPendingCommit) {
      mirrorSnlInvite(inviteTruthPendingCommit);
      inviteTruthPendingCommit = null;
    } else {
      mirrorSnlInvite(inv);
    }
    return;
  }
  const key = rollKey(inv);
  const defer =
    !(opts && opts.skipPositionDefer) &&
    inv.lastRoll &&
    !inv.lastRoll.overshoot &&
    key &&
    key !== lastAnimatedRollKey &&
    (inv.status === "playing" || inv.status === "finished");

  if (defer) {
    inviteTruthPendingCommit = inv;
    mirrorSnlInvite(inviteWithRollStartPositions(inv));
  } else {
    mirrorSnlInvite(inv);
  }
}

function commitInviteTruthIfPending(key) {
  if (!inviteTruthPendingCommit) return;
  if (key && rollKey(inviteTruthPendingCommit) !== key) return;
  mirrorSnlInvite(inviteTruthPendingCommit);
  inviteTruthPendingCommit = null;
}
function forceSnlLobbyInvite(inv) {
  wtdDispatch(setSnlLobbyInvite(inv));
}
function clearSnlLobbyMirror() {
  wtdDispatch(clearSnlLobby());
}

function $(id) {
  return document.getElementById(id);
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;");
}

/** @param {unknown} raw @returns {string} */
function normalizeHexColor(raw, fallback) {
  const s = String(raw || "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(s)) {
    const t = s
      .slice(1)
      .split("")
      .map((c) => c + c)
      .join("");
    return ("#" + t).toLowerCase();
  }
  return fallback;
}

function hexToInt(hex, fallbackInt) {
  const n = parseInt(String(hex || "").replace("#", ""), 16);
  return Number.isFinite(n) ? n : fallbackInt;
}

function loadSnLSettings() {
  try {
    const raw = localStorage.getItem(SNL_SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SNL_SETTINGS };
    const parsed = JSON.parse(raw);
    return {
      ladderColor: normalizeHexColor(parsed.ladderColor, DEFAULT_SNL_SETTINGS.ladderColor),
      snakeColor: normalizeHexColor(parsed.snakeColor, DEFAULT_SNL_SETTINGS.snakeColor),
      level: sanitizeLevel(parsed.level != null ? parsed.level : DEFAULT_SNL_SETTINGS.level)
    };
  } catch (_) {
    return { ...DEFAULT_SNL_SETTINGS };
  }
}

function saveSnLSettings(prefs) {
  snlSettings = {
    ladderColor: normalizeHexColor(prefs.ladderColor, DEFAULT_SNL_SETTINGS.ladderColor),
    snakeColor: normalizeHexColor(prefs.snakeColor, DEFAULT_SNL_SETTINGS.snakeColor),
    level: sanitizeLevel(prefs.level != null ? prefs.level : DEFAULT_SNL_SETTINGS.level)
  };
  try {
    localStorage.setItem(SNL_SETTINGS_KEY, JSON.stringify(snlSettings));
  } catch (_) {
    /* ignore */
  }
  return snlSettings;
}

function portalColorForKind(kind) {
  const prefs = snlSettingsDraft && snlSettingsOpen ? snlSettingsDraft : snlSettings;
  return kind === "ladder"
    ? hexToInt(prefs.ladderColor, 0x2563eb)
    : hexToInt(prefs.snakeColor, 0xdc2626);
}

function settingsButtonHtml() {
  return (
    '<button type="button" class="btn ghost wtd-chess-icon-btn" id="wtdSnLOpenSettings" aria-label="Snakes and Ladders settings" title="Snakes &amp; Ladders settings">' +
    SNL_COG_SVG +
    "</button>"
  );
}

const SNL_INVITE_SVG =
  '<svg class="wtd-chess-btn-svg" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">' +
  '<path fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>' +
  '<circle cx="9" cy="7" r="3.5" fill="none" stroke="currentColor" stroke-width="1.75"/>' +
  '<path fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" d="M19 8v6M22 11h-6"/>' +
  "</svg>";

const SNL_LINK_SVG =
  '<svg class="wtd-chess-btn-svg" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">' +
  '<path fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" d="M10 13a5 5 0 0 0 7.07 0l1.41-1.41a5 5 0 0 0-7.07-7.07L10.5 5.5"/>' +
  '<path fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" d="M14 11a5 5 0 0 0-7.07 0L5.52 12.41a5 5 0 0 0 7.07 7.07L13.5 18.5"/>' +
  "</svg>";

const SNL_PLAY_SVG =
  '<svg class="wtd-chess-btn-svg" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">' +
  '<path fill="currentColor" d="M8 5.5v13l11-6.5-11-6.5Z"/>' +
  "</svg>";

const SNL_REFRESH_SVG =
  '<svg class="wtd-chess-btn-svg" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">' +
  '<path fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" d="M4 12a8 8 0 0 1 13.5-5.7L20 8"/>' +
  '<path fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" d="M20 12a8 8 0 0 1-13.5 5.7L4 16"/>' +
  '<polyline fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" points="20 4 20 8 16 8"/>' +
  '<polyline fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" points="4 20 4 16 8 16"/>' +
  "</svg>";

const SNL_LEAVE_SVG =
  '<svg class="wtd-chess-btn-svg" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">' +
  '<path fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>' +
  '<polyline fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" points="16 17 21 12 16 7"/>' +
  '<line fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" x1="21" y1="12" x2="9" y2="12"/>' +
  "</svg>";

/** Icon-only footer: piece glyph opens popover menu. */
function pieceFooterIconHtml(selected) {
  const cur = sanitizePieceType(selected);
  const glyph = SNL_PIECE_GLYPHS[cur] || "♟";
  const label = SNL_PIECE_LABELS[cur] || "Piece";
  return (
    '<div class="wtd-snl-footer-piece-wrap">' +
    '<button type="button" class="btn ghost wtd-chess-icon-btn" id="wtdSnLPieceToggle" aria-haspopup="true" aria-expanded="false" aria-label="Change piece (' +
    escapeHtml(label) +
    ')" title="' +
    escapeHtml(label) +
    '"><span class="wtd-snl-footer-glyph" aria-hidden="true">' +
    glyph +
    "</span></button>" +
    '<div id="wtdSnLPieceMenu" class="wtd-snl-piece-menu" hidden role="menu" aria-label="Choose piece">' +
    SNL_PIECE_TYPES.map((t) => {
      return (
        '<button type="button" class="wtd-snl-piece-menu-btn' +
        (t === cur ? " on" : "") +
        '" data-snl-piece="' +
        t +
        '" role="menuitem" title="' +
        SNL_PIECE_LABELS[t] +
        '" aria-label="' +
        SNL_PIECE_LABELS[t] +
        '"><span aria-hidden="true">' +
        SNL_PIECE_GLYPHS[t] +
        "</span></button>"
      );
    }).join("") +
    "</div></div>"
  );
}

/** @param {string} id @param {string} label @param {string} svg @param {string} [btnClass] */
function snlIconBtn(id, label, svg, btnClass = "btn ghost") {
  return (
    '<button type="button" class="' +
    btnClass +
    ' wtd-chess-icon-btn" id="' +
    escapeHtml(id) +
    '" aria-label="' +
    escapeHtml(label) +
    '" title="' +
    escapeHtml(label) +
    '">' +
    svg +
    "</button>"
  );
}

function snlLeaveBtnHtml() {
  return snlIconBtn("wtdSnLLeaveLobby", "Leave game", SNL_LEAVE_SVG);
}

/**
 * Single-row dock: ⚙ · …actions · leave (optional). Piece lives in settings.
 * @param {string} middleHtml phase actions
 * @param {{ leave?: boolean }} [opts]
 */
function dockIconsFooter(middleHtml, opts) {
  const leave = opts && opts.leave === false ? "" : snlLeaveBtnHtml();
  return (
    '<div class="wtd-snl-dock-row wtd-snl-dock-row--icons-only">' +
    settingsButtonHtml() +
    (middleHtml || "") +
    leave +
    "</div>"
  );
}

function dockPlayIconsFooter() {
  return dockIconsFooter("");
}

function closePieceMenu() {
  const menu = $("wtdSnLPieceMenu");
  const btn = $("wtdSnLPieceToggle");
  if (menu) menu.hidden = true;
  if (btn) btn.setAttribute("aria-expanded", "false");
}

function bindPieceFooterMenu(inv) {
  const toggle = $("wtdSnLPieceToggle");
  const menu = $("wtdSnLPieceMenu");
  if (toggle && menu) {
    toggle.addEventListener("click", (e) => {
      e.stopPropagation();
      const open = menu.hidden;
      closePieceMenu();
      if (open) {
        menu.hidden = false;
        toggle.setAttribute("aria-expanded", "true");
      }
    });
  }
  document.querySelectorAll("#wtdSnLPieceMenu [data-snl-piece]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const piece = btn.getAttribute("data-snl-piece");
      if (!piece) return;
      closePieceMenu();
      if (inv && inv.token) setMyPiece(inv.token, piece);
      else {
        savePreferredPiece(piece);
        showIntro();
      }
    });
  });
  if (!window.__appgenSnLPieceMenuBound) {
    window.__appgenSnLPieceMenuBound = true;
    document.addEventListener("click", () => closePieceMenu());
  }
}

function setDockCompactMode(on) {
  const el = $("wtdSnLControls");
  if (!el) return;
  el.classList.toggle("wtd-snl-dock--compact", !!on);
  el.classList.toggle("wtd-snl-dock--play", !!on);
}

/** @deprecated use setDockCompactMode */
function setDockPlayMode(on) {
  setDockCompactMode(on);
}

function bindSettingsButton() {
  $("wtdSnLOpenSettings")?.addEventListener("click", () => openSnLSettings());
}

function applyPortalMaterials() {
  for (const row of portalMeshes) {
    const color = portalColorForKind(row.kind);
    const mats = [row.mesh, ...(row.extras || [])];
    for (const m of mats) {
      if (!m || !m.material) continue;
      m.material.color.setHex(color);
      m.material.emissive.setHex(color);
      m.material.emissiveIntensity = row.kind === "ladder" ? 0.22 : 0.18;
      m.material.needsUpdate = true;
    }
  }
}

function setSnLSettingsStatus(msg) {
  const el = $("wtdSnLSettingsStatus");
  if (el) el.textContent = msg || "";
}

function levelPickerSettingsHtml(selectedLevel) {
  const lv = sanitizeLevel(selectedLevel);
  const inLobby = getLobbyInvite() && getLobbyInvite().status === "lobby";
  const rows = (["easy", "medium", "hard"]).map((id) => {
    const cfg = SNL_LEVELS[id];
    const gridLabel = cfg.grid + "×" + cfg.grid;
    const checked = id === lv ? " checked" : "";
    const disabled = inLobby ? " disabled" : "";
    return (
      '<label class="wtd-snl-level-option">' +
      '<input type="radio" name="wtdSnLLevel" value="' +
      id +
      '"' +
      checked +
      disabled +
      " />" +
      "<span><strong>" +
      escapeHtml(cfg.label) +
      "</strong> · " +
      escapeHtml(gridLabel) +
      " (win sq " +
      cfg.winSquare +
      ")</span></label>"
    );
  });
  return (
    '<fieldset class="wtd-snl-settings-fieldset">' +
    "<legend>Board difficulty</legend>" +
    (inLobby
      ? '<p class="wtd-snl-settings-hint">Difficulty is locked for this lobby — start a new game to change grid size.</p>'
      : '<p class="wtd-snl-settings-hint">Applies to the <strong>next game you create</strong> (6×6 easy · 8×8 medium · 10×10 hard).</p>') +
    rows.join("") +
    "</fieldset>"
  );
}

function renderSnLSettingsBody() {
  const body = $("wtdSnLSettingsBody");
  if (!body || !snlSettingsDraft) return;
  const d = snlSettingsDraft;
  const inv = getLobbyInvite();
  const pieceSel =
    snlPieceDraft ||
    (inv && inv.myPiece) ||
    loadPreferredPiece();
  body.innerHTML =
    '<p class="wtd-snl-settings-hint">Backdrop, wood board, and lighting follow the shared <strong>Chess studio</strong> settings. Open <strong>Help</strong> in the header for rules.</p>' +
    '<div class="wtd-snl-settings-piece">' +
    '<p class="wtd-snl-settings-hint"><strong>Your piece</strong> — chess piece token on the board.</p>' +
    piecePickerHtml(pieceSel, { forceOpen: true }) +
    "</div>" +
    levelPickerSettingsHtml(d.level) +
    '<div class="wtd-snl-settings-row">' +
    "<label for=\"wtdSnLLadderColor\">Ladder colour</label>" +
    '<div class="wtd-snl-settings-swatch-row">' +
    '<input type="color" id="wtdSnLLadderColor" value="' +
    escapeHtml(d.ladderColor) +
    '" />' +
    "<span>" +
    escapeHtml(d.ladderColor) +
    "</span></div></div>" +
    '<div class="wtd-snl-settings-row">' +
    "<label for=\"wtdSnLSnakeColor\">Snake colour</label>" +
    '<div class="wtd-snl-settings-swatch-row">' +
    '<input type="color" id="wtdSnLSnakeColor" value="' +
    escapeHtml(d.snakeColor) +
    '" />' +
    "<span>" +
    escapeHtml(d.snakeColor) +
    "</span></div></div>";
  bindSettingsPiecePicker();
}

function bindSettingsPiecePicker() {
  const details = $("wtdSnLPiecePicker");
  if (details) {
    details.open = true;
    details.addEventListener("toggle", (e) => {
      e.preventDefault();
      details.open = true;
    });
  }
  document.querySelectorAll("#wtdSnLSettingsBody [data-snl-piece]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const piece = btn.getAttribute("data-snl-piece");
      if (!piece) return;
      snlPieceDraft = sanitizePieceType(piece);
      renderSnLSettingsBody();
      setSnLSettingsStatus("Piece selected — Apply to save.");
    });
  });
}

function openSnLSettings() {
  snlSettings = loadSnLSettings();
  snlSettingsDraft = { ...snlSettings };
  const inv = getLobbyInvite();
  snlPieceDraft = sanitizePieceType((inv && inv.myPiece) || loadPreferredPiece());
  snlSettingsOpen = true;
  const modal = $("wtdSnLSettingsModal");
  if (modal) modal.hidden = false;
  document.body.classList.add("wtd-chess-env-modal-open");
  renderSnLSettingsBody();
  setSnLSettingsStatus("");
  bindSnLSettingsModal();
}

function closeSnLSettings() {
  snlSettingsOpen = false;
  snlSettingsDraft = null;
  const modal = $("wtdSnLSettingsModal");
  if (modal) modal.hidden = true;
  document.body.classList.remove("wtd-chess-env-modal-open");
  setSnLSettingsStatus("");
}

async function applySnLSettingsFromDraft() {
  if (!snlSettingsDraft) return;
  saveSnLSettings(snlSettingsDraft);
  applyPortalMaterials();
  const piece = sanitizePieceType(snlPieceDraft || loadPreferredPiece());
  savePreferredPiece(piece);
  const inv = getLobbyInvite();
  if (inv && inv.token && inv.status === "lobby") {
    await setMyPiece(inv.token, piece);
  }
  if (!getLobbyInvite()) {
    setActiveBoardLevel(snlSettings.level);
    activeBoardLevelKey = null;
    ensureBoardLevelForInvite({ level: snlSettings.level });
  }
  setSnLSettingsStatus("Applied.");
  closeSnLSettings();
}

function bindSnLSettingsModal() {
  if (snlSettingsBound) return;
  snlSettingsBound = true;
  const modal = $("wtdSnLSettingsModal");
  if (!modal) return;
  modal.addEventListener("click", (e) => {
    const t = e.target;
    if (!(t instanceof Element)) return;
    if (t.closest("[data-wtd-snl-settings-close]")) {
      closeSnLSettings();
      return;
    }
    if (t.closest("#wtdSnLSettingsApply")) {
      void applySnLSettingsFromDraft();
      return;
    }
    if (t.closest("#wtdSnLSettingsResetColors")) {
      if (!snlSettingsDraft) return;
      snlSettingsDraft.ladderColor = DEFAULT_SNL_SETTINGS.ladderColor;
      snlSettingsDraft.snakeColor = DEFAULT_SNL_SETTINGS.snakeColor;
      snlSettingsDraft.level = DEFAULT_SNL_SETTINGS.level;
      renderSnLSettingsBody();
      setSnLSettingsStatus("Reset colours and difficulty.");
    }
  });
  modal.addEventListener("change", (e) => {
    if (!snlSettingsDraft || !(e.target instanceof HTMLInputElement)) return;
    if (e.target.name === "wtdSnLLevel") {
      snlSettingsDraft.level = sanitizeLevel(e.target.value);
    }
  });
  modal.addEventListener("input", (e) => {
    if (!snlSettingsDraft || !(e.target instanceof HTMLElement)) return;
    if (e.target.id === "wtdSnLLadderColor" && e.target instanceof HTMLInputElement) {
      snlSettingsDraft.ladderColor = normalizeHexColor(
        e.target.value,
        DEFAULT_SNL_SETTINGS.ladderColor
      );
      renderSnLSettingsBody();
    } else if (e.target.id === "wtdSnLSnakeColor" && e.target instanceof HTMLInputElement) {
      snlSettingsDraft.snakeColor = normalizeHexColor(
        e.target.value,
        DEFAULT_SNL_SETTINGS.snakeColor
      );
      renderSnLSettingsBody();
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && snlSettingsOpen) closeSnLSettings();
  });
}

function winnerDisplayLine(inv) {
  const w =
    inv && inv.winnerSlot != null
      ? (inv.players || []).find((p) => p.slot === inv.winnerSlot)
      : null;
  const name = w
    ? w.name + (w.isYou ? " (you)" : "")
    : inv && inv.winnerSlot != null
      ? "Player " + (inv.winnerSlot + 1)
      : "Someone";
  const sq = (inv && inv.winSquare) || getWinSquare();
  return name + " · square " + sq;
}

function gameOverStandingsHtml(inv) {
  const players = [...(inv?.players || [])];
  players.sort((a, b) => {
    const pa = Number(a.position) || 0;
    const pb = Number(b.position) || 0;
    if (pb !== pa) return pb - pa;
    return (a.slot ?? 0) - (b.slot ?? 0);
  });
  if (!players.length) return "";
  const rows = players.map((p, i) => {
    const name = p.name + (p.isYou ? " (you)" : "");
    const sq = Number(p.position) || 0;
    const win = inv && inv.winnerSlot === p.slot;
    const cls = win ? " wtd-snl-gameover-standing--winner" : "";
    return (
      '<li class="wtd-snl-gameover-standing' +
      cls +
      '">' +
      '<span class="wtd-snl-gameover-standing-rank">' +
      (i + 1) +
      ".</span> " +
      '<span class="wtd-snl-gameover-standing-name">' +
      escapeHtml(name) +
      "</span> " +
      '<span class="wtd-snl-gameover-standing-sq">· square ' +
      sq +
      "</span>" +
      "</li>"
    );
  });
  return (
    '<p class="wtd-snl-gameover-standings-label">Final order</p>' +
    '<ol class="wtd-snl-gameover-standings">' +
    rows.join("") +
    "</ol>"
  );
}

function bindSnLGameOverModal() {
  if (snlGameOverBound) return;
  snlGameOverBound = true;
  const modal = $("wtdSnLGameOverModal");
  if (!modal) return;
  modal.addEventListener("click", (e) => {
    const t = e.target;
    if (!(t instanceof Element)) return;
    if (t.closest("#wtdSnLGameOverRestart")) {
      closeSnLGameOver();
      createLobby();
    }
  });
}

function openSnLGameOver(inv) {
  bindSnLGameOverModal();
  const modal = $("wtdSnLGameOverModal");
  const body = $("wtdSnLGameOverBody");
  const standings = $("wtdSnLGameOverStandings");
  if (!modal || !body) return;
  body.textContent = winnerDisplayLine(inv);
  if (standings) standings.innerHTML = gameOverStandingsHtml(inv);
  modal.hidden = false;
  document.body.classList.add("wtd-chess-env-modal-open");
  $("wtdSnLGameOverRestart")?.focus();
}

function closeSnLGameOver() {
  const modal = $("wtdSnLGameOverModal");
  if (modal) modal.hidden = true;
  if (!snlSettingsOpen) document.body.classList.remove("wtd-chess-env-modal-open");
}

function signedIn() {
  return (
    window.AppgenAuth &&
    typeof window.AppgenAuth.isSignedIn === "function" &&
    window.AppgenAuth.isSignedIn()
  );
}

function setHud(html, opts) {
  const el = $("wtdSnLHud");
  if (!el) return;
  if (getLobbyInvite() && getLobbyInvite().status === "playing" && !(opts && opts.force)) {
    setPlayHudHidden();
    return;
  }
  el.innerHTML = html;
  el.hidden = false;
  el.classList.remove("wtd-snl-hud--play-hidden");
}

/** During active play the 3D die is the UI — hide the text HUD banner. */
function setPlayHudHidden() {
  const el = $("wtdSnLHud");
  if (!el) return;
  el.innerHTML = "";
  el.hidden = true;
  el.classList.add("wtd-snl-hud--play-hidden");
}

function setBoardFocusMode(on) {
  $("wtdSnLPlay")?.classList.toggle("wtd-snl-board-focus", !!on);
}

/**
 * Compact label on the 3D board (top-right). Replaces the large HUD copy.
 * @param {string | null | undefined} title
 * @param {string} [subtitle]
 */
function setTitleChip(title, subtitle) {
  const chip = $("wtdSnLTitleChip");
  if (!chip) return;
  if (!title) {
    chip.hidden = true;
    chip.innerHTML = "";
    return;
  }
  const sub =
    subtitle == null || subtitle === ""
      ? ""
      : '<span class="wtd-snl-title-chip-sub">' + escapeHtml(String(subtitle)) + "</span>";
  chip.hidden = false;
  chip.innerHTML =
    '<span class="wtd-snl-title-chip-main">' + escapeHtml(title) + "</span>" + sub;
}

function lobbyChipSubtitle(inv, secOverride) {
  const n = (inv.players || []).length;
  const grid = inv.grid || getGrid();
  const lvl =
    inv.levelLabel ||
    levelConfig(inv.level || snlSettings?.level || "hard").label;
  const base = n + "/4 · " + lvl + " " + grid + "×" + grid;
  if (inv?.status === "lobby" && inv.lobbyEndsAt) {
    const sec = Math.max(0, Math.floor(Number(secOverride ?? lobbySecondsRemaining(inv))));
    return String(sec).padStart(2, "0") + "s · " + base;
  }
  return base;
}

function syncLobbyTitleChip(inv, secOverride) {
  if (!inv || inv.status !== "lobby") return;
  setTitleChip("Lobby", lobbyChipSubtitle(inv, secOverride));
}

function setLobbyFlipOverlayVisible(on) {
  const overlay = $("wtdSnLLobbyOverlay");
  if (overlay) overlay.hidden = true;
  void on;
}

function lobbySecondsRemaining(inv) {
  if (!inv?.lobbyEndsAt) return 0;
  return Math.max(
    0,
    Math.ceil((new Date(inv.lobbyEndsAt).getTime() - Date.now()) / 1000)
  );
}

function syncLobbyOverlayBar(inv) {
  if (!inv || inv.status !== "lobby") {
    setLobbyFlipOverlayVisible(false);
    return;
  }
  // Do not mutate `inv` — RTK freezes snlLobby.lobbyInvite; overlay only needs a local sec.
  const sec = lobbySecondsRemaining(inv);
  syncLobbyTitleChip(inv, sec);
  setLobbyFlipOverlayVisible(false);
  syncDiceClickable();
}

/** Hide the navy HUD strip; optional short message on the title chip. */
function setSnLBanner(title, subtitle) {
  setBoardFocusMode(true);
  setPlayHudHidden();
  setTitleChip(title, subtitle);
}

function setSnLAlert(message) {
  setSnLBanner("Snakes & Ladders", message);
}

function setControls(html) {
  const el = $("wtdSnLControls");
  if (el) el.innerHTML = html;
}

function setSnLControlsStatus(msg) {
  const el = $("wtdSnLControls");
  if (!el) return;
  let live = $("wtdSnLControlsStatus");
  if (!live) {
    live = document.createElement("p");
    live.id = "wtdSnLControlsStatus";
    live.className = "wtd-snl-footer-status";
    live.setAttribute("role", "status");
    live.hidden = true;
    el.appendChild(live);
  }
  if (msg) {
    live.textContent = msg;
    live.hidden = false;
    window.setTimeout(() => {
      if (live.textContent === msg) live.hidden = true;
    }, 4000);
  } else {
    live.hidden = true;
    live.textContent = "";
  }
}

function attachBaseRevision(body) {
  if (!body || typeof body !== "object") return body;
  const action = String(body.action || "").toLowerCase();
  if (action === "create" || action === "presence") return body;
  const inv = getLobbyInvite();
  if (!inv || typeof inv.revision !== "number") return body;
  return { ...body, baseRevision: inv.revision };
}

function mintTabPlayerKey() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "pk_" + Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
}

function tabPlayerStorageKey(token) {
  const t = sanitizeToken(token);
  return t ? TAB_PLAYER_KEY_PREFIX + t : "";
}

function getTabPlayerKey(token) {
  const sk = tabPlayerStorageKey(token);
  if (!sk) return null;
  try {
    return sessionStorage.getItem(sk);
  } catch (_) {
    return null;
  }
}

function setTabPlayerKey(token, playerKey) {
  const sk = tabPlayerStorageKey(token);
  if (!sk || !playerKey) return;
  try {
    sessionStorage.setItem(sk, playerKey);
  } catch (_) {
    /* ignore */
  }
}

/** Sticky per-tab seat id (sessionStorage) — same Google account may fill multiple slots. */
function ensureTabPlayerKey(token) {
  const t = sanitizeToken(token);
  if (!t) return null;
  let key = getTabPlayerKey(t);
  if (!key) {
    key = mintTabPlayerKey();
    setTabPlayerKey(t, key);
  }
  return key;
}

function withTabPlayerKey(body, token) {
  const base = body && typeof body === "object" ? { ...body } : {};
  const action = String(base.action || "").toLowerCase();
  if (action === "create") {
    if (!base.playerKey) base.playerKey = mintTabPlayerKey();
    return base;
  }
  const t =
    sanitizeToken(token) ||
    sanitizeToken(base.token) ||
    (getLobbyInvite() && getLobbyInvite().token);
  if (!t) return base;
  const pk = ensureTabPlayerKey(t);
  if (pk) base.playerKey = pk;
  return base;
}

async function apiFetch(method, body, token) {
  const t = sanitizeToken(token) || (body && sanitizeToken(body.token));
  let url = SNL_INVITE_API;
  if (method === "GET" && t) {
    const pk = ensureTabPlayerKey(t);
    url =
      SNL_INVITE_API +
      "?token=" +
      encodeURIComponent(t) +
      (pk ? "&playerKey=" + encodeURIComponent(pk) : "");
  }
  const payload =
    method === "POST" ? attachBaseRevision(withTabPlayerKey(body || {}, t)) : undefined;
  const res = await fetch(url, {
    method,
    credentials: "same-origin",
    headers: method === "POST" ? { "Content-Type": "application/json" } : undefined,
    body: method === "POST" ? JSON.stringify(payload) : undefined
  });
  const data = await res.json().catch(() => ({}));
  /* POST only: mirror state without anim (roller runs playTurnVisual explicitly). GET poll must not pre-apply or the follow-up applyInvite hits sameRev and skips remote dice/path anim. */
  if (data.invite && method === "POST") {
    const action = body && String(body.action || "").toLowerCase();
    if (action === "presence") {
      const prevRev = getLastRevision();
      const rev = typeof data.invite.revision === "number" ? data.invite.revision : 0;
      if (!(prevRev >= 0 && rev < prevRev)) {
        forceSnlLobbyInvite(data.invite);
        if (data.invite.status === "lobby") {
          syncLobbyOverlayBar(data.invite);
          refreshPresencePanels(data.invite);
        }
      }
    } else {
      applyInvite(data.invite, { skipTurnVisual: true });
    }
  }
  return { res, data };
}

function stopPoll() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  pollActiveToken = "";
  pollInFlight = false;
}

function startPoll(token) {
  const t = sanitizeToken(token);
  if (!t) return;
  if (pollTimer && pollActiveToken === t) return;
  stopPoll();
  pollActiveToken = t;
  const tick = () => {
    if (pollInFlight) return;
    pollInFlight = true;
    pollState(t)
      .catch(() => {})
      .finally(() => {
        pollInFlight = false;
      });
  };
  tick();
  pollTimer = window.setInterval(tick, POLL_MS);
}

function handleDeadSnLInvite(res, data) {
  const code = data && data.code;
  const status = res && res.status;
  const dead =
    status === 404 ||
    status === 410 ||
    code === "cancelled" ||
    (data && data.invite && data.invite.status === "cancelled");
  if (!dead) return false;
  const inv = data && data.invite;
  if (inv && inv.status === "cancelled") {
    presentCancelledLobby(inv);
  } else {
    stopSnlNetworkActivity();
    clearSnLInviteFromHash();
    clearSnlLobbyMirror();
    showIntro();
    setSnLAlert("This invite is no longer active — start a new game.");
  }
  return true;
}

async function pollState(token) {
  const { res, data } = await apiFetch("GET", null, token);
  if (handleDeadSnLInvite(res, data)) return;
  if (!data.ok || !data.invite) {
    handleDeadSnLInvite(res, data);
    return;
  }
  if (data.invite.status === "cancelled") {
    presentCancelledLobby(data.invite);
    return;
  }
  applyInvite(data.invite);
}

/** Admin / kill-all: stop polls immediately and strip invite from URL. */
function stopForAdminKill(message) {
  stopSnlNetworkActivity();
  clearSnLInviteFromHash();
  clearSnlLobbyMirror();
  inviteTruthPendingCommit = null;
  setSnLAlert(message || "Invite lobbies were cancelled by admin.");
  try {
    showIntro();
  } catch (_) {
    /* ignore */
  }
}

function bindAdminKillListener() {
  if (typeof window === "undefined" || window.__appgenSnLKillBound) return;
  window.__appgenSnLKillBound = true;
  window.addEventListener("appgen:wtd-invites-killed", (ev) => {
    const detail = (ev && ev.detail) || {};
    stopForAdminKill(detail.message || "Invite lobbies were cancelled by admin.");
  });
}
bindAdminKillListener();

function unbindDicePointer() {
  if (!renderer || !pointerBound) return;
  const el = renderer.domElement;
  el.removeEventListener("pointerdown", onDicePointerDown);
  el.removeEventListener("pointermove", onDicePointerMove);
  el.removeEventListener("pointerleave", onDicePointerLeave);
  el.style.cursor = "";
  pointerBound = false;
}

function disposeEngine() {
  stopPoll();
  stopFlipTicker();
  stopPresenceHeartbeat();
  unbindDicePointer();
  if (animId) cancelAnimationFrame(animId);
  animId = 0;
  if (resizeObs && boardHost) {
    resizeObs.disconnect();
    resizeObs = null;
  }
  for (const mesh of tokenMeshes.values()) {
    disposeSnLPieceToken(mesh);
  }
  tokenMeshes.clear();
  squareTiles = [];
  if (studioHandle) {
    studioHandle.dispose();
    studioHandle = null;
  }
  if (dice) {
    dice.dispose();
    dice = null;
  }
  diceBusy = false;
  lastAnimatedRollKey = "";
  animInFlightKey = "";
  pendingPathRollKey = "";
  inflightTurnVisualPromise = null;
  inflightTurnVisualKey = "";
  skipDiceForRollKey = "";
  inviteTruthPendingCommit = null;
  pathAnim = { busy: false, slot: null, gen: pathAnim.gen + 1 };
  clearPathMarkers();
  portalMeshes = [];
  boardRoot = null;
  squareTiles = [];
  if (renderer) {
    renderer.dispose();
    if (renderer.domElement && renderer.domElement.parentNode) {
      renderer.domElement.parentNode.removeChild(renderer.domElement);
    }
  }
  renderer = null;
  scene = null;
  camera = null;
  orbit = null;
  boardHost = null;
}

function canClickDiceNow() {
  const inv = getLobbyInvite();
  return !!(
    inv &&
    inv.status === "playing" &&
    inv.isMyTurn &&
    !inv.turnIsAgent &&
    !diceBusy &&
    !pathAnim.busy &&
    dice &&
    !dice.isShaking()
  );
}

function snlPlayerBySlot(inv, slot) {
  return (inv.players || []).find((p) => p.slot === slot);
}

function snlMyPlayer(inv) {
  if (!inv) return undefined;
  const players = inv.players || [];
  if (inv.mySlot != null && Number.isFinite(Number(inv.mySlot))) {
    const bySlot = players.find((p) => Number(p.slot) === Number(inv.mySlot));
    if (bySlot) return bySlot;
  }
  if (inv.myPeerId) {
    const byPeer = players.find((p) => String(p.peerId) === String(inv.myPeerId));
    if (byPeer) return byPeer;
  }
  const byYou = players.find((p) => p.isYou);
  if (byYou) return byYou;
  const authUser =
    window.AppgenAuth && typeof window.AppgenAuth.getUser === "function"
      ? window.AppgenAuth.getUser()
      : null;
  if (authUser?.id) {
    return players.find(
      (p) => !p.isAgent && String(p.peerId) === String(authUser.id)
    );
  }
  return undefined;
}

/** Camera follows this seat — server `mySlot` wins over `isYou`. */
function myCameraSlot(inv) {
  if (!inv) return null;
  if (inv.mySlot != null && Number.isFinite(Number(inv.mySlot))) {
    return Number(inv.mySlot);
  }
  const me = snlMyPlayer(inv);
  return me != null ? Number(me.slot) : null;
}

function worldPosForPlayerSlot(inv, slot) {
  const key = String(slot);
  const mesh = tokenMeshes.get(key);
  if (mesh) {
    const y = mesh.userData.baseY != null ? mesh.userData.baseY : TOKEN_Y;
    return { x: mesh.position.x, y, z: mesh.position.z };
  }
  const p = (inv?.players || []).find((x) => Number(x.slot) === Number(slot));
  return tokenWorldPosition(p?.position ?? 0, slot);
}

function syncDiceOriginForInvite(inv) {
  if (!dice) return;
  dice.setFloating(false);
  const c = boardGridCenterWorld();
  dice.setOrigin(c.x, c.z);
  void inv;
}

function syncScreenRollDiceBtn() {
  const btn = $("wtdSnLRollDiceBtn");
  if (!btn) return;
  btn.hidden = !canClickDiceNow();
}

function bindScreenRollDiceBtn() {
  if (snlRollDiceBtnBound) return;
  snlRollDiceBtnBound = true;
  const btn = $("wtdSnLRollDiceBtn");
  if (!btn) return;
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!canClickDiceNow()) return;
    const token = getLobbyInvite() && getLobbyInvite().token;
    if (token) rollDie(token);
  });
}

function syncDiceOrigin() {
  syncDiceOriginForInvite(getLobbyInvite());
}

function syncCameraForPlay(inv, dt) {
  if (!camera || !orbit || !inv || inv.status !== "playing") return;
  if (snlOrbitFree.isManualExplore()) return;

  const tTarget = Math.min(1, dt * CAM_TARGET_LERP);
  orbit.enabled = true;
  const slot = myCameraSlot(inv);
  if (slot == null) return;
  const w = worldPosForPlayerSlot(inv, slot);
  cameraTargetDesired.set(w.x, TOKEN_Y + 0.06, w.z);
  orbit.target.lerp(cameraTargetDesired, tTarget);
}

function snapCameraToMyPiece(inv) {
  if (!camera || !orbit || !inv) return;
  snlOrbitFree.clearManualOrbitExplore();
  orbit.enabled = true;
  const slot = myCameraSlot(inv);
  if (slot == null) return;
  const w = worldPosForPlayerSlot(inv, slot);
  orbit.target.set(w.x, TOKEN_Y + 0.06, w.z);
  camera.position.set(
    w.x + PIECE_CAM_OFFSET.x,
    w.y + PIECE_CAM_OFFSET.y,
    w.z + PIECE_CAM_OFFSET.z
  );
}

function diceArenaVisible() {
  if (!dice) return false;
  const inv = getLobbyInvite();
  if (!inv) return false;
  if (inv.status === "finished" || inv.status === "cancelled") return false;
  if (inv.status !== "playing") return false;
  if (canClickDiceNow()) return false;
  if (diceBusy || dice.isShaking()) return true;
  return false;
}

function syncDicePresentation() {
  if (!dice || !renderer) return;
  const inv = getLobbyInvite();
  syncScreenRollDiceBtn();
  const show = diceArenaVisible();
  if (show) syncDiceOriginForInvite(inv);
  dice.setVisible(show);
  dice.setClickable(false);
  renderer.domElement.style.cursor = "";
}

function syncDiceClickable() {
  syncDicePresentation();
}

function pickDiceHit(clientX, clientY) {
  if (!renderer || !camera || !dice) return null;
  const rect = renderer.domElement.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  pointerNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  diceRaycaster.setFromCamera(pointerNdc, camera);
  const hits = diceRaycaster.intersectObjects(dice.getHitTargets(), false);
  return hits.length ? hits[0] : null;
}

function onDicePointerMove(ev) {
  if (!canClickDiceNow()) {
    dice?.setHovered(false);
    if (renderer) renderer.domElement.style.cursor = "";
    return;
  }
  const hit = pickDiceHit(ev.clientX, ev.clientY);
  dice?.setHovered(!!hit);
  if (renderer) renderer.domElement.style.cursor = hit ? "pointer" : "";
}

function onDicePointerDown(ev) {
  void ev;
}

function onDicePointerLeave() {
  dice?.setHovered(false);
  if (renderer) renderer.domElement.style.cursor = "";
}

function bindDicePointer() {
  if (!renderer || pointerBound) return;
  const el = renderer.domElement;
  el.addEventListener("pointerdown", onDicePointerDown);
  el.addEventListener("pointermove", onDicePointerMove);
  el.addEventListener("pointerleave", onDicePointerLeave);
  pointerBound = true;
}

function measureHost() {
  if (!boardHost) return { w: 320, h: 320 };
  const r = boardHost.getBoundingClientRect();
  return { w: Math.max(200, r.width), h: Math.max(200, r.height) };
}

function resize() {
  if (!renderer || !camera || !boardHost) return;
  const { w, h } = measureHost();
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

function applyBoardTexturesToTiles(bundle) {
  if (!bundle || !squareTiles.length) return;
  const { light, dark, prefs } = bundle;
  for (const row of squareTiles) {
    refreshStudioSquareMaterial(row.mesh.material, row.isLight, prefs, row.isLight ? light : dark);
  }
}

function makePortalMaterial(kind) {
  const color = portalColorForKind(kind);
  return new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: kind === "ladder" ? 0.22 : 0.18,
    roughness: 0.5
  });
}

function makeFlowLabelSprite(text, bgCss) {
  const canvas = document.createElement("canvas");
  const w = 144;
  const h = 56;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return new THREE.Group();
  ctx.fillStyle = bgCss;
  ctx.beginPath();
  ctx.roundRect(6, 6, w - 12, h - 12, 14);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = "700 24px system-ui,sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, w / 2, h / 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  sprite.center.set(0.5, 0.5);
  sprite.scale.set(0.44, 0.17, 1);
  sprite.renderOrder = 6;
  return sprite;
}

function addSquareFlowRing(group, square, material, inner = 0.24, outer = 0.34) {
  const pos = squareToWorld(square);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(CELL * inner, CELL * outer, 32),
    material
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(pos.x, 0.088, pos.z);
  group.add(ring);
  return ring;
}

function addPortalFlowArrow(group, fromSq, toSq, kind, mat, extras) {
  const a = squareToWorld(fromSq);
  const b = squareToWorld(toSq);
  const dir = new THREE.Vector3(b.x - a.x, 0, b.z - a.z);
  if (dir.lengthSq() < 1e-8) return;
  dir.normalize();
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(CELL * 0.08, CELL * 0.16, 10),
    mat
  );
  cone.position.set(a.x + dir.x * CELL * 0.08, 0.13, a.z + dir.z * CELL * 0.08);
  const up = new THREE.Vector3(0, 1, 0);
  const axis = new THREE.Vector3().crossVectors(up, dir);
  const angle = Math.acos(Math.max(-1, Math.min(1, up.dot(dir))));
  if (axis.lengthSq() > 1e-8) {
    cone.quaternion.setFromAxisAngle(axis.normalize(), angle);
  }
  if (kind === "snake") {
    cone.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI));
  }
  group.add(cone);
  extras.push(cone);
}

function addBoardRouteMarkers(group) {
  const win = getWinSquare();
  const start = squareToWorld(1);
  const finish = squareToWorld(win);
  const startLabel = makeFlowLabelSprite("START", "#15803d");
  startLabel.position.set(start.x, 0.34, start.z);
  group.add(startLabel);
  const finishLabel = makeFlowLabelSprite("FINISH", "#b45309");
  finishLabel.position.set(finish.x, 0.34, finish.z);
  group.add(finishLabel);
  addSquareFlowRing(
    group,
    1,
    new THREE.MeshStandardMaterial({
      color: 0x22c55e,
      emissive: 0x15803d,
      emissiveIntensity: 0.55,
      side: THREE.DoubleSide
    })
  );
  addSquareFlowRing(
    group,
    win,
    new THREE.MeshStandardMaterial({
      color: 0xeab308,
      emissive: 0xca8a04,
      emissiveIntensity: 0.55,
      side: THREE.DoubleSide
    }),
    0.2,
    0.3
  );
}

function addPortalEndpointMarkers(group, seg, extras) {
  const tubeMat = makePortalMaterial(seg.kind);
  const fromRing = addSquareFlowRing(group, seg.from, tubeMat, 0.16, 0.24);
  extras.push(fromRing);
  const toPos = squareToWorld(seg.to);
  const toMarker = new THREE.Mesh(
    new THREE.CircleGeometry(CELL * 0.11, 24),
    tubeMat
  );
  toMarker.rotation.x = -Math.PI / 2;
  toMarker.position.set(toPos.x, 0.091, toPos.z);
  group.add(toMarker);
  extras.push(toMarker);
  addPortalFlowArrow(group, seg.from, seg.to, seg.kind, tubeMat, extras);
}

/** Ladder rungs along the curve so blue reads as a climb, not a pipe. */
function addLadderRungs(group, curve, mat, extras) {
  const count = 5;
  for (let i = 1; i <= count; i++) {
    const t = i / (count + 1);
    const p = curve.getPoint(t);
    const tangent = curve.getTangent(t).normalize();
    const side = new THREE.Vector3(-tangent.z, 0, tangent.x);
    if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
    side.normalize();
    const rung = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.012, CELL * 0.38, 8),
      mat
    );
    rung.position.copy(p);
    rung.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), side);
    group.add(rung);
    extras.push(rung);
  }
}

function disposeBoardRoot(root) {
  if (!root) return;
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    obj.geometry?.dispose();
    const mat = obj.material;
    if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
    else mat?.dispose();
  });
}

function rebuildBoard3D() {
  if (!scene) return;
  if (boardRoot) {
    scene.remove(boardRoot);
    disposeBoardRoot(boardRoot);
    boardRoot = null;
  }
  squareTiles = [];
  portalMeshes = [];
  boardRoot = buildBoardMeshes();
  scene.add(boardRoot);
  loadStudioBoardTextures((bundle) => applyBoardTexturesToTiles(bundle));
  applyPortalMaterials();
  syncDiceBoardPhysics();
}

/** Rebuild meshes when invite level differs from what is on screen. */
function ensureBoardLevelForInvite(inv) {
  syncBoardFromInviteMeta(inv);
  const key = sanitizeLevel(inv && inv.level != null ? inv.level : snlSettings.level);
  if (key === activeBoardLevelKey && boardRoot) return;
  activeBoardLevelKey = key;
  if (scene) rebuildBoard3D();
}

function portalCurveForSegment(seg) {
  const a = tokenWorldPosition(seg.from, 0);
  const b = tokenWorldPosition(seg.to, 0);
  const mid = portalCurveMid(seg.from, seg.to, seg.kind, 0);
  return new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(a.x, 0.08, a.z),
    new THREE.Vector3(mid.x, mid.y, mid.z),
    new THREE.Vector3(b.x, 0.08, b.z)
  );
}

function syncDiceBoardPhysics() {
  if (!dice) return;
  const half = boardCenterHalf() + CELL * 0.55;
  const curves = portalSegments().map((seg) => ({
    curve: portalCurveForSegment(seg),
    kind: seg.kind
  }));
  dice.rebuildEnvironment({ boardHalf: half, curves });
  syncDiceOrigin();
}

function buildBoardMeshes() {
  const group = new THREE.Group();
  // Must match squareToWorld / boardCenterHalf — not (GRID*CELL)/2.
  const half = boardCenterHalf();
  squareTiles = [];
  portalMeshes = [];

  // Placeholder mats — wood textures applied async via shared chess board theme.
  const stubPrefs = {
    squareLight: "#858585",
    squareDark: "#4d1414",
    squareLightColorOpacity: 1,
    squareLightImageOpacity: 1,
    squareDarkColorOpacity: 1,
    squareDarkImageOpacity: 1
  };

  const grid = getGrid();
  const winSquare = getWinSquare();
  for (let n = 1; n <= winSquare; n++) {
    const { row, col } = squareToRowCol(n);
    const x = col * CELL - half;
    const z = row * CELL - half;
    const isLight = (row + col) % 2 === 0;
    const geo = new THREE.BoxGeometry(CELL * 0.94, 0.04, CELL * 0.94);
    const mat = createStudioSquareMaterial(isLight, stubPrefs, null);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, 0.03, z);
    mesh.receiveShadow = true;
    group.add(mesh);
    squareTiles.push({ mesh, isLight });
  }

  const boardBase = new THREE.Mesh(
    new THREE.BoxGeometry(grid * CELL + 0.2, 0.08, grid * CELL + 0.2),
    new THREE.MeshStandardMaterial({ color: 0x3e2723, roughness: 0.85 })
  );
  boardBase.position.set(0, -0.05, 0);
  boardBase.receiveShadow = true;
  group.add(boardBase);

  addBoardRouteMarkers(group);

  for (const seg of portalSegments()) {
    const curve = portalCurveForSegment(seg);
    const a = tokenWorldPosition(seg.from, 0);
    const b = tokenWorldPosition(seg.to, 0);
    const mid = portalCurveMid(seg.from, seg.to, seg.kind, 0);
    const tubeMat = makePortalMaterial(seg.kind);
    const tube = new THREE.TubeGeometry(
      curve,
      24,
      seg.kind === "ladder" ? 0.018 : 0.032,
      6,
      false
    );
    const tubeMesh = new THREE.Mesh(tube, tubeMat);
    group.add(tubeMesh);
    /** @type {THREE.Mesh[]} */
    const extras = [];
    if (seg.kind === "ladder") {
      // Twin rails + rungs — reads clearly as a ladder in blue.
      const railOffset = CELL * 0.12;
      const side = new THREE.Vector3(-(b.z - a.z), 0, b.x - a.x);
      if (side.lengthSq() > 1e-8) side.normalize().multiplyScalar(railOffset);
      else side.set(railOffset, 0, 0);
      for (const sign of [-1, 1]) {
        const oa = new THREE.Vector3(a.x + side.x * sign, 0.08, a.z + side.z * sign);
        const ob = new THREE.Vector3(b.x + side.x * sign, 0.08, b.z + side.z * sign);
        const om = new THREE.Vector3(mid.x + side.x * sign, mid.y, mid.z + side.z * sign);
        const railCurve = new THREE.QuadraticBezierCurve3(oa, om, ob);
        const rail = new THREE.Mesh(
          new THREE.TubeGeometry(railCurve, 20, 0.01, 5, false),
          tubeMat
        );
        group.add(rail);
        extras.push(rail);
      }
      addLadderRungs(group, curve, tubeMat, extras);
    } else {
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 10), tubeMat);
      head.position.set(a.x, 0.12, a.z);
      group.add(head);
      extras.push(head);
      const tail = new THREE.Mesh(new THREE.SphereGeometry(0.032, 10, 8), tubeMat);
      tail.position.set(b.x, 0.1, b.z);
      group.add(tail);
      extras.push(tail);
    }
    addPortalEndpointMarkers(group, seg, extras);
    portalMeshes.push({ mesh: tubeMesh, kind: seg.kind, extras });
  }

  return group;
}

function loadPreferredPiece() {
  try {
    return sanitizePieceType(localStorage.getItem(PIECE_PREF_KEY));
  } catch (_) {
    return "p";
  }
}

function savePreferredPiece(piece) {
  try {
    localStorage.setItem(PIECE_PREF_KEY, sanitizePieceType(piece));
  } catch (_) {
    /* ignore */
  }
}

/**
 * @param {string} selected
 * @param {{ forceOpen?: boolean }} [opts]
 */
function piecePickerHtml(selected, opts) {
  const cur = sanitizePieceType(selected);
  const open = !!(opts && opts.forceOpen) || piecePickerExpanded;
  const glyph = SNL_PIECE_GLYPHS[cur] || "♟";
  const label = SNL_PIECE_LABELS[cur] || "Pawn";
  return (
    '<details class="wtd-snl-piece-picker"' +
    (open ? " open" : "") +
    ' id="wtdSnLPiecePicker">' +
    '<summary class="wtd-snl-piece-picker-summary">' +
    '<span class="wtd-snl-piece-glyph" aria-hidden="true">' +
    glyph +
    "</span>" +
    '<span class="wtd-snl-piece-picker-current">' +
    escapeHtml(label) +
    "</span>" +
    '<span class="wtd-snl-piece-picker-hint">change piece</span>' +
    "</summary>" +
    '<div class="wtd-snl-piece-picker-row" role="group" aria-label="Choose your chess piece">' +
    SNL_PIECE_TYPES.map((t) => {
      const on = t === cur ? " on" : "";
      return (
        '<button type="button" class="btn ghost wtd-snl-piece-btn' +
        on +
        '" data-snl-piece="' +
        t +
        '" aria-pressed="' +
        (t === cur ? "true" : "false") +
        '" title="' +
        SNL_PIECE_LABELS[t] +
        '" aria-label="' +
        SNL_PIECE_LABELS[t] +
        '"><span class="wtd-snl-piece-glyph" aria-hidden="true">' +
        SNL_PIECE_GLYPHS[t] +
        '</span><span class="wtd-snl-piece-name">' +
        SNL_PIECE_LABELS[t] +
        "</span></button>"
      );
    }).join("") +
    "</div></details>"
  );
}

function bindPiecePicker(inv) {
  const details = $("wtdSnLPiecePicker");
  if (details) {
    details.addEventListener("toggle", () => {
      piecePickerExpanded = !!details.open;
    });
  }
  document.querySelectorAll("[data-snl-piece]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const piece = btn.getAttribute("data-snl-piece");
      if (!piece) return;
      piecePickerExpanded = false;
      if (inv && inv.token) setMyPiece(inv.token, piece);
      else {
        savePreferredPiece(piece);
        showIntro();
      }
    });
  });
}

async function setMyPiece(token, piece) {
  const p = sanitizePieceType(piece);
  savePreferredPiece(p);
  piecePickerExpanded = false;
  const { data } = await apiFetch("POST", { action: "setPiece", token, piece: p });
  if (data.ok && data.invite) {
    applyInvite(data.invite);
    bounceToken(data.invite.mySlot);
  }
}

function bounceToken(slot) {
  if (slot == null) return;
  const mesh = tokenMeshes.get(String(slot));
  if (!mesh) return;
  mesh.userData.bounceT = 0.45;
}

function clearPathMarkers() {
  if (!scene) {
    pathMarkers = [];
    return;
  }
  for (const m of pathMarkers) {
    scene.remove(m);
    m.geometry?.dispose?.();
    const mat = m.material;
    if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
    else mat?.dispose?.();
  }
  pathMarkers = [];
}

function addPathMarker(square, colorHex) {
  if (!scene || !square) return;
  const w = tokenWorldPosition(square, 0);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(CELL * 0.18, CELL * 0.28, 24),
    new THREE.MeshBasicMaterial({
      color: colorHex,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      depthWrite: false
    })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(w.x, 0.055, w.z);
  scene.add(ring);
  pathMarkers.push(ring);
}

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function tweenMs(ms, onUpdate) {
  return new Promise((resolve) => {
    const start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / ms);
      onUpdate(easeInOutCubic(t), t);
      if (t < 1) requestAnimationFrame(step);
      else resolve();
    };
    requestAnimationFrame(step);
  });
}

/**
 * @param {THREE.Object3D} mesh
 * @param {{ x: number, y: number, z: number }} from
 * @param {{ x: number, y: number, z: number }} to
 * @param {number} ms
 * @param {number} [hopHeight]
 */
async function animateMeshTo(mesh, from, to, ms, hopHeight) {
  const hop = hopHeight == null ? 0.22 : hopHeight;
  await tweenMs(ms, (e) => {
    mesh.position.x = from.x + (to.x - from.x) * e;
    mesh.position.z = from.z + (to.z - from.z) * e;
    const arc = Math.sin(Math.PI * e) * hop;
    mesh.position.y = from.y + (to.y - from.y) * e + arc;
    mesh.userData.baseY = mesh.position.y;
    mesh.rotation.y = e * Math.PI * 2 * 0.15;
  });
  mesh.position.set(to.x, to.y, to.z);
  mesh.userData.baseY = to.y;
}

/**
 * @param {THREE.Object3D} mesh
 * @param {number} fromSq
 * @param {number} toSq
 * @param {"ladder"|"snake"} kind
 * @param {number} slot
 */
async function animatePortal(mesh, fromSq, toSq, kind, slot) {
  const a = tokenWorldPosition(fromSq, slot);
  const b = tokenWorldPosition(toSq, slot);
  const mid = portalCurveMid(fromSq, toSq, kind, slot);
  const ms = kind === "ladder" ? 780 : 920;
  await tweenMs(ms, (e) => {
    const omt = 1 - e;
    mesh.position.x = omt * omt * a.x + 2 * omt * e * mid.x + e * e * b.x;
    mesh.position.y = omt * omt * a.y + 2 * omt * e * mid.y + e * e * b.y;
    mesh.position.z = omt * omt * a.z + 2 * omt * e * mid.z + e * e * b.z;
    mesh.userData.baseY = mesh.position.y;
    mesh.rotation.y += kind === "snake" ? 0.12 : 0.06;
  });
  mesh.position.set(b.x, b.y, b.z);
  mesh.userData.baseY = b.y;
}

function resolveRollRoute(lr) {
  if (!lr) return null;
  if (Array.isArray(lr.walk) && lr.walk.length) {
    return {
      walk: lr.walk.slice(),
      path: Array.isArray(lr.path) ? lr.path.slice() : lr.walk.slice(),
      portal: lr.portal || null,
      portalFrom: lr.portalFrom ?? lr.fromSquare ?? null,
      portalTo: lr.portalTo ?? (lr.portal ? lr.to : null)
    };
  }
  const rebuilt = reconstructMoveRoute(lr.from, lr.value, lr.overshoot);
  if (Array.isArray(lr.path) && lr.path.length && !(rebuilt.walk || []).length) {
    rebuilt.walk = lr.path.slice();
    rebuilt.path = lr.path.slice();
  }
  return rebuilt;
}

/** Build square-by-square hops from die value (client fallback). */
function walkSquaresFromRoll(lr) {
  if (!lr || lr.overshoot) return [];
  const from = Number(lr.from) || 0;
  const steps = Number(lr.value) || 0;
  if (steps < 1 || steps > 6) return [];
  /** @type {number[]} */
  const walk = [];
  if (from === 0) {
    for (let i = 1; i <= steps; i++) walk.push(i);
  } else {
    for (let i = 1; i <= steps; i++) walk.push(from + i);
  }
  return walk;
}

/** Ensure at least one hop when server state moved but walk[] was omitted. */
function ensureWalkSteps(route, lr) {
  if (!lr || lr.overshoot) return route;
  const base =
    route ||
    ({ walk: [], path: [], portal: null, portalFrom: null, portalTo: null, land: lr.to });
  if (Array.isArray(base.walk) && base.walk.length) return base;
  const path = Array.isArray(lr.path) ? lr.path.map(Number).filter(Number.isFinite) : [];
  if (path.length > 1) {
    base.walk = path.slice();
    base.path = path.slice();
    return base;
  }
  const fromWalk = walkSquaresFromRoll(lr);
  if (fromWalk.length) {
    base.walk = fromWalk;
    base.path = path.length ? path.slice() : fromWalk.slice();
    return base;
  }
  const from = Number(lr.from) || 0;
  const to = Number(lr.to);
  if (Number.isFinite(to) && to !== from) {
    base.walk = [to];
    base.path = [to];
  }
  return base;
}

function markPendingPathAnim(inv) {
  const key = rollKey(inv);
  if (!key || !inv?.lastRoll || inv.lastRoll.overshoot) {
    pendingPathRollKey = "";
    return;
  }
  pendingPathRollKey = key;
}

function clearPendingPathAnim(key) {
  if (!key || pendingPathRollKey === key) pendingPathRollKey = "";
}

function formatRouteHtml(lr) {
  if (!lr) return "";
  if (lr.overshoot) {
    return (
      '<p class="wtd-3d-metric wtd-snl-route">Rolled <strong>' +
      lr.value +
      "</strong> — overshoot from sq " +
      (lr.from || "start") +
      ", stayed put.</p>"
    );
  }
  const route = resolveRollRoute(lr);
  const walkStr = (route.walk || []).join(" → ");
  const portalNote =
    route.portal && route.portalFrom != null && route.portalTo != null
      ? " · then <strong>" +
        route.portal +
        "</strong> " +
        route.portalFrom +
        " → " +
        route.portalTo
      : "";
  const who = lr.playerName ? escapeHtml(lr.playerName) + " · " : "";
  const glyph = SNL_PIECE_GLYPHS[sanitizePieceType(lr.piece)] || "♟";
  return (
    '<p class="wtd-3d-metric wtd-snl-route">' +
    glyph +
    " " +
    who +
    "rolled <strong>" +
    lr.value +
    "</strong> · walked " +
    (walkStr || "—") +
    portalNote +
    " · now sq <strong>" +
    (lr.to || "start") +
    "</strong></p>"
  );
}

function turnLogRowHtml(lr, latest) {
  const route = resolveRollRoute(lr);
  const walk = (route.walk || []).join("→") || "—";
  const portal =
    route.portal && route.portalFrom != null
      ? " · " + route.portal[0] + route.portalFrom + "→" + route.portalTo
      : "";
  const g = SNL_PIECE_GLYPHS[sanitizePieceType(lr.piece)] || "♟";
  return (
    '<p class="wtd-snl-turn-log-row' +
    (latest ? " latest" : "") +
    '">' +
    g +
    " <strong>" +
    escapeHtml(lr.playerName || "Player") +
    "</strong> 🎲" +
    lr.value +
    " · " +
    walk +
    portal +
    " → <strong>" +
    (lr.overshoot ? "stay " + (lr.from || 0) : lr.to) +
    "</strong></p>"
  );
}

function formatTurnHistoryHtml(inv) {
  const hist = Array.isArray(inv.turnHistory) ? inv.turnHistory : [];
  const rows = hist.length ? hist.slice(-6).reverse() : inv.lastRoll ? [inv.lastRoll] : [];
  if (!rows.length) return "";
  const latest = rows[0];
  const g = SNL_PIECE_GLYPHS[sanitizePieceType(latest.piece)] || "♟";
  const summaryLine =
    g +
    " " +
    escapeHtml(latest.playerName || "Player") +
    " 🎲" +
    latest.value +
    " → sq " +
    (latest.overshoot ? latest.from || 0 : latest.to);
  return (
    '<details class="wtd-snl-turn-log"' +
    (turnLogExpanded ? " open" : "") +
    ' id="wtdSnLTurnLog">' +
    '<summary class="wtd-snl-turn-log-summary">' +
    '<span class="wtd-snl-turn-log-summary-label">Turn routes</span>' +
    '<span class="wtd-snl-turn-log-summary-latest">' +
    summaryLine +
    "</span>" +
    '<span class="wtd-snl-turn-log-summary-hint">' +
    (turnLogExpanded ? "collapse" : "expand") +
    "</span>" +
    "</summary>" +
    '<div class="wtd-snl-turn-log-body" aria-label="Turn route log">' +
    rows.map((lr, i) => turnLogRowHtml(lr, i === 0)).join("") +
    "</div></details>"
  );
}

function bindTurnLogToggle() {
  const el = $("wtdSnLTurnLog");
  if (!el) return;
  el.addEventListener("toggle", () => {
    turnLogExpanded = !!el.open;
    const hint = el.querySelector(".wtd-snl-turn-log-summary-hint");
    if (hint) hint.textContent = turnLogExpanded ? "collapse" : "expand";
  });
}

/**
 * Animate the chess-piece token along walk squares + snake/ladder arc.
 * @param {object} inv
 */
/**
 * @param {object} inv
 * @returns {Promise<boolean>} true when any movement was animated
 */
async function animateRollPath(inv) {
  const lr = inv && inv.lastRoll;
  if (!lr || lr.overshoot || !scene) return false;
  let route = resolveRollRoute(lr);
  route = ensureWalkSteps(route, lr);
  if (!route || !(route.walk || []).length) return false;
  const slot = lr.playerSlot;
  const key = String(slot);
  let mesh = tokenMeshes.get(key);
  if (!mesh) {
    syncTokens(inv);
    mesh = tokenMeshes.get(key);
  }
  if (!mesh) return false;

  const gen = ++pathAnim.gen;
  pathAnim.busy = true;
  pathAnim.slot = slot;
  clearPathMarkers();

  const startW = tokenWorldPosition(lr.from || 0, slot);
  mesh.position.set(startW.x, startW.y, startW.z);
  mesh.userData.baseY = startW.y;

  let prev = startW;
  for (const sq of route.walk) {
    if (gen !== pathAnim.gen) return false;
    addPathMarker(sq, playerColorHex(slot));
    const next = tokenWorldPosition(sq, slot);
    await animateMeshTo(mesh, prev, next, 260, 0.2);
    prev = next;
  }

  if (route.portal && route.portalFrom != null && route.portalTo != null) {
    if (gen !== pathAnim.gen) return false;
    addPathMarker(route.portalTo, portalColorForKind(route.portal));
    await animatePortal(mesh, route.portalFrom, route.portalTo, route.portal, slot);
  }

  if (gen === pathAnim.gen) {
    const end = tokenWorldPosition(lr.to, slot);
    mesh.position.set(end.x, end.y, end.z);
    mesh.userData.baseY = end.y;
    pathAnim.busy = false;
    pathAnim.slot = null;
    window.setTimeout(() => {
      if (gen === pathAnim.gen) clearPathMarkers();
    }, 1600);
    return true;
  }
  return false;
}

/** Last-resort hop when route metadata was missing — still visible motion. */
async function animateMinimalRollHop(inv) {
  const lr = inv && inv.lastRoll;
  if (!lr || lr.overshoot || !scene) return false;
  const slot = rollPlayerSlot(lr);
  if (slot == null) return false;
  let mesh = tokenMeshes.get(String(slot));
  if (!mesh) {
    syncTokens(inviteWithRollStartPositions(inv));
    mesh = tokenMeshes.get(String(slot));
  }
  if (!mesh) return false;
  const fromSq = typeof lr.from === "number" ? lr.from : Number(lr.from) || 0;
  const toSq = typeof lr.to === "number" ? lr.to : Number(lr.to);
  if (!Number.isFinite(toSq) || toSq === fromSq) return false;

  const gen = ++pathAnim.gen;
  pathAnim.busy = true;
  pathAnim.slot = slot;
  const a = tokenWorldPosition(fromSq, slot);
  const b = tokenWorldPosition(toSq, slot);
  mesh.position.set(a.x, a.y, a.z);
  mesh.userData.baseY = a.y;
  await animateMeshTo(mesh, a, b, 520, 0.28);
  if (gen !== pathAnim.gen) return false;
  mesh.position.set(b.x, b.y, b.z);
  mesh.userData.baseY = b.y;
  pathAnim.busy = false;
  pathAnim.slot = null;
  return true;
}

/**
 * @param {object} inv
 * @param {{ force?: boolean }} [opts]
 */
async function playTurnVisual(inv, opts) {
  if (!inv || !inv.lastRoll) return;
  const key = rollKey(inv);
  const force = !!(opts && opts.force);
  if (!key) return;
  if (!force && key === lastAnimatedRollKey) return;
  if (inflightTurnVisualPromise && inflightTurnVisualKey === key) {
    return inflightTurnVisualPromise;
  }
  if (!force && key === animInFlightKey) return;

  inflightTurnVisualKey = key;
  animInFlightKey = key;
  markPendingPathAnim(inv);
  syncTokens(inv);

  inflightTurnVisualPromise = (async () => {
    const lr = inv.lastRoll;
    const needDice = skipDiceForRollKey !== key && dice && !diceBusy;

    if (needDice) {
      diceBusy = true;
      syncDiceOrigin();
      syncDicePresentation();
      try {
        await dice.shakeToValue(lr.value);
        dice.commitRollFace(lr.value);
      } catch (_) {
        /* ignore */
      }
      diceBusy = false;
      syncDicePresentation();
    }

    let moved = false;
    try {
      if (lr.overshoot) {
        bounceToken(lr.playerSlot);
        moved = true;
      } else {
        const visualInv = inviteWithRollStartPositions(
          inviteTruthPendingCommit && rollKey(inviteTruthPendingCommit) === key
            ? inviteTruthPendingCommit
            : inv
        );
        syncTokens(visualInv);
        moved = await animateRollPath(visualInv);
        if (!moved) {
          moved = await animateMinimalRollHop(visualInv);
        }
      }
    } finally {
      animInFlightKey = "";
      skipDiceForRollKey = "";
      if (moved) {
        lastAnimatedRollKey = key;
        clearPendingPathAnim(key);
        commitInviteTruthIfPending(key);
      } else if (inviteTruthPendingCommit && rollKey(inviteTruthPendingCommit) === key) {
        commitInviteTruthIfPending(key);
      }
      syncTokens(getLobbyInvite());
      if (inflightTurnVisualKey === key) {
        inflightTurnVisualPromise = null;
        inflightTurnVisualKey = "";
      }
    }

    syncDiceClickable();
    if (
      getLobbyInvite() &&
      getLobbyInvite().token === inv.token &&
      getLobbyInvite().status === "playing"
    ) {
      renderPlayingControls(getLobbyInvite());
    }
  })();

  return inflightTurnVisualPromise;
}

function syncTokens(invite) {
  if (!scene) return;
  const players = invite.players || [];
  const liveSlots = new Set();
  const lr = invite.lastRoll;
  const pendingKey = lr ? rollKey(invite) : "";
  const pendingWalk =
    !!lr &&
    !lr.overshoot &&
    pendingKey &&
    (pendingKey === pendingPathRollKey ||
      pendingKey === animInFlightKey ||
      pendingKey === inflightTurnVisualKey ||
      (pendingKey !== lastAnimatedRollKey && !pathAnim.busy));
  for (const p of players) {
    const key = String(p.slot);
    liveSlots.add(key);
    const piece = sanitizePieceType(p.piece || defaultPieceForSlot(p.slot));
    let mesh = tokenMeshes.get(key);
    const needRebuild = !mesh || mesh.userData.pieceType !== piece;
    if (needRebuild) {
      if (mesh) {
        scene.remove(mesh);
        disposeSnLPieceToken(mesh);
      }
      mesh = createSnLPieceToken(piece, playerColorHex(p.slot), 0.52);
      mesh.userData.slot = p.slot;
      mesh.userData.baseY = TOKEN_Y;
      mesh.userData.idlePhase = Number(p.slot) * 1.7;
      scene.add(mesh);
      tokenMeshes.set(key, mesh);
      if (p.isYou) bounceToken(p.slot);
    } else {
      mesh.userData.slot = p.slot;
    }
    const animating = pathAnim.busy && pathAnim.slot === p.slot;
    if (animating) continue;
    // Park at roll start until path anim runs — avoids flashing the end square.
    if (pendingWalk && rollPlayerSlot(lr) === Number(p.slot)) {
      const w = tokenWorldPosition(lr.from || 0, p.slot);
      mesh.position.set(w.x, w.y, w.z);
      mesh.userData.baseY = w.y;
      continue;
    }
    const w = tokenWorldPosition(p.position, p.slot);
    mesh.position.set(w.x, w.y, w.z);
    mesh.userData.baseY = w.y;
  }
  for (const [key, mesh] of tokenMeshes) {
    if (!liveSlots.has(key)) {
      scene.remove(mesh);
      disposeSnLPieceToken(mesh);
      tokenMeshes.delete(key);
    }
  }
}

function refreshStudioVisuals() {
  if (!renderer || !scene) return;
  if (studioHandle) {
    studioHandle.dispose();
    studioHandle = null;
  }
  studioHandle = attachWtdStudioEnvironment(renderer, scene);
  loadStudioBoardTextures((bundle) => applyBoardTexturesToTiles(bundle));
}

function ensureStudioAccessListener() {
  if (studioAccessBound) return;
  studioAccessBound = true;
  window.addEventListener("appgen-access-change", () => {
    ensureStudioSettingsSynced().then(() => {
      if (renderer && scene) refreshStudioVisuals();
    });
  });
}

function ensureEngine() {
  boardHost = $("wtdSnLBoard");
  if (!boardHost) {
    console.warn("[SnL] #wtdSnLBoard not found — switch to Snakes & Ladders tab or reload WTD.");
    return false;
  }
  if (renderer) return true;

  const { w, h } = measureHost();
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(w, h, false);
  renderer.setClearColor(DEFAULT_STUDIO_COLOR, 1);
  renderer.shadowMap.enabled = true;
  boardHost.appendChild(renderer.domElement);

  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(42, w / h, 0.1, 80);
  // Closer orbit for half-size board (was ~11 / 7).
  camera.position.set(0, 5.8, 3.8);
  camera.lookAt(0, 0, 0);

  orbit = new OrbitControls(camera, renderer.domElement);
  orbit.enableDamping = true;
  orbit.target.set(0, 0, 0);
  applyBoardOrbitLimits(orbit, { maxDistance: 18 });
  snlOrbitFree.bind(orbit);

  snlSettings = loadSnLSettings();
  if (!activeBoardLevelKey) {
    activeBoardLevelKey = sanitizeLevel(getLobbyInvite()?.level || snlSettings.level);
  }
  setActiveBoardLevel(activeBoardLevelKey);
  // Shared Chess studio: nebula backdrop, wood board textures, light prefs / cloud blob.
  studioHandle = attachWtdStudioEnvironment(renderer, scene);
  boardRoot = buildBoardMeshes();
  scene.add(boardRoot);
  loadStudioBoardTextures((bundle) => applyBoardTexturesToTiles(bundle));
  bindSnLSettingsModal();
  bindSnLGameOverModal();
  bindScreenRollDiceBtn();
  ensureStudioAccessListener();
  ensureStudioSettingsSynced().then((r) => {
    if (r && r.ok && r.loaded) refreshStudioVisuals();
  });

  dice = createSnLDice(scene, { scale: 0.276 });
  syncDiceBoardPhysics();
  bindDicePointer();
  syncDiceClickable();

  resizeObs = new ResizeObserver(() => resize());
  resizeObs.observe(boardHost);
  window.addEventListener("resize", resize);

  lastTick = performance.now();
  const tick = (now) => {
    animId = requestAnimationFrame(tick);
    const dt = Math.min(0.05, (now - lastTick) / 1000);
    lastTick = now;
    if (dice && !diceBusy) dice.stepIdle(dt);
    const inv = getLobbyInvite();
    if (inv && inv.status === "playing") {
      syncCameraForPlay(inv, dt);
    }
    // Chess-piece idle: subtle bob + yaw so tokens feel alive between turns.
    for (const [slotKey, mesh] of tokenMeshes) {
      if (pathAnim.busy && String(pathAnim.slot) === slotKey) continue;
      const phase = (mesh.userData.idlePhase || 0) + now * 0.0022;
      const baseY = mesh.userData.baseY != null ? mesh.userData.baseY : TOKEN_Y;
      let bounce = 0;
      if (mesh.userData.bounceT > 0) {
        mesh.userData.bounceT = Math.max(0, mesh.userData.bounceT - dt);
        bounce = Math.sin(mesh.userData.bounceT * Math.PI * 4) * 0.08 * mesh.userData.bounceT;
      }
      mesh.position.y = baseY + Math.sin(phase) * 0.018 + bounce;
      mesh.rotation.y = Math.sin(phase * 0.65) * 0.12;
    }
    if (orbit) orbit.update();
    if (renderer && scene && camera) renderer.render(scene, camera);
  };
  tick(lastTick);
  return true;
}

function formatPlayerLabel(p) {
  const glyph = SNL_PIECE_GLYPHS[sanitizePieceType(p.piece)] || "♟";
  return (
    glyph +
    " " +
    escapeHtml(p.name) +
    (p.isYou ? " (you)" : "") +
    (p.isAgent ? " · agent" : "")
  );
}

function localTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch (_) {
    return null;
  }
}

function formatCoords(lat, lng) {
  if (lat == null || lng == null || !Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) {
    return "location pending";
  }
  return Number(lat).toFixed(4) + ", " + Number(lng).toFixed(4);
}

function formatPresenceAge(iso) {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "just now";
  if (ms < 15000) return "just now";
  if (ms < 60000) return Math.round(ms / 1000) + "s ago";
  if (ms < 3600000) return Math.round(ms / 60000) + "m ago";
  return new Date(iso).toLocaleString();
}

function formatLocalTimeInZone(timezone) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      timeZone: timezone || undefined,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    }).format(new Date());
  } catch (_) {
    return new Date().toLocaleTimeString();
  }
}

function stopFlipTicker(hideOverlay = true) {
  if (flipTimerId) {
    clearInterval(flipTimerId);
    flipTimerId = 0;
  }
  if (hideOverlay) setLobbyFlipOverlayVisible(false);
}

function startFlipTicker(inv) {
  stopFlipTicker(false);
  if (!inv || inv.status !== "lobby" || !inv.lobbyEndsAt) return;
  const tick = () => {
    if (!getLobbyInvite() || getLobbyInvite().status !== "lobby" || !getLobbyInvite().lobbyEndsAt) {
      stopFlipTicker();
      return;
    }
    syncLobbyOverlayBar(getLobbyInvite());
    if (lobbySecondsRemaining(getLobbyInvite()) <= 0) stopFlipTicker();
  };
  tick();
  flipTimerId = window.setInterval(tick, 250);
}

function lobbyPlayersPresenceHtml(inv) {
  const humans = (inv.players || []).filter((p) => !p.isAgent);
  if (!humans.length) return "";
  return (
    '<div class="wtd-snl-presence-block" id="wtdSnLLobbyPresence">' +
    '<p class="wtd-snl-presence-heading">In this lobby</p>' +
    "<ul class=\"wtd-snl-presence-list\">" +
    humans
      .map((p) => {
        const tz = p.timezone || "—";
        const local = p.timezone ? formatLocalTimeInZone(p.timezone) : "—";
        return (
          "<li>" +
          "<strong>" +
          escapeHtml(p.name) +
          (p.isYou ? " (you)" : "") +
          "</strong>" +
          '<span class="wtd-snl-presence-meta">lat/lng ' +
          escapeHtml(formatCoords(p.lat, p.lng)) +
          " · " +
          escapeHtml(tz) +
          " · local " +
          escapeHtml(local) +
          " · updated " +
          escapeHtml(formatPresenceAge(p.presenceAt)) +
          "</span></li>"
        );
      })
      .join("") +
    "</ul></div>"
  );
}

function activeUsersHtml(inv) {
  const others = activeLabUsers.filter((u) => !u.isYou);
  const me = activeLabUsers.find((u) => u.isYou);
  const inLobby = inv && inv.status === "lobby" && inv.token;
  let html =
    '<details class="wtd-snl-active-users" id="wtdSnLActiveUsers" open>' +
    '<summary>Online lab users <span class="wtd-snl-active-count">(' +
    activeLabUsers.length +
    ")</span></summary>" +
    '<p class="wtd-snl-presence-note">Signed-in users in the training lab. During an open lobby you can send them a join invite they can accept or decline.</p>';
  if (me) {
    html +=
      '<p class="wtd-snl-presence-me">You: ' +
      escapeHtml(formatCoords(me.lat, me.lng)) +
      " · " +
      escapeHtml(me.timezone || "—") +
      " · " +
      escapeHtml(formatPresenceAge(me.updatedAt)) +
      "</p>";
  }
  if (!others.length) {
    html += '<p class="wtd-3d-metric">No other active users right now.</p></details>';
    return html;
  }
  html +=
    '<ul class="wtd-snl-presence-list">' +
    others
      .map((u) => {
        const inviteBtn = inLobby
          ? ' <button type="button" class="btn ghost wtd-snl-direct-invite-btn" data-snl-invite-user="' +
            escapeHtml(u.id) +
            '">Send invite</button>'
          : "";
        return (
          "<li><strong>" +
          escapeHtml(u.name) +
          "</strong>" +
          inviteBtn +
          '<span class="wtd-snl-presence-meta">lat/lng ' +
          escapeHtml(formatCoords(u.lat, u.lng)) +
          " · " +
          escapeHtml(u.timezone || "—") +
          " · local " +
          escapeHtml(u.timezone ? formatLocalTimeInZone(u.timezone) : "—") +
          " · " +
          escapeHtml(formatPresenceAge(u.updatedAt)) +
          "</span></li>"
        );
      })
      .join("") +
    "</ul></details>";
  return html;
}

function lobbyHudHtml(inv) {
  return (
    '<div class="wtd-snl-lobby-hud">' +
    lobbyPlayersPresenceHtml(inv) +
    activeUsersHtml(inv) +
    "</div>"
  );
}

function bindActiveUserInviteButtons(inv) {
  if (!inv || inv.status !== "lobby" || !inv.token) return;
  document.querySelectorAll("[data-snl-invite-user]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const uid = btn.getAttribute("data-snl-invite-user");
      if (uid) void sendDirectLobbyInvite(uid, inv);
    });
  });
}

async function sendDirectLobbyInvite(targetUserId, inv) {
  if (!inv || inv.status !== "lobby") {
    setSnLAlert("Start a lobby before sending invites.");
    return;
  }
  const url = snlPlayerInviteUrl(inv, { freshJoinId: true });
  if (!url) return;
  const { data } = await apiFetch("POST", {
    action: "directinvite",
    token: inv.token,
    targetUserId,
    joinUrl: url
  });
  if (!data.ok) {
    setSnLAlert(data.error || "Could not send invite");
    return;
  }
  const name =
    activeLabUsers.find((u) => u.id === targetUserId)?.name || "player";
  setSnLAlert(
    data.duplicate
      ? "Invite already pending for " + name + "."
      : "Invite sent to " + name + " — they can accept or decline."
  );
}

async function ensureNotifyPermission() {
  if (typeof Notification === "undefined") return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  try {
    const p = await Notification.requestPermission();
    return p === "granted";
  } catch (_) {
    return false;
  }
}

function showChromeInviteNotification(item) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  if (!item || !item.id || notifiedInboxIds.has(item.id)) return;
  notifiedInboxIds.add(item.id);
  try {
    const n = new Notification("Snakes & Ladders invite", {
      body:
        (item.fromName || "Someone") +
        " invited you to " +
        (item.lobbyLabel || "a lobby") +
        ". Open the lab to Accept or Decline.",
      tag: "snl-invite-" + item.id,
      requireInteraction: true
    });
    n.onclick = () => {
      try {
        window.focus();
      } catch (_) {
        /* ignore */
      }
      n.close();
      openInboxModal(item);
    };
  } catch (_) {
    /* ignore */
  }
}

function bindInboxModalOnce() {
  if (inboxModalBound) return;
  inboxModalBound = true;
  const modal = $("wtdSnLInboxModal");
  if (!modal) return;
  modal.addEventListener("click", (e) => {
    const t = e.target;
    if (!(t instanceof Element)) return;
    if (t.closest("[data-wtd-snl-inbox-close]")) {
      closeInboxModal();
      return;
    }
    if (t.closest("#wtdSnLInboxAccept") && activeInboxItem) {
      void respondInboxInvite(activeInboxItem.id, "accept");
      return;
    }
    if (t.closest("#wtdSnLInboxDecline") && activeInboxItem) {
      void respondInboxInvite(activeInboxItem.id, "reject");
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && inboxModalOpen) closeInboxModal();
  });
}

function openInboxModal(item) {
  if (!item || !item.id) return;
  bindInboxModalOnce();
  activeInboxItem = item;
  inboxModalOpen = true;
  const modal = $("wtdSnLInboxModal");
  const body = $("wtdSnLInboxModalBody");
  if (body) {
    body.innerHTML =
      "<strong>" +
      escapeHtml(item.fromName || "Someone") +
      "</strong> invited you to " +
      escapeHtml(item.lobbyLabel || "Snakes & Ladders") +
      ".";
  }
  if (modal) modal.hidden = false;
  document.body.classList.add("wtd-chess-env-modal-open");
  hideInboxBanner();
}

function closeInboxModal() {
  inboxModalOpen = false;
  activeInboxItem = null;
  const modal = $("wtdSnLInboxModal");
  if (modal) modal.hidden = true;
  if (!snlSettingsOpen && !onlineInviteModalOpen) {
    document.body.classList.remove("wtd-chess-env-modal-open");
  }
}

function hideInboxBanner() {
  const el = $("wtdSnLInboxBanner");
  if (el) {
    el.hidden = true;
    el.innerHTML = "";
  }
}

async function respondInboxInvite(inboxId, decision) {
  const { data } = await apiFetch("POST", {
    action: "inboxrespond",
    inboxId,
    decision
  });
  closeInboxModal();
  hideInboxBanner();
  if (!data.ok) {
    setSnLAlert(data.error || "Could not update invite");
    return;
  }
  if (data.rejected) {
    setSnLAlert("Invite declined.");
    return;
  }
  if (data.accepted && data.lobbyToken) {
    setSnLAlert("Joining lobby…");
    await joinLobby(data.lobbyToken);
  } else if (data.joinUrl) {
    try {
      const u = new URL(data.joinUrl);
      const m = u.hash.match(/snlInvite=([^&]+)/);
      if (m) await joinLobby(decodeURIComponent(m[1]));
    } catch (_) {
      setSnLAlert("Could not open invite link.");
    }
  }
}

function processInboxItems(items) {
  if (!Array.isArray(items) || !items.length) return;
  pendingInboxInvites = items;
  const next = items.find((e) => e && e.id && !seenInboxIds.has(e.id));
  if (!next) return;
  seenInboxIds.add(next.id);
  void ensureNotifyPermission().then((ok) => {
    if (ok) showChromeInviteNotification(next);
  });
  if (!inboxModalOpen) openInboxModal(next);
}

function startLabPresencePolling() {
  if (labPresenceTimer) return;
  void pollLabPresence();
  labPresenceTimer = window.setInterval(() => {
    void pollLabPresence();
  }, PRESENCE_HEARTBEAT_MS);
}

function stopLabPresencePolling() {
  if (labPresenceTimer) {
    clearInterval(labPresenceTimer);
    labPresenceTimer = null;
  }
}

async function pollLabPresence() {
  if (!signedIn()) return;
  try {
    const res = await fetch(PRESENCE_API, { method: "GET", credentials: "same-origin" });
    const data = await res.json().catch(() => ({}));
    if (data.ok && Array.isArray(data.users)) {
      activeLabUsers = data.users;
      const inv = getLobbyInvite();
      if (inv && inv.status === "lobby") refreshPresencePanels(inv);
    }
    if (data.ok && Array.isArray(data.inbox)) {
      processInboxItems(data.inbox);
    }
  } catch (_) {
    /* ignore */
  }
}

function refreshPresencePanels(inv) {
  const lobbyEl = $("wtdSnLLobbyPresence");
  if (lobbyEl && inv) {
    const wrap = document.createElement("div");
    wrap.innerHTML = lobbyPlayersPresenceHtml(inv);
    const next = wrap.firstElementChild;
    if (next) lobbyEl.replaceWith(next);
  }
  const activeEl = $("wtdSnLActiveUsers");
  if (activeEl) {
    const open = activeEl.open;
    const wrap = document.createElement("div");
    wrap.innerHTML = activeUsersHtml(inv);
    const next = wrap.firstElementChild;
    if (next) {
      if (open) next.open = true;
      activeEl.replaceWith(next);
      bindActiveUserInviteButtons(inv);
    }
  }
}

async function readDeviceGeo() {
  deviceGeo.timezone = localTimezone();
  if (!navigator.geolocation) return deviceGeo;
  try {
    const pos = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: false,
        maximumAge: 120000,
        timeout: 8000
      });
    });
    deviceGeo.lat = pos.coords.latitude;
    deviceGeo.lng = pos.coords.longitude;
  } catch (_) {
    /* permission denied / unavailable — still send timezone */
  }
  return deviceGeo;
}

async function heartbeatPresence(token) {
  deviceGeo.timezone = localTimezone();
  const body = {
    lat: deviceGeo.lat,
    lng: deviceGeo.lng,
    timezone: deviceGeo.timezone
  };
  try {
    const res = await fetch(PRESENCE_API, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const data = await res.json().catch(() => ({}));
    if (data.ok && Array.isArray(data.users)) {
      activeLabUsers = data.users;
      if (getLobbyInvite() && getLobbyInvite().status === "lobby") refreshPresencePanels(getLobbyInvite());
    }
    if (data.ok && Array.isArray(data.inbox)) {
      processInboxItems(data.inbox);
    }
  } catch (_) {
    /* ignore */
  }
  if (token) {
    try {
      const { data } = await apiFetch("POST", {
        action: "presence",
        token,
        lat: deviceGeo.lat,
        lng: deviceGeo.lng,
        timezone: deviceGeo.timezone
      });
    } catch (_) {
      /* ignore */
    }
  }
}

function stopPresenceHeartbeat() {
  if (presenceTimer) {
    clearInterval(presenceTimer);
    presenceTimer = null;
  }
  presenceHeartbeatToken = null;
}

function startPresenceHeartbeat(token) {
  if (!token) return;
  if (presenceTimer && presenceHeartbeatToken === token) return;
  stopPresenceHeartbeat();
  presenceHeartbeatToken = token;
  void readDeviceGeo().then(() => heartbeatPresence(token));
  presenceTimer = window.setInterval(() => {
    void readDeviceGeo().then(() => heartbeatPresence(token));
  }, PRESENCE_HEARTBEAT_MS);
}

async function startLobbyEarly(token) {
  const { data } = await apiFetch("POST", { action: "start", token });
  if (data.ok && data.invite) applyInvite(data.invite);
  else if (data.error) {
    setSnLAlert(data.error || "Could not start");
  }
}

function renderLobby(inv) {
  setDockCompactMode(true);
  forceSnlLobbyInvite(inv);
  stopFlipTicker(false);
  const myPiece = inv.myPiece || loadPreferredPiece();
  setSnLBanner("Lobby", lobbyChipSubtitle(inv));
  setHud(lobbyHudHtml(inv));
  startLabPresencePolling();
  syncLobbyOverlayBar(inv);
  startFlipTicker(inv);
  startPresenceHeartbeat(inv.token);

  const pieceBlock = pieceFooterIconHtml(myPiece);
  const playerLinkBtn = snlIconBtn(
    "wtdSnLPlayerInviteLink",
    "Copy link for next open seat",
    SNL_LINK_SVG
  );
  const onlineBtn = snlIconBtn(
    "wtdSnLOpenOnline",
    "Online players — send invite",
    SNL_INVITE_SVG
  );
  if (inv.status === "lobby" && inv.isHost) {
    setControls(
      dockIconsFooter(
        pieceBlock +
          playerLinkBtn +
          onlineBtn +
          snlIconBtn("wtdSnLStartNow", "Start game now", SNL_PLAY_SVG, "btn wtd-snl-dock-primary")
      )
    );
  } else if (inv.status === "lobby") {
    setControls(dockIconsFooter(pieceBlock + playerLinkBtn + onlineBtn));
  } else if (inv.status === "playing") {
    stopFlipTicker();
    renderPlaying(inv);
    return;
  } else if (inv.status === "finished") {
    stopFlipTicker();
    stopPresenceHeartbeat();
    renderFinished(inv);
    return;
  } else {
    setControls(dockIconsFooter(""));
  }
  bindLobbyControls(inv);
  bindActiveUserInviteButtons(inv);
  bindOnlinePanelToggle();
  bindPieceFooterMenu(inv);
  bindSettingsButton();
}

function bindOnlinePanelToggle() {
  $("wtdSnLOpenOnline")?.addEventListener("click", () => {
    const panel = $("wtdSnLActiveUsers");
    if (panel) {
      panel.open = true;
      panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
    setHud(lobbyHudHtml(getLobbyInvite()));
    bindActiveUserInviteButtons(getLobbyInvite());
  });
}

function turnLabel(inv) {
  const p = (inv.players || []).find((x) => x.slot === inv.turnPlayerSlot);
  if (!p) return "—";
  return escapeHtml(p.name) + (p.isAgent ? " (agent)" : p.isYou ? " (you)" : "");
}

function renderPlayingControls(inv) {
  const myPiece = inv.myPiece || loadPreferredPiece();
  setDockPlayMode(true);
  setControls(dockPlayIconsFooter(pieceFooterIconHtml(myPiece)));
  bindPlayingControls(inv);
  bindPieceFooterMenu(inv);
  bindSettingsButton();
}

function renderPlaying(inv) {
  setBoardFocusMode(true);
  setPlayHudHidden();
  setTitleChip("Snakes & Ladders");
  const playSection = $("wtdSnLPlay");
  if (playSection) playSection.classList.add("wtd-snl-play-active");
  snapCameraToMyPiece(inv);
  renderPlayingControls(inv);
  syncDiceClickable();
  snapCameraToMyPiece(inv);
}

function rollKey(inv) {
  if (!inv || !inv.lastRoll) return "";
  return String(inv.revision) + ":" + inv.lastRoll.playerSlot + ":" + inv.lastRoll.value;
}

/** Catch-up when invite revision already mirrored but turn anim never ran (e.g. duplicate apply). */
function maybePlayPendingTurnVisual(inv) {
  if (!inv || !inv.lastRoll) return;
  if (inv.status !== "playing" && inv.status !== "finished") return;
  const key = rollKey(inv);
  if (!key || key === lastAnimatedRollKey || key === animInFlightKey) return;
  if (inv.status === "finished") {
    void playTurnVisual(inv).then(() => renderFinished(inv));
  } else {
    void playTurnVisual(inv);
  }
}

function renderFinished(inv) {
  setDockCompactMode(true);
  const playSection = $("wtdSnLPlay");
  if (playSection) playSection.classList.remove("wtd-snl-play-active");
  setBoardFocusMode(true);
  setPlayHudHidden();
  setTitleChip("Snakes & Ladders");
  openSnLGameOver(inv);
  syncDiceClickable();
  setControls(dockIconsFooter());
  $("wtdSnLLeaveLobby")?.addEventListener("click", () => leaveLobby());
  bindSettingsButton();
}

function bindLobbyControls(inv) {
  bindSnLPlayerInviteLink(inv);
  $("wtdSnLStartNow")?.addEventListener("click", () => {
    if (inv.token) startLobbyEarly(inv.token);
  });
  $("wtdSnLLeaveLobby")?.addEventListener("click", () => leaveLobby());
}

function bindPlayingControls(inv) {
  $("wtdSnLLeaveLobby")?.addEventListener("click", () => leaveLobby());
}

function stopSnlNetworkActivity() {
  stopPoll();
  stopPresenceHeartbeat();
  stopLabPresencePolling();
  stopFlipTicker();
}

function clearSnLInviteFromHash() {
  try {
    sessionStorage.removeItem(PENDING_KEY);
  } catch (_) {
    /* ignore */
  }
  try {
    history.replaceState(null, "", "#snakes-ladders");
  } catch (_) {
    location.hash = "snakes-ladders";
  }
}

/** Cancelled / dead lobby — stop all network loops and offer a fresh game. */
function presentCancelledLobby(inv, message) {
  stopSnlNetworkActivity();
  clearSnLInviteFromHash();
  setSnLAlert(message || "This lobby is closed — start a new game.");
  setDockCompactMode(true);
  setControls(
    dockIconsFooter(
      snlIconBtn("wtdSnLNewGame", "Try again", SNL_REFRESH_SVG, "btn wtd-snl-dock-primary"),
      { leave: false }
    )
  );
  $("wtdSnLNewGame")?.addEventListener("click", () => createLobby());
  bindSettingsButton();
}

function applyInvite(inv, opts) {
  if (!inv || !inv.token) return;
  const skipTurnVisual = !!(opts && opts.skipTurnVisual);
  const prevRev = getLastRevision();
  const prevPresence = getLastPresenceRevision();
  const rev = typeof inv.revision === "number" ? inv.revision : 0;

  /* Terminal status always wins — never early-return before stop. */
  if (inv.status === "cancelled") {
    inviteTruthPendingCommit = null;
    mirrorSnlInvite(inv);
    presentCancelledLobby(inv);
    return;
  }

  if (prevRev >= 0 && rev < prevRev) return;

  const sameRev = rev === prevRev;
  const presenceChanged =
    typeof inv.presenceRevision === "number" && inv.presenceRevision !== prevPresence;

  if (sameRev && inv.status === "lobby") {
    if (presenceChanged) {
      forceSnlLobbyInvite(inv);
      refreshPresencePanels(inv);
    }
    syncLobbyOverlayBar(inv);
    startFlipTicker(inv);
    startPoll(inv.token);
    return;
  }
  if (sameRev && inv.status !== "lobby") {
    stopFlipTicker();
    if (inv.status === "playing") {
      setPlayHudHidden();
      setDockPlayMode(true);
      startPoll(inv.token);
    }
    if (inv.status === "finished") {
      stopPresenceHeartbeat();
      stopPoll();
    }
    syncTokens(inv);
    syncDiceClickable();
    maybePlayPendingTurnVisual(inv);
    return;
  }

  const prevInvite = getLobbyInvite();
  const prevRollKey = rollKey(prevInvite);
  mirrorInviteState(inv, opts);
  const nextRollKey = rollKey(inv);
  if (
    nextRollKey &&
    nextRollKey !== prevRollKey &&
    inv.lastRoll &&
    !inv.lastRoll.overshoot &&
    (inv.status === "playing" || inv.status === "finished")
  ) {
    markPendingPathAnim(inv);
  }
  ensureBoardLevelForInvite(inv);
  ensureEngine();
  syncTokens(inv);
  syncDiceClickable();
  if (inv.status === "lobby") renderLobby(inv);
  else if (inv.status === "playing") {
    stopFlipTicker();
    renderPlaying(inv);
    if (!skipTurnVisual) void playTurnVisual(inv);
  } else if (inv.status === "finished") {
    stopFlipTicker();
    stopPresenceHeartbeat();
    if (skipTurnVisual) {
      renderFinished(inv);
    } else {
      void playTurnVisual(inv).then(() => renderFinished(inv));
    }
  } else renderLobby(inv);
  if (inv.status === "lobby" || inv.status === "playing") {
    startPoll(inv.token);
  } else if (inv.status === "finished") {
    stopPoll();
  }
}

function leaveLobby() {
  closeSnLGameOver();
  const playSection = $("wtdSnLPlay");
  if (playSection) playSection.classList.remove("wtd-snl-play-active");
  stopPoll();
  stopFlipTicker();
  stopPresenceHeartbeat();
  clearSnlLobbyMirror();
  try {
    sessionStorage.removeItem(PENDING_KEY);
  } catch (_) {}
  try {
    history.replaceState(null, "", "#snakes-ladders");
  } catch (_) {
    location.hash = "snakes-ladders";
  }
  showIntro();
}

function snlOAuthSignInHref() {
  if (window.AppgenAuth && typeof window.AppgenAuth.signInHref === "function") {
    return window.AppgenAuth.signInHref();
  }
  const next =
    typeof window.appgenSignInReturnUrl === "function"
      ? window.appgenSignInReturnUrl()
      : location.pathname + (location.hash || "#snakes-ladders");
  return "/api/auth/google?next=" + encodeURIComponent(next);
}

function hasPendingSnLInvite() {
  if (snlInviteTokenFromLocation()) return true;
  try {
    return Boolean(sessionStorage.getItem(PENDING_KEY));
  } catch (_) {
    return false;
  }
}

function showIntro(opts) {
  stopSnlNetworkActivity();
  setDockCompactMode(true);
  const pref = loadPreferredPiece();
  snlSettings = loadSnLSettings();
  const playSection = $("wtdSnLPlay");
  if (playSection) playSection.classList.remove("wtd-snl-play-active");
  setSnLBanner("Snakes & Ladders");
  const awaitingSignIn =
    !!(opts && opts.awaitingSignIn) || (!signedIn() && hasPendingSnLInvite());
  const signInDock = awaitingSignIn
    ? '<a class="btn wtd-snl-dock-primary" id="wtdSnLSignInJoin" href="' +
      escapeHtml(snlOAuthSignInHref()) +
      '">Sign in to join</a>'
    : snlIconBtn("wtdSnLCreate", "Create game and invite", SNL_INVITE_SVG, "btn wtd-snl-dock-primary");
  setControls(dockIconsFooter(pieceFooterIconHtml(pref) + signInDock, { leave: false }));
  bindPieceFooterMenu(null);
  bindSettingsButton();
  bindSnLPlayerInviteLink(null);
  if (!awaitingSignIn) {
    $("wtdSnLCreate")?.addEventListener("click", () => createLobby());
    startLabPresencePolling();
  }
  syncDiceOrigin();
  syncDiceClickable();
}

async function createLobby() {
  if (!signedIn()) {
    setSnLAlert("Sign in with Google in the header");
    return;
  }
  setControls('<p class="wtd-3d-metric">Creating lobby…</p>');
  const hostTabKey = mintTabPlayerKey();
  const { data } = await apiFetch("POST", {
    action: "create",
    level: snlSettings.level,
    playerKey: hostTabKey
  });
  if (!data.ok) {
    showIntro();
    setSnLAlert(data.error || "Could not create game");
    return;
  }
  try {
    history.replaceState(null, "", "#snakes-ladders?snlInvite=" + encodeURIComponent(data.token));
  } catch (_) {
    location.hash = "snakes-ladders?snlInvite=" + data.token;
  }
  if (data.token) setTabPlayerKey(data.token, hostTabKey);
  const pref = loadPreferredPiece();
  if (pref && data.token) {
    const set = await apiFetch("POST", { action: "setPiece", token: data.token, piece: pref });
    if (set.data.ok && set.data.invite) {
      applyInvite(set.data.invite);
      return;
    }
  }
  applyInvite(data.invite);
}

async function joinLobby(token) {
  const t = sanitizeToken(token);
  if (!t) return;
  syncSnLInviteHash(t);
  if (!signedIn()) {
    try {
      sessionStorage.setItem(PENDING_KEY, t);
    } catch (_) {}
    setSnLAlert("Sign in with Google — you will return here and join this lobby automatically.");
    showIntro({ awaitingSignIn: true });
    return;
  }
  if (joinLobbyInFlight === t) return;
  joinLobbyInFlight = t;
  try {
  ensureSnLLabVisible();
  setControls('<p class="wtd-3d-metric">Joining lobby…</p>');
  const { res, data } = await apiFetch("POST", { action: "join", token: t });
  if (!data.ok) {
    if (handleDeadSnLInvite(res, data)) return;
    showIntro();
    setSnLAlert(data.error || "Join failed");
    return;
  }
  const pref = loadPreferredPiece();
  if (pref && data.token) {
    const set = await apiFetch("POST", { action: "setPiece", token: data.token, piece: pref });
    if (set.data.ok && set.data.invite) {
      applyInvite(set.data.invite);
      return;
    }
  }
  applyInvite(data.invite);
  } finally {
    if (joinLobbyInFlight === t) joinLobbyInFlight = null;
  }
}

async function rollDie(token) {
  if (diceBusy || pathAnim.busy || !dice) return;
  diceBusy = true;
  dice.setHovered(false);
  const rollBtn = $("wtdSnLRollDiceBtn");
  if (rollBtn) rollBtn.hidden = true;
  syncDiceOriginForInvite(getLobbyInvite());
  dice.setFloating(false);
  dice.setVisible(true);
  syncDicePresentation();
  try {
    const value = await dice.dropRoll();
    const roll = dice.commitRollFace(value);
    const { data } = await apiFetch("POST", { action: "roll", token, roll });
    if (data.ok && data.invite) {
      const serverRoll =
        typeof data.invite.lastRoll?.value === "number"
          ? data.invite.lastRoll.value
          : typeof data.roll === "number"
            ? data.roll
            : roll;
      dice.commitRollFace(serverRoll);
      skipDiceForRollKey = rollKey(data.invite);
      applyInvite(data.invite, { skipTurnVisual: true });
      await playTurnVisual(data.invite, { force: true });
      if (data.invite.status === "finished") {
        stopFlipTicker();
        stopPresenceHeartbeat();
        renderFinished(data.invite);
      }
    } else {
      if (data.code === "stale_revision" && token) await pollState(token);
      setSnLControlsStatus(data.error || "Roll failed");
      if (getLobbyInvite()) renderPlaying(getLobbyInvite());
    }
  } catch (e) {
    setSnLControlsStatus(e.message || "Dice error");
    if (getLobbyInvite()) renderPlaying(getLobbyInvite());
  } finally {
    diceBusy = false;
    syncDicePresentation();
    if (getLobbyInvite() && getLobbyInvite().status === "playing") renderPlayingControls(getLobbyInvite());
  }
}

function sanitizeToken(raw) {
  let t = String(raw || "").trim();
  if (!t) return null;
  try {
    t = decodeURIComponent(t);
  } catch (_) {
    /* keep raw */
  }
  return TOKEN_RE.test(t) ? t : null;
}

/** Parse invite token from hash, search params, full URL, or bare token (chess-style link open). */
function parseSnLInviteToken(raw) {
  const s = String(raw || "").trim();
  if (!s) return null;
  const embedded = s.match(/[#?&]snlInvite=([^&#]+)/i);
  if (embedded) return sanitizeToken(embedded[1]);
  return sanitizeToken(s);
}

function snlInviteTokenFromLocation() {
  try {
    const hashQ = (location.hash || "").replace(/^#/, "").split("?")[1] || "";
    const fromHash = new URLSearchParams(hashQ).get("snlInvite");
    if (fromHash) return sanitizeToken(fromHash);
    const fromSearch = new URLSearchParams(location.search || "").get("snlInvite");
    if (fromSearch) return sanitizeToken(fromSearch);
  } catch (_) {
    /* ignore */
  }
  return null;
}

function syncSnLInviteHash(token) {
  const t = sanitizeToken(token);
  if (!t) return;
  const want = "#snakes-ladders?snlInvite=" + encodeURIComponent(t);
  try {
    if ((location.hash || "") !== want) history.replaceState(null, "", want);
  } catch (_) {
    location.hash = want.slice(1);
  }
}

function nextOpenPlayerSlot(inv) {
  const max = typeof inv.maxPlayers === "number" ? inv.maxPlayers : 4;
  const used = new Set((inv.players || []).map((p) => Number(p.slot)));
  for (let s = 0; s < max; s++) {
    if (!used.has(s)) return s;
  }
  return null;
}

/** Share URL for the next human seat; each click mints a fresh `snlJoin` id (distinct links, same lobby). */
function snlPlayerInviteUrl(inv, { freshJoinId = true } = {}) {
  const token = sanitizeToken(inv && inv.token);
  if (!token) return "";
  const path = location.pathname || "/";
  let q = "snlInvite=" + encodeURIComponent(token);
  if (freshJoinId) {
    q += "&snlJoin=" + encodeURIComponent(mintTabPlayerKey());
  }
  return location.origin.replace(/\/$/, "") + path + "#snakes-ladders?" + q;
}

function snlInviteAbsoluteUrl(inv) {
  return snlPlayerInviteUrl(inv, { freshJoinId: false });
}

async function copyInviteLinkForNextPlayer(inv) {
  const live = inv || getLobbyInvite();
  if (!live || !live.token) {
    setSnLAlert("Create a game first, then use the link button for each player.");
    return;
  }
  if (live.status !== "lobby" || !live.lobbyOpen) {
    setSnLAlert("Lobby is closed — start a new game to invite players.");
    return;
  }
  const slot = nextOpenPlayerSlot(live);
  if (slot == null) {
    setSnLAlert("Lobby is full (4 players max).");
    return;
  }
  const url = snlPlayerInviteUrl(live, { freshJoinId: true });
  if (!url) return;
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(url);
    } else {
      window.prompt("Copy this link for player " + (slot + 1) + ":", url);
    }
    setSnLAlert(
      "Player " +
        (slot + 1) +
        " link copied — they open it to claim the next seat automatically."
    );
  } catch (_) {
    window.prompt("Copy this link for player " + (slot + 1) + ":", url);
  }
}

function bindSnLPlayerInviteLink(inv) {
  $("wtdSnLPlayerInviteLink")?.addEventListener("click", () => {
    void copyInviteLinkForNextPlayer(inv);
  });
}

/** Open SNL panel without re-dispatching setWtdMode (same-mode bumps seq → init/join loop). */
function ensureSnLLabVisible() {
  const api = window.AppgenWtdStore;
  if (api && api.store && api.selectors && typeof api.selectors.selectWtdMode === "function") {
    try {
      if (api.selectors.selectWtdMode(api.store.getState()) === "snl") return;
    } catch (_) {
      /* fall through */
    }
  }
  const panel = $("wtdPanelSnL");
  if (panel && !panel.hidden) return;
  if (window.AppgenWtd && typeof window.AppgenWtd.setWtdMode === "function") {
    window.AppgenWtd.setWtdMode("snl");
  }
}

function bindSnLAuthInviteRetry() {
  if (window.__appgenSnLAuthInviteRetry) return;
  window.__appgenSnLAuthInviteRetry = true;
  window.addEventListener("appgen-access-change", () => {
    const wtdView = $("wtdView");
    if (wtdView && wtdView.hidden) return;
    const t = snlInviteTokenFromLocation();
    if (!t || !signedIn()) return;
    const live = getLobbyInvite();
    if (live && live.token === t) return;
    joinFromHash(t);
  });
}

function joinFromHash(token) {
  const t = parseSnLInviteToken(token) || sanitizeToken(token);
  if (!t) return;
  if (joinFromHashInFlight === t) return;
  const live = getLobbyInvite();
  if (live && live.token === t) return;
  joinFromHashInFlight = t;
  try {
    ensureTabPlayerKey(t);
    syncSnLInviteHash(t);
    try {
      sessionStorage.setItem(PENDING_KEY, t);
    } catch (_) {}
    ensureSnLLabVisible();
    if (signedIn()) {
      void joinLobby(t);
    } else {
      setSnLAlert("Sign in with Google — you will return here and join this lobby automatically.");
      showIntro({ awaitingSignIn: true });
    }
  } finally {
    if (joinFromHashInFlight === t) joinFromHashInFlight = null;
  }
}

function consumePendingInvite() {
  const fromHash = snlInviteTokenFromLocation();
  if (fromHash) {
    joinFromHash(fromHash);
    return;
  }
  let token = null;
  try {
    token = sessionStorage.getItem(PENDING_KEY);
  } catch (_) {}
  if (!token) return;
  if (signedIn()) {
    sessionStorage.removeItem(PENDING_KEY);
    ensureTabPlayerKey(token);
    void joinLobby(token);
  }
}

function init() {
  bindSnLAuthInviteRetry();
  snlSettings = loadSnLSettings();
  if (initialized) {
    ensureEngine();
    resize();
    const live = getLobbyInvite();
    if (live) {
      if (live.status === "lobby") renderLobby(live);
      else if (live.status === "playing") renderPlaying(live);
      else if (live.status === "finished") renderFinished(live);
      else showIntro();
    } else {
      const t = snlInviteTokenFromLocation();
      if (t) joinFromHash(t);
      else showIntro();
    }
    return;
  }
  initialized = true;
  ensureEngine();
  const fromHash = snlInviteTokenFromLocation();
  let storedInvite = false;
  try {
    storedInvite = Boolean(sessionStorage.getItem(PENDING_KEY));
  } catch (_) {
    /* ignore */
  }
  if (!fromHash && !storedInvite) showIntro();
  else if (fromHash) joinFromHash(fromHash);
}

function onClose() {
  disposeEngine();
  initialized = false;
  clearSnlLobbyMirror();
}

window.AppgenWtdSnL = {
  init,
  onClose,
  joinInviteFromHash: joinFromHash,
  consumePendingInvite,
  stopForAdminKill,
  stopSnlNetworkActivity,
  clearSnLInviteFromHash
};
