#!/usr/bin/env node
import { Chess } from "chess.js";
import { validateDrillCatalog } from "../../appgen/assets/appgen-wtd-chess-101.js";
import { CHESS_STRATEGIES } from "../../appgen/assets/appgen-wtd-chess-strategies.js";

const errors = validateDrillCatalog(Chess);

for (const s of CHESS_STRATEGIES) {
  if (!s.startFen || !s.lessonMoves?.length) continue;
  const board = new Chess();
  try {
    board.load(s.startFen);
  } catch (e) {
    errors.push(`${s.id}: invalid startFen (${e.message})`);
    continue;
  }
  for (let i = 0; i < s.lessonMoves.length; i++) {
    const step = s.lessonMoves[i];
    while (board.turn() !== "w" && board.moves().length) {
      board.move(board.moves()[0]);
    }
    if (board.turn() !== "w") {
      errors.push(`${s.id} lesson ${i}: no White move available`);
      break;
    }
    const legal = board
      .moves({ square: step.from, verbose: true })
      .some((m) => m.to === step.to);
    if (!legal) errors.push(`${s.id} lesson ${i}: illegal ${step.from}->${step.to}`);
    else board.move({ from: step.from, to: step.to, promotion: "q" });
  }
}

if (errors.length) {
  console.error("Chess drill/lesson validation failed:\n" + errors.join("\n"));
  process.exit(1);
}
console.log("Chess 101 + strategy lessonMoves: OK");
