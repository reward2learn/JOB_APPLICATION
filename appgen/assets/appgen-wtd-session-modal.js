/* Fullscreen modal host for active WTD training sessions (2D / 3D / rainbow). */
(function () {
  "use strict";

  let modal = null;
  let mountEl = null;
  let headerSlot = null;
  let titleEl = null;
  let footerEl = null;
  let actionsEl = null;
  let actionsHome = null;
  let openFlag = false;
  let exitHandler = null;
  let restartHandler = null;
  let restartBtn = null;
  const homes = new Map();

  function rememberHome(el) {
    if (!el) return;
    /* Don't overwrite home while the node already lives inside the modal. */
    if (modal && modal.contains(el)) return;
    if (!el.parentNode) return;
    homes.set(el, { parent: el.parentNode, next: el.nextSibling });
  }

  function restoreNode(el) {
    const home = homes.get(el);
    if (!home || !home.parent) return;
    if (home.next && home.next.parentNode === home.parent) {
      home.parent.insertBefore(el, home.next);
    } else {
      home.parent.appendChild(el);
    }
  }

  /** Put back every node we borrowed — session body nodes and the app top bar alike. */
  function restoreAll() {
    if (!modal) return;
    Array.from(homes.keys()).forEach((el) => {
      if (modal.contains(el)) restoreNode(el);
    });
  }

  function ensureDom() {
    if (modal) return;
    modal = document.createElement("div");
    modal.id = "wtdSessionModal";
    modal.className = "wtd-session-modal";
    modal.hidden = true;
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "wtdSessionModalTitle");
    modal.innerHTML =
      /* Same app header as every other page — the live #wtdView bar is moved in on open. */
      '<div class="wtd-session-modal-topbar" id="wtdSessionModalTopbar"></div>' +
      /* Session title + right-aligned ↻/✕ sit ABOVE the play area (was a footer). */
      '<header class="wtd-session-modal-bar" id="wtdSessionModalBar">' +
      '<h1 class="wtd-session-modal-title" id="wtdSessionModalTitle">Training session</h1>' +
      '<div class="wtd-session-modal-actions">' +
      '<button type="button" class="btn ghost wtd-session-modal-restart" id="wtdSessionModalRestart" hidden aria-label="Restart game" title="Restart game"><svg viewBox="0 0 24 24" focusable="false" aria-hidden="true"><path fill="currentColor" d="M17.65 6.35A7.958 7.958 0 0 0 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0 1 12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg></button>' +
      '<button type="button" class="btn ghost wtd-session-modal-exit" id="wtdSessionModalExit" aria-label="Exit session" title="Exit session"><svg viewBox="0 0 24 24" focusable="false" aria-hidden="true"><path fill="currentColor" d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg></button>' +
      "</div></header>" +
      '<div class="wtd-session-modal-body" id="wtdSessionModalMount"></div>';
    document.body.appendChild(modal);
    mountEl = document.getElementById("wtdSessionModalMount");
    headerSlot = document.getElementById("wtdSessionModalTopbar");
    titleEl = document.getElementById("wtdSessionModalTitle");
    footerEl = modal.querySelector(".wtd-session-modal-bar");
    actionsEl = modal.querySelector(".wtd-session-modal-actions");
    if (actionsEl) {
      actionsHome = { parent: actionsEl.parentNode, next: actionsEl.nextSibling };
    }
    restartBtn = document.getElementById("wtdSessionModalRestart");
    document.getElementById("wtdSessionModalExit").addEventListener("click", () => close());
    restartBtn.addEventListener("click", () => {
      if (restartHandler) restartHandler();
    });
    modal.addEventListener("click", (e) => {
      if (e.target === modal) close();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && openFlag) close();
    });
  }

  /** Move the live app top bar (apps grid + auth) into the modal — no cloned markup, so
   *  the lab picker, auth slot and back button keep their existing wiring. */
  function mountAppHeader() {
    if (!headerSlot) return;
    const bar = document.querySelector("#wtdView > .appgen-top-bar");
    if (!bar || headerSlot.contains(bar)) return;
    rememberHome(bar);
    headerSlot.appendChild(bar);
  }

  /** Put ↻ / ✕ back in the footer — the 3D HUD borrows them while a session runs. */
  function parkSessionActions() {
    if (!actionsEl || !actionsHome || !actionsHome.parent) return;
    if (actionsEl.parentNode === actionsHome.parent) return;
    if (actionsHome.next && actionsHome.next.parentNode === actionsHome.parent) {
      actionsHome.parent.insertBefore(actionsEl, actionsHome.next);
    } else {
      actionsHome.parent.appendChild(actionsEl);
    }
  }

  function notifyResize() {
    window.requestAnimationFrame(() => {
      window.dispatchEvent(new Event("resize"));
      window.requestAnimationFrame(() => {
        window.dispatchEvent(new Event("resize"));
      });
    });
  }

  function open(opts) {
    ensureDom();
    const options = opts || {};
    const nodeIds = options.nodeIds || [];
    const layout =
      options.layout === "3d" ? "3d" : options.layout === "chess" ? "chess" : "2d";
    exitHandler = typeof options.onExit === "function" ? options.onExit : null;
    restartHandler = typeof options.onRestart === "function" ? options.onRestart : null;
    if (restartBtn) {
      restartBtn.hidden = !restartHandler;
      if (restartHandler) restartBtn.removeAttribute("hidden");
    }

    /* 3D keeps title + ↻/✕ in the HUD bar, so the footer would be a duplicate. */
    if (footerEl) footerEl.hidden = layout === "3d";
    modal.setAttribute(
      "aria-labelledby",
      layout === "3d" ? "wtd3dHudTitle" : "wtdSessionModalTitle"
    );

    /* Always clear prior session nodes (2D/3D/rainbow swap or restart). */
    restoreAll();

    nodeIds.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      rememberHome(el);
      el.hidden = false;
      el.removeAttribute("hidden");
      mountEl.appendChild(el);
    });

    mountAppHeader();

    mountEl.classList.remove("layout-2d", "layout-3d", "layout-chess", "layout-3d-results");
    if (layout === "3d") mountEl.classList.add("layout-3d");
    else if (layout === "chess") mountEl.classList.add("layout-chess");
    else mountEl.classList.add("layout-2d");

    if (titleEl && options.title) titleEl.textContent = options.title;
    modal.hidden = false;
    document.body.classList.add("wtd-session-modal-open");
    openFlag = true;
    notifyResize();
  }

  function close(skipExit) {
    if (!modal || !openFlag) return;
    openFlag = false;
    modal.hidden = true;
    document.body.classList.remove("wtd-session-modal-open");
    restoreAll();
    parkSessionActions();
    if (footerEl) footerEl.hidden = false;
    modal.setAttribute("aria-labelledby", "wtdSessionModalTitle");
    notifyResize();
    restartHandler = null;
    if (restartBtn) restartBtn.hidden = true;
    if (!skipExit && exitHandler) {
      const fn = exitHandler;
      exitHandler = null;
      fn();
    } else {
      exitHandler = null;
    }
  }

  function isOpen() {
    return openFlag;
  }

  window.AppgenWtdSessionModal = { open, close, isOpen };
})();
