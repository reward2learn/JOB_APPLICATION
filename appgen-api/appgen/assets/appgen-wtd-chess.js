/**
 * WTD Chess Tutor — user vs teaching AI (chess.js rules, Three.js 3D board).
 */
import { Chess } from "chess.js";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { createOrbitFreeExplore } from "./appgen-wtd-orbit-free.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import {
  GOLDEN_RULES,
  formatCoachWithRule,
  isLessonModeEnabled,
  markRuleEncounter,
  pickPrimaryGoldenRule,
  setLessonModeEnabled
} from "./appgen-wtd-chess-golden-rules.js";
import {
  CHESS_101_DRILLS,
  currentDrillStep,
  getDrillById,
  isDrillComplete,
  load101Progress,
  mark101DrillComplete,
  resolveDrillFen,
  stepMatchesMove
} from "./appgen-wtd-chess-101.js";
import {
  CHESS_STRATEGIES,
  getStrategyById,
  isStrategyComplete,
  markStrategyComplete,
  resolveNextLesson,
  resolveNextStrategyAfter,
  strategiesProgressSummary,
  strategyCoachFocus,
  strategyIndex,
  strategyLessonStepAtWhitePly
} from "./appgen-wtd-chess-strategies.js";
import {
  DEFAULT_STUDIO_COLOR,
  applyBackdropImageBlend,
  applySceneBackground,
  createEnvironmentSphere,
  disposeBackgroundTexture,
  disposeEnvironmentSphere,
  loadBackgroundPrefs,
  readImageFileAsDataUrl,
  resetBackgroundApplyCache,
  saveBackgroundPrefs
} from "./appgen-wtd-chess-scene-bg.js";
import {
  LIGHT_INTENSITY_MAX,
  LIGHT_INTENSITY_MIN,
  SCENE_LIGHT_BASE,
  loadSceneLightPrefs,
  normalizeLightIntensity,
  saveSceneLightPrefs
} from "./appgen-wtd-chess-scene-light.js";
import {
  hexToThreeColor,
  loadBoardThemePrefs,
  mixThemeHex,
  pickThemeOpacity,
  saveBoardThemePrefs
} from "./appgen-wtd-chess-board-theme.js";
import {
  applyChessSettingsPayload,
  downloadChessSettingsExport,
  parseChessSettingsImport,
  pushChessSettingsToCloud,
  readChessSettingsFromStorage,
  syncChessSettingsWithCloud
} from "./appgen-wtd-chess-settings.js";
import {
  store as wtdStore,
  dispatch as wtdDispatch,
  applyServerInviteSnapshot,
  clearChessMultiplayer,
  resetSyncedRevision,
  setPvpSendingMove,
  selectPvpInvite,
  selectLastSyncedRevision,
  selectPvpSendingMove,
  hydrateChessEnv,
  setChessEnvBackground,
  setChessEnvBoardTheme,
  setChessEnvSceneLight,
  openChessEnvModal as openChessEnvModalAction,
  closeChessEnvModal as closeChessEnvModalAction,
  commitChessEnvModal as commitChessEnvModalAction,
  setChessEnvDraftBackground,
  setChessEnvDraftBoardTheme,
  patchChessEnvDraftBackground,
  patchChessEnvDraftBoardTheme,
  patchChessEnvDraftSceneLight,
  selectChessEnvBackground,
  selectChessEnvBoardTheme,
  selectChessEnvSceneLight,
  selectChessEnvDraftBackground,
  selectChessEnvDraftBoardTheme,
  selectChessEnvDraftSceneLight,
  selectChessEnvModalOpen,
  setChessPlayMode,
  setChessMyColor,
  setChessFen,
  setChessSelection,
  clearChessSelection,
  setChessLastMove,
  clearChessLastMove,
  resetChessGame,
  setChessSession,
  startNewChessSession,
  ensureChessSession,
  patchChessSession,
  incrementChessHumanMoves,
  incrementChessAiMoves,
  setChessCurriculumFocus,
  setChessPractice,
  incrementChessPracticeStep,
  clearChessPractice,
  setInviteResumeState,
  clearInviteResumeState,
  resetChessSessionSlice,
  clearChessActiveSession,
  selectChessGame,
  selectChessSessionSlice,
  selectInviteResumeState,
  selectChessOrbit
} from "./appgen-wtd-store.js?v=20261024-cognitive-3d-autostart";

const LEVEL_ID = "chess";
const COACH_API = "/api/wtd-chess-coach";
const CHESS_INVITE_API = "/api/chess-invite";
const PVP_POLL_MS = 1500;
const PENDING_INVITE_KEY = "wtdChessInvitePending";
/** Sticky dual-seat tab role — survives hash strip / soft refresh within the tab. */
const PVP_SEAT_LOCK_KEY = "wtdChessPvpSeat";
const BEGINNER_HINTS_KEY = "wtdChessBeginnerHints";
const COACH_ASIDE_OPEN_KEY = "wtdChessCoachAsideOpen";
const CHESS_INVITE_TOKEN_RE = /^[a-zA-Z0-9_-]{16,48}$/;
const MOBILE_CHESS_LAB_MQ = window.matchMedia("(max-width: 720px)");

function isMobileChessLab() {
  if (window.AppgenWtd && typeof window.AppgenWtd.isMobileChessLab === "function") {
    return window.AppgenWtd.isMobileChessLab();
  }
  return MOBILE_CHESS_LAB_MQ.matches;
}

function syncMobileChessLabChrome() {
  if (window.AppgenWtd && typeof window.AppgenWtd.syncMobileChessLabUi === "function") {
    window.AppgenWtd.syncMobileChessLabUi();
  }
}

function notifyChessLayoutResize() {
  window.requestAnimationFrame(() => {
    resize();
    window.dispatchEvent(new Event("resize"));
  });
}

const BOARD = 8;
const CELL = 1.05;
/** Top of tile meshes (center 0.02 + half height 0.035). Piece foot + orbit pivot height. */
const TILE_TOP_Y = 0.055;
const PIECE_REST_Y = TILE_TOP_Y;
const PIECE_CAM_TARGET_Y = PIECE_REST_Y + 0.12;

const SCENE_BG = 0xd8e2ea;
const HIGHLIGHT_SELECT = 0x0d9488;
/** Legal-move rings only (no tile fill) — simple white circle on the board. */
const HIGHLIGHT_TARGET = 0xffffff;
const HIGHLIGHT_HINT = 0xeab308;
/** Coach recommend squares — double white rings + subtle tile glow. */
const HIGHLIGHT_COACH = 0xffffff;
const HIGHLIGHT_COACH_INTENSITY = 0.1;
const HIGHLIGHT_LAST = 0xea580c;

/** Default orbit: ~45° elevation, White side (−Z / rank 1 near camera, Black far). */
const CAM_WHITE_POS = Object.freeze({ x: 0, y: 7.4, z: -7.4 });
const CAM_BLACK_POS = Object.freeze({ x: 0, y: 7.4, z: 7.4 });
/** Orbit pivot at board center — keeps the full 8×8 grid framed when tilting up. */
const CAM_ORBIT_TARGET = Object.freeze({ x: 0, y: PIECE_CAM_TARGET_Y, z: 0 });
/** King-follow only when the king has left the opening area (endgame drift). */
const ORBIT_KING_FOLLOW_START = CELL * 4.25;
/** Camera offset from your king when snapping / starting orbit (rank-1 vs rank-8 side). */
const CAM_PIECE_OFFSET_WHITE = Object.freeze({ x: 0, y: 7.2, z: -7.2 });
const CAM_PIECE_OFFSET_BLACK = Object.freeze({ x: 0, y: 7.2, z: 7.2 });
const pieceCameraTarget = new THREE.Vector3();
/** Hot-read cache of Redux `chessOrbit` (OrbitControls object stays module-local). */
let orbitPolicy = {
  followHumanKing: true,
  minPolarAngle: 0.12,
  maxPolarAngle: Math.PI / 2 - 0.04,
  minDistance: 2.6,
  maxDistance: 22,
  rotateSpeed: 0.72,
  zoomSpeed: 0.85,
  kingTargetLerp: 7,
  dampingFactor: 0.08,
  enableDamping: true,
  enablePan: true
};

const chessOrbitFree = createOrbitFreeExplore();

const PIECE_VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

let playEl = null;
let hudEl = null;
let controlsEl = null;
let game = null;
let session = null;
let selectedSquare = null;
let legalTargets = [];
let hintMove = null;
/** @type {{ from: string, to: string } | null} */
let coachRecommendMove = null;
let lastMoveFrom = null;
let lastMoveTo = null;
let beginnerHints = loadBeginnerHintsEnabled();
let lessonMode = true;

function loadBeginnerHintsEnabled() {
  try {
    const raw = localStorage.getItem(BEGINNER_HINTS_KEY);
    if (raw === "0" || raw === "false") return false;
    if (raw === "1" || raw === "true") return true;
  } catch (_) {
    /* ignore */
  }
  return true;
}

function setBeginnerHintsEnabled(on) {
  beginnerHints = !!on;
  try {
    localStorage.setItem(BEGINNER_HINTS_KEY, beginnerHints ? "1" : "0");
  } catch (_) {
    /* ignore */
  }
}

function loadCoachAsideOpen() {
  try {
    return localStorage.getItem(COACH_ASIDE_OPEN_KEY) === "1";
  } catch (_) {
    return false;
  }
}

/** Desktop coach panel — collapsed by default; open only via toggle. */
let coachAsideOpen = loadCoachAsideOpen();

/** Mobile curriculum strip (≤720px) — collapsed by default. */
let mobileStepExpanded = false;

function setCoachAsideOpen(open) {
  coachAsideOpen = !!open;
  try {
    localStorage.setItem(COACH_ASIDE_OPEN_KEY, coachAsideOpen ? "1" : "0");
  } catch (_) {
    /* ignore */
  }
  syncCoachAsideUi();
}

function syncCoachAsideUi() {
  const play = $("wtdChessPlay");
  const aside = $("wtdChessCoachAside");
  const toggle = $("wtdChessCoachAsideToggle");
  if (play) play.classList.toggle("wtd-chess-coach-open", coachAsideOpen);
  if (aside) {
    aside.hidden = !coachAsideOpen;
    aside.setAttribute("aria-hidden", coachAsideOpen ? "false" : "true");
  }
  if (toggle) {
    toggle.setAttribute("aria-pressed", coachAsideOpen ? "true" : "false");
    toggle.setAttribute(
      "aria-label",
      coachAsideOpen ? "Collapse coach panel" : "Expand coach panel"
    );
    toggle.title = coachAsideOpen ? "Collapse coach panel" : "Expand coach panel";
  }
  requestAnimationFrame(() => {
    resize();
    forceChessRender();
  });
}

let useCloudCoach = true;
let coachBusy = false;
let aiTurnTimer = null;
let coachRequestGen = 0;
/** @type {import("./appgen-wtd-chess-golden-rules.js").GOLDEN_RULES[number] | null} */
let activeGoldenRule = null;
/** When set, lesson-mode coach tips prioritize this golden rule id. */
let curriculumFocusRuleId = null;
/** Active winning-strategy curriculum lesson (vs coach). */
let curriculumFocusStrategyId = null;

/** @type {"ai" | "pvp" | "pvp-waiting" | "practice"} */
let playMode = "ai";
/** @type {import("./appgen-wtd-chess-101.js").Chess101Drill | null} */
let practiceDrill = null;
let practiceStepIndex = 0;
/**
 * Chess env hot-read cache — write-side SSoT is Redux `chessEnv`.
 * Updated via pullChessEnvFromStore after every env dispatch.
 * @type {import("./appgen-wtd-chess-scene-bg.js").SceneBgPrefs}
 */
let sceneBgPrefs = loadBackgroundPrefs();
/** @type {import("./appgen-wtd-chess-board-theme.js").BoardThemePrefs} */
let boardThemePrefs = loadBoardThemePrefs();
/** @type {import("./appgen-wtd-chess-scene-light.js").SceneLightPrefs} */
let sceneLightPrefs = loadSceneLightPrefs();
/** @type {import("./appgen-wtd-chess-scene-bg.js").SceneBgPrefs | null} */
let envDraftBg = null;
/** @type {import("./appgen-wtd-chess-board-theme.js").BoardThemePrefs | null} */
let envDraftBoard = null;
/** @type {import("./appgen-wtd-chess-scene-light.js").SceneLightPrefs | null} */
let envDraftLight = null;
let envModalOpen = false;
let chessGameOverBound = false;
/** @type {Promise<unknown> | null} */
let chessCloudSyncPromise = null;

/** Sync module cache from Redux `chessEnv`. */
function pullChessEnvFromStore() {
  const st = wtdStore.getState();
  sceneBgPrefs = selectChessEnvBackground(st);
  boardThemePrefs = selectChessEnvBoardTheme(st);
  sceneLightPrefs = selectChessEnvSceneLight(st);
  envDraftBg = selectChessEnvDraftBackground(st);
  envDraftBoard = selectChessEnvDraftBoardTheme(st);
  envDraftLight = selectChessEnvDraftSceneLight(st);
  envModalOpen = selectChessEnvModalOpen(st);
}

/** Load localStorage → Redux → cache (initial + cloud/import reload). */
function hydrateChessEnvPrefsFromStorage(opts = {}) {
  wtdDispatch(
    hydrateChessEnv({
      background: loadBackgroundPrefs(),
      boardTheme: loadBoardThemePrefs(),
      sceneLight: loadSceneLightPrefs(),
      syncDrafts: !!opts.syncDrafts
    })
  );
  pullChessEnvFromStore();
}

function setCommittedBackground(prefs) {
  wtdDispatch(setChessEnvBackground(prefs));
  pullChessEnvFromStore();
  saveBackgroundPrefs(sceneBgPrefs);
}

function setCommittedBoardTheme(prefs) {
  wtdDispatch(setChessEnvBoardTheme(prefs));
  pullChessEnvFromStore();
  saveBoardThemePrefs(boardThemePrefs);
}

function setCommittedSceneLight(prefs) {
  wtdDispatch(setChessEnvSceneLight(prefs));
  pullChessEnvFromStore();
  saveSceneLightPrefs(sceneLightPrefs);
}

hydrateChessEnvPrefsFromStorage();

/** @type {Record<"squareLight"|"squareDark"|"pieceWhite"|"pieceBlack", import("three").Texture | null>} */
const boardThemeTextures = {
  squareLight: null,
  squareDark: null,
  pieceWhite: null,
  pieceBlack: null
};
let boardThemeTextureGen = 0;
/** @type {Record<"squareLight"|"squareDark"|"pieceWhite"|"pieceBlack", string | null>} */
const boardThemeTextureSourceUrls = {
  squareLight: null,
  squareDark: null,
  pieceWhite: null,
  pieceBlack: null
};
/** @type {"w" | "b"} */
let myColor = "w";
/** Snapshot before PvP lobby — SSoT in Redux `chessSession.inviteResumeState`; mirrored here after pull. */
let inviteResumeState = null;
let pvpPollTimer = null;
/** Token currently polled; avoids stacking intervals on repeated applyServerInvite. */
let pvpPollActiveToken = "";
let pvpPollInFlight = false;
/** Full init for host-on-opponent-link runs once per token (poll only refreshes FEN). */
let opponentTabBoundToken = "";
/** Dedupe concurrent joinInviteFromHash (openWtd + hashchange). */
let joinInviteInFlight = null;
/** Opponent URL opened by host (same Google account) — Black camera, no moves. */
let opponentViewOnly = false;
/**
 * Sticky dual-seat role for this tab. Hash `pvpSeat` can be stripped (clear pending → `#chess`);
 * without a lock, dual-seat GET defaults to host/White and Black tab loses piece selection.
 * @type {"host"|"guest"|null}
 */
let lockedPvpSeat = null;

/** Chess PvP SSoT — Redux `chessMultiplayer` (invite / revision / sending). */
function getPvpInvite() {
  return selectPvpInvite(wtdStore.getState());
}
function getLastSyncedRevision() {
  return selectLastSyncedRevision(wtdStore.getState());
}
function getPvpSendingMove() {
  return selectPvpSendingMove(wtdStore.getState());
}
function mirrorServerInvite(inv) {
  wtdDispatch(applyServerInviteSnapshot(inv));
}
function clearPvpMultiplayer() {
  wtdDispatch(clearChessMultiplayer());
}
function resetPvpSyncedRevision() {
  wtdDispatch(resetSyncedRevision());
}
function setSendingPvpMove(sending) {
  wtdDispatch(setPvpSendingMove(sending));
}

/** Sync module play-session cache from Redux `chessGame` + `chessSession`. */
function pullChessPlayFromStore() {
  const st = wtdStore.getState();
  const cg = selectChessGame(st);
  const cs = selectChessSessionSlice(st);
  playMode = cg.playMode;
  myColor = cg.myColor;
  selectedSquare = cg.selectedSquare;
  legalTargets = cg.legalTargets ? [...cg.legalTargets] : [];
  lastMoveFrom = cg.lastMoveFrom;
  lastMoveTo = cg.lastMoveTo;
  session = cs.session;
  curriculumFocusStrategyId = cs.curriculumFocusStrategyId;
  curriculumFocusRuleId = cs.curriculumFocusRuleId;
  practiceStepIndex = cs.practiceStepIndex;
  practiceDrill = cs.practiceDrillId ? getDrillById(cs.practiceDrillId) : null;
  inviteResumeState = cs.inviteResumeState;
}

/** Intro/mobile preview board can receive moves before Start — ensure Redux session exists. */
function ensureChessSessionForPlay() {
  if (session) return;
  wtdDispatch(ensureChessSession({ startedAt: performance.now() }));
  pullChessPlayFromStore();
}

function pullChessOrbitFromStore() {
  const o = selectChessOrbit(wtdStore.getState());
  orbitPolicy = { ...o };
}

function applyOrbitPolicyToControls() {
  if (!orbit) return;
  const p = orbitPolicy;
  orbit.enableDamping = p.enableDamping;
  orbit.dampingFactor = p.dampingFactor;
  orbit.enablePan = p.enablePan;
  orbit.minPolarAngle = p.minPolarAngle;
  orbit.maxPolarAngle = p.maxPolarAngle;
  orbit.minDistance = p.minDistance;
  orbit.maxDistance = p.maxDistance;
  orbit.rotateSpeed = p.rotateSpeed;
  orbit.zoomSpeed = p.zoomSpeed;
  orbit.enableRotate = true;
}

function syncStoreFenFromGame() {
  if (game) wtdDispatch(setChessFen(game.fen()));
}

function setPlayModeInStore(mode) {
  wtdDispatch(setChessPlayMode(mode));
  pullChessPlayFromStore();
}

function setMyColorInStore(color) {
  wtdDispatch(setChessMyColor(color));
  pullChessPlayFromStore();
}

function setCurriculumFocusInStore(strategyId, ruleId) {
  wtdDispatch(setChessCurriculumFocus({ strategyId, ruleId }));
  pullChessPlayFromStore();
}

function dispatchClearSelection() {
  wtdDispatch(clearChessSelection());
  pullChessPlayFromStore();
}

function dispatchRecordLastMove(from, to) {
  wtdDispatch(setChessLastMove({ from, to }));
  pullChessPlayFromStore();
}

function dispatchSelectPiece(square, targets) {
  wtdDispatch(setChessSelection({ square, legalTargets: targets }));
  pullChessPlayFromStore();
}

pullChessPlayFromStore();
pullChessOrbitFromStore();

let orbitPolicySubKey = "";
wtdStore.subscribe(() => {
  const o = selectChessOrbit(wtdStore.getState());
  const key = JSON.stringify(o);
  if (key === orbitPolicySubKey) return;
  orbitPolicySubKey = key;
  pullChessOrbitFromStore();
  applyOrbitPolicyToControls();
});
orbitPolicySubKey = JSON.stringify(selectChessOrbit(wtdStore.getState()));

let host = null;
let renderer = null;
let scene = null;
let camera = null;
let orbit = null;
let animId = null;
let raycaster = null;
let pointer = null;
let pmremGenerator = null;
let envMapTexture = null;
let keyLightTarget = null;
/** @type {THREE.AmbientLight | null} */
let ambientLight = null;
/** @type {THREE.HemisphereLight | null} */
let hemisphereLight = null;
/** @type {THREE.DirectionalLight | null} */
let keyDirectionalLight = null;
/** @type {THREE.DirectionalLight | null} */
let fillDirectionalLight = null;
/** @type {THREE.Mesh | null} */
let envSphereMesh = null;
/** @type {ResizeObserver | null} */
let hostResizeObserver = null;

/** @type {Map<string, THREE.Mesh>} */
const tilesBySquare = new Map();
/** @type {Map<string, THREE.Group>} */
const piecesBySquare = new Map();
/** @type {THREE.Mesh[]} */
const targetRingMeshes = [];

let boundResize = null;
let boundPointerDown = null;
let boundPointerMove = null;
let boundPointerUp = null;
/** @type {{ x: number, y: number } | null} */
let pointerAnchor = null;
let clock = null;
/** @type {THREE.Plane | null} */
let dragPlane = null;

const DRAG_THRESHOLD_PX = 6;
const DRAG_LIFT_MAX = 0.38;
/** Vertical rise while piece is selected (before / during drag). */
const PICK_LIFT_MAX = 0.38;
const PIECE_GRAVITY_STIFF = 48;
const PIECE_ROTATION_SETTLE = 28;
/** Head follows pointer quickly; base lags — top leads, bottom trails. */
const DRAG_HEAD_STIFF = 32;
const DRAG_BASE_STIFF = 12;
const DRAG_TILT_GAIN = 0.62;
const DRAG_TILT_DAMP = 20;
const DRAG_LIFT_STIFF = 22;
const PICK_LIFT_STIFF = 26;

/** @type {{ from: string, group: THREE.Group, target: THREE.Vector3, head: THREE.Vector3, base: THREE.Vector3, tiltX: number, tiltZ: number, lift: number, pointerId: number } | null} */
let activeDrag = null;
/** @type {{ from: string, pointerId: number, x: number, y: number } | null} */
let dragPointerDown = null;
/** Square whose piece is rising after pointer-down (pre-threshold pick). */
let pickLiftSquare = null;
let pickLift = 0;

const sharedMats = {
  white: null,
  black: null,
  whiteAccent: null,
  blackAccent: null
};

function $(id) {
  return document.getElementById(id);
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isSignedIn() {
  return !!(
    window.AppgenAuth &&
    typeof window.AppgenAuth.isSignedIn === "function" &&
    window.AppgenAuth.isSignedIn()
  );
}

function stopPvpPoll() {
  if (pvpPollTimer) {
    clearInterval(pvpPollTimer);
    pvpPollTimer = null;
  }
  pvpPollActiveToken = "";
  pvpPollInFlight = false;
}

function startPvpPoll(token) {
  const t = sanitizeChessInviteToken(token);
  if (!t) return;
  if (pvpPollTimer && pvpPollActiveToken === t) return;
  stopPvpPoll();
  pvpPollActiveToken = t;
  const tick = () => {
    if (pvpPollInFlight) return;
    pvpPollInFlight = true;
    pollInviteState(t)
      .catch(() => {})
      .finally(() => {
        pvpPollInFlight = false;
      });
  };
  tick();
  pvpPollTimer = window.setInterval(tick, PVP_POLL_MS);
}

function sanitizeChessInviteToken(raw) {
  const t = String(raw || "").trim();
  return CHESS_INVITE_TOKEN_RE.test(t) ? t : null;
}

const CHESS_OPPONENT_LINK_QUERY = "pvpSeat=guest&joinRole=opponent";
const CHESS_HOST_LINK_QUERY = "pvpSeat=host";

/** Full page URL for sharing or `window.open`. */
function chessInviteAbsoluteUrl(inv, extraQuery) {
  const token = sanitizeChessInviteToken(inv && inv.token);
  if (!token) return "";
  const path = location.pathname || "/";
  let q = "chessInvite=" + encodeURIComponent(token);
  if (extraQuery) q += "&" + String(extraQuery).replace(/^&/, "");
  return location.origin.replace(/\/$/, "") + path + "#chess?" + q;
}

function chessOpponentInviteUrl(inv) {
  const fromServer = inv && inv.url && String(inv.url).includes("pvpSeat=guest");
  if (fromServer) return inv.url;
  return chessInviteAbsoluteUrl(inv, CHESS_OPPONENT_LINK_QUERY);
}

function chessHostInviteUrl(inv) {
  return chessInviteAbsoluteUrl(inv, CHESS_HOST_LINK_QUERY);
}

function chessHashParams() {
  const raw = (location.hash || "").replace(/^#/, "");
  const q = raw.indexOf("?");
  return new URLSearchParams(q >= 0 ? raw.slice(q + 1) : "");
}

function isHostInviteWindow() {
  return chessHashParams().get("pvpSeat") === "host";
}

/** True when URL is the share link for the friend (Black). Bare `chessInvite=` counts too. */
function isOpponentInviteWindow() {
  const params = chessHashParams();
  if (params.get("pvpSeat") === "host") return false;
  if (params.get("pvpSeat") === "guest" || params.get("joinRole") === "opponent") return true;
  return params.has("chessInvite");
}

/** @param {"host"|"guest"|null|undefined} seat */
function lockPvpSeat(seat) {
  if (seat !== "guest" && seat !== "host") return;
  lockedPvpSeat = seat;
  try {
    sessionStorage.setItem(PVP_SEAT_LOCK_KEY, seat);
  } catch (_) {
    /* ignore */
  }
}

function clearLockedPvpSeat() {
  lockedPvpSeat = null;
  try {
    sessionStorage.removeItem(PVP_SEAT_LOCK_KEY);
  } catch (_) {
    /* ignore */
  }
}

function readStoredPvpSeat() {
  try {
    const s = sessionStorage.getItem(PVP_SEAT_LOCK_KEY);
    if (s === "guest" || s === "host") return s;
  } catch (_) {
    /* ignore */
  }
  return null;
}

/**
 * Seat for API role resolution (dual-seat: same Google account can be host White + guest Black).
 * Prefer sticky lock, then hash `pvpSeat`, then live invite role.
 * @returns {"host"|"guest"|null}
 */
function chessClientSeat() {
  if (lockedPvpSeat === "guest" || lockedPvpSeat === "host") return lockedPvpSeat;
  const stored = readStoredPvpSeat();
  if (stored) {
    lockedPvpSeat = stored;
    return stored;
  }
  if (isOpponentInviteWindow()) return "guest";
  if (isHostInviteWindow()) return "host";
  const inv = getPvpInvite();
  if (inv && inv.role === "guest") return "guest";
  if (inv && inv.role === "host") return "host";
  if (inv && inv.myColor === "b") return "guest";
  if (inv && inv.myColor === "w") return "host";
  return null;
}

/** Color this tab must play — seat lock wins over a mismatched invite snapshot. */
function colorForClientSeat() {
  const seat = chessClientSeat();
  if (seat === "guest") return "b";
  if (seat === "host") return "w";
  return null;
}

/** @param {object} [inv] defaults to live lobby invite */
function openOpponentInviteWindow(inv) {
  const lobby = inv && inv.token ? inv : getPvpInvite();
  if (!lobby || !lobby.token) {
    setCoach("Create an invite first, then use the link in a new window for your opponent.");
    return null;
  }
  const url = chessOpponentInviteUrl(lobby);
  const winName = "wtdChessOpponent_" + lobby.token;
  const popup = window.open(url, winName, "noopener,noreferrer");
  if (!popup) {
    setCoach("Pop-up blocked — allow pop-ups for this site, or copy the invite link instead.");
    void copyInviteLink();
    return null;
  }
  try {
    popup.opener = null;
  } catch (_) {
    /* ignore */
  }
  startPvpPoll(lobby.token);
  setCoach(
    "Black seat opened in a new window — same Google account can play both sides for testing. This tab stays White; both sync the same lobby."
  );
  return popup;
}

function clearChessInvitePending() {
  try {
    sessionStorage.removeItem(PENDING_INVITE_KEY);
  } catch (_) {
    /* ignore */
  }
  // Keep pvpSeat in the hash so dual-seat polls still resolve guest/host after token strip.
  const seat =
    lockedPvpSeat ||
    (isOpponentInviteWindow() ? "guest" : isHostInviteWindow() ? "host" : null);
  const nextHash = seat ? "#chess?pvpSeat=" + seat : "#chess";
  try {
    if ((location.hash || "").includes("chessInvite=")) {
      history.replaceState(null, "", nextHash);
    }
  } catch (_) {
    if ((location.hash || "").includes("chessInvite=")) location.hash = nextHash.slice(1);
  }
}

function closeChessSessionModal() {
  if (window.AppgenWtdSessionModal && typeof window.AppgenWtdSessionModal.close === "function") {
    window.AppgenWtdSessionModal.close(true);
  }
}

function attachChessBaseRevision(body) {
  if (!body || typeof body !== "object") return body;
  const action = String(body.action || "").toLowerCase();
  if (action === "create") return body;
  const invite = getPvpInvite();
  const lastRev = getLastSyncedRevision();
  const rev =
    invite && typeof invite.revision === "number"
      ? invite.revision
      : lastRev >= 0
        ? lastRev
        : null;
  if (rev == null) return body;
  return { ...body, baseRevision: rev };
}

/**
 * @param {string} method
 * @param {object} [body]
 * @param {string} [token]
 * @param {{ skipApply?: boolean, pvpSeat?: string }} [opts]
 */
async function chessInviteFetch(method, body, token, opts) {
  const seat =
    (opts && opts.pvpSeat) ||
    (body && (body.pvpSeat || body.seat)) ||
    chessClientSeat();
  let url = CHESS_INVITE_API;
  if (method === "GET" && token) {
    url =
      CHESS_INVITE_API +
      "?token=" +
      encodeURIComponent(token) +
      (seat ? "&pvpSeat=" + encodeURIComponent(seat) : "");
  }
  let payload = method === "POST" ? attachChessBaseRevision(body || {}) : undefined;
  if (method === "POST" && payload && seat && !payload.pvpSeat) {
    payload = { ...payload, pvpSeat: seat };
  }
  const res = await fetch(url, {
    method,
    credentials: "same-origin",
    headers: method === "POST" ? { "Content-Type": "application/json" } : undefined,
    body: method === "POST" ? JSON.stringify(payload) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok && !data.error) data.error = "Request failed";
  if (data.invite && !(opts && opts.skipApply)) applyServerInvite(data.invite);
  return { res, data };
}

function clearActiveChessInviteSession(message) {
  stopPvpPoll();
  opponentTabBoundToken = "";
  joinInviteInFlight = null;
  clearLockedPvpSeat();
  clearChessInvitePending();
  closeChessSessionModal();
  clearPvpMultiplayer();
  showIntro();
  setCoach(message || "Invite closed.");
}

function stopForAdminKill(message) {
  clearActiveChessInviteSession(message || "Invite lobbies were cancelled by admin.");
}

function bindAdminKillListener() {
  if (typeof window === "undefined" || window.__appgenChessKillBound) return;
  window.__appgenChessKillBound = true;
  window.addEventListener("appgen:wtd-invites-killed", (ev) => {
    const detail = (ev && ev.detail) || {};
    stopForAdminKill(detail.message || "Invite lobbies were cancelled by admin.");
  });
}
bindAdminKillListener();

async function pollInviteState(token) {
  const { res, data } = await chessInviteFetch("GET", null, token, { skipApply: true });
  if (!data.ok || !data.invite) {
    if (res && (res.status === 404 || res.status === 410)) {
      clearActiveChessInviteSession("That invite is no longer active.");
    }
    return data;
  }
  if (data.invite.status === "cancelled") {
    clearActiveChessInviteSession("This game was cancelled.");
    return data;
  }
  applyServerInvite(data.invite);
  return data;
}

function humanPlayColor() {
  if (playMode === "pvp" || playMode === "pvp-waiting") {
    return colorForClientSeat() || (myColor === "b" ? "b" : "w");
  }
  return "w";
}

function findKingSquare(color) {
  if (!game) return null;
  const board = game.board();
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const p = board[r][f];
      if (p && p.type === "k" && p.color === color) {
        return String.fromCharCode(97 + f) + (8 - r);
      }
    }
  }
  return null;
}

function worldPosForHumanKing() {
  const color = humanPlayColor();
  const sq = findKingSquare(color);
  if (!sq) return null;
  const mesh = piecesBySquare.get(sq);
  if (mesh) {
    return { x: mesh.position.x, y: PIECE_CAM_TARGET_Y, z: mesh.position.z };
  }
  const p = squareToWorld(sq, PIECE_CAM_TARGET_Y);
  return { x: p.x, y: p.y, z: p.z };
}

/** Board-centered pivot; optional endgame drift toward the human king (not back-rank anchored). */
function resolveOrbitTargetPoint() {
  const center = CAM_ORBIT_TARGET;
  if (!orbitPolicy.followHumanKing || !game) {
    return { x: center.x, y: center.y, z: center.z };
  }
  const w = worldPosForHumanKing();
  if (!w) return { x: center.x, y: center.y, z: center.z };
  const dist = Math.hypot(w.x - center.x, w.z - center.z);
  if (dist < ORBIT_KING_FOLLOW_START) {
    return { x: center.x, y: center.y, z: center.z };
  }
  const span = CELL * 3;
  const blend = Math.min(1, (dist - ORBIT_KING_FOLLOW_START) / Math.max(span, 0.001));
  return {
    x: center.x + (w.x - center.x) * blend,
    y: center.y,
    z: center.z + (w.z - center.z) * blend
  };
}

function syncCameraOrbitOnHumanKing(dt) {
  if (!camera || !orbit || !game) return;
  if (chessOrbitFree.isManualExplore()) return;
  if (activeDrag || pickLiftSquare) return;
  const p = resolveOrbitTargetPoint();
  pieceCameraTarget.set(p.x, p.y, p.z);
  const t = Math.min(1, dt * orbitPolicy.kingTargetLerp);
  orbit.target.lerp(pieceCameraTarget, t);
}

function resetCameraForPlayerView(color) {
  if (!camera || !orbit) return;
  chessOrbitFree.clearManualOrbitExplore();
  const pos = color === "b" ? CAM_BLACK_POS : CAM_WHITE_POS;
  const p = resolveOrbitTargetPoint();
  camera.position.set(pos.x, pos.y, pos.z);
  orbit.target.set(p.x, p.y, p.z);
  orbit.update();
}

/** Nudge projection on mobile so the board sits between top nav and bottom dock. */
function applyMobileCameraFrameBias(w, h) {
  if (!camera) return;
  if (!isMobileChessLab()) {
    if (camera.view?.enabled) camera.clearViewOffset();
    return;
  }
  const dockH = controlsEl ? Math.round(controlsEl.getBoundingClientRect().height) : 0;
  const topBar = document.querySelector("#wtdView.wtd-mobile-chess-lab > .appgen-top-bar");
  const topH = topBar ? Math.round(topBar.getBoundingClientRect().height) : 0;
  const shift = Math.round((dockH - topH) * 0.22);
  if (shift > 2) {
    camera.setViewOffset(w, h, 0, shift, w, h);
  } else if (camera.view?.enabled) {
    camera.clearViewOffset();
  }
}

function syncLastMoveFromInvite(inv) {
  const moves = Array.isArray(inv.moves) ? inv.moves : [];
  const last = moves[moves.length - 1];
  if (last && last.from && last.to) {
    recordLastMove(last.from, last.to);
  }
}

function syncBoardFromInvite(inv) {
  if (!inv) return;
  const rev = typeof inv.revision === "number" ? inv.revision : inv.moves?.length || 0;
  const lastRev = getLastSyncedRevision();
  if (lastRev >= 0 && rev < lastRev) return;
  mirrorServerInvite(inv);
  // Seat lock / hash wins: dual-seat same-rev polls without pvpSeat default to host (White).
  const seatColor = colorForClientSeat();
  const color =
    seatColor || (inv.myColor === "b" ? "b" : inv.myColor === "w" ? "w" : "w");
  setMyColorInStore(color);
  if (!game) game = new Chess();
  try {
    game.load(inv.fen || undefined);
  } catch (_) {
    game = new Chess();
  }
  syncStoreFenFromGame();
  syncLastMoveFromInvite(inv);
  wtdDispatch(ensureChessSession({ startedAt: performance.now() }));
  pullChessPlayFromStore();
  dispatchClearSelection();
  refreshHint();
  renderBoard();
  resetCameraForPlayerView(myColor);
  if (inv.gameOver && !session.finished) {
    finishPvpGame(inv);
  }
}

function renderOpponentLinkTabHud(inv) {
  const hostName = inv.host && inv.host.name ? escapeHtml(inv.host.name) : "White";
  const guestLine =
    inv.status === "waiting"
      ? "Waiting for someone to join as Black on this link."
      : inv.guest
        ? escapeHtml(inv.guest.name) + " is Black — board synced."
        : "Game in progress — board synced from White.";
  const previewNote =
    inv.status === "waiting" || !inv.guest
      ? '<p class="wtd-3d-metric wtd-chess-opponent-link-note">Share this link with your friend. They open it and sign in with Google on their device to play the black pieces.</p>'
      : '<p class="wtd-3d-metric wtd-chess-opponent-link-note">Host preview — you are watching the Black-side camera. Moves are synced from your White tab.</p>';
  setHud(
    "<h3>Chess · Black-side view</h3>" +
      '<p class="wtd-3d-metric">You are viewing from <strong>Black</strong>. Host: <strong>' +
      hostName +
      "</strong> (White).</p>" +
      '<p class="wtd-3d-metric">' +
      guestLine +
      "</p>" +
      previewNote
  );
}

/**
 * Legacy preview-only Black camera (should be rare after dual-seat join).
 * Prefer join as guest — same account is allowed and playable.
 */
function enterOpponentTabView(inv, token) {
  if (!inv || !inv.token) return;
  // Dual-seat / guest seat must play Black — never stick in preview-only.
  if (
    inv.role === "guest" ||
    inv.myColor === "b" ||
    inv.dualSeat ||
    chessClientSeat() === "guest"
  ) {
    lockPvpSeat("guest");
    opponentViewOnly = false;
    opponentTabBoundToken = "";
    beginPvpInviteSession(inv, token || inv.token, { joinedAsGuest: true });
    return;
  }
  const t = sanitizeChessInviteToken(token || inv.token);
  mirrorServerInvite(inv);
  if (t && opponentTabBoundToken === t && opponentViewOnly) {
    refreshOpponentTabFromInvite(inv);
    return;
  }
  opponentTabBoundToken = t || "";
  opponentViewOnly = true;
  wtdDispatch(setChessMyColor("b"));
  pullChessPlayFromStore();
  setPlayModeInStore(inv.status === "active" || inv.status === "finished" ? "pvp" : "pvp-waiting");
  useCloudCoach = true;
  openSessionModal();
  playEl = $("wtdChessPlay");
  hudEl = $("wtdChessHud");
  controlsEl = $("wtdChessControls");
  if (playEl) playEl.hidden = false;
  if (!game) game = new Chess();
  try {
    game.load(inv.fen || undefined);
  } catch (_) {
    game = new Chess();
  }
  syncStoreFenFromGame();
  wtdDispatch(ensureChessSession({ startedAt: performance.now() }));
  pullChessPlayFromStore();
  renderOpponentLinkTabHud(inv);
  setControls(boardEnvButtonHtml() + coachPanelToggleButtonHtml());
  bindControls();
  ensureEngine();
  renderBoard();
  resetCameraForPlayerView("b");
  if (t) startPvpPoll(t);
  syncMobileChessLabChrome();
  notifyChessLayoutResize();
  setCoach(
    "Preview only — re-open the opponent link to join as playable Black (same account is OK for testing)."
  );
}

function refreshOpponentTabFromInvite(inv) {
  if (!inv || !game) return;
  try {
    game.load(inv.fen || undefined);
  } catch (_) {
    /* keep prior position */
  }
  syncStoreFenFromGame();
  renderOpponentLinkTabHud(inv);
  renderBoard();
  resetCameraForPlayerView("b");
}

function renderHostWaiting(inv) {
  opponentViewOnly = false;
  setPlayModeInStore("pvp-waiting");
  const url = chessOpponentInviteUrl(inv);
  setHud(
    "<h3>Chess lobby · waiting for opponent</h3>" +
      '<p class="wtd-3d-metric"><strong>You = White (host)</strong> in this tab. Open the link below as <strong>Black</strong> (friend’s Google account, or the same account in a second window for dual-seat testing).</p>' +
      '<p class="wtd-3d-metric">Guest: <span id="wtdChessGuestStatus">' +
      (inv.guest ? escapeHtml(inv.guest.name) + " joined" : "—") +
      "</span></p>"
  );
  setControls(
    '<label class="wtd-chess-invite-url">Opponent link (Black)<input type="text" readonly id="wtdChessInviteUrl" value="' +
      escapeHtml(url) +
      '"></label>' +
      '<button type="button" class="btn" id="wtdChessOpenInviteLink">Use link (new window)</button>' +
      '<button type="button" class="btn ghost" id="wtdChessCopyInvite">Copy invite link</button>' +
      '<button type="button" class="btn ghost" id="wtdChessCancelInvite">Cancel invite</button>'
  );
  setCoach(
    "Use link opens a playable Black seat (same Google account is fine for testing). Wait for Black to join before moving — then both tabs sync the same FEN."
  );
}

function renderPvpControls(inv) {
  const opp =
    inv.role === "host"
      ? inv.guest && inv.guest.name
        ? inv.guest.name
        : "Guest"
      : inv.host && inv.host.name
        ? inv.host.name
        : "Host";
  setHud(
    "<h3>Chess · you vs " +
      escapeHtml(opp) +
      "</h3>" +
      '<p class="wtd-3d-metric">You are <strong>' +
      (myColor === "w" ? "White" : "Black") +
      '</strong> · Turn: <span id="wtdChessTurn">…</span> · State: <span id="wtdChessState">In play</span> · Time: <span id="wtdChessTimer">0.0s</span></p>' +
      '<p class="wtd-3d-metric">Drag to orbit · drag a piece to move (or click piece, then square).</p>'
  );
  const hostLinkBtn =
    inv.role === "host"
      ? '<button type="button" class="btn ghost" id="wtdChessOpenInviteLink" title="Open opponent view in a new window">Use link</button>'
      : "";
  setControls(
    hostLinkBtn +
      boardEnvButtonHtml() +
      askCoachButtonHtml("Coach tip") +
      resignButtonHtml() +
      coachPanelToggleButtonHtml()
  );
  bindControls();
}

function applyServerInvite(inv) {
  if (!inv || !inv.token) return;
  if (inv.status === "cancelled") {
    clearActiveChessInviteSession("This game was cancelled.");
    return;
  }
  const prevRev = getLastSyncedRevision();
  const rev = typeof inv.revision === "number" ? inv.revision : inv.moves?.length || 0;
  const sameRev = prevRev >= 0 && rev === prevRev;
  const seat = chessClientSeat();
  const opponentTab = isOpponentInviteWindow() || seat === "guest";

  // Heal sticky seat from a correct server payload (dual-seat tabs).
  if (inv.role === "guest" || inv.myColor === "b") lockPvpSeat("guest");
  else if (inv.role === "host" || inv.myColor === "w") {
    if (seat === "host" || isHostInviteWindow()) lockPvpSeat("host");
  }

  if (opponentTab || seat === "guest") {
    lockPvpSeat("guest");
    opponentViewOnly = false;
  }

  // Dual-seat: host-shaped payload on the Black tab — still playable; re-GET as guest to heal role.
  if (opponentTab && inv.role === "host" && inv.dualSeat) {
    opponentViewOnly = false;
    lockPvpSeat("guest");
    if (!sameRev || playMode !== "pvp" || myColor !== "b") {
      setPlayModeInStore("pvp");
      useCloudCoach = true;
      openSessionModal();
      playEl = $("wtdChessPlay");
      hudEl = $("wtdChessHud");
      controlsEl = $("wtdChessControls");
      if (prevRev < 0 || inv.revision !== prevRev) renderPvpControls({ ...inv, role: "guest", myColor: "b" });
      syncBoardFromInvite(inv);
      resetCameraForPlayerView("b");
    } else {
      syncBoardFromInvite(inv);
    }
    startPvpPoll(inv.token);
    void chessInviteFetch("GET", null, inv.token, { pvpSeat: "guest" });
    return;
  }

  if (opponentTab && inv.role === "host" && !inv.dualSeat) {
    // Opponent URL but server still sees host only (join not applied) — preview fallback.
    enterOpponentTabView(inv, inv.token);
    return;
  }

  // Same-revision host lobby: keep poll alive, do not re-paint HUD / thrash board.
  if (sameRev && inv.status === "waiting" && inv.role === "host" && seat !== "guest") {
    startPvpPoll(inv.token);
    return;
  }

  mirrorServerInvite(inv);
  if (inv.status === "waiting" && inv.role === "host" && seat !== "guest") {
    lockPvpSeat("host");
    renderHostWaiting(inv);
    startPvpPoll(inv.token);
    playEl = $("wtdChessPlay");
    hudEl = $("wtdChessHud");
    controlsEl = $("wtdChessControls");
    if (playEl) {
      playEl.hidden = false;
      playEl.removeAttribute("hidden");
    }
    if (!game) game = new Chess();
    try {
      game.load(inv.fen || undefined);
    } catch (_) {
      game = new Chess();
    }
    syncStoreFenFromGame();
    ensureEngine();
    renderBoard();
    resetCameraForWhiteView();
    return;
  }
  if (inv.pvp || inv.status === "active" || inv.status === "finished") {
    opponentViewOnly = false;
    setPlayModeInStore("pvp");
    useCloudCoach = true;
    openSessionModal();
    playEl = $("wtdChessPlay");
    hudEl = $("wtdChessHud");
    controlsEl = $("wtdChessControls");
    const hudInv =
      seat === "guest" || inv.myColor === "b"
        ? { ...inv, role: "guest", myColor: "b" }
        : seat === "host"
          ? { ...inv, role: "host", myColor: "w" }
          : inv;
    if (prevRev < 0 || inv.revision !== prevRev) {
      renderPvpControls(hudInv);
    }
    syncBoardFromInvite(inv);
    const viewColor = colorForClientSeat() || (inv.myColor === "b" ? "b" : "w");
    resetCameraForPlayerView(viewColor);
    const guestEl = $("wtdChessGuestStatus");
    if (guestEl && inv.guest) guestEl.textContent = inv.guest.name + " joined";
  }
}

function captureInviteResumeState() {
  wtdDispatch(
    setInviteResumeState({
      playMode,
      fen: game ? game.fen() : null,
      session: session
        ? {
            startedAt: session.startedAt,
            humanMoves: session.humanMoves,
            aiMoves: session.aiMoves,
            finished: session.finished,
            resigned: session.resigned,
            practice: session.practice,
            lessonWhitePly: session.lessonWhitePly
          }
        : null,
      curriculumFocusStrategyId,
      curriculumFocusRuleId,
      myColor,
      lastMoveFrom,
      lastMoveTo,
      modalOpen: Boolean(window.AppgenWtdSessionModal?.isOpen?.()),
      practiceDrillId: practiceDrill?.id ?? null,
      practiceStepIndex,
      hadSession: Boolean(session && !session.finished)
    })
  );
  pullChessPlayFromStore();
}

function restoreInviteResumeState() {
  const snap = selectInviteResumeState(wtdStore.getState());
  wtdDispatch(clearInviteResumeState());
  clearPvpMultiplayer();
  setPlayModeInStore("ai");

  if (!snap) {
    pullChessPlayFromStore();
    showIntro();
    return;
  }

  wtdDispatch(
    setChessCurriculumFocus({
      strategyId: snap.curriculumFocusStrategyId ?? null,
      ruleId: snap.curriculumFocusRuleId ?? null
    })
  );
  wtdDispatch(setChessMyColor(snap.myColor || "w"));
  wtdDispatch(
    setChessLastMove({ from: snap.lastMoveFrom ?? null, to: snap.lastMoveTo ?? null })
  );
  wtdDispatch(
    setChessPractice({
      drillId: snap.practiceDrillId ?? null,
      stepIndex: snap.practiceStepIndex || 0
    })
  );
  wtdDispatch(setChessSession(snap.session ?? null));
  pullChessPlayFromStore();

  if (snap.fen) {
    const loaded = tryLoadGameFromFen(snap.fen);
    game = loaded || new Chess();
    syncStoreFenFromGame();
  } else if (!game) {
    game = new Chess();
    syncStoreFenFromGame();
  }

  const resumeMode =
    snap.playMode === "practice" && practiceDrill
      ? "practice"
      : snap.hadSession || snap.modalOpen
        ? "ai"
        : "intro";

  if (resumeMode === "intro") {
    showIntro();
    setCoach("Invite closed — pick a lesson or start a game when you are ready.");
    return;
  }

  setPlayModeInStore(resumeMode);
  openSessionModal();
  playEl = $("wtdChessPlay");
  hudEl = $("wtdChessHud");
  controlsEl = $("wtdChessControls");
  const panel101 = $("wtdChess101Panel");
  if (panel101) panel101.hidden = true;

  if (playMode === "practice" && practiceDrill) {
    setHud(
      "<h3>Chess 101 · " +
        escapeHtml(practiceDrill.title) +
        "</h3>" +
        '<p class="wtd-3d-metric">' +
        escapeHtml(practiceDrill.blurb) +
        '</p><p class="wtd-3d-metric">Turn: <span id="wtdChessTurn">…</span> · State: <span id="wtdChessState">Practice</span> · Time: <span id="wtdChessTimer">0.0s</span></p>'
    );
    setControls(practiceControlsHtml());
  } else {
    setHud(
      '<h3>Chess tutor · you vs coach</h3>' +
        '<p class="wtd-3d-metric">Turn: <span id="wtdChessTurn">Your turn (White)</span> · ' +
        'State: <span id="wtdChessState">In play</span> · ' +
        'Time: <span id="wtdChessTimer">0.0s</span></p>' +
        '<p class="wtd-3d-metric">Drag empty space to orbit around your king (zoom &amp; swivel) · drag a piece to move (or click piece, then square).</p>'
    );
    setControls(coachSessionControlsHtml());
  }
  bindControls();
  renderLessonList();
  updateStatusBar();
  renderBoard();
  resetCameraForPlayerView(myColor);
  setCoach("Invite closed — your game is still here.");
}

async function createInviteLobby() {
  if (!isSignedIn()) {
    setCoach("Sign in with Google to invite a friend.");
    return;
  }
  captureInviteResumeState();
  stopPvpPoll();
  lockPvpSeat("host");
  setPlayModeInStore("pvp-waiting");
  resetPvpSyncedRevision();
  openSessionModal();
  playEl = $("wtdChessPlay");
  hudEl = $("wtdChessHud");
  controlsEl = $("wtdChessControls");
  // Keep the current board/session — cancel restores it; joining a friend starts a fresh PvP fen.
  setCoach("Creating invite…");
  const { res, data } = await chessInviteFetch("POST", { action: "create" });
  if (!res.ok || !data.ok) {
    clearLockedPvpSeat();
    restoreInviteResumeState();
    setCoach(data.error || "Could not create invite.");
    return;
  }
  try {
    sessionStorage.setItem(PENDING_INVITE_KEY, data.token);
  } catch (_) {
    /* ignore */
  }
  applyServerInvite(data.invite);
  startPvpPoll(data.token);
  const hostHash =
    "#chess?chessInvite=" + encodeURIComponent(data.token) + "&" + CHESS_HOST_LINK_QUERY;
  try {
    history.replaceState(null, "", hostHash);
  } catch (_) {
    location.hash = hostHash.slice(1);
  }
}

/**
 * Invite URL in the address bar = join as guest (Black / opponent).
 * Seat comes from `pvpSeat` (tab/hash); same Google account may hold both seats.
 * @param {string} token
 */
function beginPvpInviteSession(inv, token, { joinedAsGuest = false } = {}) {
  opponentViewOnly = false;
  opponentTabBoundToken = "";
  if (joinedAsGuest || inv.role === "guest" || inv.myColor === "b" || chessClientSeat() === "guest") {
    lockPvpSeat("guest");
  } else if (inv.role === "host" || inv.myColor === "w") {
    lockPvpSeat("host");
  }
  openSessionModal();
  playEl = $("wtdChessPlay");
  hudEl = $("wtdChessHud");
  controlsEl = $("wtdChessControls");
  setPlayModeInStore("pvp");
  useCloudCoach = true;
  resetPvpSyncedRevision();
  applyServerInvite(inv);
  startPvpPoll(token);
  const viewColor = colorForClientSeat() || (inv.myColor === "b" ? "b" : "w");
  if (viewColor === "b") {
    ensureEngine();
    resetCameraForPlayerView("b");
  }
  if (joinedAsGuest || viewColor === "b") {
    const hostName = inv.host && inv.host.name ? inv.host.name : "White";
    const dual =
      inv.dualSeat || (inv.guest && inv.guest.dualSeat)
        ? " Dual-seat: this tab is Black; your other tab is White."
        : "";
    setCoach("You're Black — opponent to " + hostName + ". You move the black pieces." + dual);
  }
}

async function openHostInviteLobby(token) {
  const t = sanitizeChessInviteToken(token);
  if (!t || !isSignedIn()) return false;
  lockPvpSeat("host");
  setCoach("Loading your lobby as White (host)…");
  const inv = await syncInviteFromServer(t);
  if (!inv || inv.role !== "host") return false;
  setPlayModeInStore("pvp-waiting");
  openSessionModal();
  playEl = $("wtdChessPlay");
  hudEl = $("wtdChessHud");
  controlsEl = $("wtdChessControls");
  applyServerInvite(inv);
  startPvpPoll(t);
  return true;
}

async function syncInviteFromServer(token) {
  const { data } = await chessInviteFetch("GET", null, token);
  return data.ok && data.invite ? data.invite : null;
}

/** Ensure chess lab is visible without re-dispatching setWtdMode (same-mode bumps seq → onClose/init thrash). */
function ensureChessLabVisible() {
  const api = window.AppgenWtdStore;
  if (api && api.store && api.selectors && typeof api.selectors.selectWtdMode === "function") {
    try {
      if (api.selectors.selectWtdMode(api.store.getState()) === "chess") return;
    } catch (_) {
      /* fall through */
    }
  }
  const panel = $("wtdPanelChess");
  if (panel && !panel.hidden) return;
  if (window.AppgenWtd && typeof window.AppgenWtd.setWtdMode === "function") {
    window.AppgenWtd.setWtdMode("chess");
  }
}

async function joinInviteFromHash(token) {
  const t = sanitizeChessInviteToken(token);
  if (!t) {
    clearChessInvitePending();
    return;
  }
  if (joinInviteInFlight === t) return;
  joinInviteInFlight = t;
  try {
    try {
      sessionStorage.setItem(PENDING_INVITE_KEY, t);
    } catch (_) {
      /* ignore */
    }
    ensureChessLabVisible();
    if (isHostInviteWindow()) {
      lockPvpSeat("host");
      if (!isSignedIn()) {
        setCoach("Sign in with Google to open your chess lobby as White (host).");
        showIntro();
        return;
      }
      if (await openHostInviteLobby(t)) return;
    }

    if (!isSignedIn()) {
      setCoach(
        "Sign in with Google to join this game as Black (opponent) — you will play the black pieces."
      );
      showIntro();
      return;
    }

    if (!isOpponentInviteWindow()) {
      setCoach("Use the opponent link from your friend to join as Black.");
      showIntro();
      return;
    }

    // Lock before any GET/POST so dual-seat polls never default this tab to White.
    lockPvpSeat("guest");
    opponentViewOnly = false;
    setCoach("Joining as Black (opponent)…");
    const { res, data } = await chessInviteFetch(
      "POST",
      { action: "join", token: t, pvpSeat: "guest" },
      null,
      { skipApply: true, pvpSeat: "guest" }
    );

    if (res.ok && data.ok && data.invite) {
      if (data.invite.myColor === "b" || data.invite.role === "guest") {
        beginPvpInviteSession(data.invite, t, { joinedAsGuest: true });
        return;
      }
      // Unexpected host payload on opponent URL — retry GET as guest seat.
      const asGuest = await chessInviteFetch("GET", null, t, {
        skipApply: true,
        pvpSeat: "guest"
      });
      if (
        asGuest.data &&
        asGuest.data.ok &&
        asGuest.data.invite &&
        (asGuest.data.invite.myColor === "b" || asGuest.data.invite.role === "guest")
      ) {
        beginPvpInviteSession(asGuest.data.invite, t, { joinedAsGuest: true });
        return;
      }
      setCoach("This link is for the opponent (Black).");
      return;
    }

    const code = String(data.code || "");
    if (code === "full") {
      // Already seated as guest (or someone else took Black) — sync as guest seat.
      const { data: syncData } = await chessInviteFetch("GET", null, t, {
        skipApply: true,
        pvpSeat: "guest"
      });
      const inv = syncData && syncData.ok ? syncData.invite : null;
      if (inv && (inv.role === "guest" || inv.myColor === "b")) {
        beginPvpInviteSession(inv, t, { joinedAsGuest: true });
        return;
      }
      if (inv && inv.role === "host" && !inv.dualSeat) {
        setCoach("This game already has a different guest. Create a new invite to dual-seat test.");
        clearChessInvitePending();
        closeChessSessionModal();
        showIntro();
        return;
      }
    }

    clearChessInvitePending();
    closeChessSessionModal();
    showIntro();
    setCoach(data.error || "That invite link is no longer valid — start a fresh game.");
  } finally {
    if (joinInviteInFlight === t) joinInviteInFlight = null;
  }
}

async function submitPvpMove(from, to, promotion) {
  const invite = getPvpInvite();
  if (!invite || !invite.token) return;
  setSendingPvpMove(true);
  try {
    const { res, data } = await chessInviteFetch("POST", {
      action: "move",
      token: invite.token,
      from,
      to,
      promotion
    });
    if (data.ok && data.invite) {
      wtdDispatch(incrementChessHumanMoves());
      pullChessPlayFromStore();
      applyServerInvite(data.invite);
      if (data.move) {
        setCoach("Played " + data.move.san + " — good luck!");
      }
    } else {
      await pollInviteState(invite.token);
      setCoach(data.error || "Move rejected — board synced.");
    }
    if (!res.ok && res.status !== 409) {
      /* synced via poll */
    }
  } finally {
    setSendingPvpMove(false);
    clearSelection();
    renderBoard();
  }
}

async function resignPvp() {
  const invite = getPvpInvite();
  if (!invite || !invite.token) return;
  const { data } = await chessInviteFetch("POST", {
    action: "resign",
    token: invite.token
  });
  if (data.ok && data.invite) applyServerInvite(data.invite);
}

function consumePendingInvite() {
  // Hash invite is the only join path (maybeOpenChessInviteFromHash). Stale
  // sessionStorage must not re-enter join on plain #chess and blank the board.
  if ((location.hash || "").includes("chessInvite=")) return;
  try {
    sessionStorage.removeItem(PENDING_INVITE_KEY);
  } catch (_) {
    /* ignore */
  }
}

async function copyInviteLink() {
  const input = $("wtdChessInviteUrl");
  const invite = getPvpInvite();
  const url = input ? input.value : invite ? chessOpponentInviteUrl(invite) : "";
  if (!url) return;
  try {
    await navigator.clipboard.writeText(url);
    setCoach("Opponent link copied — your friend opens it to play Black.");
  } catch (_) {
    if (input) {
      input.focus();
      input.select();
    }
    setCoach("Copy the invite link from the field above.");
  }
}

function cancelInviteLobby() {
  stopPvpPoll();
  clearLockedPvpSeat();
  clearChessInvitePending();
  // Close invite UI only — do not tear down the chess session / board.
  restoreInviteResumeState();
}

function pieceName(type) {
  return (
    { p: "pawn", n: "knight", b: "bishop", r: "rook", q: "queen", k: "king" }[type] || "piece"
  );
}

function setHud(html) {
  if (hudEl) hudEl.innerHTML = html;
}

function setControls(html) {
  if (controlsEl) {
    controlsEl.innerHTML = html;
    controlsEl.classList.toggle("wtd-chess-dock", isMobileChessLab());
  }
  syncCoachAsideUi();
}

function renderGoldenRuleCard(rule) {
  activeGoldenRule = rule;
  const wrap = $("wtdChessGoldenRule");
  const nameEl = $("wtdChessGoldenRuleName");
  const patternEl = $("wtdChessGoldenRulePattern");
  if (!wrap) return;
  if (!rule || !lessonMode) {
    wrap.hidden = true;
    return;
  }
  wrap.hidden = false;
  if (nameEl) nameEl.textContent = rule.name;
  if (patternEl) patternEl.textContent = "Pattern: " + rule.pattern;
}

function chessSessionAsideActive() {
  if (window.AppgenWtdSessionModal?.isOpen?.()) return true;
  return Boolean(session && isMobileChessLab());
}

/** Strategy highlighted in the winning-strategies aside (Continue path or user pick). */
function focusedStrategyIdForUi() {
  if (curriculumFocusStrategyId) return curriculumFocusStrategyId;
  const next = resolveNextLesson();
  if (next?.strategyId) return next.strategyId;
  return CHESS_STRATEGIES[0]?.id || null;
}

function applyCurriculumFocusFromNextLesson() {
  const next = resolveNextLesson();
  if (next?.strategyId) {
    const strat = getStrategyById(next.strategyId);
    setCurriculumFocusInStore(next.strategyId, strat?.ruleId || null);
    return;
  }
  const first = CHESS_STRATEGIES[0];
  if (first) {
    setCurriculumFocusInStore(first.id, first.ruleId || null);
  }
}

function truncateCoachLine(text, max = 100) {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return t.slice(0, max - 1).trimEnd() + "…";
}

function resolveContinueLessonTarget() {
  if (chessSessionAsideActive() && curriculumFocusStrategyId) {
    return (
      resolveNextStrategyAfter(curriculumFocusStrategyId) || resolveNextLesson()
    );
  }
  return resolveNextLesson();
}

function syncChessLessonModeClass() {
  const play = $("wtdChessPlay");
  if (play) play.classList.toggle("wtd-chess-lesson-mode", lessonMode);
}

function syncMobileStepExpandUi() {
  const bar = $("wtdChessMobileStep");
  const toggle = $("wtdChessMobileStepToggle");
  const body = $("wtdChessMobileStepBody");
  if (!bar) return;
  bar.classList.toggle("wtd-chess-mobile-step--expanded", mobileStepExpanded);
  bar.classList.toggle("wtd-chess-mobile-step--collapsed", !mobileStepExpanded);
  if (body) body.hidden = !mobileStepExpanded;
  if (toggle) {
    toggle.setAttribute("aria-expanded", mobileStepExpanded ? "true" : "false");
    const label = mobileStepExpanded ? "Collapse lesson details" : "Expand lesson details";
    toggle.setAttribute("aria-label", label);
    toggle.title = label;
  }
}

function setMobileStepExpanded(open) {
  mobileStepExpanded = !!open;
  syncMobileStepExpandUi();
  notifyChessLayoutResize();
}

function renderMobileCurriculumStrip() {
  const bar = $("wtdChessMobileStep");
  if (!bar) return;
  syncChessLessonModeClass();
  if (!lessonMode) {
    bar.hidden = true;
    return;
  }
  bar.hidden = false;
  syncMobileStepExpandUi();
  const { total } = strategiesProgressSummary();
  const focusId = focusedStrategyIdForUi();
  const strat = focusId ? getStrategyById(focusId) : null;
  const idx = focusId ? strategyIndex(focusId) : 0;
  const stepNum = idx >= 0 ? idx + 1 : 1;
  const badge = $("wtdChessMobileStepBadge");
  const title = $("wtdChessMobileStepTitle");
  if (badge) badge.textContent = stepNum + "/" + total;
  if (title) title.textContent = strat?.title || "Winning strategies";
  const actions = $("wtdChessMobileStepActions");
  const next = resolveContinueLessonTarget();
  if (actions) {
    actions.innerHTML = next
      ? nextStrategyButtonHtml(next, {
          buttonLabel: "Next",
          extraClass: "wtd-chess-next-lesson-btn wtd-chess-mobile-continue",
          omitId: true
        })
      : "";
  }
}

function renderLessonList() {
  const el = $("wtdChessLessonList");
  if (!el) return;
  el.hidden = !lessonMode;
  syncChessLessonModeClass();
  if (!lessonMode) {
    renderMobileCurriculumStrip();
    return;
  }
  const { done, total, currentIndex } = strategiesProgressSummary();
  const focusId = focusedStrategyIdForUi();
  const items = CHESS_STRATEGIES.map((s, i) => {
    const complete = isStrategyComplete(s.id);
    const current = i === currentIndex;
    const selected = focusId === s.id;
    const icon = complete ? "✓" : selected ? "◉" : current ? "◉" : "○";
    const classes = [complete ? "done" : "", current ? "current" : "", selected ? "selected" : ""]
      .filter(Boolean)
      .join(" ");
    return (
      '<li class="' +
      classes +
      '"><button type="button" class="wtd-chess-lesson-item" data-strategy-id="' +
      escapeHtml(s.id) +
      '" title="' +
      escapeHtml(s.summary) +
      '"' +
      (selected ? ' aria-pressed="true"' : "") +
      ">" +
      icon +
      " " +
      escapeHtml(s.title) +
      "</button></li>"
    );
  }).join("");
  el.innerHTML =
    "<h4>Winning strategies (" +
    done +
    "/" +
    total +
    ")</h4>" +
    (chessSessionAsideActive()
      ? '<p class="wtd-chess-lesson-hint">Tap a lesson or use <strong>Continue</strong> in the controls.</p>'
      : '<p class="wtd-chess-lesson-hint">Open a game to follow the list beside the board, or tap a lesson to start.</p>') +
    "<ul>" +
    items +
    "</ul>";
  renderMobileCurriculumStrip();
}

const CHESS_CTRL_ICON = {
  cog:
    '<svg class="wtd-chess-btn-svg" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">' +
    '<path fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/>' +
    '<path fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/>' +
    "</svg>",
  vs:
    '<svg class="wtd-chess-btn-svg" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">' +
    '<text x="12" y="16" text-anchor="middle" font-size="11" font-weight="700" fill="currentColor" font-family="system-ui,sans-serif">VS</text>' +
    "</svg>",
  back:
    '<svg class="wtd-chess-btn-svg" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">' +
    '<path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" d="M14 6 8 12l6 6"/>' +
    "</svg>",
  coach:
    '<svg class="wtd-chess-btn-svg" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">' +
    '<path fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" d="M4 12a7 7 0 0 1 7-7h2a7 7 0 0 1 7 7v1a4 4 0 0 1-4 4h-1l-3.5 2.5V17H11a7 7 0 0 1-7-7v0Z"/>' +
    '<path fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" d="M9 11h.01M12 11h.01M15 11h.01"/>' +
    "</svg>",
  invite:
    '<svg class="wtd-chess-btn-svg" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">' +
    '<path fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>' +
    '<circle cx="9" cy="7" r="3.5" fill="none" stroke="currentColor" stroke-width="1.75"/>' +
    '<path fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" d="M19 8v6M22 11h-6"/>' +
    "</svg>",
  resign:
    '<svg class="wtd-chess-btn-svg" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">' +
    '<path fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" d="M5 21V4"/>' +
    '<path fill="currentColor" d="M6 5.2 15 3.5v7.2L6 12.4V5.2Z" opacity=".9"/>' +
    "</svg>",
  panel:
    '<svg class="wtd-chess-btn-svg" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">' +
    '<rect x="3.5" y="4.5" width="17" height="15" rx="2" fill="none" stroke="currentColor" stroke-width="1.75"/>' +
    '<path fill="none" stroke="currentColor" stroke-width="1.75" d="M14.5 4.5v15"/>' +
    "</svg>"
};

/** @param {string} id @param {string} btnClass @param {string} label @param {"cog"|"vs"|"back"|"coach"|"invite"|"resign"|"panel"} icon */
function chessIconButtonHtml(id, btnClass, label, icon) {
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
    CHESS_CTRL_ICON[icon] +
    "</button>"
  );
}

function boardEnvButtonHtml() {
  return chessIconButtonHtml(
    "wtdChessOpenEnvModal",
    "btn ghost",
    "Chess settings",
    "cog"
  );
}

/** @param {string} id @param {string} label @param {{ big?: boolean }} [opts] */
function playVsCoachButtonHtml(id, label, opts = {}) {
  const cls = opts.big ? "btn big" : "btn";
  return chessIconButtonHtml(id, cls, label, "vs");
}

function backToIntroButtonHtml() {
  return chessIconButtonHtml("wtdChessExitResults", "btn ghost", "Back to intro", "back");
}

function askCoachButtonHtml(label = "Ask coach") {
  return chessIconButtonHtml("wtdChessAskCoach", "btn ghost", label, "coach");
}

function coachPanelToggleButtonHtml() {
  return chessIconButtonHtml(
    "wtdChessCoachAsideToggle",
    "btn ghost wtd-chess-coach-aside-toggle",
    coachAsideOpen ? "Collapse coach panel" : "Expand coach panel",
    "panel"
  );
}

function inviteFriendButtonHtml(label = "Invite friend") {
  return chessIconButtonHtml("wtdChessInvite", "btn ghost", label, "invite");
}

function resignButtonHtml() {
  return chessIconButtonHtml("wtdChessResign", "btn ghost", "Resign", "resign");
}

function envPrefsForUi() {
  return {
    bg: envModalOpen && envDraftBg ? envDraftBg : sceneBgPrefs,
    board: envModalOpen && envDraftBoard ? envDraftBoard : boardThemePrefs,
    light: envModalOpen && envDraftLight ? envDraftLight : sceneLightPrefs
  };
}

function currentLightIntensityMultiplier() {
  return normalizeLightIntensity(envPrefsForUi().light.intensity);
}

function applyChessSceneLightFromPrefs() {
  if (!scene) return;
  const mult = currentLightIntensityMultiplier();
  if (ambientLight) ambientLight.intensity = SCENE_LIGHT_BASE.ambient * mult;
  if (hemisphereLight) hemisphereLight.intensity = SCENE_LIGHT_BASE.hemisphere * mult;
  if (keyDirectionalLight) {
    keyDirectionalLight.intensity = SCENE_LIGHT_BASE.key * mult;
    if (typeof keyDirectionalLight.shadow.intensity === "number") {
      keyDirectionalLight.shadow.intensity = SCENE_LIGHT_BASE.keyShadow * mult;
    }
  }
  if (fillDirectionalLight) fillDirectionalLight.intensity = SCENE_LIGHT_BASE.fill * mult;
  forceChessRender();
}

/** @param {string} label @param {string} controlHtml */
function envSettingsRow(label, controlHtml) {
  return (
    '<div class="wtd-chess-env-row">' +
    '<span class="wtd-chess-env-row-label">' +
    escapeHtml(label) +
    "</span>" +
    '<div class="wtd-chess-env-row-control">' +
    controlHtml +
    "</div></div>"
  );
}

/** @param {string | null | undefined} dataUrl @param {string} label */
function envImageThumbMarkup(dataUrl, label) {
  const alt = label + " preview";
  if (typeof dataUrl === "string" && dataUrl.startsWith("data:")) {
    return (
      '<img class="wtd-chess-env-thumb" src="' +
      escapeHtml(dataUrl) +
      '" alt="' +
      escapeHtml(alt) +
      '" loading="lazy" decoding="async">'
    );
  }
  return (
    '<span class="wtd-chess-env-thumb wtd-chess-env-thumb--empty" role="img" aria-label="' +
    escapeHtml("No " + label.toLowerCase()) +
    '"></span>'
  );
}

/** @param {string} actionsHtml @param {string | null | undefined} dataUrl @param {string} label */
function envUploadRowMarkup(dataUrl, label, actionsHtml) {
  return (
    '<div class="wtd-chess-env-row-upload">' +
    envImageThumbMarkup(dataUrl, label) +
    '<div class="wtd-chess-env-row-upload-actions">' +
    actionsHtml +
    "</div></div>"
  );
}

/** @param {string} id @param {string} label @param {number} value @param {number} min @param {number} max */
function envRangeSlider(id, label, value, min, max) {
  const v = Math.round(Math.min(max, Math.max(min, value)));
  return (
    '<label class="wtd-chess-env-opacity">' +
    '<span class="wtd-chess-env-opacity-label">' +
    escapeHtml(label) +
    "</span>" +
    '<input type="range" id="' +
    id +
    '" min="' +
    min +
    '" max="' +
    max +
    '" step="1" value="' +
    v +
    '">' +
    '<output class="wtd-chess-env-opacity-value" for="' +
    id +
    '">' +
    v +
    "%</output></label>"
  );
}

/** @param {string} id @param {string} label @param {number} pct 0–100 */
function envOpacitySlider(id, label, pct) {
  return envRangeSlider(id, label, pct, 0, 100);
}

/** @param {Record<string, unknown>} prefs @param {string} colorKey @param {string} imageKey @param {string} idTint @param {string} idTex */
function envTextureBlendSliders(prefs, colorKey, imageKey, idTint, idTex) {
  const co = pickThemeOpacity(prefs[colorKey], 1) * 100;
  const io = pickThemeOpacity(prefs[imageKey], 1) * 100;
  return (
    '<div class="wtd-chess-env-blend-sliders">' +
    envOpacitySlider(idTint, "Color tint", co) +
    envOpacitySlider(idTex, "Texture", io) +
    "</div>"
  );
}

/** @param {import("./appgen-wtd-chess-board-theme.js").BoardThemePrefs} board @param {"squareLight"|"squareDark"|"pieceWhite"|"pieceBlack"} stem */
function themeOpacity01(board, stem, kind) {
  const key = stem + (kind === "color" ? "ColorOpacity" : "ImageOpacity");
  return pickThemeOpacity(board[key], 1);
}

function setEnvModalStatus(msg, isError) {
  const el = $("wtdChessEnvStatus");
  if (!el) return;
  el.textContent = msg || "";
  el.classList.toggle("wtd-chess-env-status--error", !!isError);
}

function reloadChessEnvFromStorage() {
  hydrateChessEnvPrefsFromStorage({ syncDrafts: true });
  beginnerHints = loadBeginnerHintsEnabled();
  lessonMode = isLessonModeEnabled();
  boardThemeTextureSourceUrls.squareLight = null;
  boardThemeTextureSourceUrls.squareDark = null;
  boardThemeTextureSourceUrls.pieceWhite = null;
  boardThemeTextureSourceUrls.pieceBlack = null;
  if (envModalOpen) renderEnvSettingsPanel();
  applyChessSceneLightFromPrefs();
  applyChessVisualEnvironment();
}

function ensureChessCloudSync() {
  if (!isSignedIn()) return Promise.resolve({ ok: false, skipped: true });
  if (chessCloudSyncPromise) return chessCloudSyncPromise;
  chessCloudSyncPromise = syncChessSettingsWithCloud()
    .then((result) => {
      if (result.ok && result.loaded && result.settings) {
        reloadChessEnvFromStorage();
      }
      return result;
    })
    .finally(() => {
      chessCloudSyncPromise = null;
    });
  return chessCloudSyncPromise;
}

function openChessEnvModal() {
  wtdDispatch(openChessEnvModalAction());
  pullChessEnvFromStore();
  setEnvModalStatus("");
  const modal = $("wtdChessEnvModal");
  if (modal && modal.parentNode !== document.body) {
    document.body.appendChild(modal);
  }
  if (modal) {
    modal.hidden = false;
    modal.removeAttribute("hidden");
  }
  document.body.classList.add("wtd-chess-env-modal-open");
  renderEnvSettingsPanel();
}

function isChessGameOverOpen() {
  const modal = $("wtdChessGameOverModal");
  return !!(modal && !modal.hidden);
}

function chessGameOverKicker(outcome) {
  if (!outcome) return "Result";
  if (/^You won|^You win/i.test(outcome)) return "Victory";
  if (/^Coach wins|^Checkmate — you lost|^You resigned/i.test(outcome)) return "Defeat";
  if (/^Draw/i.test(outcome)) return "Draw";
  if (/complete/i.test(outcome)) return "Complete";
  return "Result";
}

function bindChessGameOverModal() {
  if (chessGameOverBound) return;
  chessGameOverBound = true;
  const modal = $("wtdChessGameOverModal");
  if (!modal) return;
  modal.addEventListener("click", (e) => {
    const t = e.target;
    if (!(t instanceof Element)) return;
    if (t.closest("#wtdChessGameOverRestart")) {
      closeChessGameOver();
      startSession();
    }
  });
}

function openChessGameOver(outcome, elapsed, options = {}) {
  bindChessGameOverModal();
  const modal = $("wtdChessGameOverModal");
  const label = $("wtdChessGameOverLabel");
  const body = $("wtdChessGameOverBody");
  if (!modal || !body) return;
  if (label) label.textContent = options.kicker || chessGameOverKicker(outcome);
  body.textContent = outcome + " · " + formatTimer(elapsed);
  if (modal.parentNode !== document.body) document.body.appendChild(modal);
  modal.hidden = false;
  modal.removeAttribute("hidden");
  document.body.classList.add("wtd-chess-env-modal-open");
  $("wtdChessGameOverRestart")?.focus();
}

function closeChessGameOver() {
  const modal = $("wtdChessGameOverModal");
  if (modal) modal.hidden = true;
  if (!envModalOpen) document.body.classList.remove("wtd-chess-env-modal-open");
}

function closeChessEnvModal() {
  wtdDispatch(closeChessEnvModalAction());
  pullChessEnvFromStore();
  const modal = $("wtdChessEnvModal");
  if (modal) modal.hidden = true;
  if (!isChessGameOverOpen()) document.body.classList.remove("wtd-chess-env-modal-open");
  applyChessSceneLightFromPrefs();
}

function commitChessEnvModal() {
  const hadBoardDraft = !!envDraftBoard;
  wtdDispatch(commitChessEnvModalAction());
  pullChessEnvFromStore();
  saveBackgroundPrefs(sceneBgPrefs);
  saveBoardThemePrefs(boardThemePrefs);
  saveSceneLightPrefs(sceneLightPrefs);
  if (hadBoardDraft) {
    boardThemeTextureSourceUrls.squareLight = null;
    boardThemeTextureSourceUrls.squareDark = null;
    boardThemeTextureSourceUrls.pieceWhite = null;
    boardThemeTextureSourceUrls.pieceBlack = null;
  }
  const payload = readChessSettingsFromStorage();
  const modal = $("wtdChessEnvModal");
  if (modal) modal.hidden = true;
  if (!isChessGameOverOpen()) document.body.classList.remove("wtd-chess-env-modal-open");
  applyChessSceneLightFromPrefs();
  applyChessVisualEnvironment();
  if (isSignedIn()) {
    pushChessSettingsToCloud(payload).then((r) => {
      if (!r.ok && !r.skipped) setCoach("Could not sync chess settings to cloud — " + (r.error || "try again"));
    });
  }
}

function exportChessEnvSettings() {
  try {
    const payload = envModalOpen
      ? {
          version: 1,
          background: JSON.parse(JSON.stringify(envDraftBg || sceneBgPrefs)),
          boardTheme: JSON.parse(JSON.stringify(envDraftBoard || boardThemePrefs)),
          sceneLight: JSON.parse(JSON.stringify(envDraftLight || sceneLightPrefs)),
          coaching: { beginnerHints, lessonMode }
        }
      : readChessSettingsFromStorage();
    downloadChessSettingsExport(payload);
    setEnvModalStatus("Settings exported as JSON (includes image data).");
  } catch (e) {
    setEnvModalStatus("Export failed: " + (e.message || e), true);
  }
}

function importChessEnvSettingsFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    let parsed;
    try {
      parsed = JSON.parse(String(reader.result || ""));
    } catch (_) {
      setEnvModalStatus("Import failed: invalid JSON.", true);
      return;
    }
    const payload = parseChessSettingsImport(parsed);
    if (!payload) {
      setEnvModalStatus(
        "Import failed: not a recognised chess settings file (or over ~3MB).",
        true
      );
      return;
    }
    applyChessSettingsPayload(payload);
    reloadChessEnvFromStorage();
    setEnvModalStatus("Settings imported and applied to the board.");
    if (isSignedIn()) {
      pushChessSettingsToCloud(readChessSettingsFromStorage()).catch(() => {});
    }
  };
  reader.onerror = () => setEnvModalStatus("Import failed: could not read file.", true);
  reader.readAsText(file);
}

function patchEnvDraftBg(partial) {
  if (!envModalOpen) return;
  wtdDispatch(patchChessEnvDraftBackground(partial));
  pullChessEnvFromStore();
}

function patchEnvDraftBoard(partial) {
  if (!envModalOpen) return;
  wtdDispatch(patchChessEnvDraftBoardTheme(partial));
  pullChessEnvFromStore();
}

function patchEnvDraftLight(partial) {
  if (!envModalOpen) return;
  wtdDispatch(patchChessEnvDraftSceneLight(partial));
  pullChessEnvFromStore();
}

function setCoach(text, goldenRule = null) {
  const line = text || "Make a move — I'll explain ideas as we go.";
  const el = $("wtdChessCoachText");
  if (el) el.textContent = line;
  const mobileCoach = $("wtdChessMobileCoach");
  if (mobileCoach) mobileCoach.textContent = truncateCoachLine(line, 96);
  renderGoldenRuleCard(goldenRule);
  if (goldenRule && lessonMode) markRuleEncounter(goldenRule.id);
  renderLessonList();
}

function clearPendingCoachWork() {
  if (aiTurnTimer) {
    clearTimeout(aiTurnTimer);
    aiTurnTimer = null;
  }
  coachRequestGen += 1;
  coachBusy = false;
}

function goldenPayloadFields(rule, strategy = null) {
  const out = {};
  if (rule) {
    out.goldenRuleName = rule.name;
    out.goldenRuleTip = rule.tip;
    out.goldenPattern = rule.pattern;
  }
  if (strategy) {
    out.curriculumStrategyId = strategy.id;
    out.curriculumStrategyTitle = strategy.title;
    out.curriculumStrategySummary = strategy.summary;
  }
  return out;
}

function goldenRuleById(id) {
  if (!id) return null;
  return GOLDEN_RULES.find((r) => r.id === id) || null;
}

function activeCurriculumStrategy() {
  return curriculumFocusStrategyId ? getStrategyById(curriculumFocusStrategyId) : null;
}

function coachCardForRuleId(ruleId) {
  const rule = goldenRuleById(ruleId);
  if (rule) return rule;
  return null;
}

function pickLessonGoldenRule(chess, ctx) {
  const strategy = activeCurriculumStrategy();
  if (strategy) {
    const focus = strategyCoachFocus(strategy);
    const linked = strategy.ruleId ? goldenRuleById(strategy.ruleId) : null;
    return linked || focus;
  }
  if (curriculumFocusRuleId) {
    const focused = goldenRuleById(curriculumFocusRuleId);
    if (focused) return focused;
  }
  return pickPrimaryGoldenRule(chess, ctx);
}

function nextStrategyButtonHtml(next, opts = {}) {
  if (!next) return "";
  const id = next.kind === "drill" ? next.drillId : next.strategyId;
  const sizeClass = opts.big ? "btn big" : "btn";
  const extraClass = opts.extraClass ? " " + opts.extraClass : "";
  const advance =
    opts.advancePractice ? ' data-advance-practice="1"' : "";
  const label = opts.buttonLabel || "Continue to next strategy";
  const btnId = opts.omitId ? "" : ' id="wtdChessNextLesson"';
  return (
    '<button type="button" class="' +
    sizeClass +
    extraClass +
    ' wtd-chess-next-lesson-btn"' +
    btnId +
    ' aria-label="' +
    escapeHtml(label) +
    '" title="' +
    escapeHtml(label) +
    '" data-next-kind="' +
    escapeHtml(next.kind) +
    '" data-next-id="' +
    escapeHtml(id) +
    '"' +
    advance +
    '><span class="wtd-chess-btn-label">' +
    escapeHtml(label) +
    "</span></button>"
  );
}

function startChessButtonHtml() {
  if (isMobileChessLab()) {
    return playVsCoachButtonHtml("wtdChessStart", "Start chess game", { big: true });
  }
  return '<button type="button" class="btn big" id="wtdChessStart">Start chess game</button>';
}

function introControlsHtml() {
  const next = resolveNextLesson();
  return (
    (!isMobileChessLab() && next
      ? nextStrategyButtonHtml(next, { big: true, buttonLabel: "Continue" })
      : "") +
    startChessButtonHtml() +
    inviteFriendButtonHtml() +
    boardEnvButtonHtml() +
    coachPanelToggleButtonHtml() /* last: right-aligned via CSS */
  );
}

function practiceControlsHtml() {
  const next = practiceDrill?.strategyId
    ? resolveNextStrategyAfter(practiceDrill.strategyId)
    : resolveNextLesson();
  return (
    nextStrategyButtonHtml(next, { advancePractice: true }) +
    boardEnvButtonHtml() +
    chessIconButtonHtml("wtdChessExitPractice", "btn ghost", "Exit drill", "back") +
    coachPanelToggleButtonHtml()
  );
}

function coachSessionControlsHtml() {
  const next = curriculumFocusStrategyId
    ? resolveNextStrategyAfter(curriculumFocusStrategyId)
    : null;
  return (
    nextStrategyButtonHtml(next) +
    boardEnvButtonHtml() +
    askCoachButtonHtml() +
    inviteFriendButtonHtml() +
    resignButtonHtml() +
    coachPanelToggleButtonHtml()
  );
}

function gameOverDockHtml(options = {}) {
  const againLabel = options.againLabel || "Play again";
  const againId = options.againId || "wtdChessAgain";
  const next = resolveNextLesson();
  let html = "";
  if (next) {
    html += nextStrategyButtonHtml(next, { big: true });
  }
  html += boardEnvButtonHtml();
  html += playVsCoachButtonHtml(againId, againLabel, { big: true });
  html += backToIntroButtonHtml();
  return html;
}

function pvpGameOverDockHtml() {
  return (
    playVsCoachButtonHtml("wtdChessAgain", "Play vs coach", { big: true }) +
    inviteFriendButtonHtml("Invite another friend") +
    backToIntroButtonHtml()
  );
}

function clearAllPieceMeshes() {
  if (!scene) return;
  Array.from(piecesBySquare.keys()).forEach((sq) => removePieceAt(sq));
}

function startNextLesson(kind, id) {
  if (!kind || !id) return;
  if (kind === "drill") {
    startPracticeDrill(id);
    return;
  }
  lessonMode = true;
  setLessonModeEnabled(true);
  startSession(id);
}

function startStrategyLesson(strategyId) {
  const s = getStrategyById(strategyId);
  if (!s) return;
  lessonMode = true;
  setLessonModeEnabled(true);
  const drillProgress = load101Progress();
  if ((s.kind === "drill" || s.kind === "both") && s.drillId && !drillProgress[s.drillId]) {
    startPracticeDrill(s.drillId);
    return;
  }
  if (s.kind === "vs_coach" || s.kind === "both") {
    lessonMode = true;
    setLessonModeEnabled(true);
    startSession(strategyId);
  }
}

const CHESS_101_CATEGORY_LABEL = {
  opening: "Opening",
  golden_rule: "Golden rule",
  tactics: "Tactics",
  endgame: "Endgame"
};

function render101DrillList() {
  const panel = $("wtdChess101Panel");
  if (!panel) return;
  const progress = load101Progress();
  const cards = CHESS_101_DRILLS.map((d) => {
    const done = !!progress[d.id];
    return (
      '<button type="button" class="wtd-chess-101-card' +
      (done ? " done" : "") +
      '" data-drill-id="' +
      escapeHtml(d.id) +
      '"><span class="wtd-chess-101-tag">' +
      escapeHtml(CHESS_101_CATEGORY_LABEL[d.category] || d.category) +
      "</span><strong>" +
      escapeHtml(d.title) +
      (done ? " ✓" : "") +
      '</strong><span>' +
      escapeHtml(d.blurb) +
      "</span></button>"
    );
  }).join("");
  const doneCount = CHESS_101_DRILLS.filter((d) => progress[d.id]).length;
  panel.innerHTML =
    "<h4>Chess 101 practice</h4>" +
    "<p>Guided mini-positions for center, development, castling, hanging pieces, forks, and pins — no coach opponent.</p>" +
    '<p class="wtd-3d-metric">Progress: ' +
    doneCount +
    "/" +
    CHESS_101_DRILLS.length +
    " drills</p>" +
    '<div class="wtd-chess-101-grid">' +
    cards +
    "</div>";
}

/** @param {"squareLightImage"|"squareDarkImage"|"pieceWhiteImage"|"pieceBlackImage"} prefKey */
function themeImageClearButton(prefKey, hasImage) {
  if (!hasImage) return "";
  return (
    '<button type="button" class="btn ghost wtd-chess-theme-clear" data-theme-clear="' +
    prefKey +
    '">Clear image</button>'
  );
}

/** @type {Record<"squareLightImage"|"squareDarkImage"|"pieceWhiteImage"|"pieceBlackImage", { tintId: string, texId: string, stem: "squareLight"|"squareDark"|"pieceWhite"|"pieceBlack" }>} */
const THEME_BLEND_UI = {
  squareLightImage: { tintId: "wtdChessSqLightTint", texId: "wtdChessSqLightTex", stem: "squareLight" },
  squareDarkImage: { tintId: "wtdChessSqDarkTint", texId: "wtdChessSqDarkTex", stem: "squareDark" },
  pieceWhiteImage: { tintId: "wtdChessPcWhiteTint", texId: "wtdChessPcWhiteTex", stem: "pieceWhite" },
  pieceBlackImage: { tintId: "wtdChessPcBlackTint", texId: "wtdChessPcBlackTex", stem: "pieceBlack" }
};

/** @param {string} id @param {"squareLightImage"|"squareDarkImage"|"pieceWhiteImage"|"pieceBlackImage"} imageKey */
function themeUploadControl(id, imageKey, label) {
  const board = envPrefsForUi().board;
  const dataUrl = board[imageKey];
  const hasImage = Boolean(dataUrl);
  const blend = THEME_BLEND_UI[imageKey];
  const stem = blend.stem;
  const actions =
    '<input type="file" id="' +
    id +
    '" accept="image/*" data-theme-upload="' +
    imageKey +
    '">' +
    themeImageClearButton(imageKey, hasImage) +
    envTextureBlendSliders(
      board,
      stem + "ColorOpacity",
      stem + "ImageOpacity",
      blend.tintId,
      blend.texId
    );
  return envUploadRowMarkup(dataUrl, label || imageKey, actions);
}

function renderEnvSettingsPanel() {
  const body = $("wtdChessEnvSettingsBody");
  if (!body) return;
  const { bg, board, light } = envPrefsForUi();
  const mode = bg.mode || "color";
  const color = bg.color || DEFAULT_STUDIO_COLOR;
  const lightPct = Math.round(normalizeLightIntensity(light.intensity) * 100);
  body.innerHTML =
    '<p class="wtd-chess-env-section-label">Coaching</p>' +
    envSettingsRow(
      "Beginner hints",
      '<label class="wtd-chess-toggle wtd-chess-env-toggle"><input type="checkbox" id="wtdChessHintToggle"' +
        (beginnerHints ? " checked" : "") +
        "> Highlight a good move</label>"
    ) +
    envSettingsRow(
      "Lesson mode",
      '<label class="wtd-chess-toggle wtd-chess-env-toggle"><input type="checkbox" id="wtdChessLessonToggle"' +
        (lessonMode ? " checked" : "") +
        "> Winning strategies path</label>"
    ) +
    '<p class="wtd-chess-env-section-label">Lighting</p>' +
    envSettingsRow(
      "Light intensity",
      envRangeSlider(
        "wtdChessLightIntensity",
        "Brightness",
        lightPct,
        Math.round(LIGHT_INTENSITY_MIN * 100),
        Math.round(LIGHT_INTENSITY_MAX * 100)
      )
    ) +
    '<p class="wtd-chess-env-section-label">Board &amp; backdrop</p>' +
    envSettingsRow(
      "Backdrop mode",
      '<button type="button" class="btn ghost" data-wtd-chess-bg="color"' +
        (mode === "color" ? ' aria-pressed="true"' : "") +
        ">Studio color</button> " +
        '<button type="button" class="btn ghost" data-wtd-chess-bg="cosmic"' +
        (mode === "cosmic" ? ' aria-pressed="true"' : "") +
        ">Cosmic grid</button> " +
        '<button type="button" class="btn ghost" data-wtd-chess-bg="galaxy"' +
        (mode === "galaxy" ? ' aria-pressed="true"' : "") +
        ">Galaxy preset</button>"
    ) +
    envSettingsRow(
      mode === "image" ? "Backdrop tint color" : "Backdrop color",
      '<input type="color" id="wtdChessBgColor" value="' + escapeHtml(color) + '">'
    ) +
    envSettingsRow(
      "Backdrop image",
      envUploadRowMarkup(
        bg.imageDataUrl,
        "Backdrop",
        '<input type="file" id="wtdChessBgUpload" accept="image/*">' +
          envTextureBlendSliders(
            bg,
            "imageColorOpacity",
            "imageOpacity",
            "wtdChessBgTint",
            "wtdChessBgTex"
          )
      )
    ) +
    envSettingsRow(
      "Light square color",
      '<input type="color" id="wtdChessSquareLight" value="' + escapeHtml(board.squareLight) + '">'
    ) +
    envSettingsRow(
      "Light square texture",
      themeUploadControl("wtdChessSquareLightUpload", "squareLightImage", "Light square texture")
    ) +
    envSettingsRow(
      "Dark square color",
      '<input type="color" id="wtdChessSquareDark" value="' + escapeHtml(board.squareDark) + '">'
    ) +
    envSettingsRow(
      "Dark square texture",
      themeUploadControl("wtdChessSquareDarkUpload", "squareDarkImage", "Dark square texture")
    ) +
    envSettingsRow(
      "White pieces color",
      '<input type="color" id="wtdChessPieceWhite" value="' + escapeHtml(board.pieceWhite) + '">'
    ) +
    envSettingsRow(
      "White pieces texture",
      themeUploadControl("wtdChessPieceWhiteUpload", "pieceWhiteImage", "White pieces texture")
    ) +
    envSettingsRow(
      "Black pieces color",
      '<input type="color" id="wtdChessPieceBlack" value="' + escapeHtml(board.pieceBlack) + '">'
    ) +
    envSettingsRow(
      "Black pieces texture",
      themeUploadControl("wtdChessPieceBlackUpload", "pieceBlackImage", "Black pieces texture")
    );
}

function isChessPieceInteractionActive() {
  return Boolean(activeDrag || dragPointerDown || pickLiftSquare);
}

/** @param {Record<string, string>} partial @param {{ skipPanelRefresh?: boolean }} [options] */
function applyBoardThemeChoice(partial, options = {}) {
  if (envModalOpen) {
    patchEnvDraftBoard(partial);
    if (!options.skipPanelRefresh) renderEnvSettingsPanel();
    return;
  }
  setCommittedBoardTheme({ ...boardThemePrefs, ...partial });
  applyChessVisualEnvironment();
  if (!options.skipPanelRefresh) renderEnvSettingsPanel();
}

/** @param {"squareLight"|"squareDark"|"pieceWhite"|"pieceBlack"} slot */
function disposeBoardThemeTexture(slot) {
  const tex = boardThemeTextures[slot];
  if (tex) {
    tex.dispose();
    boardThemeTextures[slot] = null;
  }
}

function disposeAllBoardThemeTextures() {
  disposeBoardThemeTexture("squareLight");
  disposeBoardThemeTexture("squareDark");
  disposeBoardThemeTexture("pieceWhite");
  disposeBoardThemeTexture("pieceBlack");
  boardThemeTextureSourceUrls.squareLight = null;
  boardThemeTextureSourceUrls.squareDark = null;
  boardThemeTextureSourceUrls.pieceWhite = null;
  boardThemeTextureSourceUrls.pieceBlack = null;
}

/** @param {import("three").Texture} tex */
function configureBoardThemeTexture(tex) {
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}

function forceChessRender() {
  if (renderer && scene && camera) {
    if (orbit) orbit.update();
    renderer.render(scene, camera);
  }
}

function watchChessHostResize() {
  if (!host || hostResizeObserver) return;
  hostResizeObserver = new ResizeObserver(() => {
    resize();
    forceChessRender();
  });
  hostResizeObserver.observe(host);
}

/** @param {import("three").MeshStandardMaterial | import("three").MeshPhysicalMaterial} mat @param {string} hex @param {import("three").Texture | null} tex @param {number} [colorOpacity] @param {number} [imageOpacity] */
function applyColorAndOptionalMap(mat, hex, tex, colorOpacity = 1, imageOpacity = 1) {
  const co = pickThemeOpacity(colorOpacity, 1);
  const io = pickThemeOpacity(imageOpacity, 1);
  const tinted = mixThemeHex("#ffffff", hex, co);
  if (!tex || io <= 0.001) {
    mat.map = null;
    mat.color.set(hex);
    mat.transparent = false;
    mat.opacity = 1;
  } else if (io >= 0.999) {
    mat.map = tex;
    mat.color.set(tinted);
    mat.transparent = false;
    mat.opacity = 1;
  } else {
    mat.map = tex;
    mat.color.set(mixThemeHex(hex, tinted, io));
    mat.transparent = false;
    mat.opacity = 1;
  }
  mat.needsUpdate = true;
}

function syncTileBaseAppearance(square) {
  const tile = tilesBySquare.get(square);
  if (!tile) return;
  const tex = isLightSquare(square) ? boardThemeTextures.squareLight : boardThemeTextures.squareDark;
  const stem = isLightSquare(square) ? "squareLight" : "squareDark";
  applyColorAndOptionalMap(
    tile.material,
    boardThemePrefs[stem],
    tex,
    themeOpacity01(boardThemePrefs, stem, "color"),
    themeOpacity01(boardThemePrefs, stem, "image")
  );
}

function uploadBoardThemeTexturesToGpu() {
  if (!renderer) return;
  for (const slot of ["squareLight", "squareDark", "pieceWhite", "pieceBlack"]) {
    const tex = boardThemeTextures[slot];
    if (tex && typeof renderer.initTexture === "function") {
      renderer.initTexture(tex);
    }
  }
}

function markPieceMeshesMaterialDirty() {
  piecesBySquare.forEach((group) => {
    group.traverse((node) => {
      if (node.isMesh && node.material) {
        node.material.needsUpdate = true;
      }
    });
  });
}

function applyBoardThemeVisualsSync(options = {}) {
  const rebuildPieces = options.rebuildPieces !== false;
  applyBoardThemeToMaterials();
  uploadBoardThemeTexturesToGpu();
  if (!scene) return;
  tilesBySquare.forEach((_, sq) => syncTileBaseAppearance(sq));
  if (rebuildPieces && game && !isChessPieceInteractionActive()) {
    for (let rank = 1; rank <= 8; rank++) {
      for (let file = 0; file < 8; file++) {
        const sq = String.fromCharCode(97 + file) + rank;
        const piece = game.get(sq);
        if (piece) placePieceAt(sq, piece.color, piece.type);
      }
    }
  } else {
    markPieceMeshesMaterialDirty();
  }
  applyTileHighlights();
  forceChessRender();
}

/** @param {() => void} [onReady] Fires after all theme images are applied to materials (sync or async). */
function reloadBoardThemeTextures(onReady) {
  const gen = ++boardThemeTextureGen;
  /** @type {const} */
  const slots = [
    ["squareLight", "squareLightImage"],
    ["squareDark", "squareDarkImage"],
    ["pieceWhite", "pieceWhiteImage"],
    ["pieceBlack", "pieceBlackImage"]
  ];
  let loadsQueued = 0;
  let finished = false;
  const finish = () => {
    if (finished || gen !== boardThemeTextureGen) return;
    finished = true;
    applyBoardThemeVisualsSync();
    if (typeof onReady === "function") onReady();
  };
  const manager = new THREE.LoadingManager();
  manager.onLoad = () => finish();
  const loader = new THREE.TextureLoader(manager);
  slots.forEach(([slot, prefKey]) => {
    const url = boardThemePrefs[prefKey] || null;
    if (!url) {
      if (boardThemeTextureSourceUrls[slot] || boardThemeTextures[slot]) {
        disposeBoardThemeTexture(slot);
        boardThemeTextureSourceUrls[slot] = null;
      }
      return;
    }
    if (boardThemeTextureSourceUrls[slot] === url && boardThemeTextures[slot]) {
      return;
    }
    boardThemeTextureSourceUrls[slot] = url;
    disposeBoardThemeTexture(slot);
    loadsQueued += 1;
    loader.load(
      url,
      (tex) => {
        if (gen !== boardThemeTextureGen) {
          tex.dispose();
          return;
        }
        configureBoardThemeTexture(tex);
        boardThemeTextures[slot] = tex;
        applyBoardThemeVisualsSync({ rebuildPieces: false });
      },
      undefined,
      () => {
        if (gen !== boardThemeTextureGen) return;
        boardThemeTextureSourceUrls[slot] = null;
        setCoach("Could not load a board texture — try re-uploading.");
      }
    );
  });
  if (loadsQueued === 0) {
    finish();
  }
}

/** @param {string} prefKey @param {string} dataUrl */
function applyBoardThemeImageChoice(prefKey, dataUrl) {
  applyBoardThemeChoice({ [prefKey]: dataUrl });
}

/** @param {"squareLightImage"|"squareDarkImage"|"pieceWhiteImage"|"pieceBlackImage"} prefKey */
function clearBoardThemeImage(prefKey) {
  if (envModalOpen && envDraftBoard) {
    const next = { ...envDraftBoard };
    delete next[prefKey];
    wtdDispatch(setChessEnvDraftBoardTheme(next));
    pullChessEnvFromStore();
    renderEnvSettingsPanel();
    return;
  }
  const next = { ...boardThemePrefs };
  delete next[prefKey];
  setCommittedBoardTheme(next);
  applyChessVisualEnvironment();
  renderEnvSettingsPanel();
}

/** @param {{ skipPanelRefresh?: boolean }} [options] */
function applyBackgroundChoice(mode, extra = {}, options = {}) {
  const base = envModalOpen && envDraftBg ? envDraftBg : sceneBgPrefs;
  /** @type {import("./appgen-wtd-chess-scene-bg.js").SceneBgPrefs} */
  let next;
  if (mode === "galaxy") next = { ...base, mode: "galaxy" };
  else if (mode === "cosmic") next = { ...base, mode: "cosmic" };
  else if (mode === "color" && extra.color) next = { ...base, mode: "color", color: extra.color };
  else if (mode === "color") next = { ...base, mode: "color", color: DEFAULT_STUDIO_COLOR };
  else if (mode === "image" && extra.imageDataUrl) {
    next = { ...base, mode: "image", imageDataUrl: extra.imageDataUrl };
  } else {
    return;
  }
  if (envModalOpen) {
    wtdDispatch(setChessEnvDraftBackground(next));
    pullChessEnvFromStore();
    if (!options.skipPanelRefresh) renderEnvSettingsPanel();
    return;
  }
  setCommittedBackground(next);
  applyChessVisualEnvironment();
  if (!options.skipPanelRefresh) renderEnvSettingsPanel();
}

/** @type {Record<string, keyof import("./appgen-wtd-chess-scene-bg.js").SceneBgPrefs>} */
const ENV_BG_BLEND_IDS = {
  wtdChessBgTint: "imageColorOpacity",
  wtdChessBgTex: "imageOpacity"
};

/** @type {Record<string, keyof import("./appgen-wtd-chess-board-theme.js").BoardThemePrefs>} */
const ENV_BOARD_BLEND_IDS = {
  wtdChessSqLightTint: "squareLightColorOpacity",
  wtdChessSqLightTex: "squareLightImageOpacity",
  wtdChessSqDarkTint: "squareDarkColorOpacity",
  wtdChessSqDarkTex: "squareDarkImageOpacity",
  wtdChessPcWhiteTint: "pieceWhiteColorOpacity",
  wtdChessPcWhiteTex: "pieceWhiteImageOpacity",
  wtdChessPcBlackTint: "pieceBlackColorOpacity",
  wtdChessPcBlackTex: "pieceBlackImageOpacity"
};

/** @param {EventTarget & { value?: string }} target */
function opacityFromRangeTarget(target) {
  return pickThemeOpacity(Number(target.value) / 100, 1);
}

/** @param {EventTarget & { id?: string, value?: string }} target */
function syncOpacityRangeOutput(target) {
  if (!target.id) return;
  const out = document.querySelector('output[for="' + target.id + '"]');
  if (out) out.textContent = Math.round(Number(target.value)) + "%";
}

/** @param {EventTarget | null} target @param {{ live?: boolean }} [opts] */
function handleEnvSettingsLiveInput(target, opts = {}) {
  if (!target || !("id" in target)) return;
  const panelOpts = opts.live ? { skipPanelRefresh: true } : {};
  const id = target.id;
  if (target.type === "range" && id === "wtdChessLightIntensity") {
    syncOpacityRangeOutput(target);
    const intensity = normalizeLightIntensity(Number(target.value) / 100);
    if (envModalOpen) {
      patchEnvDraftLight({ intensity });
    } else {
      setCommittedSceneLight({ intensity });
    }
    applyChessSceneLightFromPrefs();
    return;
  }
  if (target.type === "range" && id in ENV_BG_BLEND_IDS) {
    syncOpacityRangeOutput(target);
    const key = ENV_BG_BLEND_IDS[id];
    const val = opacityFromRangeTarget(target);
    if (envModalOpen) {
      patchEnvDraftBg({ [key]: val });
      if (scene) applyBackdropImageBlend(THREE, envPrefsForUi().bg, envSphereMesh);
    } else {
      setCommittedBackground({ ...sceneBgPrefs, [key]: val });
      if (scene) applyBackdropImageBlend(THREE, sceneBgPrefs, envSphereMesh);
    }
    return;
  }
  if (target.type === "range" && id in ENV_BOARD_BLEND_IDS) {
    syncOpacityRangeOutput(target);
    applyBoardThemeChoice({ [ENV_BOARD_BLEND_IDS[id]]: opacityFromRangeTarget(target) }, panelOpts);
    if (envModalOpen && scene) previewBoardThemeFromDraft();
    return;
  }
  if (id === "wtdChessBgColor") {
    if (envModalOpen) {
      patchEnvDraftBg({ color: target.value });
      if (scene) applyBackdropImageBlend(THREE, envPrefsForUi().bg, envSphereMesh);
      if (!panelOpts.skipPanelRefresh) renderEnvSettingsPanel();
    } else {
      setCommittedBackground({ ...sceneBgPrefs, color: target.value });
      refreshSceneBackground();
    }
    return;
  }
  if (id === "wtdChessSquareLight") {
    applyBoardThemeChoice({ squareLight: target.value }, panelOpts);
    return;
  }
  if (id === "wtdChessSquareDark") {
    applyBoardThemeChoice({ squareDark: target.value }, panelOpts);
    return;
  }
  if (id === "wtdChessPieceWhite") {
    applyBoardThemeChoice({ pieceWhite: target.value }, panelOpts);
    return;
  }
  if (id === "wtdChessPieceBlack") {
    applyBoardThemeChoice({ pieceBlack: target.value }, panelOpts);
  }
}

function syncPracticeCoachHighlight() {
  if (playMode !== "practice" || !practiceDrill || session?.finished) {
    return;
  }
  const step = currentDrillStep(practiceDrill, practiceStepIndex);
  if (step && !step.auto && game && game.turn() === step.color) {
    const piece = game.get(step.from);
    if (piece && piece.color === step.color) {
      coachRecommendMove = { from: step.from, to: step.to };
    } else {
      coachRecommendMove = null;
    }
  } else {
    coachRecommendMove = null;
  }
}

function promptCurrentPracticeStep() {
  if (!practiceDrill || session?.finished) return;
  if (isDrillComplete(practiceDrill, practiceStepIndex)) {
    finishPracticeDrill();
    return;
  }
  const step = currentDrillStep(practiceDrill, practiceStepIndex);
  if (step && !step.auto) {
    setCoach("Your move — " + step.coach, goldenRuleById(step.ruleId));
    syncPracticeCoachHighlight();
    renderBoard();
  }
}

function runAutoDrillSteps() {
  if (!practiceDrill || !game || session?.finished) return;
  let advanced = false;
  while (true) {
    const step = currentDrillStep(practiceDrill, practiceStepIndex);
    if (!step || !step.auto) break;
    let move;
    try {
      move = game.move({
        from: step.from,
        to: step.to,
        promotion: step.promotion || "q"
      });
    } catch (_) {
      break;
    }
    if (!move) break;
    recordLastMove(step.from, step.to);
    syncStoreFenFromGame();
    wtdDispatch(incrementChessPracticeStep());
    pullChessPlayFromStore();
    advanced = true;
    setCoach(step.coach, goldenRuleById(step.ruleId));
  }
  if (advanced) {
    syncPracticeCoachHighlight();
    renderBoard();
  }
  if (isDrillComplete(practiceDrill, practiceStepIndex)) {
    finishPracticeDrill();
    return;
  }
  promptCurrentPracticeStep();
}

function finishPracticeDrill() {
  if (!session || session.finished) return;
  clearPendingCoachWork();
  wtdDispatch(patchChessSession({ finished: true }));
  pullChessPlayFromStore();
  coachRecommendMove = null;
  if (practiceDrill?.id) mark101DrillComplete(practiceDrill.id);
  if (practiceDrill?.strategyId) markStrategyComplete(practiceDrill.strategyId);
  updateStatusBar();
  renderLessonList();
  const drillElapsed = Math.max(400, Math.round(performance.now() - session.startedAt));
  const drillOutcome = "Chess 101 drill complete — " + (practiceDrill?.title || "well done");
  openChessGameOver(drillOutcome, drillElapsed, { kicker: "Complete" });
  setControls(gameOverDockHtml({ againLabel: "Play vs coach", againId: "wtdChessStart" }));
  const next = resolveNextLesson();
  setCoach(
    next
      ? "Drill complete — press Continue for the next strategy (" +
        next.label +
        "), or Back to intro to choose any lesson."
      : "Drill complete — curriculum finished. Back to intro to replay drills or start vs coach.",
    practiceDrill ? coachCardForRuleId(practiceDrill.steps[practiceDrill.steps.length - 1]?.ruleId) : null
  );
  const panel101 = $("wtdChess101Panel");
  if (panel101) panel101.hidden = true;
  wtdDispatch(clearChessPractice());
  setPlayModeInStore("ai");
}

function startPracticeDrill(drillId) {
  const drill = getDrillById(drillId);
  if (!drill) return;
  openSessionModal();
  playEl = $("wtdChessPlay");
  hudEl = $("wtdChessHud");
  controlsEl = $("wtdChessControls");
  const panel101 = $("wtdChess101Panel");
  if (panel101) panel101.hidden = true;
  setPlayModeInStore("practice");
  wtdDispatch(setChessPractice({ drillId: drill.id, stepIndex: 0 }));
  if (drill.strategyId) {
    const strat = getStrategyById(drill.strategyId);
    setCurriculumFocusInStore(drill.strategyId, strat?.ruleId || null);
  }
  let drillHumanColor = "w";
  for (const s of drill.steps) {
    if (!s.auto) {
      drillHumanColor = s.color;
      break;
    }
  }
  setMyColorInStore(drillHumanColor);
  pullChessPlayFromStore();
  const drillFen = resolveDrillFen(drill);
  const loadedGame = tryLoadGameFromFen(drillFen);
  if (!loadedGame) {
    game = new Chess();
    setCoach(
      "This drill position could not be loaded — the board shows the starting position. Try again after a refresh; drill id: " +
        drill.id
    );
  } else {
    game = loadedGame;
  }
  if (scene) clearAllPieceMeshes();
  wtdDispatch(
    startNewChessSession({ startedAt: performance.now(), practice: true })
  );
  wtdDispatch(clearChessLastMove());
  pullChessPlayFromStore();
  syncStoreFenFromGame();
  dispatchClearSelection();
  clearCoachRecommend();
  setHud(
    "<h3>Chess 101 · " +
      escapeHtml(drill.title) +
      "</h3>" +
      '<p class="wtd-3d-metric">' +
      escapeHtml(drill.blurb) +
      '</p><p class="wtd-3d-metric">Turn: <span id="wtdChessTurn">…</span> · State: <span id="wtdChessState">Practice</span> · Time: <span id="wtdChessTimer">0.0s</span></p>'
  );
  setControls(practiceControlsHtml());
  bindControls();
  renderLessonList();
  runAutoDrillSteps();
  if (!session.finished) promptCurrentPracticeStep();
  renderBoard();
  resetCameraForPlayerView(myColor);
}

function formatTimer(ms) {
  const s = ms / 1000;
  if (s < 60) return s.toFixed(1) + "s";
  return Math.floor(s / 60) + "m " + (s % 60).toFixed(0) + "s";
}

function gridOffset() {
  return ((BOARD - 1) * CELL) / 2;
}

function squareToGrid(square) {
  const file = square.charCodeAt(0) - 97;
  const rank = parseInt(square[1], 10) - 1;
  return { file, rank };
}

function squareToWorld(square, y) {
  const { file, rank } = squareToGrid(square);
  const offset = gridOffset();
  return new THREE.Vector3(file * CELL - offset, typeof y === "number" ? y : 0, rank * CELL - offset);
}

function isLightSquare(square) {
  const { file, rank } = squareToGrid(square);
  return (file + rank) % 2 === 0;
}

function tileBaseHex(square) {
  return isLightSquare(square)
    ? hexToThreeColor(boardThemePrefs.squareLight)
    : hexToThreeColor(boardThemePrefs.squareDark);
}

function shadeThemeHex(hex, factor) {
  const c = new THREE.Color(hex);
  c.multiplyScalar(factor);
  return c;
}

function applyBoardThemeToMaterials() {
  ensureSharedMaterials();
  applyColorAndOptionalMap(
    sharedMats.white,
    boardThemePrefs.pieceWhite,
    boardThemeTextures.pieceWhite,
    themeOpacity01(boardThemePrefs, "pieceWhite", "color"),
    themeOpacity01(boardThemePrefs, "pieceWhite", "image")
  );
  applyColorAndOptionalMap(
    sharedMats.black,
    boardThemePrefs.pieceBlack,
    boardThemeTextures.pieceBlack,
    themeOpacity01(boardThemePrefs, "pieceBlack", "color"),
    themeOpacity01(boardThemePrefs, "pieceBlack", "image")
  );
  const whiteCo = themeOpacity01(boardThemePrefs, "pieceWhite", "color");
  const whiteIo = themeOpacity01(boardThemePrefs, "pieceWhite", "image");
  const blackCo = themeOpacity01(boardThemePrefs, "pieceBlack", "color");
  const blackIo = themeOpacity01(boardThemePrefs, "pieceBlack", "image");
  sharedMats.whiteAccent.map = whiteIo > 0.001 ? boardThemeTextures.pieceWhite : null;
  sharedMats.blackAccent.map = blackIo > 0.001 ? boardThemeTextures.pieceBlack : null;
  sharedMats.whiteAccent.color.copy(shadeThemeHex(boardThemePrefs.pieceWhite, 0.88));
  sharedMats.blackAccent.color.copy(shadeThemeHex(boardThemePrefs.pieceBlack, 1.28));
  if (whiteCo < 0.999) {
    sharedMats.whiteAccent.color.lerp(new THREE.Color(0xffffff), 1 - whiteCo);
  }
  if (blackCo < 0.999) {
    sharedMats.blackAccent.color.lerp(new THREE.Color(0xffffff), 1 - blackCo);
  }
  sharedMats.whiteAccent.needsUpdate = true;
  sharedMats.blackAccent.needsUpdate = true;
}

function refreshBoardThemeVisuals() {
  reloadBoardThemeTextures();
}

/** Live modal preview — uses draft board prefs without persisting (local swap only). */
function previewBoardThemeFromDraft() {
  if (!envModalOpen || !envDraftBoard || !scene) return;
  const saved = boardThemePrefs;
  boardThemePrefs = envDraftBoard;
  applyBoardThemeVisualsSync();
  boardThemePrefs = saved;
}

/** Floor contact blob — readable on light squares alongside PCF shadows (spatial3d pattern). */
function attachContactShadow(group, radius) {
  const r = typeof radius === "number" ? radius : 0.26;
  const disk = new THREE.Mesh(
    new THREE.CircleGeometry(r, 22),
    new THREE.MeshBasicMaterial({
      color: 0x152028,
      transparent: true,
      opacity: 0.62,
      depthWrite: false
    })
  );
  disk.rotation.x = -Math.PI / 2;
  disk.position.y = 0.003;
  disk.renderOrder = 1;
  const mat = disk.material;
  mat.polygonOffset = true;
  mat.polygonOffsetFactor = -3;
  mat.polygonOffsetUnits = -3;
  disk.userData.type = "contactShadow";
  disk.raycast = () => {};
  group.add(disk);
  return disk;
}

function isSharedPieceMaterial(mat) {
  if (!mat) return false;
  return (
    mat === sharedMats.white ||
    mat === sharedMats.black ||
    mat === sharedMats.whiteAccent ||
    mat === sharedMats.blackAccent
  );
}

/** Dispose a piece group without tearing down shared piece materials (used by all pieces). */
function disposePieceGroup(group) {
  if (!group) return;
  group.traverse((node) => {
    if (node.geometry) node.geometry.dispose();
    if (node.material) {
      const mats = Array.isArray(node.material) ? node.material : [node.material];
      mats.forEach((m) => {
        if (isSharedPieceMaterial(m)) return;
        if (m.map) m.map.dispose();
        m.dispose();
      });
    }
  });
}

function disposeMeshDeep(mesh) {
  if (!mesh) return;
  mesh.traverse((node) => {
    if (node.geometry) node.geometry.dispose();
    if (node.material) {
      const mats = Array.isArray(node.material) ? node.material : [node.material];
      mats.forEach((m) => {
        if (m.map) m.map.dispose();
        m.dispose();
      });
    }
  });
}

function disposeSharedPieceMaterials() {
  const mats = [
    sharedMats.white,
    sharedMats.black,
    sharedMats.whiteAccent,
    sharedMats.blackAccent
  ];
  mats.forEach((m) => {
    if (m) m.dispose();
  });
  sharedMats.white = null;
  sharedMats.black = null;
  sharedMats.whiteAccent = null;
  sharedMats.blackAccent = null;
}

function createTileMaterial(colorHex) {
  return new THREE.MeshPhysicalMaterial({
    color: colorHex,
    metalness: 0.02,
    roughness: 0.54,
    clearcoat: 0.1,
    clearcoatRoughness: 0.58,
    envMapIntensity: 0.05,
    emissive: 0x000000,
    emissiveIntensity: 0
  });
}

function createPianoMaterial(colorHex) {
  return new THREE.MeshPhysicalMaterial({
    color: colorHex,
    metalness: 0.08,
    roughness: 0.5,
    clearcoat: 0.32,
    clearcoatRoughness: 0.45,
    envMapIntensity: 0.1
  });
}

function ensureSharedMaterials() {
  if (!sharedMats.white) {
    sharedMats.white = new THREE.MeshStandardMaterial({
      color: boardThemePrefs.pieceWhite,
      metalness: 0.12,
      roughness: 0.42,
      envMapIntensity: 0.08
    });
    sharedMats.black = new THREE.MeshStandardMaterial({
      color: boardThemePrefs.pieceBlack,
      metalness: 0.18,
      roughness: 0.38,
      envMapIntensity: 0.1
    });
    sharedMats.whiteAccent = new THREE.MeshStandardMaterial({
      color: shadeThemeHex(boardThemePrefs.pieceWhite, 0.88),
      metalness: 0.08,
      roughness: 0.48
    });
    sharedMats.blackAccent = new THREE.MeshStandardMaterial({
      color: shadeThemeHex(boardThemePrefs.pieceBlack, 1.28),
      metalness: 0.12,
      roughness: 0.44
    });
  }
}

function addMesh(group, geo, mat, x, y, z) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  m.receiveShadow = false;
  m.position.set(x, y, z);
  group.add(m);
  return m;
}

function createPieceGroup(color, type) {
  ensureSharedMaterials();
  const group = new THREE.Group();
  const body = color === "w" ? sharedMats.white : sharedMats.black;
  const accent = color === "w" ? sharedMats.whiteAccent : sharedMats.blackAccent;
  group.userData = { color, type, piece: true };

  if (type === "p") {
    addMesh(group, new THREE.CylinderGeometry(0.2, 0.24, 0.38, 20), body, 0, 0.19, 0);
    addMesh(group, new THREE.SphereGeometry(0.16, 16, 12), body, 0, 0.44, 0);
  } else if (type === "r") {
    addMesh(group, new THREE.BoxGeometry(0.38, 0.52, 0.38), body, 0, 0.26, 0);
    addMesh(group, new THREE.BoxGeometry(0.48, 0.1, 0.48), accent, 0, 0.52, 0);
  } else if (type === "n") {
    addMesh(group, new THREE.CylinderGeometry(0.22, 0.26, 0.22, 16), body, 0, 0.11, 0);
    addMesh(group, new THREE.BoxGeometry(0.18, 0.32, 0.36), body, 0.06, 0.38, 0.02);
    addMesh(group, new THREE.BoxGeometry(0.12, 0.14, 0.22), accent, 0.12, 0.52, 0.08);
  } else if (type === "b") {
    addMesh(group, new THREE.CylinderGeometry(0.22, 0.28, 0.2, 18), body, 0, 0.1, 0);
    addMesh(group, new THREE.ConeGeometry(0.22, 0.48, 20), body, 0, 0.44, 0);
    addMesh(group, new THREE.SphereGeometry(0.1, 12, 10), accent, 0, 0.68, 0);
  } else if (type === "q") {
    addMesh(group, new THREE.CylinderGeometry(0.24, 0.3, 0.28, 22), body, 0, 0.14, 0);
    addMesh(group, new THREE.SphereGeometry(0.2, 20, 14), body, 0, 0.42, 0);
    addMesh(group, new THREE.TorusGeometry(0.12, 0.04, 10, 24), accent, 0, 0.62, 0);
  } else if (type === "k") {
    addMesh(group, new THREE.CylinderGeometry(0.26, 0.32, 0.32, 22), body, 0, 0.16, 0);
    addMesh(group, new THREE.CylinderGeometry(0.18, 0.2, 0.28, 18), body, 0, 0.46, 0);
    addMesh(group, new THREE.BoxGeometry(0.34, 0.06, 0.06), accent, 0, 0.66, 0);
    addMesh(group, new THREE.BoxGeometry(0.06, 0.22, 0.06), accent, 0, 0.74, 0);
  }

  const shadowRadii = { p: 0.2, r: 0.28, n: 0.24, b: 0.22, q: 0.3, k: 0.3 };
  attachContactShadow(group, shadowRadii[type] || 0.24);

  group.traverse((c) => {
    if (c.isMesh) c.userData.pieceRoot = group;
  });
  return group;
}

function configureKeyLightShadows(key) {
  const shadowHalf = gridOffset() + CELL * 0.72;
  if (!keyLightTarget) keyLightTarget = new THREE.Object3D();
  keyLightTarget.position.set(0, 0, 0);
  key.target = keyLightTarget;
  key.shadow.mapSize.set(3072, 3072);
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 24;
  key.shadow.camera.left = -shadowHalf;
  key.shadow.camera.right = shadowHalf;
  key.shadow.camera.top = shadowHalf;
  key.shadow.camera.bottom = -shadowHalf;
  key.shadow.bias = -0.00022;
  key.shadow.normalBias = 0.018;
  key.shadow.radius = 0.85;
  key.shadow.camera.updateProjectionMatrix();
}

function disposeEnvironment() {
  if (envMapTexture) {
    envMapTexture.dispose();
    envMapTexture = null;
  }
  if (pmremGenerator) {
    pmremGenerator.dispose();
    pmremGenerator = null;
  }
  if (scene) scene.environment = null;
}

function initEnvironment() {
  if (!renderer || !scene) return;
  disposeEnvironment();
  pmremGenerator = new THREE.PMREMGenerator(renderer);
  pmremGenerator.compileEquirectangularShader();
  const roomScene = new RoomEnvironment();
  envMapTexture = pmremGenerator.fromScene(roomScene, 0.04).texture;
  scene.environment = envMapTexture;
}

/** Orbit from rank-1 (White) side — low angle, White near / Black far (horizon taper). */
function resetCameraForWhiteView() {
  resetCameraForPlayerView("w");
}

function refreshSceneBackground() {
  if (!scene) return;
  applySceneBackground(scene, THREE, sceneBgPrefs, envSphereMesh, {
    onReady: () => {
      applyBackdropImageBlend(THREE, sceneBgPrefs, envSphereMesh);
      forceChessRender();
    }
  });
  applyBackdropImageBlend(THREE, sceneBgPrefs, envSphereMesh);
}

let visualEnvApplyGen = 0;

function applyChessVisualEnvironmentAfterThemeReady() {
  const interacting = isChessPieceInteractionActive();
  const inPractice = playMode === "practice" && practiceDrill;
  if (!game && !interacting && !inPractice) {
    game = new Chess();
  }
  if (!interacting && !inPractice) {
    syncPiecesFromGame();
  } else if (!interacting && inPractice && game) {
    syncPiecesFromGame();
  }
  applyBoardThemeVisualsSync();
  resize();
  requestAnimationFrame(() => {
    resize();
    forceChessRender();
  });
}

/** Push backdrop + board/piece theme to the live WebGL view (intro or in-session). */
function applyChessVisualEnvironment() {
  if (!ensureEngine()) return;
  const gen = ++visualEnvApplyGen;
  refreshSceneBackground();
  reloadBoardThemeTextures(() => {
    if (gen !== visualEnvApplyGen) return;
    applyChessVisualEnvironmentAfterThemeReady();
  });
}

/** @param {string} fen */
function tryLoadGameFromFen(fen) {
  const g = new Chess();
  try {
    g.load(fen);
  } catch (_) {
    return null;
  }
  const wantBoard = fen.trim().split(/\s+/)[0];
  const gotBoard = g.fen().trim().split(/\s+/)[0];
  return wantBoard === gotBoard ? g : null;
}

/** Materials + tiles only — safe while dragging (no mesh teardown). */
function applyChessVisualEnvironmentLight() {
  if (!ensureEngine()) return;
  applyBoardThemeVisualsSync();
}

function buildScene() {
  scene = new THREE.Scene();
  scene.fog = new THREE.Fog(DEFAULT_STUDIO_COLOR, 18, 32);

  camera = new THREE.PerspectiveCamera(48, 1, 0.1, 200);
  camera.position.set(CAM_WHITE_POS.x, CAM_WHITE_POS.y, CAM_WHITE_POS.z);

  ambientLight = new THREE.AmbientLight(0xfff3e6, SCENE_LIGHT_BASE.ambient);
  scene.add(ambientLight);
  hemisphereLight = new THREE.HemisphereLight(0xffeed6, 0xbfa894, SCENE_LIGHT_BASE.hemisphere);
  scene.add(hemisphereLight);
  keyDirectionalLight = new THREE.DirectionalLight(0xfff4e6, SCENE_LIGHT_BASE.key);
  keyDirectionalLight.position.set(4.5, 10, 6);
  keyDirectionalLight.castShadow = true;
  configureKeyLightShadows(keyDirectionalLight);
  scene.add(keyLightTarget);
  scene.add(keyDirectionalLight);
  fillDirectionalLight = new THREE.DirectionalLight(0xb8cce0, SCENE_LIGHT_BASE.fill);
  fillDirectionalLight.position.set(-5, 6, 4);
  scene.add(fillDirectionalLight);
  applyChessSceneLightFromPrefs();

  envSphereMesh = createEnvironmentSphere(THREE);
  scene.add(envSphereMesh);

  const desk = new THREE.Mesh(
    new THREE.BoxGeometry(BOARD * CELL + 0.5, 0.14, BOARD * CELL + 0.5),
    createPianoMaterial(0xb0bcc8)
  );
  desk.position.y = -0.08;
  desk.receiveShadow = true;
  scene.add(desk);

  tilesBySquare.clear();
  for (let rank = 1; rank <= 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const sq = String.fromCharCode(97 + file) + rank;
      const mat = createTileMaterial(tileBaseHex(sq));
      const tile = new THREE.Mesh(new THREE.BoxGeometry(CELL * 0.94, 0.07, CELL * 0.94), mat);
      const pos = squareToWorld(sq, 0.02);
      tile.position.copy(pos);
      tile.position.y = 0.02;
      tile.receiveShadow = true;
      tile.userData = { square: sq, type: "tile" };
      scene.add(tile);
      tilesBySquare.set(sq, tile);
    }
  }

  raycaster = new THREE.Raycaster();
  pointer = new THREE.Vector2();
}

function clearTargetRings() {
  targetRingMeshes.forEach((ring) => {
    scene.remove(ring);
    disposeMeshDeep(ring);
  });
  targetRingMeshes.length = 0;
}

function addSquareRing(square, color, innerR, outerR, opacity) {
  if (!scene) return;
  const pos = squareToWorld(square, 0.08);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(CELL * innerR, CELL * outerR, 32),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      side: THREE.DoubleSide,
      depthWrite: false
    })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(pos.x, 0.1, pos.z);
  scene.add(ring);
  targetRingMeshes.push(ring);
}

/** Two concentric white rings — coach from/to (practice + vs-coach). */
function addCoachSquareRings(square) {
  const opacity = 0.9;
  addSquareRing(square, HIGHLIGHT_COACH, 0.15, 0.21, opacity);
  addSquareRing(square, HIGHLIGHT_COACH, 0.25, 0.31, opacity);
}

function resetTileMaterial(square) {
  const tile = tilesBySquare.get(square);
  if (!tile) return;
  syncTileBaseAppearance(square);
  tile.material.emissive.setHex(0x000000);
  tile.material.emissiveIntensity = 0;
}

function applyTileHighlights() {
  for (let rank = 1; rank <= 8; rank++) {
    for (let file = 0; file < 8; file++) {
      resetTileMaterial(String.fromCharCode(97 + file) + rank);
    }
  }
  clearTargetRings();

  const paint = (square, emissive, intensity) => {
    const tile = tilesBySquare.get(square);
    if (!tile) return;
    tile.material.emissive.setHex(emissive);
    tile.material.emissiveIntensity = intensity;
  };

  if (lastMoveFrom) paint(lastMoveFrom, HIGHLIGHT_LAST, 0.35);
  if (lastMoveTo) paint(lastMoveTo, HIGHLIGHT_LAST, 0.35);
  if (selectedSquare) paint(selectedSquare, HIGHLIGHT_SELECT, 0.42);

  if (hintMove) {
    paint(hintMove.from, HIGHLIGHT_HINT, 0.38);
    paint(hintMove.to, HIGHLIGHT_HINT, 0.38);
  }

  if (coachRecommendMove) {
    for (const sq of new Set([coachRecommendMove.from, coachRecommendMove.to])) {
      if (!sq) continue;
      paint(sq, HIGHLIGHT_COACH, HIGHLIGHT_COACH_INTENSITY);
      addCoachSquareRings(sq);
    }
  }

  // Legal targets: white ring only — no green/emissive square fill under the circle.
  legalTargets.forEach((sq) => {
    // +20% vs piece base so ring stays visible when a piece occupies the square.
    addSquareRing(sq, HIGHLIGHT_TARGET, 0.24, 0.336, 0.88);
  });
}

function removePieceAt(square) {
  const mesh = piecesBySquare.get(square);
  if (!mesh) return;
  scene.remove(mesh);
  disposePieceGroup(mesh);
  piecesBySquare.delete(square);
}

function placePieceAt(square, color, type) {
  removePieceAt(square);
  const group = createPieceGroup(color, type);
  const pos = squareToWorld(square, PIECE_REST_Y);
  group.position.copy(pos);
  group.rotation.set(0, 0, 0);
  group.userData.square = square;
  scene.add(group);
  piecesBySquare.set(square, group);
}

function syncPiecesFromGame() {
  if (!game || !scene) return;
  const seen = new Set();
  for (let rank = 1; rank <= 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const sq = String.fromCharCode(97 + file) + rank;
      seen.add(sq);
      const piece = game.get(sq);
      const existing = piecesBySquare.get(sq);
      if (!piece) {
        if (existing) removePieceAt(sq);
        continue;
      }
      if (
        !existing ||
        existing.userData.color !== piece.color ||
        existing.userData.type !== piece.type
      ) {
        placePieceAt(sq, piece.color, piece.type);
      } else if (
        (!activeDrag || activeDrag.from !== sq) &&
        pickLiftSquare !== sq
      ) {
        const pos = squareToWorld(sq, PIECE_REST_Y);
        existing.position.copy(pos);
        existing.rotation.set(0, 0, 0);
        existing.userData.square = sq;
      }
    }
  }
  piecesBySquare.forEach((_, sq) => {
    if (!seen.has(sq)) removePieceAt(sq);
  });
}

function measureChessHostSize() {
  if (!host) return { w: 1, h: 320 };
  const rect = host.getBoundingClientRect();
  let w = Math.max(host.clientWidth, Math.floor(rect.width));
  let h = Math.max(host.clientHeight, Math.floor(rect.height));
  let el = host.parentElement;
  while ((w <= 1 || h <= 1) && el) {
    w = Math.max(w, el.clientWidth, Math.floor(el.getBoundingClientRect().width));
    h = Math.max(h, el.clientHeight, Math.floor(el.getBoundingClientRect().height));
    el = el.parentElement;
  }
  if (w <= 1) w = Math.max(1, window.innerWidth);
  return { w, h };
}

function resize() {
  if (!renderer || !host || !camera) return;
  const inModal = !!(host.closest && host.closest(".wtd-session-modal"));
  const measured = measureChessHostSize();
  const w = measured.w;
  let h = measured.h;
  if (inModal) {
    if (h < 160) {
      h = Math.max(280, Math.floor(window.innerHeight * 0.48));
      host.style.height = h + "px";
    } else {
      host.style.height = "";
      h = host.clientHeight || h;
    }
  } else if (isMobileChessLab()) {
    host.style.height = "";
    h = Math.max(host.clientHeight || 0, measured.h, 200);
  } else {
    h = Math.max(320, Math.min(520, w * 0.72));
    host.style.height = h + "px";
  }
  renderer.setSize(w, Math.max(1, h), false);
  camera.aspect = w / Math.max(1, h);
  applyMobileCameraFrameBias(w, Math.max(1, h));
  camera.updateProjectionMatrix();
}

function expSmoothing(stiffness, dt) {
  return 1 - Math.exp(-stiffness * dt);
}

function resetPickLiftVisual(square) {
  if (!square) return;
  const group = piecesBySquare.get(square);
  if (!group || (activeDrag && activeDrag.from === square)) return;
  group.position.y = PIECE_REST_Y;
}

function clearPickLiftState() {
  const prev = pickLiftSquare;
  pickLiftSquare = null;
  pickLift = 0;
  if (prev) resetPickLiftVisual(prev);
}

function stepPickLiftPhysics(dt) {
  if (activeDrag || !pickLiftSquare) return;
  const group = piecesBySquare.get(pickLiftSquare);
  if (!group) {
    clearPickLiftState();
    return;
  }
  const aLift = expSmoothing(PICK_LIFT_STIFF, dt);
  pickLift += (PICK_LIFT_MAX - pickLift) * aLift;
  group.position.y = PIECE_REST_Y + pickLift;
}

function rebindActiveDragGroupIfNeeded() {
  if (!activeDrag) return false;
  if (activeDrag.group && activeDrag.group.parent) return true;
  const replacement = piecesBySquare.get(activeDrag.from);
  if (!replacement) {
    finishActiveDrag();
    return false;
  }
  activeDrag.group = replacement;
  return true;
}

function stepDragPhysics(dt) {
  if (!activeDrag || !rebindActiveDragGroupIfNeeded()) return;
  const d = activeDrag;
  const g = d.group;
  const aHead = expSmoothing(DRAG_HEAD_STIFF, dt);
  const aBase = expSmoothing(DRAG_BASE_STIFF, dt);
  const aTilt = expSmoothing(DRAG_TILT_DAMP, dt);
  const aLift = expSmoothing(DRAG_LIFT_STIFF, dt);

  d.lift += (DRAG_LIFT_MAX - d.lift) * aLift;

  d.head.x += (d.target.x - d.head.x) * aHead;
  d.head.z += (d.target.z - d.head.z) * aHead;

  d.base.x += (d.target.x - d.base.x) * aBase;
  d.base.z += (d.target.z - d.base.z) * aBase;

  const liftY = PIECE_REST_Y + d.lift;
  g.position.set(d.base.x, liftY, d.base.z);

  const dx = d.head.x - d.base.x;
  const dz = d.head.z - d.base.z;
  const wantTiltX = -dz * DRAG_TILT_GAIN;
  const wantTiltZ = dx * DRAG_TILT_GAIN;
  d.tiltX += (wantTiltX - d.tiltX) * aTilt;
  d.tiltZ += (wantTiltZ - d.tiltZ) * aTilt;
  g.rotation.x = d.tiltX;
  g.rotation.z = d.tiltZ;
}

/** Snap idle pieces onto the board and upright after drag (gravity-style settle). */
function stepPiecesOnBoard(dt) {
  const aY = expSmoothing(PIECE_GRAVITY_STIFF, dt);
  const aR = expSmoothing(PIECE_ROTATION_SETTLE, dt);
  piecesBySquare.forEach((group) => {
    if (activeDrag && activeDrag.group === group) return;
    if (group.position.y > PIECE_REST_Y + 0.0005) {
      group.position.y += (PIECE_REST_Y - group.position.y) * aY;
    } else {
      group.position.y = PIECE_REST_Y;
    }
    if (Math.abs(group.rotation.x) > 0.0005 || Math.abs(group.rotation.z) > 0.0005) {
      group.rotation.x *= 1 - aR;
      group.rotation.z *= 1 - aR;
      if (Math.abs(group.rotation.x) < 0.002) group.rotation.x = 0;
      if (Math.abs(group.rotation.z) < 0.002) group.rotation.z = 0;
    }
  });
}

function animate() {
  animId = requestAnimationFrame(animate);
  const dt = clock ? Math.min(clock.getDelta(), 0.05) : 1 / 60;
  stepPickLiftPhysics(dt);
  stepDragPhysics(dt);
  stepPiecesOnBoard(dt);
  syncCameraOrbitOnHumanKing(dt);
  if (orbit) orbit.update();
  if (renderer && scene && camera) renderer.render(scene, camera);
}

function detachPointer() {
  if (!renderer) return;
  const el = renderer.domElement;
  if (boundPointerDown) el.removeEventListener("pointerdown", boundPointerDown);
  if (boundPointerMove) el.removeEventListener("pointermove", boundPointerMove);
  if (boundPointerUp) {
    el.removeEventListener("pointerup", boundPointerUp);
    el.removeEventListener("pointercancel", boundPointerUp);
  }
  boundPointerDown = null;
  boundPointerMove = null;
  boundPointerUp = null;
  pointerAnchor = null;
  dragPointerDown = null;
  activeDrag = null;
  clearPickLiftState();
  if (orbit) orbit.enabled = true;
}

function getActivePlayColor() {
  if (!game) return null;
  if (playMode === "pvp") return colorForClientSeat() || myColor;
  // Waiting for guest (incl. dual-seat self-join) — no local orphan moves.
  if (playMode === "pvp-waiting") return null;
  if (playMode === "practice") {
    const step = currentDrillStep(practiceDrill, practiceStepIndex);
    if (!step || step.auto) return null;
    return step.color;
  }
  return "w";
}

function canHumanInteract() {
  if (opponentViewOnly) return false;
  if (!game || session?.finished || getPvpSendingMove()) return false;
  const activeColor = getActivePlayColor();
  if (!activeColor || game.turn() !== activeColor) return false;
  return true;
}

function legalTargetsFor(square) {
  if (!game || !square) return [];
  let targets = game.moves({ square, verbose: true }).map((m) => m.to);
  if (playMode === "practice") {
    const step = currentDrillStep(practiceDrill, practiceStepIndex);
    if (step && !step.auto && step.from === square) {
      targets = targets.includes(step.to) ? [step.to] : [];
    } else if (step && step.from !== square) {
      targets = [];
    }
  }
  return targets;
}

function selectPieceSquare(square) {
  if (!game) return;
  const activeColor = getActivePlayColor();
  if (!activeColor) return;
  const piece = game.get(square);
  if (!piece || piece.color !== activeColor) {
    clearSelection();
    return;
  }
  dispatchSelectPiece(square, legalTargetsFor(square));
}

/** Select the piece for the coached / hinted next move (when it is the human's turn). */
function syncSelectionToRecommendedMove() {
  if (!game || session?.finished || activeDrag || dragPointerDown) return;
  const activeColor = getActivePlayColor();
  if (!activeColor || game.turn() !== activeColor) return;

  let from = null;
  if (playMode === "practice" && coachRecommendMove?.from) {
    from = coachRecommendMove.from;
  } else if (coachRecommendMove?.from && (lessonMode || beginnerHints)) {
    from = coachRecommendMove.from;
  } else if (beginnerHints && hintMove?.from) {
    from = hintMove.from;
  }
  if (!from) return;

  const piece = game.get(from);
  if (!piece || piece.color !== activeColor) return;
  if (selectedSquare !== from) selectPieceSquare(from);
}

function worldXZToSquare(x, z) {
  const offset = gridOffset();
  const file = Math.round((x + offset) / CELL);
  const rank = Math.round((z + offset) / CELL);
  if (file < 0 || file > 7 || rank < 0 || rank > 7) return null;
  return String.fromCharCode(97 + file) + (rank + 1);
}

function raycastBoardPoint(ev, out) {
  if (!raycaster || !dragPlane) return null;
  updatePointerFromEvent(ev);
  const hit = out || new THREE.Vector3();
  return raycaster.ray.intersectPlane(dragPlane, hit) ? hit : null;
}

function beginActiveDrag(from, pointerId) {
  const group = piecesBySquare.get(from);
  if (!group || !scene) return;
  selectPieceSquare(from);
  applyTileHighlights();
  const pos = group.position;
  const carryLift =
    pickLiftSquare === from ? pickLift : Math.max(0, group.position.y - PIECE_REST_Y);
  pickLiftSquare = null;
  pickLift = 0;
  activeDrag = {
    from,
    group,
    target: new THREE.Vector3(pos.x, PIECE_REST_Y, pos.z),
    head: new THREE.Vector3(pos.x, PIECE_REST_Y, pos.z),
    base: new THREE.Vector3(pos.x, PIECE_REST_Y, pos.z),
    tiltX: group.rotation.x,
    tiltZ: group.rotation.z,
    lift: carryLift,
    pointerId
  };
  group.position.y = PIECE_REST_Y + carryLift;
  if (orbit) orbit.enabled = false;
}

function finishActiveDrag() {
  activeDrag = null;
  dragPointerDown = null;
  if (orbit) orbit.enabled = true;
}

function attemptMove(from, to) {
  if (!game || from === to) return false;
  const activeColor = getActivePlayColor();
  if (!activeColor || game.turn() !== activeColor) return false;
  if (!legalTargetsFor(from).includes(to)) return false;
  const promo =
    game.get(from).type === "p" &&
    ((activeColor === "w" && to.endsWith("8")) || (activeColor === "b" && to.endsWith("1")))
      ? "q"
      : undefined;

  if (playMode === "practice") {
    const step = currentDrillStep(practiceDrill, practiceStepIndex);
    if (!step || step.auto) return false;
    if (!stepMatchesMove(game, step, from, to, promo)) {
      setCoach("Try again — " + step.coach, goldenRuleById(step.ruleId));
      clearSelection();
      renderBoard();
      return false;
    }
    ensureChessSessionForPlay();
    let move;
    try {
      move = game.move({ from, to, promotion: promo });
    } catch (_) {
      clearSelection();
      renderBoard();
      return false;
    }
    clearSelection();
    clearCoachRecommend();
    recordLastMove(from, to);
    syncStoreFenFromGame();
    wtdDispatch(incrementChessHumanMoves());
    wtdDispatch(incrementChessPracticeStep());
    pullChessPlayFromStore();
    renderBoard();
    runAutoDrillSteps();
    if (!session.finished) promptCurrentPracticeStep();
    return true;
  }

  if (playMode === "pvp") {
    const trial = new Chess(game.fen());
    let move;
    try {
      move = trial.move({ from, to, promotion: promo });
    } catch (_) {
      clearSelection();
      renderBoard();
      return false;
    }
    if (!move) {
      clearSelection();
      renderBoard();
      return false;
    }
    clearCoachRecommend();
    submitPvpMove(from, to, promo);
    return true;
  }

  ensureChessSessionForPlay();
  let move;
  try {
    move = game.move({ from, to, promotion: promo });
  } catch (_) {
    clearSelection();
    renderBoard();
    return false;
  }
  clearSelection();
  clearCoachRecommend();
  recordLastMove(from, to);
  syncStoreFenFromGame();
  wtdDispatch(
    incrementChessHumanMoves({
      lessonWhitePly: activeColor === "w" && typeof session?.lessonWhitePly === "number"
    })
  );
  pullChessPlayFromStore();
  renderBoard();
  explainMove(move, "human");
  afterHumanMove();
  return true;
}

function resolveDropSquare(ev, drag) {
  const pt = raycastBoardPoint(ev);
  if (pt) {
    const fromRay = worldXZToSquare(pt.x, pt.z);
    if (fromRay) return fromRay;
  }
  let to = worldXZToSquare(drag.target.x, drag.target.z);
  if (!to || to === drag.from) {
    to = worldXZToSquare(drag.head.x, drag.head.z);
  }
  if (!to || to === drag.from) {
    to = worldXZToSquare(drag.base.x, drag.base.z);
  }
  if (!to || to === drag.from) {
    const picked = pickSquare(ev, { ignoreSquare: drag.from, ignoreGroup: drag.group });
    if (picked) to = picked;
  }
  return to && to !== drag.from ? to : null;
}

function endDragPointer(ev) {
  if (!activeDrag) return;
  const from = activeDrag.from;
  const group = activeDrag.group;
  const to = resolveDropSquare(ev, activeDrag);
  finishActiveDrag();
  try {
    if (renderer && ev.pointerId != null) renderer.domElement.releasePointerCapture(ev.pointerId);
  } catch (_) {
    /* ignore */
  }

  if (to && attemptMove(from, to)) return;
  if (group) {
    group.rotation.set(0, 0, 0);
    const pos = squareToWorld(from, PIECE_REST_Y);
    group.position.copy(pos);
  }
  clearSelection();
  renderBoard();
}

function attachPointer() {
  if (!renderer) return;
  detachPointer();
  const el = renderer.domElement;
  boundPointerDown = (ev) => {
    if (!canHumanInteract()) return;
    pointerAnchor = { x: ev.clientX, y: ev.clientY };
    const sq = pickSquare(ev);
    if (!sq) return;
    const activeColor = getActivePlayColor();
    const piece = game.get(sq);
    if (piece && piece.color === activeColor) {
      if (pickLiftSquare && pickLiftSquare !== sq) resetPickLiftVisual(pickLiftSquare);
      dragPointerDown = { from: sq, pointerId: ev.pointerId, x: ev.clientX, y: ev.clientY };
      pickLiftSquare = sq;
      pickLift = Math.max(0, (piecesBySquare.get(sq)?.position.y ?? PIECE_REST_Y) - PIECE_REST_Y);
      selectPieceSquare(sq);
      applyTileHighlights();
      if (orbit) orbit.enabled = false;
    } else {
      dragPointerDown = null;
      clearPickLiftState();
    }
  };
  boundPointerMove = (ev) => {
    if (activeDrag) {
      if (ev.pointerId !== activeDrag.pointerId) return;
      const pt = raycastBoardPoint(ev, activeDrag.target);
      if (pt) {
        activeDrag.target.x = pt.x;
        activeDrag.target.z = pt.z;
      }
      ev.preventDefault();
      return;
    }
    if (!dragPointerDown || ev.pointerId !== dragPointerDown.pointerId) return;
    const dx = ev.clientX - dragPointerDown.x;
    const dy = ev.clientY - dragPointerDown.y;
    if (dx * dx + dy * dy < DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) return;
    try {
      el.setPointerCapture(ev.pointerId);
    } catch (_) {
      /* ignore */
    }
    beginActiveDrag(dragPointerDown.from, ev.pointerId);
    dragPointerDown = null;
    const pt = raycastBoardPoint(ev, activeDrag.target);
    if (pt) {
      activeDrag.target.x = pt.x;
      activeDrag.target.z = pt.z;
      activeDrag.head.x = pt.x;
      activeDrag.head.z = pt.z;
    }
    ev.preventDefault();
  };
  boundPointerUp = (ev) => {
    if (activeDrag && ev.pointerId === activeDrag.pointerId) {
      endDragPointer(ev);
      pointerAnchor = null;
      return;
    }
    if (!pointerAnchor) return;
    const dx = ev.clientX - pointerAnchor.x;
    const dy = ev.clientY - pointerAnchor.y;
    pointerAnchor = null;
    const pendingFrom = dragPointerDown?.from ?? null;
    dragPointerDown = null;
    if (dx * dx + dy * dy > DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) {
      clearPickLiftState();
      if (orbit) orbit.enabled = true;
      return;
    }
    if (orbit) orbit.enabled = true;
    clearPickLiftState();
    if (pendingFrom) resetPickLiftVisual(pendingFrom);
    const sq = pickSquare(ev);
    if (sq) onSquareClick(sq);
  };
  el.addEventListener("pointerdown", boundPointerDown);
  el.addEventListener("pointermove", boundPointerMove);
  el.addEventListener("pointerup", boundPointerUp);
  el.addEventListener("pointercancel", boundPointerUp);
}

function updatePointerFromEvent(ev) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
}

function pickSquare(ev, opts) {
  if (!raycaster || !scene) return null;
  updatePointerFromEvent(ev);
  const pickables = [];
  tilesBySquare.forEach((t) => pickables.push(t));
  piecesBySquare.forEach((g, sq) => {
    if (opts && opts.ignoreSquare === sq) return;
    if (opts && opts.ignoreGroup === g) return;
    pickables.push(g);
  });
  const hits = raycaster.intersectObjects(pickables, true);
  for (let i = 0; i < hits.length; i++) {
    let o = hits[i].object;
    while (o) {
      if (o.userData && o.userData.square) return o.userData.square;
      if (o.userData && o.userData.pieceRoot) return o.userData.pieceRoot.userData.square;
      o = o.parent;
    }
  }
  return null;
}

function disposeEngine() {
  if (hostResizeObserver) {
    hostResizeObserver.disconnect();
    hostResizeObserver = null;
  }
  if (animId) cancelAnimationFrame(animId);
  animId = null;
  activeDrag = null;
  dragPointerDown = null;
  clearPickLiftState();
  clock = null;
  dragPlane = null;
  detachPointer();
  if (boundResize) {
    window.removeEventListener("resize", boundResize);
    boundResize = null;
  }
  clearTargetRings();
  Array.from(piecesBySquare.keys()).forEach((sq) => removePieceAt(sq));
  piecesBySquare.clear();
  tilesBySquare.clear();
  disposeSharedPieceMaterials();
  disposeEnvironment();
  if (envSphereMesh) {
    disposeEnvironmentSphere(envSphereMesh);
    envSphereMesh = null;
  }
  disposeBackgroundTexture();
  resetBackgroundApplyCache();
  disposeAllBoardThemeTextures();
  boardThemeTextureGen++;
  visualEnvApplyGen++;
  if (renderer) {
    renderer.dispose();
    if (host) host.innerHTML = "";
  }
  renderer = null;
  scene = null;
  camera = null;
  orbit = null;
}

function ensureEngine() {
  if (renderer && scene && camera) return true;
  host = $("wtdChessBoard");
  if (!host) return false;
  host.hidden = false;
  host.removeAttribute("hidden");
  buildScene();
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.86;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  host.appendChild(renderer.domElement);
  watchChessHostResize();
  initEnvironment();
  orbit = new OrbitControls(camera, renderer.domElement);
  chessOrbitFree.bind(orbit);
  pullChessOrbitFromStore();
  applyOrbitPolicyToControls();
  resetCameraForWhiteView();
  clock = new THREE.Clock();
  dragPlane = new THREE.Plane();
  dragPlane.setFromNormalAndCoplanarPoint(
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(0, PIECE_REST_Y, 0)
  );
  boundResize = () => resize();
  window.addEventListener("resize", boundResize);
  resize();
  attachPointer();
  animate();
  return true;
}

function centerControlScore(square, color) {
  const file = square.charCodeAt(0) - 97;
  const rank = parseInt(square[1], 10) - 1;
  const cf = Math.min(file, 7 - file);
  const cr = Math.min(rank, 7 - rank);
  return (3 - cf) * 0.08 + (3 - cr) * 0.06;
}

function evaluateForSide(chess, color) {
  let score = 0;
  const board = chess.board();
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const p = board[r][f];
      if (!p) continue;
      const v = PIECE_VALUE[p.type] || 0;
      const sq = String.fromCharCode(97 + f) + (8 - r);
      const bonus = centerControlScore(sq, p.color);
      if (p.color === color) score += v + bonus;
      else score -= v + bonus;
    }
  }
  if (chess.inCheck()) {
    score += chess.turn() === color ? -0.4 : 0.4;
  }
  return score;
}

function chooseAiMove(chess) {
  const moves = chess.moves({ verbose: true });
  if (!moves.length) return null;
  const aiColor = chess.turn();
  let best = moves[0];
  let bestScore = -Infinity;
  moves.forEach((m, idx) => {
    chess.move(m);
    let score = evaluateForSide(chess, aiColor);
    chess.undo();
    if (m.captured) score += (PIECE_VALUE[m.captured] || 0) * 0.15;
    if (m.san.includes("+")) score += 0.35;
    if (m.flags.includes("k") || m.flags.includes("q")) score += 0.25;
    if (m.piece === "n" || m.piece === "b") {
      const homeRank = aiColor === "w" ? "1" : "8";
      if (m.from.endsWith(homeRank)) score += 0.2;
    }
    score += (idx % 7) * 0.001;
    if (score > bestScore) {
      bestScore = score;
      best = m;
    }
  });
  return best;
}

const ANTI_UNDO_PENALTY = 8;

function lastVerboseMoveForColor(chess, color) {
  const hist = chess.history({ verbose: true });
  for (let i = hist.length - 1; i >= 0; i--) {
    if (hist[i].color === color) return hist[i];
  }
  return null;
}

/** True when candidate undoes the last move of that color (from↔to swapped). */
function isReverseOfMove(candidate, prior) {
  if (!prior) return false;
  return candidate.from === prior.to && candidate.to === prior.from;
}

function scoreHintCandidate(chess, m, lastWhite) {
  chess.move(m);
  let score = evaluateForSide(chess, "w");
  const inCheck = chess.inCheck();
  chess.undo();
  const capturedVal = m.captured ? PIECE_VALUE[m.captured] || 0 : 0;
  const moverVal = PIECE_VALUE[m.piece] || 0;
  if (m.captured) score += capturedVal * 0.22;
  if (m.san.includes("+")) score += 0.35;
  if (m.san.includes("#")) score += 1.2;
  if (m.flags.includes("k") || m.flags.includes("q")) score += 0.28;
  if (m.piece === "n" || m.piece === "b") {
    if (m.from.endsWith("1")) score += 0.25;
  }
  if (m.piece === "p" && ["e4", "d4", "c4", "e5", "d5"].includes(m.to)) score += 0.18;
  if (m.captured && moverVal > capturedVal + 0.5 && !m.san.includes("#")) {
    score -= 2.4;
  }
  if (inCheck && m.piece !== "k") score -= 1.5;
  if (lastWhite && isReverseOfMove(m, lastWhite)) score -= ANTI_UNDO_PENALTY;
  else if (lastWhite && m.from === lastWhite.to && m.piece === lastWhite.piece) score -= 2.5;
  return score;
}

function chooseHintMove(chess) {
  if (chess.turn() !== "w") return null;
  const moves = chess.moves({ verbose: true });
  if (!moves.length) return null;
  const lastWhite = lastVerboseMoveForColor(chess, "w");
  let best = null;
  let bestScore = -Infinity;
  moves.forEach((m) => {
    const score = scoreHintCandidate(chess, m, lastWhite);
    if (score > bestScore) {
      bestScore = score;
      best = m;
    }
  });
  if (!best) return moves[0];
  if (lastWhite && isReverseOfMove(best, lastWhite)) {
    const alt = moves.find((m) => !isReverseOfMove(m, lastWhite));
    if (alt) return alt;
  }
  return best;
}

function clearCoachRecommend() {
  coachRecommendMove = null;
}

function pickCurriculumLessonMoveVerbose() {
  if (!lessonMode || !game || game.turn() !== "w") return null;
  const strategy = activeCurriculumStrategy();
  const ply = session?.lessonWhitePly ?? 0;
  const step = strategyLessonStepAtWhitePly(strategy, ply);
  if (!step) return null;
  const move = findWhiteMove(step.from, step.to, step.san);
  return move ? { move, step } : null;
}

function applyCoachRecommendFromHeuristic() {
  if (!game || session?.finished || game.turn() !== "w") {
    coachRecommendMove = null;
    return null;
  }
  const curriculum = pickCurriculumLessonMoveVerbose();
  if (curriculum) {
    coachRecommendMove = { from: curriculum.move.from, to: curriculum.move.to };
    return coachRecommendMove;
  }
  const best = chooseHintMove(game);
  coachRecommendMove = best ? { from: best.from, to: best.to } : null;
  return coachRecommendMove;
}

function forkFromSquare(chess, square) {
  const caps = chess.moves({ square, verbose: true }).filter((m) => m.captured && PIECE_VALUE[m.captured] >= 3);
  return caps.length >= 2;
}

function templateCoachForMove(chess, move, actor) {
  const tips = [];
  const you = actor === "human" ? "You" : "I";
  if (move.captured) {
    tips.push(
      `${you} captured a ${pieceName(move.captured)} — always ask: "What can take me back?" before celebrating.`
    );
  }
  if (move.san.includes("#")) {
    tips.push("Checkmate ends the game — the king has no legal escape.");
    return tips.join(" ");
  }
  if (move.san.includes("+")) {
    tips.push("Check limits the king — reply with block, capture, or a safe king move.");
  }
  if (move.flags.includes("k") || move.flags.includes("q")) {
    tips.push("Castling tucks the king away and connects your rooks — a classic opening goal.");
  }
  if ((move.piece === "n" || move.piece === "b") && move.from.endsWith("1") && actor === "human") {
    tips.push("Developing knights and bishops toward the center helps control the board early.");
  }
  if (forkFromSquare(chess, move.to)) {
    tips.push("That move forks two targets — one defender often cannot cover both.");
  }
  const piece = chess.get(move.to);
  if (piece) {
    const attacker = piece.color === "w" ? "b" : "w";
    if (chess.isAttacked(move.to, attacker)) {
      tips.push("That piece may be hanging — scan for loose pieces before moving again.");
    }
  }
  if (["e4", "d4", "e5", "d5"].includes(move.to) && move.piece === "p") {
    tips.push("Pawns on central squares fight for space — control the center when you can.");
  }
  if (!tips.length) {
    if (actor === "ai") {
      tips.push("I'm improving piece activity and king safety — look at your weakest square.");
    } else {
      tips.push("Solid move — keep developing, protect the king, and watch for tactics.");
    }
  }
  return tips.slice(0, 2).join(" ");
}

function normalizeSquare(sq) {
  if (typeof sq !== "string" || sq.length !== 2) return null;
  const file = sq[0].toLowerCase();
  const rank = sq[1];
  if (file < "a" || file > "h" || rank < "1" || rank > "8") return null;
  return file + rank;
}

function findWhiteMove(from, to, san) {
  if (!game || game.turn() !== "w") return null;
  const moves = game.moves({ verbose: true });
  const f = normalizeSquare(from);
  const t = normalizeSquare(to);
  if (f && t) {
    const hit = moves.find((m) => m.from === f && m.to === t);
    if (hit) return hit;
  }
  if (typeof san === "string" && san.trim()) {
    const clean = san.trim();
    return (
      moves.find((m) => m.san === clean) ||
      moves.find((m) => m.san.replace(/[+#]$/, "") === clean.replace(/[+#]$/, "")) ||
      null
    );
  }
  return null;
}

function templateNextWhiteMoveTip(chess, move) {
  if (!move) {
    return "Develop knights toward the center, castle early, and don't leave your queen undefended.";
  }
  const parts = [`Try ${move.san} — a solid next step for White.`];
  if (move.captured) {
    parts.push(`It wins the ${pieceName(move.captured)} — still check what can take you back.`);
  } else if (move.san.includes("+")) {
    parts.push("Check keeps pressure — follow up by improving your pieces.");
  } else if (move.from.endsWith("1") && (move.piece === "n" || move.piece === "b")) {
    parts.push("Developing toward the center opens more squares for your army.");
  } else if (["e4", "d4", "c4"].includes(move.to) && move.piece === "p") {
    parts.push("Central pawns fight for space and help your pieces jump into the game.");
  } else {
    parts.push("Look for loose enemy pieces and keep your king safe while you improve.");
  }
  return parts.slice(0, 2).join(" ");
}

function applyRecommendFromPayload(data) {
  const parsed = findWhiteMove(data.from, data.to, data.san);
  if (parsed) {
    coachRecommendMove = { from: parsed.from, to: parsed.to };
    return true;
  }
  return false;
}

async function maybeCloudCoach(payload, fallback, goldenRule = null) {
  const gen = ++coachRequestGen;
  setCoach(fallback, goldenRule);
  if (!useCloudCoach || coachBusy) return;
  coachBusy = true;
  try {
    const res = await fetch(COACH_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...payload,
        ...goldenPayloadFields(goldenRule, activeCurriculumStrategy())
      }),
      signal: AbortSignal.timeout(9000)
    });
    if (gen !== coachRequestGen || session?.finished || !game || game.isGameOver()) return;
    if (!res.ok) return;
    const data = await res.json();
    if (gen !== coachRequestGen || session?.finished || !game || game.isGameOver()) return;
    if (typeof data.tip === "string" && data.tip.trim()) {
      setCoach(data.tip.trim().slice(0, 420), goldenRule);
    }
    if (payload.intent === "next_white") {
      const scripted = lessonMode && pickCurriculumLessonMoveVerbose();
      if (!scripted && applyRecommendFromPayload(data)) {
        renderBoard();
      }
    }
  } catch (_) {
    /* offline */
  } finally {
    if (gen === coachRequestGen) coachBusy = false;
  }
}

function autoTutorForNextWhiteMove(opponentMove) {
  if (!game || session?.finished || game.isGameOver() || game.turn() !== "w") return;
  applyCoachRecommendFromHeuristic();
  const curriculum = pickCurriculumLessonMoveVerbose();
  const heuristic = coachRecommendMove
    ? findWhiteMove(coachRecommendMove.from, coachRecommendMove.to, null)
    : null;
  const goldenRule = lessonMode
    ? pickLessonGoldenRule(game, { move: opponentMove, actor: "ai", intent: "next_white" })
    : null;
  let fallback =
    curriculum?.step?.tip && heuristic
      ? curriculum.step.tip
      : templateNextWhiteMoveTip(game, heuristic);
  if (goldenRule && !curriculum?.step?.tip) fallback = formatCoachWithRule(fallback, goldenRule);
  else if (goldenRule && curriculum?.step?.tip) {
    fallback = formatCoachWithRule(curriculum.step.tip, goldenRule);
  }
  renderBoard();
  maybeCloudCoach(
    {
      fen: game.fen(),
      intent: "next_white",
      san: opponentMove?.san || "",
      actor: "ai",
      beginner: beginnerHints
    },
    fallback,
    goldenRule
  );
}

function explainMove(move, actor) {
  const goldenRule = lessonMode
    ? pickLessonGoldenRule(game, { move, actor, intent: "move" })
    : null;
  let fallback = templateCoachForMove(game, move, actor);
  if (goldenRule) fallback = formatCoachWithRule(fallback, goldenRule);
  maybeCloudCoach(
    {
      fen: game.fen(),
      san: move.san,
      actor,
      beginner: beginnerHints
    },
    fallback,
    goldenRule
  );
}

function updateStatusBar() {
  const turnEl = $("wtdChessTurn");
  const stateEl = $("wtdChessState");
  const timerEl = $("wtdChessTimer");
  if (!game || !session) return;
  if (turnEl) {
    if (session.finished || game.isGameOver()) {
      if (session.resigned) turnEl.textContent = "Resigned";
      else if (game.isCheckmate()) {
        turnEl.textContent =
          game.turn() === "w" ? "Checkmate — you lost" : "Checkmate — you win!";
      } else if (game.isStalemate()) turnEl.textContent = "Stalemate — draw";
      else if (game.isDraw()) turnEl.textContent = "Draw";
      else turnEl.textContent = "Game over";
    } else if (playMode === "practice") {
      if (session.finished) turnEl.textContent = "Drill complete";
      else {
        const step = practiceDrill ? currentDrillStep(practiceDrill, practiceStepIndex) : null;
        turnEl.textContent =
          step && !step.auto && game.turn() === step.color
            ? "Chess 101 — play the highlighted move"
            : "Chess 101 — watch the idea";
      }
    } else if (playMode === "pvp") {
      turnEl.textContent =
        game.turn() === myColor ? "Your turn" : "Opponent's turn…";
    } else {
      turnEl.textContent = game.turn() === "w" ? "Your turn (White)" : "Coach thinking…";
    }
  }
  if (stateEl) {
    if (playMode === "practice" && !session.finished) stateEl.textContent = "Practice";
    else if (game.isCheckmate()) stateEl.textContent = game.turn() === "w" ? "Checkmate — you lost" : "Checkmate — you win!";
    else if (game.isStalemate()) stateEl.textContent = "Stalemate — draw";
    else if (game.isDraw()) stateEl.textContent = "Draw";
    else if (game.inCheck()) stateEl.textContent = "Check!";
    else stateEl.textContent = "In play";
  }
  if (timerEl && session.startedAt) {
    timerEl.textContent = formatTimer(performance.now() - session.startedAt);
  }
}

function renderBoard() {
  if (!game) return;
  if (ensureEngine()) {
    syncPiecesFromGame();
    syncSelectionToRecommendedMove();
    // Keep uploaded square/piece maps in sync even if this runs before theme reload finishes.
    applyBoardThemeVisualsSync({ rebuildPieces: false });
    applyTileHighlights();
    resize();
  }
  updateStatusBar();
}

function clearSelection() {
  dispatchClearSelection();
}

function recordLastMove(from, to) {
  dispatchRecordLastMove(from, to);
}

function onSquareClick(square) {
  if (!canHumanInteract()) return;
  const activeColor = getActivePlayColor();
  const piece = game.get(square);
  if (selectedSquare && legalTargets.includes(square)) {
    attemptMove(selectedSquare, square);
    return;
  }
  if (piece && piece.color === activeColor) {
    selectPieceSquare(square);
    renderBoard();
    return;
  }
  clearSelection();
  renderBoard();
}

function refreshHint() {
  const hintColor = playMode === "pvp" ? myColor : "w";
  if (!beginnerHints || !game || game.turn() !== hintColor) {
    hintMove = null;
    return;
  }
  if (coachRecommendMove) {
    hintMove = null;
    return;
  }
  hintMove = chooseHintMove(game);
}

function afterHumanMove() {
  refreshHint();
  renderBoard();
  if (game.isGameOver()) {
    finishGame();
    return;
  }
  if (playMode === "pvp") return;
  if (aiTurnTimer) clearTimeout(aiTurnTimer);
  aiTurnTimer = window.setTimeout(() => {
    aiTurnTimer = null;
    runAiTurn();
  }, 450);
}

function runAiTurn() {
  if (!game || session?.finished || playMode !== "ai") return;
  if (game.turn() !== "b") return;
  const move = chooseAiMove(game);
  if (!move) {
    finishGame();
    return;
  }
  game.move(move);
  recordLastMove(move.from, move.to);
  syncStoreFenFromGame();
  wtdDispatch(incrementChessAiMoves());
  pullChessPlayFromStore();
  renderBoard();
  if (game.isGameOver()) {
    finishGame();
    return;
  }
  autoTutorForNextWhiteMove(move);
  refreshHint();
}

async function finishGame() {
  ensureChessSessionForPlay();
  if (!session || session.finished) return;
  clearPendingCoachWork();
  wtdDispatch(patchChessSession({ finished: true }));
  pullChessPlayFromStore();
  updateStatusBar();
  const elapsed = Math.max(400, Math.round(performance.now() - session.startedAt));
  let accuracy = 55;
  if (session.resigned) accuracy = 38;
  else if (game.isCheckmate()) {
    accuracy = game.turn() === "b" ? 100 : 35;
  } else if (game.isStalemate() || game.isDraw()) {
    accuracy = 72;
  }
  const entry = {
    levelId: LEVEL_ID,
    timeMs: elapsed,
    accuracyPct: accuracy,
    points: undefined
  };
  if (window.AppgenWtd && typeof window.AppgenWtd.submitRun === "function") {
    await window.AppgenWtd.submitRun(entry);
  }
  let outcome = "Draw — solid fight.";
  if (session.resigned) outcome = "You resigned — keep practicing development and king safety.";
  else if (game.isCheckmate() && game.turn() === "b") outcome = "You won — nice tactics!";
  else if (game.isCheckmate()) outcome = "Coach wins — review hanging pieces and king safety.";
  else if (game.isStalemate() || game.isDraw()) outcome = "Draw — solid fight.";
  if (
    curriculumFocusStrategyId &&
    game.isCheckmate() &&
    game.turn() === "b" &&
    !session.resigned
  ) {
    markStrategyComplete(curriculumFocusStrategyId);
    renderLessonList();
  }
  openChessGameOver(outcome, elapsed);
  setControls(gameOverDockHtml());
  const next = resolveNextLesson();
  setCoach(
    "Game over — " +
      outcome +
      " Dragon Points submitted to the chess leaderboard." +
      (next ? " Next up: " + next.label + "." : " Fast-track curriculum complete — review drills anytime.")
  );
}

function askCoach() {
  if (!game || session?.finished) return;
  clearCoachRecommend();
  if (game.turn() === "w") {
    const lastBlack = lastVerboseMoveForColor(game, "b");
    autoTutorForNextWhiteMove(lastBlack || null);
    refreshHint();
    return;
  }
  const moves = game.history({ verbose: true });
  const last = moves[moves.length - 1];
  if (last) {
    explainMove(last, last.color === "w" ? "human" : "ai");
    return;
  }
  setCoach("Develop knights toward the center, castle early, and don't leave your queen undefended.");
}

function applyPlayPreferenceFromToggle(target) {
  if (!target || !("id" in target)) return false;
  if (target.id === "wtdChessHintToggle") {
    setBeginnerHintsEnabled(target.checked);
    refreshHint();
    if (game) renderBoard();
    return true;
  }
  if (target.id === "wtdChessLessonToggle") {
    lessonMode = target.checked;
    setLessonModeEnabled(lessonMode);
    renderGoldenRuleCard(lessonMode ? activeGoldenRule : null);
    renderLessonList();
    return true;
  }
  return false;
}

function bindControls() {
  const coachBtn = $("wtdChessAskCoach");
  if (coachBtn) {
    coachBtn.addEventListener("click", () => askCoach());
  }
  const resign = $("wtdChessResign");
  if (resign) {
    resign.addEventListener("click", () => {
      if (!game || session?.finished) return;
      if (playMode === "pvp") {
        wtdDispatch(patchChessSession({ resigned: true }));
        pullChessPlayFromStore();
        resignPvp().then(() => {
          const inv = getPvpInvite();
          if (inv) finishPvpGame(inv);
        });
        return;
      }
      wtdDispatch(patchChessSession({ resigned: true }));
      pullChessPlayFromStore();
      setCoach("You resigned — saving the lesson run anyway. Tip: when losing material, trade into a simpler endgame.");
      finishGame();
    });
  }
}

async function finishPvpGame(inv) {
  if (session?.finished) return;
  clearPendingCoachWork();
  wtdDispatch(patchChessSession({ finished: true }));
  pullChessPlayFromStore();
  stopPvpPoll();
  updateStatusBar();
  const elapsed = Math.max(400, Math.round(performance.now() - session.startedAt));
  let outcome = "Game over.";
  if (session.resigned || inv.resignedBy) {
    outcome =
      inv.outcome === "white_wins"
        ? myColor === "w"
          ? "You win — opponent resigned."
          : "You resigned."
        : myColor === "b"
          ? "You win — opponent resigned."
          : "You resigned.";
  } else if (inv.outcome === "white_wins") {
    outcome = myColor === "w" ? "You win — checkmate!" : "Checkmate — you lost.";
  } else if (inv.outcome === "black_wins") {
    outcome = myColor === "b" ? "You win — checkmate!" : "Checkmate — you lost.";
  } else if (inv.outcome === "draw") {
    outcome = "Draw — well played.";
  }
  const entry = {
    levelId: LEVEL_ID,
    timeMs: elapsed,
    accuracyPct: inv.outcome === "draw" ? 72 : 80,
    points: undefined
  };
  if (window.AppgenWtd && typeof window.AppgenWtd.submitRun === "function") {
    await window.AppgenWtd.submitRun(entry);
  }
  openChessGameOver(outcome, elapsed);
  setControls(pvpGameOverDockHtml());
  setCoach("Friend game complete — Dragon Points submitted to the chess leaderboard.");
  setPlayModeInStore("ai");
  clearPvpMultiplayer();
  try {
    sessionStorage.removeItem(PENDING_INVITE_KEY);
  } catch (_) {
    /* ignore */
  }
}

function resetGameState() {
  stopPvpPoll();
  clearPvpMultiplayer();
  wtdDispatch(resetChessGame());
  wtdDispatch(clearChessPractice());
  wtdDispatch(
    startNewChessSession({ startedAt: performance.now(), lessonWhitePly: 0 })
  );
  wtdDispatch(clearChessLastMove());
  pullChessPlayFromStore();
  game = new Chess();
  syncStoreFenFromGame();
  clearCoachRecommend();
  clearSelection();
  refreshHint();
}

function openSessionModal() {
  playEl = $("wtdChessPlay");
  if (playEl) {
    playEl.hidden = false;
    playEl.removeAttribute("hidden");
    playEl.classList.add("wtd-3d-light");
  }
  if (isMobileChessLab()) {
    syncMobileChessLabChrome();
    notifyChessLayoutResize();
    return;
  }
  if (window.AppgenWtdSessionModal) {
    window.AppgenWtdSessionModal.open({
      title: "Chess tutor",
      layout: "chess",
      nodeIds: ["wtdChessPlay"],
      onRestart: () => startSession(),
      onExit: () => showIntro()
    });
  }
}

function startSession(focusStrategyId = null) {
  closeChessGameOver();
  const leavingPractice = playMode === "practice";
  const strategy = focusStrategyId ? getStrategyById(focusStrategyId) : null;
  setCurriculumFocusInStore(strategy ? strategy.id : null, strategy?.ruleId || null);
  openSessionModal();
  hudEl = $("wtdChessHud");
  controlsEl = $("wtdChessControls");
  const panel101 = $("wtdChess101Panel");
  if (panel101) panel101.hidden = true;
  resetGameState();
  if (strategy?.startFen && game) {
    try {
      game.load(strategy.startFen);
      syncStoreFenFromGame();
    } catch (_) {
      game = new Chess();
      syncStoreFenFromGame();
    }
  }
  if (leavingPractice) clearAllPieceMeshes();
  setHud(
    '<h3>Chess tutor · you vs coach</h3>' +
      '<p class="wtd-3d-metric">Turn: <span id="wtdChessTurn">Your turn (White)</span> · ' +
      'State: <span id="wtdChessState">In play</span> · ' +
      'Time: <span id="wtdChessTimer">0.0s</span></p>' +
      '<p class="wtd-3d-metric">Drag empty space to orbit around your king (zoom &amp; swivel) · drag a piece to move (or click piece, then square).</p>'
  );
  setControls(coachSessionControlsHtml());
  bindControls();
  renderLessonList();
  const coachCard = strategy
    ? pickLessonGoldenRule(game, { intent: "next_white" })
    : lessonMode
      ? GOLDEN_RULES[0]
      : null;
  setCoach(
    strategy
      ? "You're White — focus on \"" + strategy.title + '". ' + strategy.summary
      : "You're White — follow the winning-strategies path in the sidebar, or play a free practice game.",
    lessonMode ? coachCard : null
  );
  autoTutorForNextWhiteMove(null);
  renderBoard();
  resetCameraForWhiteView();
}

function showIntro() {
  closeChessGameOver();
  closeChessSessionModal();
  stopPvpPoll();
  opponentViewOnly = false;
  opponentTabBoundToken = "";
  // Do not wipe seat lock while a hash join is in flight (init → showIntro race).
  if (!joinInviteInFlight) clearLockedPvpSeat();
  clearPvpMultiplayer();
  playEl = $("wtdChessPlay");
  hudEl = $("wtdChessHud");
  controlsEl = $("wtdChessControls");
  wtdDispatch(setChessPlayMode("ai"));
  wtdDispatch(clearChessPractice());
  wtdDispatch(clearChessActiveSession());
  pullChessPlayFromStore();
  applyCurriculumFocusFromNextLesson();
  if (playEl) {
    playEl.hidden = false;
    playEl.removeAttribute("hidden");
  }
  const panel101 = $("wtdChess101Panel");
  syncMobileChessLabChrome();
  if (isMobileChessLab()) {
    if (panel101) panel101.hidden = true;
    if (hudEl) {
      hudEl.innerHTML = "";
      hudEl.hidden = true;
    }
    if (!game) game = new Chess();
    setControls(introControlsHtml());
    renderLessonList();
    const next = resolveNextLesson();
    setCoach(
      next
        ? "Ready — tap Start chess game or Next in the strip above."
        : "Ready when you are — start a game vs coach."
    );
    applyChessVisualEnvironment();
    if (ensureEngine()) {
      renderBoard();
      resetCameraForWhiteView();
    }
    notifyChessLayoutResize();
    return;
  }
  if (panel101) panel101.hidden = false;
  if (hudEl) hudEl.hidden = false;
  setHud(
    "<h3>Chess tutor</h3>" +
      "<p>Play a friendly game on a <strong>3D board</strong> against a teaching coach, or drill <strong>Chess 101</strong> patterns below.</p>" +
      '<p class="wtd-3d-metric">Finish a full game (win, loss, or draw) to earn Dragon Points on the <code>chess</code> leaderboard.</p>'
  );
  setControls(introControlsHtml());
  render101DrillList();
  renderLessonList();
  const next = resolveNextLesson();
  setCoach(
    next
      ? "Ready — press Continue for " + next.label + ", pick any winning strategy below, or start a free game vs coach."
      : "Ready when you are — all strategies complete; replay any lesson below or play vs coach."
  );
  applyChessVisualEnvironment();
  if (!game) game = new Chess();
  if (ensureEngine()) {
    renderBoard();
    resetCameraForWhiteView();
  }
  notifyChessLayoutResize();
}

function init() {
  lessonMode = isLessonModeEnabled();
  hydrateChessEnvPrefsFromStorage();
  playEl = $("wtdChessPlay");
  hudEl = $("wtdChessHud");
  controlsEl = $("wtdChessControls");
  if (!document.documentElement.dataset.wtdChessDelegated) {
    document.documentElement.dataset.wtdChessDelegated = "1";
    document.addEventListener("click", (e) => {
      const drillBtn = e.target.closest(".wtd-chess-101-card[data-drill-id]");
      if (drillBtn) {
        e.preventDefault();
        startPracticeDrill(drillBtn.getAttribute("data-drill-id"));
        return;
      }
      const lessonBtn = e.target.closest(".wtd-chess-lesson-item[data-strategy-id]");
      if (lessonBtn) {
        e.preventDefault();
        const sid = lessonBtn.getAttribute("data-strategy-id");
        if (sid) {
          const strat = getStrategyById(sid);
          setCurriculumFocusInStore(sid, strat?.ruleId || null);
        }
        startStrategyLesson(sid);
        return;
      }
      if (e.target.closest("#wtdChessCoachAsideToggle")) {
        e.preventDefault();
        setCoachAsideOpen(!coachAsideOpen);
        return;
      }
      if (e.target.closest("#wtdChessCoachAsideClose")) {
        e.preventDefault();
        setCoachAsideOpen(false);
        return;
      }
      if (e.target.closest("#wtdChessOpenEnvModal")) {
        e.preventDefault();
        openChessEnvModal();
        return;
      }
      if (e.target.closest("#wtdChessEnvModalApply")) {
        e.preventDefault();
        commitChessEnvModal();
        return;
      }
      if (e.target.closest("#wtdChessEnvExport")) {
        e.preventDefault();
        exportChessEnvSettings();
        return;
      }
      if (e.target.closest("#wtdChessEnvImport")) {
        e.preventDefault();
        const input = $("wtdChessEnvImportFile");
        if (input) input.click();
        return;
      }
      if (e.target.closest("[data-wtd-chess-env-close]")) {
        e.preventDefault();
        closeChessEnvModal();
        return;
      }
      const bgBtn = e.target.closest("[data-wtd-chess-bg]");
      if (bgBtn) {
        e.preventDefault();
        applyBackgroundChoice(bgBtn.getAttribute("data-wtd-chess-bg"));
        return;
      }
      const themeClearBtn = e.target.closest("[data-theme-clear]");
      if (themeClearBtn) {
        e.preventDefault();
        const key = themeClearBtn.getAttribute("data-theme-clear");
        if (
          key === "squareLightImage" ||
          key === "squareDarkImage" ||
          key === "pieceWhiteImage" ||
          key === "pieceBlackImage"
        ) {
          clearBoardThemeImage(key);
        }
        return;
      }
      if (e.target.closest("#wtdChessMobileStepToggle")) {
        e.preventDefault();
        setMobileStepExpanded(!mobileStepExpanded);
        return;
      }
      if (e.target.closest("#wtdChessExitPractice, #wtdChess101More")) {
        e.preventDefault();
        if (window.AppgenWtdSessionModal) window.AppgenWtdSessionModal.close(true);
        showIntro();
        return;
      }
      const nextLessonBtn = e.target.closest(".wtd-chess-next-lesson-btn");
      if (nextLessonBtn) {
        e.preventDefault();
        if (
          nextLessonBtn.getAttribute("data-advance-practice") === "1" &&
          playMode === "practice" &&
          practiceDrill
        ) {
          if (practiceDrill.id) mark101DrillComplete(practiceDrill.id);
          if (practiceDrill.strategyId) markStrategyComplete(practiceDrill.strategyId);
          renderLessonList();
          render101DrillList();
        }
        startNextLesson(
          nextLessonBtn.getAttribute("data-next-kind"),
          nextLessonBtn.getAttribute("data-next-id")
        );
        return;
      }
      if (e.target.closest("#wtdChessStart, #wtdChessAgain")) {
        e.preventDefault();
        startSession();
      }
      if (e.target.closest("#wtdChessInvite")) {
        e.preventDefault();
        createInviteLobby();
      }
      if (e.target.closest("#wtdChessOpenInviteLink")) {
        e.preventDefault();
        openOpponentInviteWindow();
      }
      if (e.target.closest("#wtdChessCopyInvite")) {
        e.preventDefault();
        copyInviteLink();
      }
      if (e.target.closest("#wtdChessCancelInvite")) {
        e.preventDefault();
        cancelInviteLobby();
      }
      if (e.target.closest("#wtdChessExitResults")) {
        e.preventDefault();
        if (window.AppgenWtdSessionModal) window.AppgenWtdSessionModal.close(true);
        showIntro();
      }
    });
    document.addEventListener("input", (e) => {
      if (!envModalOpen) return;
      handleEnvSettingsLiveInput(e.target, { live: true });
    });
    document.addEventListener("change", (e) => {
      if (applyPlayPreferenceFromToggle(e.target)) return;
      if (envModalOpen) handleEnvSettingsLiveInput(e.target);
      if (e.target.id === "wtdChessBgUpload" && e.target.files && e.target.files[0]) {
        readImageFileAsDataUrl(e.target.files[0])
          .then((url) => applyBackgroundChoice("image", { imageDataUrl: url }))
          .catch(() => setCoach("Could not use that image — try a smaller JPG or PNG."));
      }
      const themeUploadKey = e.target.getAttribute && e.target.getAttribute("data-theme-upload");
      if (themeUploadKey && e.target.files && e.target.files[0]) {
        readImageFileAsDataUrl(e.target.files[0])
          .then((url) => {
            if (
              themeUploadKey === "squareLightImage" ||
              themeUploadKey === "squareDarkImage" ||
              themeUploadKey === "pieceWhiteImage" ||
              themeUploadKey === "pieceBlackImage"
            ) {
              applyBoardThemeImageChoice(themeUploadKey, url);
            }
          })
          .catch(() => setCoach("Could not use that image — try a smaller JPG or PNG (max 2MB)."));
      }
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && envModalOpen) closeChessEnvModal();
    });
    document.addEventListener("change", (e) => {
      if (e.target && e.target.id === "wtdChessEnvImportFile" && e.target.files && e.target.files[0]) {
        importChessEnvSettingsFile(e.target.files[0]);
        e.target.value = "";
      }
    });
    window.addEventListener("appgen-access-change", () => {
      ensureChessCloudSync().catch(() => {});
    });
    if (!window.__wtdChessMobileMqBound) {
      window.__wtdChessMobileMqBound = true;
      MOBILE_CHESS_LAB_MQ.addEventListener("change", () => {
        syncMobileChessLabChrome();
        notifyChessLayoutResize();
      });
    }
  }
  ensureChessCloudSync().catch(() => {});
  // Always paint intro + mount Three.js. Skipping showIntro when chessInvite /
  // sessionStorage pending left #wtdChessControls empty and #wtdChessBoard blank.
  // Invite join (maybeOpenChessInviteFromHash) overlays after init.
  if (!chessHashParams().has("chessInvite")) {
    try {
      sessionStorage.removeItem(PENDING_INVITE_KEY);
    } catch (_) {
      /* ignore */
    }
  }
  showIntro();
}

function onClose() {
  opponentViewOnly = false;
  opponentTabBoundToken = "";
  joinInviteInFlight = null;
  clearLockedPvpSeat();
  stopPvpPoll();
  if (window.AppgenWtdSessionModal) window.AppgenWtdSessionModal.close(true);
  disposeEngine();
  game = null;
  wtdDispatch(resetChessGame());
  wtdDispatch(resetChessSessionSlice());
  pullChessPlayFromStore();
  clearPvpMultiplayer();
}

window.AppgenWtdChess = {
  init,
  onClose,
  dispose: onClose,
  joinInviteFromHash,
  consumePendingInvite,
  openOpponentInviteWindow,
  stopForAdminKill,
  clearActiveChessInviteSession
};
