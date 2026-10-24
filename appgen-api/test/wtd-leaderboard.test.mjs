import test from "node:test";
import assert from "node:assert/strict";
import {
  validateWtdEntry,
  appendWtdEntry,
  filterAndSortLeaderboard,
  sanitizeWtdEntry
} from "../lib/wtd-leaderboard.js";

test("validateWtdEntry accepts valid payload", () => {
  const r = validateWtdEntry({
    player: "Ilia",
    levelId: "inhibit",
    timeMs: 12000,
    points: 900,
    accuracyPct: 88
  });
  assert.equal(r.ok, true);
  assert.equal(r.entry.levelId, "inhibit");
});

test("validateWtdEntry rejects bad level", () => {
  const r = validateWtdEntry({ player: "x", levelId: "cheat", timeMs: 5000, points: 100, accuracyPct: 50 });
  assert.equal(r.ok, false);
});

test("validateWtdEntry accepts spatial3d", () => {
  const r = validateWtdEntry({
    player: "Ilia",
    levelId: "spatial3d",
    timeMs: 90000,
    points: 1200,
    accuracyPct: 92
  });
  assert.equal(r.ok, true);
});

test("validateWtdEntry accepts rainbow3d", () => {
  const r = validateWtdEntry({
    player: "Ilia",
    levelId: "rainbow3d",
    timeMs: 45000,
    points: 1100,
    accuracyPct: 100
  });
  assert.equal(r.ok, true);
});

test("validateWtdEntry accepts chess", () => {
  const r = validateWtdEntry({
    player: "Ilia",
    levelId: "chess",
    timeMs: 120000,
    points: 950,
    accuracyPct: 72
  });
  assert.equal(r.ok, true);
});

test("filterAndSortLeaderboard sorts by time ascending", () => {
  const rows = filterAndSortLeaderboard(
    [
      { levelId: "memory", timeMs: 20000, player: "a" },
      { levelId: "memory", timeMs: 10000, player: "b" }
    ],
    "memory",
    10
  );
  assert.equal(rows[0].timeMs, 10000);
});

test("appendWtdEntry caps list", () => {
  let list = [];
  for (let i = 0; i < 5; i++) {
    list = appendWtdEntry(list, sanitizeWtdEntry(
      { id: "id" + i, player: "p", levelId: "sprint", timeMs: 1000 + i, points: 100, accuracyPct: 90, at: new Date().toISOString() },
      "id" + i,
      new Date().toISOString()
    ), 3);
  }
  assert.equal(list.length, 3);
});
