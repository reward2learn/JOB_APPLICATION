/**
 * Installable standalone apps (PWA) + offline shell for Training Lab games.
 * Chess practice is offline-capable; Snakes & Ladders lobby needs network.
 */
(function () {
  const MANIFEST_BY_APP = {
    lab: "/manifest.webmanifest",
    chess: "/manifest-chess.webmanifest",
    snl: "/manifest-snl.webmanifest"
  };

  /** Apps that can run usefully without network after install. */
  const OFFLINE_OK = {
    chess: true,
    snl: false,
    lab: true,
    "2d": true,
    "3d": true,
    rainbow: true
  };

  let deferredPrompt = null;
  let swReady = false;

  function $(id) {
    return document.getElementById(id);
  }

  function isStandalone() {
    return (
      window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true
    );
  }

  function setManifest(appKey) {
    const href = MANIFEST_BY_APP[appKey] || MANIFEST_BY_APP.lab;
    let link = document.querySelector('link[rel="manifest"]');
    if (!link) {
      link = document.createElement("link");
      link.rel = "manifest";
      document.head.appendChild(link);
    }
    if (link.getAttribute("href") !== href) link.setAttribute("href", href);
  }

  async function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return false;
    try {
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      swReady = !!reg;
      return true;
    } catch (_) {
      return false;
    }
  }

  function canPromptInstall() {
    return !!deferredPrompt;
  }

  /**
   * @param {"chess"|"snl"|"lab"} appKey
   * @returns {Promise<{ ok: boolean, mode?: string, message?: string }>}
   */
  async function installApp(appKey) {
    const key = appKey === "snl" || appKey === "chess" ? appKey : "lab";
    setManifest(key);

    if (isStandalone()) {
      return {
        ok: true,
        mode: "already",
        message: "Already running as an installed app (no browser bar)."
      };
    }

    if (deferredPrompt) {
      deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice.catch(() => ({ outcome: "dismissed" }));
      deferredPrompt = null;
      syncInstallUi();
      if (choice && choice.outcome === "accepted") {
        return { ok: true, mode: "prompt", message: "App added to your device." };
      }
      return { ok: false, mode: "dismissed", message: "Install cancelled." };
    }

    // iOS Safari / browsers without beforeinstallprompt
    const isiOS =
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    if (isiOS) {
      return {
        ok: false,
        mode: "ios",
        message:
          "On iPhone/iPad: tap Share → Add to Home Screen. It opens full-screen without the address bar."
      };
    }

    return {
      ok: false,
      mode: "manual",
      message:
        ""
    };
  }

  function offlineCapable(appKey) {
    return !!OFFLINE_OK[appKey];
  }

  function syncInstallUi() {
    document.querySelectorAll("[data-appgen-install]").forEach((btn) => {
      const key = btn.getAttribute("data-appgen-install") || "lab";
      const offline = offlineCapable(key);
      btn.disabled = false;
      if (isStandalone()) {
        btn.textContent = "Installed";
        btn.title = "Running as standalone app";
      } else if (canPromptInstall()) {
        btn.textContent = "Add to Home";
        btn.title = offline
          ? "Install for offline / no browser bar"
          : "Install (online play; no browser bar)";
      } else {
        btn.textContent = "Add to Home";
        btn.title = offline
          ? "Install instructions — offline practice supported"
          : "Install instructions — needs network for multiplayer";
      }
      const badge = btn.parentElement && btn.parentElement.querySelector("[data-appgen-offline-badge]");
      if (badge) {
        badge.hidden = !offline;
      }
    });
    const banner = $("appgenPwaBanner");
    if (banner) {
      banner.hidden = isStandalone() || !canPromptInstall();
    }
  }

  function ensureInstallButtonsBound() {
    if (window.__appgenPwaInstallBound) return;
    window.__appgenPwaInstallBound = true;
    document.addEventListener("click", (e) => {
      const t = e.target;
      if (!(t instanceof Element)) return;
      const btn = t.closest("[data-appgen-install]");
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      const key = btn.getAttribute("data-appgen-install") || "lab";
      installApp(key).then((r) => {
        const menu = btn.closest(".appgen-lab-picker-menu");
        const status =
          (menu && menu.querySelector(".appgen-lab-picker-status")) ||
          $("appgenPwaInstallStatus");
        if (status) {
          status.hidden = false;
          status.textContent = r.message || "";
        } else if (r.message) {
          window.alert(r.message);
        }
        syncInstallUi();
      });
    });
  }

  function init() {
    setManifest(
      (function () {
        try {
          const pref = localStorage.getItem("appgenPreferredLab");
          if (pref === "snl") return "snl";
          if (pref === "cognitive") return "lab";
          return "chess";
        } catch (_) {
          return "chess";
        }
      })()
    );
    ensureInstallButtonsBound();
    window.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault();
      deferredPrompt = e;
      syncInstallUi();
    });
    window.addEventListener("appinstalled", () => {
      deferredPrompt = null;
      syncInstallUi();
    });
    registerServiceWorker().then(() => syncInstallUi());
    syncInstallUi();
  }

  window.AppgenPwa = {
    init,
    installApp,
    setManifest,
    isStandalone,
    canPromptInstall,
    offlineCapable,
    syncInstallUi
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
