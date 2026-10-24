/**
 * Authoring templates for WTD Chess curriculum.
 * Copy a block into `appgen-wtd-chess-101.js` (drills) or `appgen-wtd-chess-strategies.js` (vs coach).
 *
 * Methods:
 * - single_shot: one human move from a set FEN (Chess 101 default).
 * - scripted_line: human + auto opponent replies (mini Italian).
 * - black_replies: human plays Black (save hanging queen).
 * - vs_coach_script: startFen + lessonMoves[] for guided White plies vs AI.
 * - vs_coach_open: startFen only — coach hints via golden rule, no scripted moves.
 */

/** @typedef {"single_shot"|"scripted_line"|"black_replies"|"vs_coach_script"|"vs_coach_open"} LessonMethod */

/**
 * @typedef {Object} DrillTemplate
 * @property {LessonMethod} method
 * @property {string} description
 * @property {import("./appgen-wtd-chess-101.js").Chess101Drill} example
 */

/** @typedef {Object} StrategyTemplate
 * @property {LessonMethod} method
 * @property {string} description
 * @property {import("./appgen-wtd-chess-strategies.js").ChessStrategy} example
 */

/** @type {DrillTemplate[]} */
export const CHESS_101_DRILL_TEMPLATES = [
  {
    method: "single_shot",
    description: "One correct move from FEN; best for tactics and endgame motifs.",
    example: {
      id: "TEMPLATE_single_shot",
      category: "tactics",
      title: "Example — single shot",
      blurb: "One move theme.",
      strategyId: "forks",
      fen: "8/8/8/r1N5/8/8/8/k3K3 w - - 0 1",
      steps: [
        {
          color: "w",
          from: "c5",
          to: "b3",
          coach: "Nb3 forks king and rook — two targets, one knight.",
          ruleId: "forks"
        }
      ]
    }
  },
  {
    method: "scripted_line",
    description: "Multi-ply White plan with auto Black replies (opening mini-lines).",
    example: {
      id: "TEMPLATE_scripted_line",
      category: "opening",
      title: "Example — scripted line",
      blurb: "Build a plan over several moves.",
      strategyId: "opening_plan",
      fen: "start",
      steps: [
        {
          color: "w",
          from: "e2",
          to: "e4",
          coach: "Claim the center.",
          ruleId: "center_control"
        },
        { color: "b", from: "e7", to: "e5", auto: true, coach: "Black mirrors." },
        {
          color: "w",
          from: "g1",
          to: "f3",
          coach: "Develop with tempo.",
          ruleId: "develop_minor"
        }
      ]
    }
  },
  {
    method: "black_replies",
    description: "Human plays Black — teaches defensive scanning (loose pieces).",
    example: {
      id: "TEMPLATE_black_replies",
      category: "golden_rule",
      title: "Example — play Black",
      blurb: "Save a piece as Black.",
      strategyId: "dont_hang",
      fen: "r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4",
      steps: [
        {
          color: "b",
          from: "d8",
          to: "e7",
          coach: "Move the queen where it is defended.",
          ruleId: "dont_hang"
        }
      ]
    }
  }
];

/** @type {StrategyTemplate[]} */
export const CHESS_STRATEGY_TEMPLATES = [
  {
    method: "vs_coach_script",
    description: "Fixed White moves with tips; AI plays Black. Use when wild AI sacrifices must be avoided.",
    example: {
      id: "TEMPLATE_vs_coach_script",
      title: "Example — scripted vs coach",
      summary: "Three improving moves from a real middlegame.",
      kind: "vs_coach",
      ruleId: "develop_minor",
      startFen: "r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/3P1N2/PPP2PPP/RNBQK2R w KQkq - 0 4",
      lessonMoves: [
        { from: "c4", to: "b3", san: "Bb3", tip: "Improve the bishop on a long diagonal." },
        { from: "e1", to: "g1", san: "O-O", tip: "Castle before opening the center." },
        { from: "c1", to: "g5", san: "Bg5", tip: "Develop with a pin on the knight." }
      ]
    }
  },
  {
    method: "vs_coach_open",
    description: "startFen only; coach uses golden rule. Good for prophylaxis and quiet positional play.",
    example: {
      id: "TEMPLATE_vs_coach_open",
      title: "Example — open vs coach",
      summary: "Stop ...Bg4 before it lands.",
      kind: "vs_coach",
      ruleId: "king_safety",
      startFen: "rnbqkb1r/pppp1ppp/5n2/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3"
    }
  },
  {
    method: "single_shot",
    description: "Drill-only strategy (kind: drill) — links drillId, no vs-coach game.",
    example: {
      id: "TEMPLATE_drill_only",
      title: "Example — drill linked",
      summary: "Practice motif without AI opponent.",
      kind: "drill",
      ruleId: "checkmate_patterns",
      drillId: "101_smothered"
    }
  },
  {
    method: "scripted_line",
    description: "kind: both — user must finish Chess 101 drill before vs-coach on same theme.",
    example: {
      id: "TEMPLATE_both",
      title: "Example — drill then game",
      summary: "Fork in drill, then apply in a full game.",
      kind: "both",
      ruleId: "forks",
      drillId: "101_knight_fork",
      startFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
    }
  }
];
