/**
 * Snakes & Ladders board geometry (boustrophedon numbering, dynamic 6×6 / 8×8 / 10×10).
 */
import { levelConfig, sanitizeLevel } from "./appgen-wtd-snl-levels.js";

/** @type {ReturnType<typeof levelConfig>} */
let activeCfg = levelConfig("hard");

/** Half prior footprint (was 0.92) — compact board cells. */
export const CELL = 0.46;
export const TOKEN_Y = 0.12;
export const TOKEN_RADIUS = 0.075;
export const TOKEN_HEIGHT = 0.15;

const PLAYER_COLORS = [0xe11d48, 0x2563eb, 0x16a34a, 0xd97706];

/** @param {string} levelId */
export function setActiveBoardLevel(levelId) {
  activeCfg = levelConfig(levelId);
}

export function getBoardConfig() {
  return activeCfg;
}

export function getGrid() {
  return activeCfg.grid;
}

export function getWinSquare() {
  return activeCfg.winSquare;
}

/** @deprecated use getGrid() — reflects active level */
export const GRID = 10;

export function playerColorHex(slot) {
  return PLAYER_COLORS[Number(slot) % PLAYER_COLORS.length];
}

/** Square number 1–winSquare → grid row/col (row 0 = bottom row). */
export function squareToRowCol(n) {
  const grid = activeCfg.grid;
  const max = activeCfg.winSquare;
  const num = Math.max(1, Math.min(max, Number(n) || 1));
  const zero = num - 1;
  const row = Math.floor(zero / grid);
  const colInRow = zero % grid;
  const col = row % 2 === 0 ? colInRow : grid - 1 - colInRow;
  return { row, col };
}

export function boardCenterHalf() {
  const grid = activeCfg.grid;
  return (grid * CELL) / 2 - CELL / 2;
}

/** World X/Z at the geometric centre of the active grid (die spawn). */
export function boardGridCenterWorld() {
  const grid = activeCfg.grid;
  const half = boardCenterHalf();
  const mid = (grid - 1) / 2;
  return { x: mid * CELL - half, z: mid * CELL - half };
}

export function squareToWorld(n) {
  const { row, col } = squareToRowCol(n);
  const half = boardCenterHalf();
  const x = col * CELL - half;
  const z = row * CELL - half;
  return { x, y: 0.04, z };
}

export function startWorldPosition(slot) {
  const base = squareToWorld(1);
  const offset = (Number(slot) - 1.5) * 0.09;
  return { x: base.x + offset - 0.18, y: TOKEN_Y, z: base.z - CELL * 0.55 };
}

export function tokenWorldPosition(position, slot) {
  const pos = Number(position) || 0;
  if (pos <= 0) return startWorldPosition(slot);
  const base = squareToWorld(pos);
  const offset = (Number(slot) - 1.5) * 0.06;
  return { x: base.x + offset, y: TOKEN_Y, z: base.z };
}

/**
 * @param {number} fromSq
 * @param {number} toSq
 * @param {"ladder"|"snake"} kind
 * @param {number} [slot]
 */
export function portalCurveMid(fromSq, toSq, kind, slot = 0) {
  const a = tokenWorldPosition(fromSq, slot);
  const b = tokenWorldPosition(toSq, slot);
  const lift = kind === "ladder" ? 0.72 : 0.42;
  return {
    x: (a.x + b.x) / 2,
    y: TOKEN_Y + lift,
    z: (a.z + b.z) / 2
  };
}

/**
 * @param {number} from
 * @param {number} roll
 * @param {boolean} [overshoot]
 */
export function reconstructMoveRoute(from, roll, overshoot) {
  const winSquare = activeCfg.winSquare;
  const ladders = activeCfg.ladders;
  const snakes = activeCfg.snakes;
  const start = Number(from) || 0;
  const steps = Number(roll) || 0;
  if (overshoot || steps < 1 || steps > 6) {
    return { walk: [], path: [], portal: null, portalFrom: null, portalTo: null, land: start };
  }
  /** @type {number[]} */
  const walk = [];
  let land = start;
  if (start === 0) {
    for (let i = 1; i <= steps; i++) walk.push(i);
    land = steps;
  } else {
    const target = start + steps;
    if (target > winSquare) {
      return { walk: [], path: [], portal: null, portalFrom: null, portalTo: null, land: start };
    }
    for (let i = 1; i <= steps; i++) walk.push(start + i);
    land = target;
  }
  const ladder = ladders.find(([a]) => a === land);
  const snake = snakes.find(([a]) => a === land);
  if (ladder) {
    return {
      walk,
      path: walk.concat([ladder[1]]),
      portal: "ladder",
      portalFrom: land,
      portalTo: ladder[1],
      land
    };
  }
  if (snake) {
    return {
      walk,
      path: walk.concat([snake[1]]),
      portal: "snake",
      portalFrom: land,
      portalTo: snake[1],
      land
    };
  }
  return { walk, path: walk.slice(), portal: null, portalFrom: null, portalTo: null, land };
}

export function portalSegments() {
  const segments = [];
  for (const [a, b] of activeCfg.ladders) {
    segments.push({ from: a, to: b, kind: "ladder" });
  }
  for (const [a, b] of activeCfg.snakes) {
    segments.push({ from: a, to: b, kind: "snake" });
  }
  return segments;
}

/** Sync active tables when joining an existing lobby (server is source of truth). */
export function syncBoardFromInviteMeta(inv) {
  if (!inv) return;
  const level = inv.level != null ? sanitizeLevel(inv.level) : "hard";
  setActiveBoardLevel(level);
}
