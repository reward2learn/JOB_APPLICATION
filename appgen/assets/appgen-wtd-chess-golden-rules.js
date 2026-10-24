/**
 * Offline-first golden rules / patterns for WTD Chess fast-track curriculum.
 */

export const LESSON_MODE_KEY = "wtdChessLessonMode";
export const PROGRESS_KEY = "wtdChessGoldenRulesProgress";

/** @typedef {"opening" | "middlegame" | "endgame"} GamePhase */
/** @typedef {{ move?: import("chess.js").Move | null, actor?: "human" | "ai", intent?: "move" | "next_white" }} RuleContext */

/**
 * @type {Array<{
 *   id: string,
 *   name: string,
 *   phases: GamePhase[],
 *   priority: number,
 *   tip: string,
 *   pattern: string,
 *   detect: (chess: import("chess.js").Chess, ctx: RuleContext) => boolean
 * }>}
 */
export const GOLDEN_RULES = [
  {
    id: "center_control",
    name: "Control the center",
    phases: ["opening", "middlegame"],
    priority: 90,
    tip: "Central squares (e4, d4, d5, e5) let your pieces reach both flanks — fight for them with pawns and pieces.",
    pattern: "Look for pawn pushes and piece hops toward the center before chasing side targets.",
    detect(chess, ctx) {
      const center = ["e4", "d4", "e5", "d5", "c4", "c5", "f4", "f5"];
      const m = ctx.move;
      if (m && m.piece === "p" && center.includes(m.to)) return true;
      for (const sq of ["e4", "d4", "e5", "d5"]) {
        const p = chess.get(sq);
        if (p && p.type === "p") return true;
      }
      return false;
    }
  },
  {
    id: "develop_minor",
    name: "Develop knights & bishops first",
    phases: ["opening"],
    priority: 88,
    tip: "Bring knights and bishops out before moving the queen — minor pieces need routes the center opens.",
    pattern: "Knights toward c3/f3; bishops to lines that aim at the center or king.",
    detect(chess, ctx) {
      const m = ctx.move;
      if (m && (m.piece === "n" || m.piece === "b") && m.color === "w" && m.from.endsWith("1")) return true;
      if (getGamePhase(chess) !== "opening") return false;
      const hist = chess.history({ verbose: true });
      const whiteMinors = hist.filter(
        (h) => h.color === "w" && (h.piece === "n" || h.piece === "b") && !h.from.endsWith("1")
      );
      return whiteMinors.length >= 1 && whiteMinors.length <= 3;
    }
  },
  {
    id: "king_safety",
    name: "King safety — castle early",
    phases: ["opening", "middlegame"],
    priority: 86,
    tip: "An exposed king is a magnet for checks — castle when the center is stable enough to tuck the king away.",
    pattern: "Watch f7/f2 weak squares; connect rooks after castling.",
    detect(chess, ctx) {
      const m = ctx.move;
      if (m && (m.flags.includes("k") || m.flags.includes("q"))) return true;
      const phase = getGamePhase(chess);
      if (phase === "endgame") return false;
      const wk = findKingSquare(chess, "w");
      if (!wk) return false;
      if (wk === "e1" && chess.history().length >= 8) return true;
      return chess.inCheck();
    }
  },
  {
    id: "dont_hang",
    name: "Don't hang pieces",
    phases: ["opening", "middlegame", "endgame"],
    priority: 95,
    tip: "If a piece has more attackers than defenders, it's loose — count attackers and defenders before you move.",
    pattern: "After each move ask: \"What can capture me?\" and \"What can I capture?\"",
    detect(chess, ctx) {
      const m = ctx.move;
      if (!m) return false;
      const attacker = m.color === "w" ? "b" : "w";
      if (chess.isAttacked(m.to, attacker) && pieceValue(m.piece) >= 3) return true;
      return false;
    }
  },
  {
    id: "forks",
    name: "Forks (double attack)",
    phases: ["middlegame", "endgame"],
    priority: 92,
    tip: "One piece attacking two targets at once wins material when only one can be saved — knights love forks.",
    pattern: "Scan for knight hops and pawn checks that hit king + rook/queen.",
    detect(chess, ctx) {
      const m = ctx.move;
      if (!m) return false;
      return forkThreatFromSquare(chess, m.to, m.color);
    }
  },
  {
    id: "pins_skewers",
    name: "Pins & skewers",
    phases: ["middlegame", "endgame"],
    priority: 84,
    tip: "A pin ties a piece down because moving it exposes a bigger piece behind it; a skewer forces the valuable piece to move.",
    pattern: "Look for bishops/rooks/queens on open lines through enemy pieces toward the king.",
    detect(chess, ctx) {
      return lineTacticHint(chess, ctx.move);
    }
  },
  {
    id: "checkmate_patterns",
    name: "Checkmate patterns",
    phases: ["middlegame", "endgame"],
    priority: 100,
    tip: "Mate ends the game — back-rank, smothered, and queen+knight mates show up often in real games.",
    pattern: "When the king has few escape squares, bring every piece to the attack.",
    detect(chess, ctx) {
      const m = ctx.move;
      if (m && m.san.includes("#")) return true;
      if (chess.inCheck() && chess.moves().length <= 2) return true;
      return false;
    }
  }
];

const PIECE_VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

function pieceValue(type) {
  return PIECE_VALUE[type] || 0;
}

function findKingSquare(chess, color) {
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const p = chess.board()[r][f];
      if (p && p.type === "k" && p.color === color) {
        return String.fromCharCode(97 + f) + (8 - r);
      }
    }
  }
  return null;
}

function forkThreatFromSquare(chess, square, color) {
  const moves = chess.moves({ square, verbose: true });
  const valuable = moves.filter((m) => m.captured && pieceValue(m.captured) >= 3);
  return valuable.length >= 2;
}

function lineTacticHint(chess, move) {
  if (!move) return false;
  if (move.piece !== "b" && move.piece !== "r" && move.piece !== "q") return false;
  if (move.san.includes("x") && move.captured === "k") return false;
  const enemy = move.color === "w" ? "b" : "w";
  const kingSq = findKingSquare(chess, enemy);
  if (!kingSq) return false;
  const attackers = chess.moves({ verbose: true }).filter((m) => m.to === move.to && m.piece === move.piece);
  if (!attackers.length) return false;
  return chess.isAttacked(move.to, enemy) || (move.captured && pieceValue(move.captured) >= 5);
}

/** @param {import("chess.js").Chess} chess */
export function getGamePhase(chess) {
  const plies = chess.history().length;
  let pieces = 0;
  let queens = 0;
  const board = chess.board();
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const p = board[r][f];
      if (!p) continue;
      if (p.type !== "k") pieces += 1;
      if (p.type === "q") queens += 1;
    }
  }
  if (pieces <= 12 || (queens === 0 && pieces <= 16)) return "endgame";
  if (plies < 14) return "opening";
  return "middlegame";
}

/** @returns {Record<string, true>} */
export function loadProgress() {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (_) {
    return {};
  }
}

export function saveProgress(progress) {
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
  } catch (_) {
    /* quota */
  }
}

export function markRuleEncounter(ruleId) {
  if (!ruleId) return;
  const progress = loadProgress();
  if (progress[ruleId]) return;
  progress[ruleId] = true;
  saveProgress(progress);
}

export function isLessonModeEnabled() {
  try {
    const v = localStorage.getItem(LESSON_MODE_KEY);
    if (v === null) return true;
    return v !== "0" && v !== "false";
  } catch (_) {
    return true;
  }
}

export function setLessonModeEnabled(on) {
  try {
    localStorage.setItem(LESSON_MODE_KEY, on ? "1" : "0");
  } catch (_) {
    /* ignore */
  }
}

/**
 * @param {import("chess.js").Chess} chess
 * @param {RuleContext} ctx
 * @param {number} limit
 */
export function pickGoldenRules(chess, ctx, limit = 2) {
  const phase = getGamePhase(chess);
  const hits = GOLDEN_RULES.filter((rule) => {
    if (!rule.phases.includes(phase)) return false;
    try {
      return rule.detect(chess, ctx);
    } catch (_) {
      return false;
    }
  });
  hits.sort((a, b) => b.priority - a.priority);
  if (!hits.length && ctx.intent === "next_white") {
    const fallback = GOLDEN_RULES.find((r) => r.id === "develop_minor" && r.phases.includes(phase));
    if (fallback) hits.push(fallback);
  }
  return hits.slice(0, limit);
}

export function pickPrimaryGoldenRule(chess, ctx) {
  const rules = pickGoldenRules(chess, ctx, 1);
  return rules[0] || null;
}

export function formatCoachWithRule(baseTip, rule) {
  if (!rule) return baseTip;
  const prefix = "Golden rule · " + rule.name + ": ";
  if (baseTip.toLowerCase().includes(rule.name.toLowerCase())) return baseTip;
  return prefix + rule.tip + " " + baseTip;
}

export function lessonProgressSummary() {
  const progress = loadProgress();
  const total = GOLDEN_RULES.length;
  const done = GOLDEN_RULES.filter((r) => progress[r.id]).length;
  return { done, total, progress };
}
