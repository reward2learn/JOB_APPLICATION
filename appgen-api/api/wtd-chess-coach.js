// Optional chess coach copy — Vercel AI Gateway with safe fallback on client.
// POST { fen, san?, actor, beginner, intent? }
//   intent "explain" (default) → { tip }
//   intent "next_white" → { tip, from?, to?, san? }

import { Chess } from "chess.js";
import { buildPipelineAdapter, normalizeLlmRequest } from "./llm-adapter.js";

const SQ = /^[a-h][1-8]$/;

function normalizeSquare(sq) {
  if (typeof sq !== "string" || sq.length !== 2) return null;
  const n = sq.toLowerCase();
  return SQ.test(n) ? n : null;
}

function findLegalWhiteMove(fen, from, to, san) {
  const chess = new Chess();
  try {
    chess.load(fen);
  } catch (_) {
    return null;
  }
  if (chess.turn() !== "w") return null;
  const moves = chess.moves({ verbose: true });
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

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("Allow", "POST");
    res.end("Method Not Allowed");
    return;
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch (_) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Invalid JSON" }));
      return;
    }
  }

  const fen = typeof body.fen === "string" ? body.fen.slice(0, 120) : "";
  const san = typeof body.san === "string" ? body.san.slice(0, 16) : "";
  const actor = body.actor === "ai" ? "ai" : "human";
  const beginner = !!body.beginner;
  const intent = body.intent === "next_white" ? "next_white" : "explain";
  const goldenRuleName =
    typeof body.goldenRuleName === "string" ? body.goldenRuleName.slice(0, 80) : "";
  const goldenRuleTip =
    typeof body.goldenRuleTip === "string" ? body.goldenRuleTip.slice(0, 220) : "";
  const goldenPattern =
    typeof body.goldenPattern === "string" ? body.goldenPattern.slice(0, 180) : "";
  const curriculumStrategyId =
    typeof body.curriculumStrategyId === "string" ? body.curriculumStrategyId.slice(0, 64) : "";
  const curriculumStrategyTitle =
    typeof body.curriculumStrategyTitle === "string"
      ? body.curriculumStrategyTitle.slice(0, 80)
      : "";
  const curriculumStrategySummary =
    typeof body.curriculumStrategySummary === "string"
      ? body.curriculumStrategySummary.slice(0, 220)
      : "";

  if (!fen) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "fen required" }));
    return;
  }
  if (intent === "explain" && !san) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "fen and san required" }));
    return;
  }

  const prefs = normalizeLlmRequest({ provider: "auto" });
  let adapter;
  try {
    adapter = buildPipelineAdapter(prefs, {}).adapter;
  } catch (e) {
    res.statusCode = 503;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Coach unavailable" }));
    return;
  }

  const nextWhite = intent === "next_white";

  const strategyFrame =
    curriculumStrategyTitle && curriculumStrategySummary
      ? " The student is studying winning strategy \"" +
        curriculumStrategyTitle +
        "\" — " +
        curriculumStrategySummary +
        (curriculumStrategyId ? " (id: " + curriculumStrategyId + ")." : ".")
      : "";
  let goldenFrame = strategyFrame;
  if (goldenRuleName && goldenRuleTip) {
    goldenFrame +=
      " Tie your tip to this golden rule when it fits: \"" +
      goldenRuleName +
      "\" — " +
      goldenRuleTip +
      (goldenPattern ? " Pattern to mention: " + goldenPattern : "") +
      ".";
  }

  const system = nextWhite
    ? "You are a friendly chess coach for beginners. White is to move. " +
      "Reply with JSON only: {\"tip\":\"one or two short plain sentences\",\"from\":\"e2\",\"to\":\"e4\"}. " +
      "Use lowercase UCI squares for from and to. Pick one legal, sensible developing move for White — " +
      "prefer center pawns, piece development, castling, and safe development; avoid unsound bishop or queen sacrifices " +
      "unless checkmate is forced. Never suggest undoing White's last move. Optional \"san\" field with the move in SAN." +
      goldenFrame
    : "You are a friendly chess coach for beginners in a training app. " +
      "Reply with ONE or TWO short plain sentences. No markdown, no move notation lists, no JSON. " +
      "Focus on one teaching idea: center control, development, king safety, hanging pieces, or tactics." +
      goldenFrame;

  const user = nextWhite
    ? "Position FEN: " +
      fen +
      (san ? "\nOpponent (Black) just played SAN: " + san : "") +
      "\nAudience: " +
      (beginner ? "beginner" : "casual") +
      "\nRecommend White's best next move and explain why in tip."
    : "Position FEN: " +
      fen +
      "\nLast move SAN: " +
      san +
      "\nWho moved: " +
      (actor === "ai" ? "the coach (Black)" : "the student (White)") +
      "\nAudience: " +
      (beginner ? "beginner" : "casual") +
      "\nExplain why that move matters or what to watch next.";

  try {
    const raw = await adapter.complete({
      tier: "cheap",
      system,
      user,
      maxTokens: nextWhite ? 180 : 120,
      temperature: 0.35,
      jsonMode: nextWhite
    });
    const text = String(raw || "")
      .replace(/\s+/g, " ")
      .trim();

    if (nextWhite) {
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch (_) {
        const m = text.match(/\{[\s\S]*\}/);
        parsed = m ? JSON.parse(m[0]) : null;
      }
      const tip =
        parsed && typeof parsed.tip === "string"
          ? parsed.tip.trim().slice(0, 420)
          : text.slice(0, 420);
      if (!tip) {
        res.statusCode = 502;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Empty coach response" }));
        return;
      }
      const out = { tip };
      const from = parsed ? normalizeSquare(parsed.from) : null;
      const to = parsed ? normalizeSquare(parsed.to) : null;
      const sanField =
        parsed && typeof parsed.san === "string" && parsed.san.trim()
          ? parsed.san.trim().slice(0, 16)
          : "";
      const legal = findLegalWhiteMove(fen, from, to, sanField);
      if (legal) {
        out.from = legal.from;
        out.to = legal.to;
        out.san = legal.san;
      }
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Cache-Control", "no-store");
      res.end(JSON.stringify(out));
      return;
    }

    const tip = text.slice(0, 420);
    if (!tip) {
      res.statusCode = 502;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Empty coach response" }));
      return;
    }
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store");
    res.end(JSON.stringify({ tip }));
  } catch (e) {
    res.statusCode = 503;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Coach request failed" }));
  }
}
