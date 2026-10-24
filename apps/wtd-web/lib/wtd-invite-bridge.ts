import type { WtdGameMode } from "./load-wtd-game";

/** Bridge path-route query params to hash invite format the monolith modules expect. */
export function syncLegacyInviteFromSearchParams(mode: WtdGameMode): void {
  if (typeof window === "undefined") return;
  const u = new URL(window.location.href);
  if (mode === "chess") {
    const token = u.searchParams.get("chessInvite");
    if (!token) return;
    if ((window.location.hash || "").includes("chessInvite=")) return;
    const hash = `chess?chessInvite=${encodeURIComponent(token)}`;
    window.history.replaceState(null, "", `${u.pathname}?chessInvite=${encodeURIComponent(token)}#${hash}`);
    return;
  }
  const token = u.searchParams.get("snlInvite");
  if (!token) return;
  if ((window.location.hash || "").includes("snlInvite=")) return;
  const hash = `snakes-ladders?snlInvite=${encodeURIComponent(token)}`;
  window.history.replaceState(null, "", `${u.pathname}?snlInvite=${encodeURIComponent(token)}#${hash}`);
}
