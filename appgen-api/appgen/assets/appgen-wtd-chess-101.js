/**
 * Chess 101 — guided practice drills (offline, FEN + step validation).
 */

export const CHESS_101_PROGRESS_KEY = "wtdChess101Progress";

/**
 * @typedef {{
 *   color: "w" | "b",
 *   from: string,
 *   to: string,
 *   promotion?: string,
 *   auto?: boolean,
 *   coach: string,
 *   ruleId?: string
 * }} DrillStep
 */

/**
 * @typedef {{
 *   id: string,
 *   category: "opening" | "golden_rule" | "tactics" | "endgame",
 *   title: string,
 *   blurb: string,
 *   fen: string,
 *   strategyId: string,
 *   steps: DrillStep[]
 * }} Chess101Drill
 */

/** @type {Chess101Drill[]} */
export const CHESS_101_DRILLS = [
  {
    id: "101_center_e4",
    category: "opening",
    title: "Open with e4",
    blurb: "Claim the center — the classic first step for White.",
    strategyId: "center_control",
    fen: "start",
    steps: [
      {
        color: "w",
        from: "e2",
        to: "e4",
        coach: "Push the e-pawn two squares — you fight for the center and open lines for your bishop and queen.",
        ruleId: "center_control"
      }
    ]
  },
  {
    id: "101_develop_knight",
    category: "opening",
    title: "Develop the kingside knight",
    blurb: "After 1.e4 e5, bring a knight toward the center.",
    strategyId: "develop_minors",
    fen: "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2",
    steps: [
      {
        color: "w",
        from: "g1",
        to: "f3",
        coach: "Knights belong on f3/c3 early — they attack the center and prepare castling.",
        ruleId: "develop_minor"
      }
    ]
  },
  {
    id: "101_mini_italian",
    category: "opening",
    title: "Mini Italian setup",
    blurb: "Center, develop, and aim your bishop at f7.",
    strategyId: "opening_plan",
    fen: "start",
    steps: [
      {
        color: "w",
        from: "e2",
        to: "e4",
        coach: "Step 1 — occupy the center with e4.",
        ruleId: "center_control"
      },
      { color: "b", from: "e7", to: "e5", auto: true, coach: "Black mirrors — common and sound." },
      {
        color: "w",
        from: "g1",
        to: "f3",
        coach: "Step 2 — develop the knight and attack the e5 pawn.",
        ruleId: "develop_minor"
      },
      { color: "b", from: "b8", to: "c6", auto: true, coach: "Black develops and defends e5." },
      {
        color: "w",
        from: "f1",
        to: "c4",
        coach: "Step 3 — bishop to c4 eyes f7, a classic Italian idea.",
        ruleId: "develop_minor"
      }
    ]
  },
  {
    id: "101_castle_safety",
    category: "golden_rule",
    title: "Castle kingside",
    blurb: "Tuck the king away once the center is open.",
    strategyId: "king_safety",
    fen: "r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4",
    steps: [
      {
        color: "w",
        from: "e1",
        to: "g1",
        coach: "Castle short — your king leaves the center and the rook joins the action.",
        ruleId: "king_safety"
      }
    ]
  },
  {
    id: "101_save_hanging_queen",
    category: "golden_rule",
    title: "Don't hang the queen",
    blurb: "Spot a loose queen and move it to safety.",
    strategyId: "dont_hang",
    fen: "r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4",
    steps: [
      {
        color: "b",
        from: "d8",
        to: "e7",
        coach: "The queen on h5 had no defenders — retreat to a safe square before White punishes you.",
        ruleId: "dont_hang"
      }
    ]
  },
  {
    id: "101_knight_fork",
    category: "tactics",
    title: "Knight fork drill",
    blurb: "Jump the knight so it attacks king and rook at once.",
    strategyId: "forks",
    fen: "8/8/8/r1N5/8/8/8/k3K3 w - - 0 1",
    steps: [
      {
        color: "w",
        from: "c5",
        to: "b3",
        coach: "Nb3 forks the king on a1 and the rook on a5 — one knight, two targets.",
        ruleId: "forks"
      }
    ]
  },
  {
    id: "101_pin_skewer",
    category: "tactics",
    title: "Pin & capture drill",
    blurb: "Spot the diagonal pin, then win the tied-down piece.",
    strategyId: "pins_skewers",
    fen: "rnbqk2r/pppp1ppp/5n2/6B1/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 5 4",
    steps: [
      {
        color: "w",
        from: "g5",
        to: "f6",
        coach:
          "Bxf6 — the knight on f6 was pinned to the queen on d8; when the pawn recaptures, you can win the queen.",
        ruleId: "pins_skewers"
      }
    ]
  },
  {
    id: "101_back_rank",
    category: "tactics",
    title: "Back-rank awareness",
    blurb: "Lift a rook to give your king an escape square.",
    strategyId: "back_rank",
    fen: "r3k2r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQ1RK1 w kq - 5 6",
    steps: [
      {
        color: "w",
        from: "f1",
        to: "e1",
        coach: "Slide the f1 rook to e1 to connect with the a1 rook — and remember luft (h3/h6) so a back-rank mate cannot land.",
        ruleId: "checkmate_patterns"
      }
    ]
  },
  {
    id: "101_discovered",
    category: "tactics",
    title: "Discovered checkmate",
    blurb: "Move the knight to uncover a bishop checkmate.",
    strategyId: "discovered_attack",
    fen: "4k3/8/8/4N3/8/8/5B2/4K3 w - - 0 1",
    steps: [
      {
        color: "w",
        from: "e5",
        to: "f7",
        coach: "Nf7# is discovered mate — the bishop on f2 delivers check while the knight covers escape squares.",
        ruleId: "forks"
      }
    ]
  },
  {
    id: "101_smothered",
    category: "tactics",
    title: "Smothered mate",
    blurb: "Deliver mate with the knight when the king is boxed in.",
    strategyId: "smothered_mate",
    fen: "7k/8/5N2/8/8/8/6PP/6K1 w - - 0 1",
    steps: [
      {
        color: "w",
        from: "f6",
        to: "h7",
        coach: "Nh7# — the king on h8 has no escape squares; a classic smothered mate.",
        ruleId: "checkmate_patterns"
      }
    ]
  },
  {
    id: "101_deflection",
    category: "tactics",
    title: "Deflect the bishop",
    blurb: "Capture on b4 to deflect the bishop from defending the back rank.",
    strategyId: "deflection",
    fen: "4r1k1/5ppp/8/8/1b6/1Q3N2/5PPP/R3R1K1 w - - 0 1",
    steps: [
      {
        color: "w",
        from: "b3",
        to: "b4",
        coach: "Qxb4 wins material — the bishop was tied to other duties and could not hold everything.",
        ruleId: "forks"
      }
    ]
  },
  {
    id: "101_decoy",
    category: "tactics",
    title: "Decoy the king",
    blurb: "Give a check that lures the king onto a worse square.",
    strategyId: "decoy",
    fen: "4k3/8/8/8/4R3/8/8/4K3 w - - 0 1",
    steps: [
      {
        color: "w",
        from: "e4",
        to: "e8",
        coach: "Re8+ decoys the king — it must step forward where your pieces can pile up.",
        ruleId: "forks"
      }
    ]
  },
  {
    id: "101_zwischenzug",
    category: "tactics",
    title: "In-between check",
    blurb: "Insert a check before recapturing the knight.",
    strategyId: "zwischenzug",
    fen: "4r1k1/5ppp/8/8/3n4/8/5PPP/R3R1K1 w - - 0 1",
    steps: [
      {
        color: "w",
        from: "e1",
        to: "e8",
        coach: "Re8+ is the zwischenzug — check first, then you can deal with the knight on d4.",
        ruleId: "forks"
      }
    ]
  },
  {
    id: "101_passed_pawn",
    category: "endgame",
    title: "Push the passer",
    blurb: "Advance a protected passed pawn in the endgame.",
    strategyId: "passed_pawns",
    fen: "8/8/4k3/8/3P4/8/4K3/8 w - - 0 1",
    steps: [
      {
        color: "w",
        from: "d4",
        to: "d5",
        coach: "d5 creates a passed pawn — your king supports it while Black's king is far away.",
        ruleId: "dont_hang"
      }
    ]
  },
  {
    id: "101_opposition",
    category: "endgame",
    title: "Take the opposition",
    blurb: "Step in front of the enemy king to control key squares.",
    strategyId: "opposition",
    fen: "8/8/8/8/8/2k5/2P5/4K3 w - - 0 1",
    steps: [
      {
        color: "w",
        from: "e1",
        to: "e2",
        coach: "Ke2 faces the black king — opposition wins the race to promote the c-pawn.",
        ruleId: "dont_hang"
      }
    ]
  },
  {
    id: "101_rook_seventh",
    category: "tactics",
    title: "Rook to the 7th",
    blurb: "Lift the rook to the seventh rank to attack pawns.",
    strategyId: "rook_seventh",
    fen: "4k3/8/8/8/8/8/8/4R1K1 w - - 0 1",
    steps: [
      {
        color: "w",
        from: "e1",
        to: "e7",
        coach: "Re7+ forks king and pawns — a rook on the seventh is a classic winning idea.",
        ruleId: "forks"
      }
    ]
  },
  {
    id: "101_outpost",
    category: "tactics",
    title: "Knight outpost",
    blurb: "Plant the knight on a deep square the enemy pawns cannot chase away.",
    strategyId: "knight_outposts",
    fen: "4k3/8/8/4N3/8/8/8/4K3 w - - 0 1",
    steps: [
      {
        color: "w",
        from: "e5",
        to: "c6",
        coach: "Nc6 is a powerful outpost — deep, safe, and cramping Black.",
        ruleId: "forks"
      }
    ]
  },
  {
    id: "101_endgame_win",
    category: "endgame",
    title: "Rook endgame check",
    blurb: "Use your rook and king together to drive the enemy king back.",
    strategyId: "endgame_technique",
    fen: "8/8/4k3/8/4R3/8/8/4K3 w - - 0 1",
    steps: [
      {
        color: "w",
        from: "e4",
        to: "e6",
        coach: "Re6+ keeps the enemy king on the back rank — step by step you improve and win.",
        ruleId: "checkmate_patterns"
      }
    ]
  },
  {
    id: "101_prophylaxis_h3",
    category: "golden_rule",
    title: "Stop ...Bg4 early",
    blurb: "A small pawn move can prevent a pin before it happens.",
    strategyId: "prophylaxis",
    fen: "rnbqkb1r/pppp1ppp/5n2/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3",
    steps: [
      {
        color: "w",
        from: "h2",
        to: "h3",
        coach: "h3 asks: if ...Bg4, can you kick the bishop? Prophylaxis is fixing a problem before it appears.",
        ruleId: "king_safety"
      }
    ]
  },
  {
    id: "101_bishop_pair_light",
    category: "opening",
    title: "Activate the light bishop",
    blurb: "Keep both bishops on long diagonals when the center opens.",
    strategyId: "bishop_pair",
    fen: "r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/3P1N2/PPP2PPP/RNBQK2R w KQkq - 0 4",
    steps: [
      {
        color: "w",
        from: "c4",
        to: "b3",
        coach: "Bb3 preserves the bishop pair on open lines — no need for flashy sacrifices, just improve.",
        ruleId: "develop_minor"
      }
    ]
  },
  {
    id: "101_skewer_back_rank",
    category: "tactics",
    title: "Skewer on the back rank",
    blurb: "Check the king so a piece behind it gets blasted.",
    strategyId: "pins_skewers",
    fen: "4r1k1/5ppp/8/8/8/8/5PPP/R3R1K1 w - - 0 1",
    steps: [
      {
        color: "w",
        from: "e1",
        to: "e8",
        coach: "Re8+ skewers king and rook — when the king steps aside, the rook behind it is lost.",
        ruleId: "pins_skewers"
      }
    ]
  },
  {
    id: "101_pawn_break_d4",
    category: "opening",
    title: "Strike with d4",
    blurb: "Challenge the center when Black mirrors with ...e5.",
    strategyId: "center_control",
    fen: "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2",
    steps: [
      {
        color: "w",
        from: "d2",
        to: "d4",
        coach: "d4 fights for the center and opens lines for your c1 bishop — a classic plan after 1.e4 e5.",
        ruleId: "center_control"
      }
    ]
  }
];

export function load101Progress() {
  try {
    const raw = localStorage.getItem(CHESS_101_PROGRESS_KEY);
    if (!raw) return {};
    const p = JSON.parse(raw);
    return p && typeof p === "object" ? p : {};
  } catch (_) {
    return {};
  }
}

export function mark101DrillComplete(drillId) {
  if (!drillId) return;
  const p = load101Progress();
  if (p[drillId]) return;
  p[drillId] = Date.now();
  try {
    localStorage.setItem(CHESS_101_PROGRESS_KEY, JSON.stringify(p));
  } catch (_) {
    /* ignore */
  }
}

export function getDrillById(id) {
  return CHESS_101_DRILLS.find((d) => d.id === id) || null;
}

export function resolveDrillFen(drill) {
  if (!drill || drill.fen === "start") {
    return "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
  }
  return drill.fen;
}

/** Dev/CI guard — every human step must match a legal move on the drill FEN. */
export function validateDrillCatalog(chessFactory) {
  const Chess = chessFactory;
  const errors = [];
  for (const drill of CHESS_101_DRILLS) {
    const fen = resolveDrillFen(drill);
    const board = new Chess();
    try {
      board.load(fen);
    } catch (e) {
      errors.push(`${drill.id}: invalid FEN (${e.message})`);
      continue;
    }
    for (let i = 0; i < drill.steps.length; i++) {
      const step = drill.steps[i];
      if (step.auto) {
        try {
          const m = board.move({
            from: step.from,
            to: step.to,
            promotion: step.promotion || "q"
          });
          if (!m) errors.push(`${drill.id} step ${i}: auto move failed`);
        } catch (e) {
          errors.push(`${drill.id} step ${i}: auto ${e.message}`);
        }
        continue;
      }
      const piece = board.get(step.from);
      if (!piece) {
        errors.push(`${drill.id} step ${i}: no piece on ${step.from}`);
        continue;
      }
      if (piece.color !== step.color) {
        errors.push(`${drill.id} step ${i}: wrong color on ${step.from}`);
        continue;
      }
      const legal = board
        .moves({ square: step.from, verbose: true })
        .some((m) => m.to === step.to);
      if (!legal) errors.push(`${drill.id} step ${i}: illegal ${step.from}->${step.to}`);
      else {
        try {
          board.move({ from: step.from, to: step.to, promotion: step.promotion || "q" });
        } catch (e) {
          errors.push(`${drill.id} step ${i}: ${e.message}`);
        }
      }
    }
  }
  return errors;
}

/** @param {import("chess.js").Chess} chess @param {DrillStep} step */
export function stepMatchesMove(chess, step, from, to, promotion) {
  if (chess.turn() !== step.color) return false;
  if (step.from !== from || step.to !== to) return false;
  const moves = chess.moves({ square: from, verbose: true });
  const hit = moves.find((m) => m.to === to);
  if (!hit) return false;
  if (step.promotion && hit.promotion !== step.promotion) return false;
  return true;
}

export function currentDrillStep(drill, stepIndex) {
  if (!drill || stepIndex < 0 || stepIndex >= drill.steps.length) return null;
  return drill.steps[stepIndex];
}

export function isDrillComplete(drill, stepIndex) {
  return drill && stepIndex >= drill.steps.length;
}
