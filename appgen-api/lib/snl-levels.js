/**
 * Snakes & Ladders difficulty boards (shared shapes for invite payload + rules).
 * Easy 6×6 · Medium 8×8 · Hard 10×10.
 */

/** @typedef {"easy"|"medium"|"hard"} SnLLevelId */

/** @type {Record<SnLLevelId, { id: SnLLevelId, label: string, grid: number, winSquare: number, ladders: [number, number][], snakes: [number, number][] }>} */
export const SNL_LEVELS = {
  easy: {
    id: "easy",
    label: "Easy",
    grid: 6,
    winSquare: 36,
    ladders: [
      [2, 14],
      [9, 27],
      [20, 34]
    ],
    snakes: [
      [16, 3],
      [28, 11],
      [35, 24]
    ]
  },
  medium: {
    id: "medium",
    label: "Medium",
    grid: 8,
    winSquare: 64,
    ladders: [
      [3, 22],
      [15, 44],
      [40, 60]
    ],
    snakes: [
      [25, 7],
      [45, 19],
      [62, 41]
    ]
  },
  hard: {
    id: "hard",
    label: "Hard",
    grid: 10,
    winSquare: 100,
    ladders: [
      [4, 14],
      [20, 38],
      [63, 81]
    ],
    snakes: [
      [17, 7],
      [54, 32],
      [87, 24]
    ]
  }
};

/** @param {unknown} raw @returns {SnLLevelId} */
export function sanitizeLevel(raw) {
  const t = String(raw || "")
    .toLowerCase()
    .trim();
  if (t === "easy" || t === "6" || t === "6x6") return "easy";
  if (t === "medium" || t === "mid" || t === "8" || t === "8x8") return "medium";
  if (t === "hard" || t === "10" || t === "10x10") return "hard";
  return "medium";
}

/** @param {SnLLevelId | string} levelId */
export function levelConfig(levelId) {
  const id = sanitizeLevel(levelId);
  return SNL_LEVELS[id] || SNL_LEVELS.medium;
}

/** @param {ReturnType<typeof levelConfig>} cfg */
export function portalMaps(cfg) {
  const ladderFrom = new Map((cfg.ladders || []).map(([a, b]) => [a, b]));
  const snakeFrom = new Map((cfg.snakes || []).map(([a, b]) => [a, b]));
  return { ladderFrom, snakeFrom };
}
