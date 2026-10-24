/**
 * Winning strategies curriculum — 20 sequential lessons (drill and/or vs coach).
 */

import { loadProgress as loadGoldenRulesProgress } from "./appgen-wtd-chess-golden-rules.js";
import { CHESS_101_DRILLS, load101Progress } from "./appgen-wtd-chess-101.js";

export const STRATEGIES_PROGRESS_KEY = "wtdChessStrategiesProgress";

/**
 * @typedef {"drill" | "vs_coach" | "both"} StrategyKind
 * @typedef {{
 *   id: string,
 *   title: string,
 *   summary: string,
 *   kind: StrategyKind,
 *   ruleId?: string,
 *   drillId?: string,
 *   startFen?: string,
 *   lessonMoves?: { from: string, to: string, san?: string, tip?: string }[]
 * }} ChessStrategy
 */

/** @type {ChessStrategy[]} */
export const CHESS_STRATEGIES = [
  {
    id: "center_control",
    title: "Control the center",
    summary: "Fight for e4, d4, e5, and d5 so your pieces reach both flanks.",
    kind: "both",
    ruleId: "center_control",
    drillId: "101_center_e4"
  },
  {
    id: "develop_minors",
    title: "Develop knights & bishops",
    summary: "Bring minor pieces out before the queen — they need open lines.",
    kind: "both",
    ruleId: "develop_minor",
    drillId: "101_develop_knight"
  },
  {
    id: "opening_plan",
    title: "Simple opening plan",
    summary: "Center, develop, and aim at the opponent's king-side weak squares.",
    kind: "drill",
    ruleId: "develop_minor",
    drillId: "101_mini_italian"
  },
  {
    id: "king_safety",
    title: "King safety — castle",
    summary: "Tuck the king away and connect your rooks when the center allows.",
    kind: "both",
    ruleId: "king_safety",
    drillId: "101_castle_safety"
  },
  {
    id: "dont_hang",
    title: "Don't hang pieces",
    summary: "Count attackers and defenders before every move.",
    kind: "both",
    ruleId: "dont_hang",
    drillId: "101_save_hanging_queen"
  },
  {
    id: "forks",
    title: "Forks (double attack)",
    summary: "One piece hits two targets — knights love forks.",
    kind: "both",
    ruleId: "forks",
    drillId: "101_knight_fork"
  },
  {
    id: "pins_skewers",
    title: "Pins & skewers",
    summary: "Line pieces tie down or blast through enemy pieces toward the king.",
    kind: "both",
    ruleId: "pins_skewers",
    drillId: "101_pin_skewer"
  },
  {
    id: "discovered_attack",
    title: "Discovered attack",
    summary: "Move one piece to unleash another along an open line.",
    kind: "both",
    ruleId: "forks",
    drillId: "101_discovered"
  },
  {
    id: "back_rank",
    title: "Back-rank mate threat",
    summary: "Give your king luft and watch for rooks on the back rank.",
    kind: "both",
    ruleId: "checkmate_patterns",
    drillId: "101_back_rank"
  },
  {
    id: "smothered_mate",
    title: "Smothered mate pattern",
    summary: "A trapped king and a knight can deliver a classic checkmate.",
    kind: "drill",
    ruleId: "checkmate_patterns",
    drillId: "101_smothered"
  },
  {
    id: "deflection",
    title: "Deflection",
    summary: "Lure a defender away from the square or piece it must guard.",
    kind: "drill",
    ruleId: "forks",
    drillId: "101_deflection"
  },
  {
    id: "decoy",
    title: "Decoy (luring)",
    summary: "Bait an enemy piece onto a square where it becomes a target.",
    kind: "drill",
    ruleId: "forks",
    drillId: "101_decoy"
  },
  {
    id: "zwischenzug",
    title: "Zwischenzug (in-between move)",
    summary: "Insert a forcing move before playing the obvious recapture.",
    kind: "both",
    ruleId: "forks",
    drillId: "101_zwischenzug"
  },
  {
    id: "passed_pawns",
    title: "Passed pawns",
    summary: "Push protected passers — they race to promotion in the endgame.",
    kind: "both",
    ruleId: "dont_hang",
    drillId: "101_passed_pawn"
  },
  {
    id: "opposition",
    title: "King opposition",
    summary: "Face the enemy king and steal key squares in pawn endgames.",
    kind: "both",
    ruleId: "dont_hang",
    drillId: "101_opposition"
  },
  {
    id: "rook_seventh",
    title: "Rook on the 7th rank",
    summary: "A rook behind enemy pawns picks off pawns and ties down pieces.",
    kind: "both",
    ruleId: "forks",
    drillId: "101_rook_seventh"
  },
  {
    id: "bishop_pair",
    title: "The bishop pair",
    summary: "Two bishops on open diagonals can dominate a bishop vs knight fight.",
    kind: "both",
    ruleId: "develop_minor",
    drillId: "101_bishop_pair_light",
    startFen: "r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/3P1N2/PPP2PPP/RNBQK2R w KQkq - 0 4",
    lessonMoves: [
      {
        from: "c4",
        to: "b3",
        san: "Bb3",
        tip: "Bb3 keeps your light-square bishop on a long diagonal — a classic bishop-pair idea. Avoid wild sacrifices; improve both bishops and keep your king safe."
      },
      {
        from: "e1",
        to: "g1",
        san: "O-O",
        tip: "Castle — tuck the king away so your bishops can pressure the center without opening lines against your own king."
      },
      {
        from: "c1",
        to: "g5",
        san: "Bg5",
        tip: "Bg5 develops your dark-square bishop with tempo, pinning the knight. Two active bishops on open lines are the goal."
      }
    ]
  },
  {
    id: "knight_outposts",
    title: "Knight outposts",
    summary: "Plant a knight on a protected square deep in enemy territory.",
    kind: "both",
    ruleId: "forks",
    drillId: "101_outpost"
  },
  {
    id: "prophylaxis",
    title: "Prophylaxis",
    summary: "Stop your opponent's plan before you execute your own.",
    kind: "both",
    ruleId: "king_safety",
    drillId: "101_prophylaxis_h3",
    startFen: "rnbqkb1r/pppp1ppp/5n2/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3",
    lessonMoves: [
      {
        from: "h2",
        to: "h3",
        san: "h3",
        tip: "Prophylaxis: stop ...Bg4 before it pins your knight. Small moves that prevent their plan are often stronger than rushing attacks."
      },
      {
        from: "d2",
        to: "d4",
        san: "d4",
        tip: "Now strike the center — you have reduced their cheap tricks on the kingside."
      },
      {
        from: "b1",
        to: "c3",
        san: "Nc3",
        tip: "Develop toward the center. Your h3 move already made ...Bg4 less annoying."
      }
    ]
  },
  {
    id: "endgame_technique",
    title: "Convert a winning endgame",
    summary: "Use king activity and accurate checks to land the win.",
    kind: "both",
    ruleId: "checkmate_patterns",
    drillId: "101_endgame_win",
    startFen: "8/8/4k3/8/4R3/8/8/4K3 w - - 0 1"
  }
];

/** @returns {{ completed: string[] }} */
export function loadStrategiesProgress() {
  try {
    const raw = localStorage.getItem(STRATEGIES_PROGRESS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.completed)) {
        return { completed: parsed.completed.filter((id) => typeof id === "string") };
      }
    }
  } catch (_) {
    /* ignore */
  }
  return migrateLegacyProgress();
}

function migrateLegacyProgress() {
  const golden = loadGoldenRulesProgress();
  const drills = load101Progress();
  const completed = [];
  for (let i = 0; i < CHESS_STRATEGIES.length; i++) {
    const s = CHESS_STRATEGIES[i];
    const drillDone = s.drillId && drills[s.drillId];
    const ruleDone = s.ruleId && golden[s.ruleId];
    if (drillDone || ruleDone) {
      completed.push(s.id);
    } else {
      break;
    }
  }
  const progress = { completed };
  if (completed.length) {
    saveStrategiesProgress(progress);
  }
  return progress;
}

/** @param {{ completed: string[] }} progress */
export function saveStrategiesProgress(progress) {
  try {
    localStorage.setItem(STRATEGIES_PROGRESS_KEY, JSON.stringify(progress));
  } catch (_) {
    /* quota */
  }
}

export function getStrategyById(id) {
  return CHESS_STRATEGIES.find((s) => s.id === id) || null;
}

export function strategyIndex(id) {
  return CHESS_STRATEGIES.findIndex((s) => s.id === id);
}

export function isStrategyComplete(id) {
  const { completed } = loadStrategiesProgress();
  return completed.includes(id);
}

/** All winning strategies are selectable; order is a suggested path only. */
export function isStrategyUnlocked(_index) {
  return true;
}

export function getCurrentStrategyIndex() {
  for (let i = 0; i < CHESS_STRATEGIES.length; i++) {
    if (!isStrategyComplete(CHESS_STRATEGIES[i].id)) {
      return i;
    }
  }
  return -1;
}

export function markStrategyComplete(strategyId) {
  if (!strategyId) return;
  const idx = strategyIndex(strategyId);
  if (idx < 0) return;
  const progress = loadStrategiesProgress();
  if (progress.completed.includes(strategyId)) return;
  progress.completed.push(strategyId);
  saveStrategiesProgress(progress);
}

export function strategiesProgressSummary() {
  const { completed } = loadStrategiesProgress();
  return {
    done: completed.length,
    total: CHESS_STRATEGIES.length,
    completed,
    currentIndex: getCurrentStrategyIndex()
  };
}

/**
 * @param {typeof CHESS_STRATEGIES[number]} s
 * @param {Record<string, boolean>} drillProgress
 */
function resolveLessonStepForStrategy(s, drillProgress) {
  if ((s.kind === "drill" || s.kind === "both") && s.drillId && !drillProgress[s.drillId]) {
    const drill = CHESS_101_DRILLS.find((d) => d.id === s.drillId);
    return {
      kind: "drill",
      drillId: s.drillId,
      strategyId: s.id,
      label: drill?.title || s.title
    };
  }
  if (s.kind === "vs_coach" || s.kind === "both") {
    return {
      kind: "game",
      strategyId: s.id,
      ruleId: s.ruleId,
      fen: s.startFen,
      label: s.title
    };
  }
  return null;
}

/**
 * @returns {{ kind: "drill", drillId: string, strategyId: string, label: string } | { kind: "game", strategyId: string, ruleId?: string, fen?: string, label: string } | null}
 */
export function resolveNextLesson() {
  const drillProgress = load101Progress();

  for (const s of CHESS_STRATEGIES) {
    if (isStrategyComplete(s.id)) continue;
    const step = resolveLessonStepForStrategy(s, drillProgress);
    if (step) return step;
  }
  return null;
}

/**
 * Next curriculum item after a given strategy (skip current — for in-lesson "Continue").
 * @returns {{ kind: "drill", drillId: string, strategyId: string, label: string } | { kind: "game", strategyId: string, ruleId?: string, fen?: string, label: string } | null}
 */
export function resolveNextStrategyAfter(strategyId) {
  const drillProgress = load101Progress();
  const startIdx = strategyIndex(strategyId);
  const begin = startIdx >= 0 ? startIdx + 1 : 0;
  for (let i = begin; i < CHESS_STRATEGIES.length; i++) {
    const s = CHESS_STRATEGIES[i];
    if (isStrategyComplete(s.id)) continue;
    const step = resolveLessonStepForStrategy(s, drillProgress);
    if (step) return step;
  }
  return null;
}

/** Coach / golden-rule card fields for a strategy. */
export function strategyCoachFocus(strategy) {
  if (!strategy) return null;
  return {
    id: strategy.ruleId || strategy.id,
    name: strategy.title,
    tip: strategy.summary,
    pattern: strategy.summary
  };
}

/** @param {ChessStrategy | null | undefined} strategy @param {number} whitePly */
export function strategyLessonStepAtWhitePly(strategy, whitePly) {
  if (!strategy?.lessonMoves?.length || whitePly < 0) return null;
  const step = strategy.lessonMoves[whitePly];
  if (!step || typeof step.from !== "string" || typeof step.to !== "string") return null;
  return step;
}
