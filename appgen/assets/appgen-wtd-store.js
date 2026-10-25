/**
 * WTD Redux store (M1) — SSoT for shell mode, chess play session/game, PvP/env, SNL lobby.
 * Three.js scene/meshes, chess.js instance, coach streaming stay module-local; FEN mirrors game.
 */
import { configureStore, createSlice } from "@reduxjs/toolkit";
import { DEFAULT_SCENE_BG } from "./appgen-wtd-chess-scene-bg.js";
import { DEFAULT_BOARD_THEME } from "./appgen-wtd-chess-board-theme.js";
import { DEFAULT_LIGHT_INTENSITY } from "./appgen-wtd-chess-scene-light.js";

const CHESS_START_FEN =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

/** Plain copy — assigning Immer-frozen store objects back into state causes Immer stack overflow. */
function cloneStoreSnapshot(value) {
  if (value == null || typeof value !== "object") return value;
  try {
    if (typeof structuredClone === "function") return structuredClone(value);
  } catch (_) {
    /* fall through */
  }
  return JSON.parse(JSON.stringify(value));
}

/** @typedef {"2d" | "3d" | "chess" | "snl"} WtdShellMode */
/** @typedef {"ai" | "pvp" | "pvp-waiting" | "practice"} ChessPlayMode */

const WTD_SHELL_MODES = Object.freeze(["2d", "3d", "chess", "snl"]);

/**
 * @param {unknown} mode
 * @returns {WtdShellMode}
 */
export function normalizeWtdMode(mode) {
  if (mode === "3d" || mode === "chess" || mode === "snl") {
    return mode;
  }
  return "2d";
}

/**
 * Map hash base (no leading #, no query) → shell mode.
 * Legacy `#wtd` counts as chess (same as appgenIsChessRouteHash).
 * `#cognitive-training` / `#training` / `#cognitive` → 3D spatial trainer
 * (auto-starts session via AppgenWtd3d.init).
 * @param {string} hashBase
 * @returns {WtdShellMode | null} null when hash is not a lab route
 */
export function wtdModeFromHashBase(hashBase) {
  const base = String(hashBase || "")
    .replace(/^#/, "")
    .split("?")[0];
  if (base === "snakes-ladders" || base === "snakes&ladders") return "snl";
  if (base === "chess" || base === "wtd") return "chess";
  if (
    base === "cognitive-training" ||
    base === "training" ||
    base === "cognitive"
  ) {
    return "3d";
  }
  return null;
}

const wtdShellSlice = createSlice({
  name: "wtdShell",
  initialState: {
    /** @type {WtdShellMode} */
    mode: "2d",
    /** @type {WtdShellMode | null} */
    previousMode: null,
    /** Increments on every set so same-mode re-entry still notifies subscribers */
    modeChangeSeq: 0,
    /** Last hash base used for hydrate (debug / DevTools) */
    hashBase: ""
  },
  reducers: {
    setWtdMode(state, action) {
      const next = normalizeWtdMode(action.payload);
      state.previousMode = state.mode;
      state.mode = next;
      state.modeChangeSeq += 1;
    },
    /**
     * Apply mode from URL hash when it is a lab route; no-op otherwise.
     * Payload: hash base (e.g. "chess", "snakes-ladders", "cognitive-training", "wtd").
     */
    hydrateModeFromHash(state, action) {
      const base = String(action.payload || "")
        .replace(/^#/, "")
        .split("?")[0];
      state.hashBase = base;
      const fromHash = wtdModeFromHashBase(base);
      if (!fromHash) return;
      if (fromHash === state.mode) {
        state.modeChangeSeq += 1;
        return;
      }
      state.previousMode = state.mode;
      state.mode = fromHash;
      state.modeChangeSeq += 1;
    }
  }
});

/**
 * Chess PvP invite mirror (M1 slice 2). Server invite JSON is authoritative;
 * client ignores snapshots with revision &lt; lastSyncedRevision (CAS).
 */
const chessMultiplayerSlice = createSlice({
  name: "chessMultiplayer",
  initialState: {
    /** @type {object | null} */
    pvpInvite: null,
    /** Monotonic invite revision last applied; -1 = none */
    lastSyncedRevision: -1,
    /** True while a move POST is in flight */
    pvpSendingMove: false
  },
  reducers: {
    /**
     * Mirror a server invite snapshot. Ignores stale revisions
     * (same rule as syncBoardFromInvite / GAMEROOM_REVISION_CAS).
     */
    applyServerInviteSnapshot(state, action) {
      const inv = action.payload;
      if (!inv || typeof inv !== "object" || !inv.token) return;
      const rev =
        typeof inv.revision === "number"
          ? inv.revision
          : Array.isArray(inv.moves)
            ? inv.moves.length
            : 0;
      if (state.lastSyncedRevision >= 0 && rev < state.lastSyncedRevision) {
        return;
      }
      state.pvpInvite = cloneStoreSnapshot(inv);
      state.lastSyncedRevision =
        typeof inv.revision === "number" ? inv.revision : rev;
    },
    /** Clear invite + revision + sending flag (leave / finish / reset). */
    clearChessMultiplayer(state) {
      state.pvpInvite = null;
      state.lastSyncedRevision = -1;
      state.pvpSendingMove = false;
    },
    /** Reset revision watermark before join/create hydrate (keep invite until snapshot). */
    resetSyncedRevision(state) {
      state.lastSyncedRevision = -1;
    },
    setPvpSendingMove(state, action) {
      state.pvpSendingMove = Boolean(action.payload);
    }
  }
});

/**
 * Chess environment prefs (M1 slice 3) — cloud/settings-shaped studio bundle.
 * Matches chess-settings payload: background, boardTheme, sceneLight (+ UI drafts).
 */
const chessEnvSlice = createSlice({
  name: "chessEnv",
  initialState: {
    /** @type {import("./appgen-wtd-chess-scene-bg.js").SceneBgPrefs} */
    background: { ...DEFAULT_SCENE_BG },
    /** @type {import("./appgen-wtd-chess-board-theme.js").BoardThemePrefs} */
    boardTheme: { ...DEFAULT_BOARD_THEME },
    /** @type {import("./appgen-wtd-chess-scene-light.js").SceneLightPrefs} */
    sceneLight: { intensity: DEFAULT_LIGHT_INTENSITY },
    /** @type {import("./appgen-wtd-chess-scene-bg.js").SceneBgPrefs | null} */
    draftBackground: null,
    /** @type {import("./appgen-wtd-chess-board-theme.js").BoardThemePrefs | null} */
    draftBoardTheme: null,
    /** @type {import("./appgen-wtd-chess-scene-light.js").SceneLightPrefs | null} */
    draftSceneLight: null,
    envModalOpen: false
  },
  reducers: {
    /**
     * Replace committed prefs (from localStorage / cloud). Optionally refresh drafts
     * when the env modal is open (import / cloud pull while editing).
     */
    hydrateChessEnv(state, action) {
      const p = action.payload || {};
      if (p.background && typeof p.background === "object") {
        state.background = p.background;
      }
      if (p.boardTheme && typeof p.boardTheme === "object") {
        state.boardTheme = p.boardTheme;
      }
      if (p.sceneLight && typeof p.sceneLight === "object") {
        state.sceneLight = p.sceneLight;
      }
      if (p.syncDrafts && state.envModalOpen) {
        state.draftBackground = JSON.parse(JSON.stringify(state.background));
        state.draftBoardTheme = JSON.parse(JSON.stringify(state.boardTheme));
        state.draftSceneLight = JSON.parse(JSON.stringify(state.sceneLight));
      }
    },
    setChessEnvBackground(state, action) {
      if (action.payload && typeof action.payload === "object") {
        state.background = action.payload;
      }
    },
    setChessEnvBoardTheme(state, action) {
      if (action.payload && typeof action.payload === "object") {
        state.boardTheme = action.payload;
      }
    },
    setChessEnvSceneLight(state, action) {
      if (action.payload && typeof action.payload === "object") {
        state.sceneLight = action.payload;
      }
    },
    openChessEnvModal(state) {
      state.envModalOpen = true;
      state.draftBackground = JSON.parse(JSON.stringify(state.background));
      state.draftBoardTheme = JSON.parse(JSON.stringify(state.boardTheme));
      state.draftSceneLight = JSON.parse(JSON.stringify(state.sceneLight));
    },
    closeChessEnvModal(state) {
      state.envModalOpen = false;
      state.draftBackground = null;
      state.draftBoardTheme = null;
      state.draftSceneLight = null;
    },
    /** Copy drafts → committed and close modal (persist in chess module wrappers). */
    commitChessEnvModal(state) {
      if (state.draftBackground) {
        state.background = JSON.parse(JSON.stringify(state.draftBackground));
      }
      if (state.draftBoardTheme) {
        state.boardTheme = JSON.parse(JSON.stringify(state.draftBoardTheme));
      }
      if (state.draftSceneLight) {
        state.sceneLight = JSON.parse(JSON.stringify(state.draftSceneLight));
      }
      state.envModalOpen = false;
      state.draftBackground = null;
      state.draftBoardTheme = null;
      state.draftSceneLight = null;
    },
    setChessEnvDraftBackground(state, action) {
      state.draftBackground = action.payload;
    },
    setChessEnvDraftBoardTheme(state, action) {
      state.draftBoardTheme = action.payload;
    },
    setChessEnvDraftSceneLight(state, action) {
      state.draftSceneLight = action.payload;
    },
    patchChessEnvDraftBackground(state, action) {
      if (!state.envModalOpen) return;
      const base = state.draftBackground || state.background;
      state.draftBackground = { ...base, ...action.payload };
    },
    patchChessEnvDraftBoardTheme(state, action) {
      if (!state.envModalOpen) return;
      const base = state.draftBoardTheme || state.boardTheme;
      state.draftBoardTheme = { ...base, ...action.payload };
    },
    patchChessEnvDraftSceneLight(state, action) {
      if (!state.envModalOpen) return;
      const base = state.draftSceneLight || state.sceneLight;
      state.draftSceneLight = { ...base, ...action.payload };
    }
  }
});

/** Fresh chessGame slice (new `legalTargets` array each time — avoids Immer proxy loops). */
function createChessGameInitialState() {
  return {
    fen: CHESS_START_FEN,
    /** @type {"w" | "b"} */
    myColor: "w",
    /** @type {ChessPlayMode} */
    playMode: "ai",
    selectedSquare: /** @type {string | null} */ (null),
    legalTargets: /** @type {string[]} */ ([]),
    lastMoveFrom: /** @type {string | null} */ (null),
    lastMoveTo: /** @type {string | null} */ (null)
  };
}

/**
 * Chess board + interaction mirror (M1 slice 5). FEN is write-side SSoT; chess.js loads from dispatch sites.
 * pickLift / drag pointers stay module-local.
 */
const chessGameSlice = createSlice({
  name: "chessGame",
  initialState: createChessGameInitialState(),
  reducers: {
    setChessPlayMode(state, action) {
      const m = action.payload;
      if (m === "pvp" || m === "pvp-waiting" || m === "practice" || m === "ai") {
        state.playMode = m;
      }
    },
    setChessMyColor(state, action) {
      state.myColor = action.payload === "b" ? "b" : "w";
    },
    setChessFen(state, action) {
      if (typeof action.payload === "string" && action.payload.trim()) {
        state.fen = action.payload;
      }
    },
    setChessSelection(state, action) {
      const p = action.payload || {};
      state.selectedSquare =
        typeof p.square === "string" ? p.square : p.square === null ? null : state.selectedSquare;
      if (Array.isArray(p.legalTargets)) {
        state.legalTargets = p.legalTargets.map(String);
      }
    },
    clearChessSelection(state) {
      state.selectedSquare = null;
      state.legalTargets = [];
    },
    setChessLastMove(state, action) {
      const p = action.payload || {};
      state.lastMoveFrom = typeof p.from === "string" ? p.from : null;
      state.lastMoveTo = typeof p.to === "string" ? p.to : null;
    },
    clearChessLastMove(state) {
      state.lastMoveFrom = null;
      state.lastMoveTo = null;
    },
    resetChessGame() {
      return createChessGameInitialState();
    }
  }
});

/**
 * Chess tutor session lifecycle (M1 slice 5) — moves, finish/resign, curriculum, practice, invite resume.
 */
const chessSessionSlice = createSlice({
  name: "chessSession",
  initialState: {
    /** @type {null | { startedAt: number, humanMoves: number, aiMoves: number, finished: boolean, resigned?: boolean, practice?: boolean, lessonWhitePly?: number }} */
    session: null,
    curriculumFocusStrategyId: /** @type {string | null} */ (null),
    curriculumFocusRuleId: /** @type {string | null} */ (null),
    practiceDrillId: /** @type {string | null} */ (null),
    practiceStepIndex: 0,
    /** Snapshot before PvP lobby — restored on cancel invite */
    inviteResumeState: /** @type {object | null} */ (null)
  },
  reducers: {
    setChessSession(state, action) {
      state.session = action.payload ?? null;
    },
    startNewChessSession(state, action) {
      const p = action.payload || {};
      state.session = {
        startedAt: typeof p.startedAt === "number" ? p.startedAt : 0,
        humanMoves: 0,
        aiMoves: 0,
        finished: false,
        resigned: false,
        practice: !!p.practice,
        lessonWhitePly: typeof p.lessonWhitePly === "number" ? p.lessonWhitePly : 0
      };
    },
    ensureChessSession(state, action) {
      if (state.session) return;
      const p = action.payload || {};
      state.session = {
        startedAt: typeof p.startedAt === "number" ? p.startedAt : 0,
        humanMoves: 0,
        aiMoves: 0,
        finished: false,
        resigned: false,
        practice: !!p.practice,
        lessonWhitePly: typeof p.lessonWhitePly === "number" ? p.lessonWhitePly : 0
      };
    },
    patchChessSession(state, action) {
      if (!state.session) return;
      Object.assign(state.session, action.payload || {});
    },
    incrementChessHumanMoves(state, action) {
      if (!state.session) return;
      state.session.humanMoves += 1;
      if (action.payload?.lessonWhitePly) {
        state.session.lessonWhitePly = (state.session.lessonWhitePly ?? 0) + 1;
      }
    },
    incrementChessAiMoves(state) {
      if (!state.session) return;
      state.session.aiMoves += 1;
    },
    setChessCurriculumFocus(state, action) {
      const p = action.payload || {};
      if ("strategyId" in p) {
        state.curriculumFocusStrategyId =
          typeof p.strategyId === "string" ? p.strategyId : null;
      }
      if ("ruleId" in p) {
        state.curriculumFocusRuleId = typeof p.ruleId === "string" ? p.ruleId : null;
      }
    },
    setChessPractice(state, action) {
      const p = action.payload || {};
      if ("drillId" in p) {
        state.practiceDrillId = typeof p.drillId === "string" ? p.drillId : null;
      }
      if (typeof p.stepIndex === "number") {
        state.practiceStepIndex = p.stepIndex;
      }
    },
    incrementChessPracticeStep(state) {
      state.practiceStepIndex += 1;
    },
    clearChessPractice(state) {
      state.practiceDrillId = null;
      state.practiceStepIndex = 0;
    },
    setInviteResumeState(state, action) {
      const p = action.payload;
      state.inviteResumeState = p == null ? null : cloneStoreSnapshot(p);
    },
    clearInviteResumeState(state) {
      state.inviteResumeState = null;
    },
    resetChessSessionSlice(state) {
      state.session = null;
      state.curriculumFocusStrategyId = null;
      state.curriculumFocusRuleId = null;
      state.practiceDrillId = null;
      state.practiceStepIndex = 0;
      state.inviteResumeState = null;
    },
    /** Intro / close — keep curriculum focus, drop active session */
    clearChessActiveSession(state) {
      state.session = null;
      state.practiceDrillId = null;
      state.practiceStepIndex = 0;
      state.inviteResumeState = null;
    }
  }
});

/** Serializable camera/orbit policy (OrbitControls instance stays module-local). */
export const DEFAULT_CHESS_ORBIT_POLICY = Object.freeze({
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
});

/**
 * @param {typeof DEFAULT_CHESS_ORBIT_POLICY} state
 * @param {Partial<typeof DEFAULT_CHESS_ORBIT_POLICY>} patch
 */
function applyChessOrbitPolicyPatch(state, patch) {
  if (!patch || typeof patch !== "object") return;
  if (typeof patch.followHumanKing === "boolean") {
    state.followHumanKing = patch.followHumanKing;
  }
  if (typeof patch.enableDamping === "boolean") {
    state.enableDamping = patch.enableDamping;
  }
  if (typeof patch.enablePan === "boolean") {
    state.enablePan = patch.enablePan;
  }
  const nums = [
    "minPolarAngle",
    "maxPolarAngle",
    "minDistance",
    "maxDistance",
    "rotateSpeed",
    "zoomSpeed",
    "kingTargetLerp",
    "dampingFactor"
  ];
  for (const key of nums) {
    const v = patch[key];
    if (typeof v === "number" && Number.isFinite(v)) {
      state[key] = v;
    }
  }
}

const chessOrbitSlice = createSlice({
  name: "chessOrbit",
  initialState: { ...DEFAULT_CHESS_ORBIT_POLICY },
  reducers: {
    setFollowHumanKing(state, action) {
      state.followHumanKing = !!action.payload;
    },
    patchChessOrbitPolicy(state, action) {
      applyChessOrbitPolicyPatch(state, action.payload);
    },
    resetChessOrbitPolicy(state) {
      Object.assign(state, DEFAULT_CHESS_ORBIT_POLICY);
    }
  }
});

/**
 * SNL multiplayer lobby mirror (M1 slice 4). Analogous to chessMultiplayer;
 * ignores snapshots with revision &lt; lastRevision (CAS).
 */
const snlLobbySlice = createSlice({
  name: "snlLobby",
  initialState: {
    /** @type {object | null} */
    lobbyInvite: null,
    /** Monotonic game revision last applied; -1 = none */
    lastRevision: -1,
    /** Presence watermark (lobby seats / geo); -1 = none */
    lastPresenceRevision: -1
  },
  reducers: {
    /**
     * Mirror a server invite snapshot. Ignores stale game revisions
     * (same rule as applyInvite / GAMEROOM_REVISION_CAS).
     */
    applySnlInviteSnapshot(state, action) {
      const inv = action.payload;
      if (!inv || typeof inv !== "object" || !inv.token) return;
      const rev = typeof inv.revision === "number" ? inv.revision : 0;
      if (state.lastRevision >= 0 && rev < state.lastRevision) {
        return;
      }
      state.lobbyInvite = cloneStoreSnapshot(inv);
      state.lastRevision = inv.revision ?? state.lastRevision;
      state.lastPresenceRevision = inv.presenceRevision ?? state.lastPresenceRevision;
    },
    /**
     * Force-set lobby invite (renderLobby / presence path) without CAS gate.
     * Optionally bumps presence revision from the invite.
     */
    setSnlLobbyInvite(state, action) {
      const inv = action.payload;
      if (inv == null) {
        state.lobbyInvite = null;
        return;
      }
      if (typeof inv !== "object" || !inv.token) return;
      state.lobbyInvite = cloneStoreSnapshot(inv);
      if (typeof inv.presenceRevision === "number") {
        state.lastPresenceRevision = inv.presenceRevision;
      }
    },
    setSnlPresenceRevision(state, action) {
      const n = action.payload;
      if (typeof n === "number") state.lastPresenceRevision = n;
    },
    clearSnlLobby(state) {
      state.lobbyInvite = null;
      state.lastRevision = -1;
      state.lastPresenceRevision = -1;
    },
    resetSnlRevision(state) {
      state.lastRevision = -1;
      state.lastPresenceRevision = -1;
    }
  }
});

export const { setWtdMode, hydrateModeFromHash } = wtdShellSlice.actions;
export const {
  applyServerInviteSnapshot,
  clearChessMultiplayer,
  resetSyncedRevision,
  setPvpSendingMove
} = chessMultiplayerSlice.actions;
export const {
  hydrateChessEnv,
  setChessEnvBackground,
  setChessEnvBoardTheme,
  setChessEnvSceneLight,
  openChessEnvModal,
  closeChessEnvModal,
  commitChessEnvModal,
  setChessEnvDraftBackground,
  setChessEnvDraftBoardTheme,
  setChessEnvDraftSceneLight,
  patchChessEnvDraftBackground,
  patchChessEnvDraftBoardTheme,
  patchChessEnvDraftSceneLight
} = chessEnvSlice.actions;
export const {
  applySnlInviteSnapshot,
  setSnlLobbyInvite,
  setSnlPresenceRevision,
  clearSnlLobby,
  resetSnlRevision
} = snlLobbySlice.actions;
export const {
  setChessPlayMode,
  setChessMyColor,
  setChessFen,
  setChessSelection,
  clearChessSelection,
  setChessLastMove,
  clearChessLastMove,
  resetChessGame
} = chessGameSlice.actions;
export const {
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
  clearChessActiveSession
} = chessSessionSlice.actions;
export const {
  setFollowHumanKing,
  patchChessOrbitPolicy,
  resetChessOrbitPolicy
} = chessOrbitSlice.actions;

export const store = configureStore({
  reducer: {
    wtdShell: wtdShellSlice.reducer,
    chessMultiplayer: chessMultiplayerSlice.reducer,
    chessEnv: chessEnvSlice.reducer,
    chessGame: chessGameSlice.reducer,
    chessSession: chessSessionSlice.reducer,
    chessOrbit: chessOrbitSlice.reducer,
    snlLobby: snlLobbySlice.reducer
  },
  /* RTK enables the extension when installed; no-op otherwise. */
  devTools: true
});

/** @param {{ wtdShell: { mode: WtdShellMode } }} state */
export function selectWtdMode(state) {
  return state.wtdShell.mode;
}

/** @param {{ wtdShell: { previousMode: WtdShellMode | null } }} state */
export function selectPreviousWtdMode(state) {
  return state.wtdShell.previousMode;
}

/** @param {{ wtdShell: { modeChangeSeq: number } }} state */
export function selectWtdModeChangeSeq(state) {
  return state.wtdShell.modeChangeSeq;
}

/** @param {{ chessMultiplayer: { pvpInvite: object | null } }} state */
export function selectPvpInvite(state) {
  return state.chessMultiplayer.pvpInvite;
}

/** @param {{ chessMultiplayer: { lastSyncedRevision: number } }} state */
export function selectLastSyncedRevision(state) {
  return state.chessMultiplayer.lastSyncedRevision;
}

/** @param {{ chessMultiplayer: { pvpSendingMove: boolean } }} state */
export function selectPvpSendingMove(state) {
  return state.chessMultiplayer.pvpSendingMove;
}

/** @param {{ chessEnv: { background: object } }} state */
export function selectChessEnvBackground(state) {
  return state.chessEnv.background;
}

/** @param {{ chessEnv: { boardTheme: object } }} state */
export function selectChessEnvBoardTheme(state) {
  return state.chessEnv.boardTheme;
}

/** @param {{ chessEnv: { sceneLight: object } }} state */
export function selectChessEnvSceneLight(state) {
  return state.chessEnv.sceneLight;
}

/** @param {{ chessEnv: { draftBackground: object | null } }} state */
export function selectChessEnvDraftBackground(state) {
  return state.chessEnv.draftBackground;
}

/** @param {{ chessEnv: { draftBoardTheme: object | null } }} state */
export function selectChessEnvDraftBoardTheme(state) {
  return state.chessEnv.draftBoardTheme;
}

/** @param {{ chessEnv: { draftSceneLight: object | null } }} state */
export function selectChessEnvDraftSceneLight(state) {
  return state.chessEnv.draftSceneLight;
}

/** @param {{ chessEnv: { envModalOpen: boolean } }} state */
export function selectChessEnvModalOpen(state) {
  return state.chessEnv.envModalOpen;
}

/** @param {{ snlLobby: { lobbyInvite: object | null } }} state */
export function selectSnlLobbyInvite(state) {
  return state.snlLobby.lobbyInvite;
}

/** @param {{ snlLobby: { lastRevision: number } }} state */
export function selectSnlLastRevision(state) {
  return state.snlLobby.lastRevision;
}

/** @param {{ snlLobby: { lastPresenceRevision: number } }} state */
export function selectSnlLastPresenceRevision(state) {
  return state.snlLobby.lastPresenceRevision;
}

/** @param {{ chessGame: object }} state */
export function selectChessGame(state) {
  return state.chessGame;
}

/** @param {{ chessGame: { fen: string } }} state */
export function selectChessFen(state) {
  return state.chessGame.fen;
}

/** @param {{ chessGame: { playMode: ChessPlayMode } }} state */
export function selectChessPlayMode(state) {
  return state.chessGame.playMode;
}

/** @param {{ chessGame: { myColor: "w" | "b" } }} state */
export function selectChessMyColor(state) {
  return state.chessGame.myColor;
}

/** @param {{ chessSession: object }} state */
export function selectChessSessionSlice(state) {
  return state.chessSession;
}

/** @param {{ chessSession: { session: object | null } }} state */
export function selectChessSession(state) {
  return state.chessSession.session;
}

/** @param {{ chessSession: { inviteResumeState: object | null } }} state */
export function selectInviteResumeState(state) {
  return state.chessSession.inviteResumeState;
}

/** @param {{ chessOrbit: typeof DEFAULT_CHESS_ORBIT_POLICY }} state */
export function selectChessOrbit(state) {
  return state.chessOrbit;
}

export { CHESS_START_FEN };

export const dispatch = store.dispatch.bind(store);

const api = {
  store,
  dispatch,
  actions: {
    setWtdMode,
    hydrateModeFromHash,
    applyServerInviteSnapshot,
    clearChessMultiplayer,
    resetSyncedRevision,
    setPvpSendingMove,
    hydrateChessEnv,
    setChessEnvBackground,
    setChessEnvBoardTheme,
    setChessEnvSceneLight,
    openChessEnvModal,
    closeChessEnvModal,
    commitChessEnvModal,
    setChessEnvDraftBackground,
    setChessEnvDraftBoardTheme,
    setChessEnvDraftSceneLight,
    patchChessEnvDraftBackground,
    patchChessEnvDraftBoardTheme,
    patchChessEnvDraftSceneLight,
    applySnlInviteSnapshot,
    setSnlLobbyInvite,
    setSnlPresenceRevision,
    clearSnlLobby,
    resetSnlRevision,
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
    setFollowHumanKing,
    patchChessOrbitPolicy,
    resetChessOrbitPolicy
  },
  selectors: {
    selectWtdMode,
    selectPreviousWtdMode,
    selectWtdModeChangeSeq,
    selectPvpInvite,
    selectLastSyncedRevision,
    selectPvpSendingMove,
    selectChessEnvBackground,
    selectChessEnvBoardTheme,
    selectChessEnvSceneLight,
    selectChessEnvDraftBackground,
    selectChessEnvDraftBoardTheme,
    selectChessEnvDraftSceneLight,
    selectChessEnvModalOpen,
    selectSnlLobbyInvite,
    selectSnlLastRevision,
    selectSnlLastPresenceRevision,
    selectChessGame,
    selectChessFen,
    selectChessPlayMode,
    selectChessMyColor,
    selectChessSessionSlice,
    selectChessSession,
    selectInviteResumeState,
    selectChessOrbit
  },
  normalizeWtdMode,
  wtdModeFromHashBase,
  WTD_SHELL_MODES
};

if (typeof window !== "undefined") {
  window.AppgenWtdStore = api;
  if (typeof window.__appgenWtdStoreReady === "function") {
    window.__appgenWtdStoreReady(api);
  }
}

export default api;
