/* Fullscreen modal host for active WTD training sessions (2D / 3D / rainbow). */
(function () {
  "use strict";

  let modal = null;
  let mountEl = null;
  let titleEl = null;
  let openFlag = false;
  let exitHandler = null;
  let restartHandler = null;
  let restartBtn = null;
  const homes = new Map();

  function rememberHome(el) {
    if (!el) return;
    /* Don't overwrite home while the node already lives inside the modal. */
    if (mountEl && mountEl.contains(el)) return;
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

  function restoreAll() {
    if (!mountEl) return;
    const nodes = Array.from(mountEl.children);
    nodes.forEach((el) => restoreNode(el));
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
      '<header class="wtd-session-modal-header">' +
      '<h1 class="wtd-session-modal-title" id="wtdSessionModalTitle">Training session</h1>' +
      '<div class="wtd-session-modal-actions">' +
      '<button type="button" class="btn ghost wtd-session-modal-restart" id="wtdSessionModalRestart" hidden aria-label="Restart game" title="Restart game">↻</button>' +
      '<button type="button" class="btn ghost wtd-session-modal-exit" id="wtdSessionModalExit">Exit session</button>' +
      "</div></header>" +
      '<div class="wtd-session-modal-body" id="wtdSessionModalMount"></div>';
    document.body.appendChild(modal);
    mountEl = document.getElementById("wtdSessionModalMount");
    titleEl = document.getElementById("wtdSessionModalTitle");
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
