/** Minimal AppgenWtd surface for game-only Next routes (no full WTD 2D lab). */
export function installWtdStubs(mode: "chess" | "snl"): void {
  if (typeof window === "undefined") return;

  const wtdView = document.getElementById("wtdView");
  if (wtdView) {
    wtdView.hidden = false;
    wtdView.classList.add("wtd-game-lab", "wtd-mobile-chess-lab");
  }

  const existing = window.AppgenWtd;
  window.AppgenWtd = {
    init: existing?.init ?? (() => {}),
    onClose: existing?.onClose ?? (() => {}),
    getPlayerName: existing?.getPlayerName ?? (() => "Guest"),
    submitRun: existing?.submitRun ?? (async () => {}),
    setWtdMode: existing?.setWtdMode ?? (() => {}),
    hydrateWtdModeFromHash: existing?.hydrateWtdModeFromHash ?? (() => {}),
    getWtdMode: existing?.getWtdMode ?? (() => mode),
    openGameHelp: existing?.openGameHelp ?? (() => {}),
    closeGameHelp: existing?.closeGameHelp ?? (() => {}),
    setLeaderboardOpen: existing?.setLeaderboardOpen ?? (() => {}),
    isMobileChessLab: () => window.matchMedia("(max-width: 720px)").matches,
    syncMobileChessLabUi: () => {
      const lab = window.matchMedia("(max-width: 720px)").matches;
      wtdView?.classList.toggle("wtd-game-lab", lab || mode === "chess" || mode === "snl");
      wtdView?.classList.toggle("wtd-mobile-chess-lab", lab);
    }
  };
}
