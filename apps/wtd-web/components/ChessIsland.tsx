"use client";

import dynamic from "next/dynamic";
import { ChessIslandDom } from "./ChessIslandDom";
import { WtdGameBoot } from "./WtdGameBoot";
import { WtdGameShell } from "./WtdGameShell";

const ChessIslandClient = dynamic(
  () => Promise.resolve(ChessIslandInner),
  { ssr: false, loading: () => <p className="wtd-hub">Loading chess…</p> }
);

function ChessIslandInner() {
  return (
    <>
      <WtdGameShell title="Chess tutor">
        <ChessIslandDom />
      </WtdGameShell>
      <WtdGameBoot mode="chess" />
    </>
  );
}

export function ChessIsland() {
  return <ChessIslandClient />;
}
