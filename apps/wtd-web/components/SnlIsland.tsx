"use client";

import dynamic from "next/dynamic";
import { SnlIslandDom } from "./SnlIslandDom";
import { WtdGameBoot } from "./WtdGameBoot";
import { WtdGameShell } from "./WtdGameShell";

const SnlIslandClient = dynamic(
  () => Promise.resolve(SnlIslandInner),
  { ssr: false, loading: () => <p className="wtd-hub">Loading Snakes &amp; Ladders…</p> }
);

function SnlIslandInner() {
  return (
    <>
      <WtdGameShell title="Snakes &amp; Ladders">
        <SnlIslandDom />
      </WtdGameShell>
      <WtdGameBoot mode="snl" />
    </>
  );
}

export function SnlIsland() {
  return <SnlIslandClient />;
}
