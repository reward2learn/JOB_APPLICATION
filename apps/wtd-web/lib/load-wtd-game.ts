import { WTD_ASSET_VERSION } from "./wtd-import-map";
import { installWtdStubs } from "./wtd-stubs";

export type WtdGameMode = "chess" | "snl";

function loadClassicScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const el = document.createElement("script");
    el.src = src;
    el.async = false;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(el);
  });
}

let bootPromise: Promise<void> | null = null;
let bootMode: WtdGameMode | null = null;

/**
 * Load monolith game modules from /public/appgen/assets (synced from repo appgen/assets).
 * Idempotent per mode for the lifetime of the page.
 */
export function bootWtdGame(mode: WtdGameMode): Promise<void> {
  if (bootPromise && bootMode === mode) return bootPromise;
  if (bootPromise && bootMode !== mode) {
    return bootPromise.then(() => bootWtdGame(mode));
  }
  bootMode = mode;
  bootPromise = (async () => {
    const v = WTD_ASSET_VERSION;
    const base = `/appgen/assets`;

    await loadClassicScript(`${base}/appgen-auth.js`);
    if (mode === "chess") {
      await loadClassicScript(`${base}/appgen-wtd-session-modal.js`);
    }

    await import(/* webpackIgnore: true */ `${base}/appgen-wtd-store.js?v=${v}`);

    if (mode === "chess") {
      await import(/* webpackIgnore: true */ `${base}/appgen-wtd-chess.js?v=${v}`);
    } else {
      await import(/* webpackIgnore: true */ `${base}/appgen-wtd-snl.js?v=20261022-chess-env-snl-lobby-redux`);
    }

    installWtdStubs(mode);

    if (mode === "chess" && window.AppgenWtdChess?.init) {
      window.AppgenWtdChess.init();
    } else if (mode === "snl" && window.AppgenWtdSnL?.init) {
      window.AppgenWtdSnL.init();
    }
  })();

  return bootPromise;
}
