/* Google OAuth UI — session via httpOnly cookie + /api/auth/* */
(function () {
  "use strict";

  const APPGEN_ADMIN_EMAIL = "reward2learn@gmail.com";

  let user = null;
  let googleConfigured = false;
  let sessionReady = false;
  let fetchPromise = null;

  function $(id) {
    return document.getElementById(id);
  }

  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  async function refresh() {
    if (fetchPromise) return fetchPromise;
    fetchPromise = fetch("/api/auth/me", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((data) => {
        user = data && data.user ? data.user : null;
        googleConfigured = !!(data && data.googleConfigured);
        sessionReady = true;
        render();
        maybePrefillPlayer();
        return user;
      })
      .catch(() => {
        user = null;
        googleConfigured = false;
        sessionReady = true;
        render();
        return null;
      })
      .finally(() => {
        fetchPromise = null;
      });
    return fetchPromise;
  }

  function preferredPlayerName() {
    if (user && user.name) return String(user.name).trim().slice(0, 40);
    if (user && user.email) return String(user.email.split("@")[0]).slice(0, 40);
    return "";
  }

  function isAppAdmin() {
    if (!user || !user.email) return false;
    return (
      String(user.email).trim().toLowerCase() === APPGEN_ADMIN_EMAIL.toLowerCase()
    );
  }

  let accessChangeTimer = null;

  /** Coalesce rapid render()/refresh() calls — avoids duplicate cloud settings pulls. */
  function notifyAccessChange() {
    if (accessChangeTimer) clearTimeout(accessChangeTimer);
    accessChangeTimer = setTimeout(() => {
      accessChangeTimer = null;
      try {
        window.dispatchEvent(
          new CustomEvent("appgen-access-change", { detail: { isAppAdmin: isAppAdmin() } })
        );
      } catch (_) {
        /* ignore */
      }
    }, 50);
  }

  function pauseWtdGamesIfOpen() {
    if (window.AppgenWtdSessionModal && window.AppgenWtdSessionModal.isOpen()) {
      window.AppgenWtdSessionModal.close();
    }
    const wtdView = document.getElementById("wtdView");
    if (!wtdView || wtdView.hidden) return;
    if (window.AppgenWtd && typeof window.AppgenWtd.onClose === "function") {
      window.AppgenWtd.onClose();
    }
    if (window.AppgenWtd3d && typeof window.AppgenWtd3d.onClose === "function") {
      window.AppgenWtd3d.onClose();
    }
    if (window.AppgenWtdRainbow && typeof window.AppgenWtdRainbow.onClose === "function") {
      window.AppgenWtdRainbow.onClose();
    }
    if (window.AppgenWtdChess && typeof window.AppgenWtdChess.onClose === "function") {
      window.AppgenWtdChess.onClose();
    }
  }

  function syncWtdBackToAppgen() {
    const btn = $("wtdBackToAppgen");
    if (!btn) return;
    btn.hidden = !isAppAdmin();
  }

  function syncWtdLabAccess() {
    const lab = document.getElementById("wtdLabContent");
    const gate = document.getElementById("wtdAuthGate");
    const cta = document.getElementById("wtdAuthGateCta");
    const wtdView = document.getElementById("wtdView");
    if (!lab || !gate) return;

    if (!sessionReady) {
      lab.hidden = true;
      gate.hidden = false;
      if (window.AppgenWtd && typeof window.AppgenWtd.syncLeaderboardToggleVisibility === "function") {
        window.AppgenWtd.syncLeaderboardToggleVisibility();
      } else {
        const lbToggle = document.getElementById("wtdLeaderboardToggle");
        if (lbToggle) lbToggle.hidden = true;
      }
      if (cta) {
        cta.innerHTML =
          '<span class="appgen-auth-muted" aria-live="polite">Checking sign-in…</span>';
      }
      return;
    }

    const authed = !!user;
    lab.hidden = !authed;
    gate.hidden = authed;
    if (window.AppgenWtd && typeof window.AppgenWtd.syncLeaderboardToggleVisibility === "function") {
      window.AppgenWtd.syncLeaderboardToggleVisibility();
    } else {
      const lbToggle = document.getElementById("wtdLeaderboardToggle");
      if (lbToggle) {
        lbToggle.hidden = !authed;
        if (!authed && window.AppgenWtd && typeof window.AppgenWtd.setLeaderboardOpen === "function") {
          window.AppgenWtd.setLeaderboardOpen(false);
        }
      }
    }

    if (cta) {
      if (authed) {
        cta.innerHTML = "";
      } else if (!gate.hidden) {
        if (!googleConfigured) {
          cta.innerHTML =
            '<span class="appgen-auth-muted" title="Set GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET on Vercel">Sign-in unavailable</span>';
        } else {
          const next =
            typeof window.appgenSignInReturnUrl === "function"
              ? window.appgenSignInReturnUrl()
              : location.pathname + (location.hash || "");
          cta.setAttribute("data-signin-next", next);
          cta.innerHTML = googleSignInButtonHtml(signInHrefFor(cta), ["big", "appgen-auth-signin-gate"]);
        }
      }
    }

    if (!wtdView || wtdView.hidden) return;

    if (authed) {
      if (window.AppgenWtd && typeof window.AppgenWtd.init === "function") {
        window.AppgenWtd.init();
      }
      return;
    }
    pauseWtdGamesIfOpen();
  }

  function maybePrefillPlayer() {
    const inp = $("wtdPlayerName");
    if (!inp || !user) return;
    const preferred = preferredPlayerName();
    if (!preferred) return;
    if (!inp.value.trim()) {
      inp.value = preferred;
      try {
        localStorage.setItem("appgen_wtd_player_name", preferred);
      } catch (_) { /* ignore */ }
    }
  }

  const LOGOUT_ICON =
    '<svg class="appgen-auth-logout-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>';

  const ADMIN_SHIELD_ICON =
    '<svg class="appgen-auth-admin-shield" width="9" height="9" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>';

  const GOOGLE_SIGNIN_ICON =
    '<img class="appgen-auth-google-icon" src="appgen/assets/google-signin-icon.png" alt="" width="20" height="20" aria-hidden="true" decoding="async">';

  function googleSignInButtonHtml(href, extraBtnClasses) {
    const classes = ["btn", "appgen-auth-signin"].concat(extraBtnClasses || []).join(" ");
    return (
      '<a class="' +
      classes +
      '" href="' +
      escapeHtml(href) +
      '">' +
      GOOGLE_SIGNIN_ICON +
      '<span class="appgen-nav-label">Sign in with Google</span></a>'
    );
  }

  function signInHrefFor(el) {
    let next =
      (el && el.getAttribute("data-signin-next")) ||
      (typeof window.appgenSignInReturnUrl === "function" ? window.appgenSignInReturnUrl() : null) ||
      (location.pathname + location.hash) ||
      "/#chess";
    if (next.startsWith("#")) next = location.pathname + next;
    if (!next.startsWith("/")) next = "/#chess";
    return "/api/auth/google?next=" + encodeURIComponent(next);
  }

  function signInHref() {
    return signInHrefFor(null);
  }

  function signInHrefForNext(nextPath) {
    let next = String(nextPath || "").trim();
    if (!next) return signInHref();
    if (next.startsWith("#")) next = location.pathname + next;
    if (!next.startsWith("/")) next = "/#chess";
    return "/api/auth/google?next=" + encodeURIComponent(next);
  }

  function openSettingsFromAvatar() {
    const wtd = document.getElementById("wtdView");
    if (wtd && !wtd.hidden && typeof window.openUserSettingsFromWtd === "function") {
      window.openUserSettingsFromWtd();
      return;
    }
    if (typeof window.openSettings === "function") {
      window.openSettings();
      return;
    }
    if (typeof window.openSettingsView === "function") {
      window.openSettingsView("user");
    }
  }

  function renderAuthSlot(el) {
    if (!googleConfigured && !user) {
      el.innerHTML = "";
      return;
    }
    if (user) {
      const label = escapeHtml(user.name || user.email || "Signed in");
      const adminBadge = isAppAdmin()
        ? '<span class="appgen-auth-admin-badge" title="Admin (SUP)" aria-label="Admin (SUP)">' +
          ADMIN_SHIELD_ICON +
          "</span>"
        : "";
      const initial = escapeHtml(
        String(user.name || user.email || "?").trim().charAt(0).toUpperCase() || "?"
      );
      const avatarInner = user.picture
        ? '<img class="appgen-auth-avatar" src="' +
          escapeHtml(user.picture) +
          '" alt="" width="28" height="28" referrerpolicy="no-referrer">'
        : '<span class="appgen-auth-avatar appgen-auth-avatar--fallback" aria-hidden="true">' +
          initial +
          "</span>";
      const avatarBtn =
        '<button type="button" class="appgen-auth-avatar-btn" data-auth-settings aria-label="User Settings" title="User Settings">' +
        '<span class="appgen-auth-avatar-wrap">' +
        avatarInner +
        adminBadge +
        "</span></button>";
      el.innerHTML =
        '<div class="appgen-auth-signed">' +
        avatarBtn +
        "</strong></span>" +
        '<button type="button" class="btn ghost appgen-auth-logout" data-auth-logout aria-label="Sign out" title="Sign out">' +
        LOGOUT_ICON +
        "</button>" +
        "</div>";
      return;
    }
    const inGate = el.closest("#wtdAuthGate");
    if (inGate) {
      el.innerHTML = "";
      return;
    }
    /* WTD nav: card gate is the sole unsigned sign-in CTA — no duplicate header button */
    if (el.closest(".wtd-auth") || el.closest("#wtdView .appgen-top-auth")) {
      el.innerHTML = "";
      return;
    }
    if (!googleConfigured) {
      el.innerHTML =
        '<span class="appgen-auth-muted" title="Set GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET on Vercel">Sign-in unavailable</span>';
      return;
    }
    el.innerHTML = googleSignInButtonHtml(signInHrefFor(el), ["ghost"]);
  }

  function render() {
    syncWtdLabAccess();
    document.querySelectorAll("[data-appgen-auth]").forEach(renderAuthSlot);
    syncWtdBackToAppgen();
    notifyAccessChange();
  }

  async function logout() {
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
    } catch (_) { /* ignore */ }
    user = null;
    render();
  }

  function init() {
    document.addEventListener("click", (e) => {
      if (e.target.closest("[data-auth-logout]")) {
        e.preventDefault();
        logout();
        return;
      }
      const settingsBtn = e.target.closest("[data-auth-settings]");
      if (!settingsBtn) return;
      e.preventDefault();
      openSettingsFromAvatar();
    });
    syncWtdLabAccess();
    refresh();
  }

  window.AppgenAuth = {
    init,
    refresh,
    getUser: () => user,
    preferredPlayerName,
    isSignedIn: () => !!user,
    isSessionReady: () => sessionReady,
    isAppAdmin,
    adminEmail: APPGEN_ADMIN_EMAIL,
    syncWtdLabAccess,
    signInHref,
    signInHrefForNext
  };

  if (!window.__appgenExtensionRejectionBound) {
    window.__appgenExtensionRejectionBound = true;
    window.addEventListener("unhandledrejection", (ev) => {
      const r = ev.reason;
      const blob = String(r?.message || r?.stack || r || "");
      if (!/M_ID|200\.js/i.test(blob)) return;
      if (!window.__appgenExtFetchWarned) {
        window.__appgenExtFetchWarned = true;
        console.warn(
          "[Application Generator] Browser extension noise (200.js / M_ID) — not AppGen. " +
            "Disable VPN/ad extensions for this site if WTD or saves misbehave."
        );
      }
      ev.preventDefault();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
