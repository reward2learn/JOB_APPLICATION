/* Walk the Dragon — neuroscience puzzles + local cache + server leaderboard sync */
(function () {
  "use strict";

  const STORAGE_KEY = "appgen_wtd_leaderboard_v1";
  const PENDING_SYNC_KEY = "appgen_wtd_pending_sync_v1";
  const PLAYER_KEY = "appgen_wtd_player_name";
  const API_PATH = "/api/wtd-leaderboard";

  let boardCache = null;
  let cloudAvailable = false;
  let cloudFetchPromise = null;

  const COLORS = [
    { id: "red", label: "Red", hex: "#c0392b" },
    { id: "blue", label: "Blue", hex: "#2980b9" },
    { id: "green", label: "Green", hex: "#27ae60" },
    { id: "orange", label: "Orange", hex: "#d35400" }
  ];

  const SHAPES = ["●", "■", "▲", "◆"];
  const SHAPE_COLORS = ["#c0392b", "#2980b9", "#27ae60", "#8e44ad"];

  /* Working Memory Span — 3D-look glyph set. Each icon is a self-contained
     <svg> with a radial highlight + shadowed base so it reads as a glossy
     physical object instead of a flat emoji (which is font-dependent and
     vanishes in headless/print). 24x24 viewBox; CSS sizes them in the tile. */
  const ICON_SVGS = [
    /* brain */
    '<svg viewBox="0 0 24 24" focusable="false" aria-hidden="true"><defs><radialGradient id="mb" cx=".35" cy=".28" r=".85"><stop offset="0" stop-color="#fbcfe8"/><stop offset=".55" stop-color="#f472b6"/><stop offset="1" stop-color="#be185d"/></radialGradient></defs><path d="M12.1 4.5c-1-.9-2.5-1.2-3.7-.6C7 3.4 5.4 4.1 4.8 5.4c-1.2 0-2.3 1-2.4 2.2-1 .5-1.5 1.7-1.1 2.8-.7.9-.5 2.2.4 2.9-.2 1.2.7 2.4 1.9 2.6.2 1.2 1.3 2.1 2.5 2 .5.8 1.5 1.2 2.4.9.5.3 1.2.4 1.7.2V4.8c-.1 0-.4-.1-.7-.3z" fill="url(#mb)"/><path d="M11.9 4.5c1-.9 2.5-1.2 3.7-.6 1.4-.5 3 .2 3.6 1.5 1.2 0 2.3 1 2.4 2.2 1 .5 1.5 1.7 1.1 2.8.7.9.5 2.2-.4 2.9.2 1.2-.7 2.4-1.9 2.6-.2 1.2-1.3 2.1-2.5 2-.5.8-1.5 1.2-2.4.9-.5.3-1.2.4-1.7.2V4.8c.1 0 .4-.1.7-.3z" fill="url(#mb)" opacity=".92"/><path d="M12 5.2v13.4" stroke="#9d174d" stroke-width="1.1" opacity=".7"/><ellipse cx="8.4" cy="7.6" rx="1.6" ry="1" fill="#fff" opacity=".45"/><ellipse cx="15.4" cy="10.4" rx="1.3" ry=".8" fill="#fff" opacity=".3"/></svg>',
    /* snake */
    '<svg viewBox="0 0 24 24" focusable="false" aria-hidden="true"><defs><linearGradient id="ms" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4ade80"/><stop offset=".5" stop-color="#16a34a"/><stop offset="1" stop-color="#14532d"/></linearGradient></defs><path d="M5.6 19c3.4 0 2.6-3.4 5.6-3.4s2.6 3.4 5.6 3.4" fill="none" stroke="url(#ms)" stroke-width="4.4" stroke-linecap="round"/><path d="M5.6 15.4c1.2-2.4.2-4.6 1.4-6.6" fill="none" stroke="url(#ms)" stroke-width="4.4" stroke-linecap="round"/><path d="M7 8.8c.4-2.2 2.4-3.6 4.6-3.4" fill="none" stroke="url(#ms)" stroke-width="4.4" stroke-linecap="round"/><circle cx="13.4" cy="5.4" r="3.4" fill="url(#ms)"/><circle cx="14.6" cy="4.5" r=".8" fill="#052e16"/><circle cx="14.8" cy="4.3" r=".3" fill="#fff" opacity=".8"/><path d="M16.4 5.6 19 6.4" stroke="#ef4444" stroke-width="1" stroke-linecap="round"/><ellipse cx="10.6" cy="16.8" rx="1.6" ry=".9" fill="#fff" opacity=".3" transform="rotate(-18 10.6 16.8)"/></svg>',
    /* lightning */
    '<svg viewBox="0 0 24 24" focusable="false" aria-hidden="true"><defs><linearGradient id="ml" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fef08a"/><stop offset=".5" stop-color="#facc15"/><stop offset="1" stop-color="#ca8a04"/></linearGradient></defs><path d="M13.8 2.2 5.2 13.6h5.1L9.4 21.8 18.8 10h-5.4z" fill="url(#ml)" stroke="#a16207" stroke-width="1" stroke-linejoin="round"/><path d="M12.8 5.6 8.8 12.2h3l-.8 4.4" fill="none" stroke="#fff" stroke-width="1" stroke-linecap="round" opacity=".65"/></svg>',
    /* leaf */
    '<svg viewBox="0 0 24 24" focusable="false" aria-hidden="true"><defs><linearGradient id="mf" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#86efac"/><stop offset=".5" stop-color="#22c55e"/><stop offset="1" stop-color="#15803d"/></linearGradient></defs><path d="M4.2 20.2c-.6-8.6 5.2-15 15.6-16 1 10.4-4.6 16.4-12.4 16.4-1.3 0-2.5-.1-3.2-.4z" fill="url(#mf)"/><path d="M4.2 20.2c3.8-6 7.6-9.4 13.6-11.6" fill="none" stroke="#14532d" stroke-width="1.4" stroke-linecap="round" opacity=".8"/><path d="M9.6 15.4c.2-2.4 1-4.2 2.4-5.8" fill="none" stroke="#14532d" stroke-width="1" stroke-linecap="round" opacity=".5"/><ellipse cx="8.6" cy="10.2" rx="1.8" ry="1" fill="#fff" opacity=".4" transform="rotate(-42 8.6 10.2)"/></svg>',
    /* gem / diamond */
    '<svg viewBox="0 0 24 24" focusable="false" aria-hidden="true"><defs><linearGradient id="mg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#93c5fd"/><stop offset=".5" stop-color="#3b82f6"/><stop offset="1" stop-color="#1e3a8a"/></linearGradient></defs><path d="M12 2.5 21.2 9 12 21.5 2.8 9z" fill="url(#mg)" stroke="#1d4ed8" stroke-width=".9" stroke-linejoin="round"/><path d="M12 2.5 7 9h10z" fill="#bfdbfe" opacity=".8"/><path d="M2.8 9h18.4" stroke="#1d4ed8" stroke-width=".9" opacity=".7"/><path d="M7 9l5 12.5L17 9" fill="none" stroke="#1d4ed8" stroke-width=".8" opacity=".6"/><path d="M12 2.5 14.4 9 12 21.5 9.6 9z" fill="#dbeafe" opacity=".25"/></svg>',
    /* sparkle / star */
    '<svg viewBox="0 0 24 24" focusable="false" aria-hidden="true"><defs><radialGradient id="mk" cx=".4" cy=".35" r=".8"><stop offset="0" stop-color="#e9d5ff"/><stop offset=".5" stop-color="#a855f7"/><stop offset="1" stop-color="#6b21a8"/></radialGradient></defs><path d="M12 2.4c.7 5 2.3 7.6 9.2 8.8-6.9 1.2-8.5 3.8-9.2 8.8-.7-5-2.3-7.6-9.2-8.8 6.9-1.2 8.5-3.8 9.2-8.8z" fill="url(#mk)" stroke="#7e22ce" stroke-width=".7" stroke-linejoin="round"/><path d="M18.6 2.8c.2 1.4.7 2.1 2.6 2.5-1.9.4-2.4 1.1-2.6 2.5-.2-1.4-.7-2.1-2.6-2.5 1.9-.4 2.4-1.1 2.6-2.5z" fill="#c084fc" stroke="#7e22ce" stroke-width=".5"/><ellipse cx="10.6" cy="9" rx="1.4" ry=".9" fill="#fff" opacity=".4" transform="rotate(-32 10.6 9)"/></svg>'
  ];

  /* Attention sprint targets — collect the fruit, never the bomb. */
  const FRUIT_SVGS = [
    /* apple */
    '<svg viewBox="0 0 24 24" focusable="false"><path d="M12 8.5c-1.3-1.4-3.5-1.9-5.1-.8C4.9 9 5 11.9 6.3 14.1c.9 1.5 2.2 2.4 3.3 2.4.7 0 1.3-.3 2.4-.3s1.7.3 2.4.3c1.1 0 2.4-.9 3.3-2.4 1.3-2.2 1.4-5.1-.6-6.4-1.6-1.1-3.8-.6-5.1.8z" fill="#ef4444"/><path d="M12 8.5c0-1.9 1.2-3.3 3-3.8" fill="none" stroke="#15803d" stroke-width="1.8" stroke-linecap="round"/><path d="M13.4 7c1.5-.6 2.9 0 3.3 1.4-1.6.5-2.9-.1-3.3-1.4z" fill="#22c55e"/></svg>',
    /* orange */
    '<svg viewBox="0 0 24 24" focusable="false"><circle cx="12" cy="14" r="7.5" fill="#f97316"/><path d="M12 6.5c0-2 1.5-3.5 3.5-3.8-.2 2.2-1.6 3.5-3.5 3.8z" fill="#22c55e"/><path d="M12 7V5.4" stroke="#15803d" stroke-width="1.6" stroke-linecap="round"/></svg>',
    /* grapes */
    '<svg viewBox="0 0 24 24" focusable="false"><g fill="#8b5cf6"><circle cx="9" cy="10" r="3"/><circle cx="15" cy="10" r="3"/><circle cx="12" cy="14.5" r="3"/><circle cx="8" cy="15.5" r="3"/><circle cx="16" cy="15.5" r="3"/><circle cx="12" cy="19.5" r="2.6"/></g><path d="M12 7V4.6" stroke="#15803d" stroke-width="1.6" stroke-linecap="round"/></svg>',
    /* banana */
    '<svg viewBox="0 0 24 24" focusable="false"><path d="M5.5 5.5a12 12 0 0 0 13 13" fill="none" stroke="#facc15" stroke-width="6" stroke-linecap="round"/><path d="M5.5 5.5 4.2 4.2M18.5 18.5l1.3 1.3" stroke="#a16207" stroke-width="2" stroke-linecap="round"/></svg>',
    /* cherries */
    '<svg viewBox="0 0 24 24" focusable="false"><path d="M12 5c-2 2-4.5 4-5.5 7M12 5c2 2 4 4.5 4.5 7" fill="none" stroke="#15803d" stroke-width="1.8" stroke-linecap="round"/><circle cx="6.5" cy="16.5" r="4.2" fill="#ef4444"/><circle cx="16.5" cy="16.5" r="4.2" fill="#dc2626"/></svg>'
  ];
  const BOMB_SVG =
    '<svg viewBox="0 0 24 24" focusable="false"><circle cx="10.5" cy="14.5" r="7" fill="#1f2937"/>' +
    '<rect x="13" y="4.6" width="3.2" height="5" rx="1.2" fill="#6b7280" transform="rotate(35 14.6 7.1)"/>' +
    '<path d="M16.4 5.6c1.4-1.2 3.2-.8 3.8.9" fill="none" stroke="#f59e0b" stroke-width="1.8" stroke-linecap="round"/>' +
    '<path d="M20.4 3.4l.8 1.5M21.4 6.4l1.5.3" stroke="#fbbf24" stroke-width="1.6" stroke-linecap="round"/></svg>';

  const LEVELS = [
    {
      id: "inhibit",
      mode: "2d",
      name: "Stroop Gate",
      domain: "Executive inhibition",
      science:
        "Naming ink colour while ignoring the word trains prefrontal control — the same friction you feel when stress hijacks automatic reactions.",
      rounds: 6,
      intro: "Tap the colour of the ink, not the word. Speed with accuracy earns Dragon Points."
    },
    {
      id: "memory",
      mode: "2d",
      name: "Working Memory Span",
      domain: "Working memory",
      science:
        "Short sequences mirror n-back style load: holding items in mind while the next stimulus arrives — core to focus between meetings.",
      span: 4,
      intro: "Watch the sequence, then tap the icons in the same order."
    },
    {
      id: "switch",
      mode: "2d",
      name: "Task Switch",
      domain: "Cognitive flexibility",
      science:
        "Alternating rules (shape vs colour) measures switch cost — how quickly you adapt when priorities change mid-day.",
      rounds: 8,
      intro: "Follow the banner: match SHAPE on odd rounds, COLOUR on even rounds."
    },
    {
      id: "pattern",
      mode: "2d",
      name: "Pattern Matrix",
      domain: "Fluid reasoning",
      science:
        "Matrix completion taps pattern abstraction — related to problem-solving under uncertainty without extra cognitive noise.",
      puzzles: 4,
      intro: "Find the missing tile that completes the 3×3 pattern."
    },
    {
      id: "sprint",
      mode: "2d",
      name: "Attention Sprint",
      domain: "Selective attention",
      science:
        "A ninety-second micro-reset: tap brain & dragon targets, ignore distractors — practice for one-minute mindfulness breaks at work.",
      durationMs: 45000,
      intro: "Tap 🧠 and 🐉 only. Avoid ✦ distractors before time runs out."
    },
    {
      id: "spatial3d",
      mode: "3d",
      name: "3D Spatial Lab",
      domain: "Visuospatial memory",
      science:
        "Object–location binding in 3D supports episodic recall — rehearsing where tasks live on your mental workspace between interruptions.",
      intro: "Open the 3D Spatial trainer — memorise shapes on the grid, then recall placements. Three levels (3→5 shapes); perfect rounds level up."
    },
    {
      id: "chess",
      mode: "chess",
      name: "Chess Tutor",
      domain: "Strategic reasoning",
      science:
        "Chess rehearses planning under constraints — weighing threats, sequencing moves, and updating plans when the board changes, much like prioritising under interruption.",
      intro: "Open the Chess tutor tab — play White against a teaching coach with plain-language tips each turn."
    }
  ];

  let activeLevelId = LEVELS[0].id;
  /** Fallback until AppgenWtdStore module binds (classic script loads first). */
  let fallbackWtdMode = "2d";
  let lastAppliedModeSeq = -1;
  let wtdShellStoreBound = false;

  function getWtdMode() {
    const api = window.AppgenWtdStore;
    if (api && api.store) {
      return api.selectors.selectWtdMode(api.store.getState());
    }
    return fallbackWtdMode;
  }

  function isWtdMobileChessViewport() {
    return window.matchMedia("(max-width: 720px)").matches;
  }

  /** Full-viewport immersive layout (3D / chess / SnL — not 2D mini-game hub). */
  function isWtdChessLabUiActive() {
    const view = $("wtdView");
    const mode = getWtdMode();
    return !!(
      view &&
      !view.hidden &&
      (mode === "3d" || mode === "chess" || mode === "snl")
    );
  }

  function syncWtdMobileChessLabUi() {
    const view = $("wtdView");
    if (!view) return;
    const gameLab = isWtdChessLabUiActive();
    /* In-page immersive lab chrome (hides hero / stats / tabs / footer / game HUDs and
       pins #wtdView to height:100dvh; overflow:hidden) belongs to the modes that play
       straight in the page — chess and Snakes & Ladders. 3D always runs inside
       the session modal, so for them this class only ever hid the landing: after
       "Exit session" the intro HUD (Start 3D session), hero, tabs and footer were all
       display:none and the page came back black. */
    const mode = getWtdMode();
    const inPageLab = mode === "chess" || mode === "snl";
    view.classList.toggle("wtd-game-lab", gameLab);
    view.classList.toggle("wtd-mobile-chess-lab", gameLab && inPageLab);
    window.requestAnimationFrame(() => {
      window.dispatchEvent(new Event("resize"));
    });
  }

  function wtdFullscreenTarget() {
    return document.fullscreenElement || document.webkitFullscreenElement || null;
  }

  function isWtdBrowserFullscreen() {
    const view = $("wtdView");
    const active = wtdFullscreenTarget();
    return !!(view && active && (active === view || active === document.documentElement));
  }

  function syncWtdFullscreenBtn() {
    const btn = $("wtdFullscreenBtn");
    if (!btn) return;
    const on = isWtdBrowserFullscreen();
    btn.classList.toggle("on", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
    btn.setAttribute("aria-label", on ? "Exit full screen" : "Enter full screen");
    btn.title = on ? "Exit full screen (Esc)" : "Full screen";
    const label = btn.querySelector(".appgen-nav-label");
    if (label) label.textContent = on ? "Exit full screen" : "Full screen";
  }

  async function toggleWtdBrowserFullscreen() {
    const view = $("wtdView");
    if (!view || view.hidden) return;
    try {
      if (isWtdBrowserFullscreen()) {
        if (document.exitFullscreen) await document.exitFullscreen();
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
        return;
      }
      if (view.requestFullscreen) await view.requestFullscreen();
      else if (view.webkitRequestFullscreen) view.webkitRequestFullscreen();
    } catch (_) {
      /* User gesture denied or unsupported */
    }
  }

  function ensureWtdFullscreenBound() {
    if (window.__wtdFullscreenBound) return;
    window.__wtdFullscreenBound = true;
    $("wtdFullscreenBtn")?.addEventListener("click", () => {
      toggleWtdBrowserFullscreen();
    });
    document.addEventListener("fullscreenchange", () => {
      syncWtdFullscreenBtn();
      syncWtdMobileChessLabUi();
    });
    document.addEventListener("webkitfullscreenchange", syncWtdFullscreenBtn);
  }

  async function exitWtdBrowserFullscreenIfActive() {
    if (!isWtdBrowserFullscreen()) return;
    try {
      if (document.exitFullscreen) await document.exitFullscreen();
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
    } catch (_) { /* ignore */ }
  }

  function levelsForMode(mode) {
    const m =
      mode === "3d" || mode === "chess" ? mode : "2d";
    return LEVELS.filter((l) => l.mode === m);
  }

  function populateBoardLevelFilter() {
    const filter = $("wtdBoardLevel");
    if (!filter) return;
    const prev = filter.value;
    const opts = levelsForMode(getWtdMode());
    filter.innerHTML =
      '<option value="all">All levels</option>' +
      opts.map((l) => '<option value="' + l.id + '">' + l.name + "</option>").join("");
    const stillValid = prev === "all" || opts.some((l) => l.id === prev);
    filter.value = stillValid ? prev : "all";
  }
  let runState = null;
  let timerId = null;
  let mountEl = null;

  function $(id) {
    return document.getElementById(id);
  }

  function loadLocalBoard() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (_) {
      return [];
    }
  }

  function saveLocalBoard(entries) {
    const trimmed = entries.slice(0, 500);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    } catch (_) { /* private mode */ }
  }

  function loadBoard() {
    if (boardCache) return boardCache.slice();
    return loadLocalBoard();
  }

  function setBoardCache(entries) {
    boardCache = Array.isArray(entries) ? entries.slice() : [];
    saveLocalBoard(boardCache);
  }

  function loadPendingSync() {
    try {
      const raw = localStorage.getItem(PENDING_SYNC_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (_) {
      return [];
    }
  }

  function savePendingSync(list) {
    try {
      localStorage.setItem(PENDING_SYNC_KEY, JSON.stringify(list.slice(0, 50)));
    } catch (_) { /* ignore */ }
  }

  function setCloudStatus(text, isWarn) {
    const el = $("wtdCloudStatus");
    if (!el) return;
    el.textContent = text;
    el.hidden = !text;
    el.classList.toggle("warn", !!isWarn);
  }

  async function fetchLeaderboardFromCloud() {
    if (cloudFetchPromise) return cloudFetchPromise;
    cloudFetchPromise = (async () => {
      try {
        const res = await fetch(API_PATH + "?level=all&limit=100", { cache: "no-store" });
        if (!res.ok) throw new Error("HTTP " + res.status);
        const data = await res.json();
        if (!data || !Array.isArray(data.entries)) throw new Error("Bad payload");
        cloudAvailable = true;
        setBoardCache(data.entries);
        setCloudStatus(
          "Cloud leaderboard synced" +
            (data.updatedAt ? " · updated " + new Date(data.updatedAt).toLocaleString() : "") +
            " · " +
            (data.total || data.entries.length) +
            " runs globally"
        );
        return true;
      } catch (_) {
        cloudAvailable = false;
        boardCache = null;
        setCloudStatus("Cloud offline — showing this browser’s saved runs.", true);
        return false;
      } finally {
        cloudFetchPromise = null;
      }
    })();
    return cloudFetchPromise;
  }

  const WTD_CLOUD_LEVEL_IDS = new Set([
    "inhibit",
    "memory",
    "switch",
    "pattern",
    "sprint",
    "spatial3d",
    "chess"
  ]);

  function normalizeCloudEntry(entry) {
    if (!entry || typeof entry !== "object") return null;
    const levelId = typeof entry.levelId === "string" ? entry.levelId.trim() : "";
    if (!WTD_CLOUD_LEVEL_IDS.has(levelId)) return null;
    const timeMs = Math.max(400, Math.round(Number(entry.timeMs) || 0));
    if (!Number.isFinite(timeMs) || timeMs > 600000) return null;
    const accuracyPct = Math.round(Number(entry.accuracyPct) || 0);
    if (!Number.isFinite(accuracyPct) || accuracyPct < 0 || accuracyPct > 100) return null;
    let points = entry.points;
    if (points === undefined || points === null || !Number.isFinite(Number(points))) {
      points = scoreForRun(levelId, timeMs, accuracyPct);
    }
    points = Math.round(Number(points));
    if (!Number.isFinite(points) || points < 0 || points > 5000) return null;
    let player = typeof entry.player === "string" ? entry.player.trim() : "";
    if (!player) player = playerName();
    if (!player) player = "Anonymous";
    player = player.slice(0, 40);
    return { player, levelId, timeMs, points, accuracyPct };
  }

  async function postEntryToCloud(entry) {
    const payload = normalizeCloudEntry(entry);
    if (!payload) {
      return { ok: false, permanent: true };
    }
    try {
      const res = await fetch(API_PATH, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const msg = err.error || "HTTP " + res.status;
        if (res.status === 400) {
          return { ok: false, permanent: true, message: msg };
        }
        throw new Error(msg);
      }
      cloudAvailable = true;
      return { ok: true, permanent: false };
    } catch (e) {
      setCloudStatus(
        "Cloud save failed" + (e && e.message ? ": " + e.message : "") + " — score kept on this device.",
        true
      );
      return { ok: false, permanent: false };
    }
  }

  async function flushPendingSync() {
    let pending = loadPendingSync();
    if (!pending.length) return;
    const still = [];
    let droppedInvalid = 0;
    for (const entry of pending) {
      const normalized = normalizeCloudEntry(entry);
      if (!normalized) {
        droppedInvalid += 1;
        continue;
      }
      const result = await postEntryToCloud(normalized);
      if (result.ok) {
        const merged = [{ ...entry, ...normalized }, ...loadBoard()];
        merged.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
        setBoardCache(merged.slice(0, 500));
      } else if (result.permanent) {
        droppedInvalid += 1;
      } else {
        still.push(entry);
      }
    }
    savePendingSync(still);
    if (droppedInvalid && !still.length) {
      setCloudStatus("Removed " + droppedInvalid + " score(s) that could not sync to cloud.", true);
    }
    if (!still.length && cloudAvailable) await fetchLeaderboardFromCloud();
  }

  async function submitRunToCloud(entry) {
    setCloudStatus("Saving score to cloud…");
    const result = await postEntryToCloud(entry);
    if (result.ok) {
      await fetchLeaderboardFromCloud();
      renderStats();
      renderLevelList();
      renderLeaderboard();
      return;
    }
    const pending = loadPendingSync();
    pending.unshift(entry);
    savePendingSync(pending);
    setCloudStatus("Couldn’t reach cloud — score queued on this device.", true);
  }

  function playerName() {
    if (window.AppgenAuth && typeof window.AppgenAuth.preferredPlayerName === "function") {
      const fromGoogle = window.AppgenAuth.preferredPlayerName();
      if (fromGoogle) return fromGoogle.slice(0, 40);
    }
    /* Signed out: fall back to whatever was stored before the field was removed. */
    return (localStorage.getItem(PLAYER_KEY) || "Anonymous").slice(0, 40);
  }

  function formatMs(ms) {
    const s = ms / 1000;
    if (s < 60) return s.toFixed(2) + "s";
    const m = Math.floor(s / 60);
    const r = (s % 60).toFixed(1);
    return m + "m " + r + "s";
  }

  function scoreForRun(levelId, timeMs, accuracyPct) {
    const base = {
      inhibit: 400,
      memory: 450,
      switch: 500,
      pattern: 550,
      sprint: 600,
      spatial3d: 650,
      chess: 720
    }[levelId] || 400;
    const timeBonus = Math.max(0, Math.floor(800 - timeMs / 50));
    const accBonus = Math.floor((accuracyPct / 100) * 350);
    return base + timeBonus + accBonus;
  }

  function bestForLevel(levelId) {
    const board = loadBoard().filter((e) => e.levelId === levelId);
    if (!board.length) return null;
    board.sort((a, b) => a.timeMs - b.timeMs);
    return board[0];
  }

  function totalPoints() {
    return loadBoard().reduce((s, e) => s + (e.points || 0), 0);
  }

  function stopTimer() {
    if (timerId) {
      clearInterval(timerId);
      timerId = null;
    }
  }

  function closeSessionModal(skipExit) {
    if (window.AppgenWtdSessionModal) window.AppgenWtdSessionModal.close(skipExit);
  }

  function onCloseWtd() {
    exitWtdBrowserFullscreenIfActive();
    closeSessionModal(true);
    closePlayerBreakdown();
    setLeaderboardAsideOpen(false);
    stopTimer();
  }

  function syncLeaderboardToggleVisibility() {
    const toggle = $("wtdLeaderboardToggle");
    if (!toggle) return;
    const authed =
      window.AppgenAuth &&
      typeof window.AppgenAuth.isSignedIn === "function" &&
      window.AppgenAuth.isSignedIn();
    const sessionReady =
      !window.AppgenAuth ||
      typeof window.AppgenAuth.isSessionReady !== "function" ||
      window.AppgenAuth.isSessionReady();
    /* Lives in the app header now, so it follows sign-in rather than the active tab. */
    const show = !!sessionReady && !!authed;
    toggle.hidden = !show;
    if (!show) setLeaderboardAsideOpen(false);
  }

  function setLeaderboardAsideOpen(open) {
    const aside = $("wtdLeaderboardAside");
    const toggle = $("wtdLeaderboardToggle");
    const backdrop = $("wtdLeaderboardBackdrop");
    if (!aside) return;
    const on = !!open;
    aside.classList.toggle("is-open", on);
    aside.setAttribute("aria-hidden", on ? "false" : "true");
    if (toggle) {
      toggle.setAttribute("aria-expanded", on ? "true" : "false");
    }
    document.body.classList.toggle("wtd-leaderboard-open", on);
    if (backdrop) {
      backdrop.hidden = !on;
      backdrop.classList.toggle("is-visible", on);
      backdrop.setAttribute("aria-hidden", on ? "false" : "true");
    }
  }

  function ensureLeaderboardAsideBound() {
    const aside = $("wtdLeaderboardAside");
    if (!aside || aside.dataset.wtdAsideBound) return;
    aside.dataset.wtdAsideBound = "1";
    /* The toggle lives in the auth slot and is re-created on every render — delegate. */
    document.addEventListener("click", (e) => {
      const toggle = e.target.closest("#wtdLeaderboardToggle");
      if (!toggle) return;
      e.preventDefault();
      setLeaderboardAsideOpen(!aside.classList.contains("is-open"));
    });
    const closeBtn = $("wtdLeaderboardAsideClose");
    if (closeBtn) {
      closeBtn.addEventListener("click", () => setLeaderboardAsideOpen(false));
    }
    const backdrop = $("wtdLeaderboardBackdrop");
    if (backdrop) {
      backdrop.addEventListener("click", () => setLeaderboardAsideOpen(false));
    }
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape" || !aside.classList.contains("is-open")) return;
      const modal = $("wtdPlayerBreakdownModal");
      if (modal && !modal.hidden) return;
      setLeaderboardAsideOpen(false);
    });
  }

  function startClock(onTick) {
    stopTimer();
    const t0 = performance.now();
    onTick(0);
    timerId = setInterval(() => onTick(performance.now() - t0), 50);
    return () => performance.now() - t0;
  }

  /** Per-level card banner: gradient + flat white glyph (inline SVG, no extra files). */
  const LEVEL_ART = {
    inhibit: {
      from: "#f97316",
      to: "#db2777",
      icon:
        '<rect x="2" y="5" width="5.5" height="14" rx="2.2" fill="#fff"/>' +
        '<rect x="9.25" y="5" width="5.5" height="14" rx="2.2" fill="rgba(255,255,255,.72)"/>' +
        '<rect x="16.5" y="5" width="5.5" height="14" rx="2.2" fill="rgba(255,255,255,.45)"/>'
    },
    memory: {
      from: "#2563eb",
      to: "#7c3aed",
      icon:
        '<circle cx="5" cy="12" r="3.2" fill="#fff"/>' +
        '<circle cx="12" cy="12" r="3.2" fill="rgba(255,255,255,.75)"/>' +
        '<circle cx="19" cy="12" r="3.2" fill="rgba(255,255,255,.5)"/>'
    },
    switch: {
      from: "#0d9488",
      to: "#2563eb",
      icon:
        '<path d="M11 4 3.5 12 11 20V4z" fill="#fff"/>' +
        '<path d="M13 4l7.5 8L13 20V4z" fill="rgba(255,255,255,.65)"/>'
    },
    pattern: {
      from: "#7c3aed",
      to: "#db2777",
      icon: [5, 12, 19]
        .map((y) =>
          [5, 12, 19]
            .map((x) => '<circle cx="' + x + '" cy="' + y + '" r="2.3" fill="#fff"/>')
            .join("")
        )
        .join("")
    },
    sprint: {
      from: "#16a34a",
      to: "#84cc16",
      icon:
        '<circle cx="12" cy="12" r="9" fill="none" stroke="#fff" stroke-width="2"/>' +
        '<circle cx="12" cy="12" r="4.5" fill="#fff"/>' +
        '<path d="M12 1v3M12 20v3M1 12h3M20 12h3" stroke="#fff" stroke-width="2" stroke-linecap="round"/>'
    },
    spatial3d: {
      from: "#0ea5e9",
      to: "#6366f1",
      icon:
        '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" fill="none" stroke="#fff" stroke-width="2" stroke-linejoin="round"/>' +
        '<path d="M4 7.5l8 4.5 8-4.5M12 12v9" fill="none" stroke="#fff" stroke-width="2" stroke-linejoin="round"/>'
    },
    chess: {
      from: "#a16207",
      to: "#7c2d12",
      icon:
        '<path d="M12 3a2.4 2.4 0 0 1 1.4 4.35c1.1.75 1.85 2 2.05 3.65H8.55c.2-1.65.95-2.9 2.05-3.65A2.4 2.4 0 0 1 12 3zM8.2 13h7.6l1.1 4.6H7.1L8.2 13zM6.5 18.6h11v1.9h-11z" fill="#fff"/>'
    }
  };

  function levelArt(lv) {
    const a = LEVEL_ART[lv.id] || LEVEL_ART.inhibit;
    const gid = "lvgrad-" + lv.id;
    return (
      '<span class="wtd-lv-art" aria-hidden="true">' +
      '<svg viewBox="0 0 320 96" preserveAspectRatio="xMidYMid meet" focusable="false">' +
      '<defs><linearGradient id="' +
      gid +
      '" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0" stop-color="' +
      a.from +
      '"/><stop offset="1" stop-color="' +
      a.to +
      '"/></linearGradient></defs>' +
      '<rect width="320" height="96" fill="url(#' +
      gid +
      ')"/>' +
      '<circle cx="46" cy="92" r="52" fill="rgba(255,255,255,.12)"/>' +
      '<circle cx="292" cy="6" r="44" fill="rgba(255,255,255,.10)"/>' +
      '<g transform="translate(132 20) scale(2.3)">' +
      a.icon +
      "</g>" +
      "</svg></span>"
    );
  }

  function renderLevelList() {
    const list = $("wtdLevelList");
    if (!list) return;
    list.innerHTML = LEVELS.map((lv) => {
      const best = bestForLevel(lv.id);
      const bestTxt = best
        ? "Best: " + formatMs(best.timeMs) + " · " + best.points + " pts"
        : "Not played yet";
      return (
        '<button type="button" class="wtd-level-btn' +
        (lv.id === activeLevelId ? " on" : "") +
        '" data-level="' +
        lv.id +
        '">' +
        levelArt(lv) +
        '<span class="wtd-lv-name">' +
        lv.name +
        '</span><span class="wtd-lv-domain">' +
        lv.domain +
        '</span><span class="wtd-lv-best">' +
        bestTxt +
        "</span></button>"
      );
    }).join("");
    list.querySelectorAll(".wtd-level-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        activeLevelId = btn.getAttribute("data-level");
        if (activeLevelId === "spatial3d") {
          setWtdMode("3d");
          return;
        }
        if (activeLevelId === "chess") {
          setWtdMode("chess");
          return;
        }
        runState = null;
        stopTimer();
        setWtdMode("2d");
        renderLevelList();
        renderArena();
        /* Clicking a level starts it straight away — no second "Start level" click. */
        startLevel(activeLevelId);
      });
    });
  }

  /**
   * Apply shell UI + game lifecycle for a mode. Invoked from Redux subscription
   * (or synchronously before the store module binds).
   */
  function applyWtdShellMode(mode) {
    const m =
      mode === "3d" || mode === "chess" || mode === "snl" ? mode : "2d";
    fallbackWtdMode = m;
    const p2 = $("wtdPanel2d");
    const p3 = $("wtdPanel3d");
    const pC = $("wtdPanelChess");
    const pS = $("wtdPanelSnL");
    const t2 = $("wtdTab2d");
    const t3 = $("wtdTab3d");
    const tC = $("wtdTabChess");
    const tS = $("wtdTabSnL");
    if (p2) p2.hidden = m !== "2d";
    if (p3) p3.hidden = m !== "3d";
    if (pC) pC.hidden = m !== "chess";
    if (pS) pS.hidden = m !== "snl";
    if (t2) {
      t2.classList.toggle("on", m === "2d");
      t2.setAttribute("aria-selected", m === "2d" ? "true" : "false");
    }
    if (t3) {
      t3.classList.toggle("on", m === "3d");
      t3.setAttribute("aria-selected", m === "3d" ? "true" : "false");
    }
    if (tC) {
      tC.classList.toggle("on", m === "chess");
      tC.setAttribute("aria-selected", m === "chess" ? "true" : "false");
    }
    if (tS) {
      tS.classList.toggle("on", m === "snl");
      tS.setAttribute("aria-selected", m === "snl" ? "true" : "false");
    }
    closeSessionModal(true);
    populateBoardLevelFilter();
    renderLeaderboard();
    if (m === "3d") {
      if (window.AppgenWtdChess) window.AppgenWtdChess.onClose();
      if (window.AppgenWtdSnL) window.AppgenWtdSnL.onClose();
      if (window.AppgenWtd3d) window.AppgenWtd3d.init();
    } else if (m === "chess") {
      if (window.AppgenWtd3d) window.AppgenWtd3d.onClose();
      if (window.AppgenWtdSnL) window.AppgenWtdSnL.onClose();
      if (window.AppgenWtdChess) window.AppgenWtdChess.init();
    } else if (m === "snl") {
      if (window.AppgenWtd3d) window.AppgenWtd3d.onClose();
      if (window.AppgenWtdChess) window.AppgenWtdChess.onClose();
      if (window.AppgenWtdSnL) window.AppgenWtdSnL.init();
    } else {
      if (window.AppgenWtd3d) window.AppgenWtd3d.onClose();
      if (window.AppgenWtdChess) window.AppgenWtdChess.onClose();
      if (window.AppgenWtdSnL) window.AppgenWtdSnL.onClose();
      runState = null;
      render2dHud();
      renderArena();
    }
    syncWtdMobileChessLabUi();
    syncLeaderboardToggleVisibility();
  }

  function onWtdShellStoreChanged() {
    const api = window.AppgenWtdStore;
    if (!api || !api.store) return;
    const state = api.store.getState();
    const seq = api.selectors.selectWtdModeChangeSeq(state);
    if (seq === lastAppliedModeSeq) return;
    lastAppliedModeSeq = seq;
    applyWtdShellMode(api.selectors.selectWtdMode(state));
  }

  function bindWtdShellStore(api) {
    if (wtdShellStoreBound || !api || !api.store) return;
    wtdShellStoreBound = true;
    window.AppgenWtdStore = api;
    api.store.subscribe(onWtdShellStoreChanged);
    const state = api.store.getState();
    const seq = api.selectors.selectWtdModeChangeSeq(state);
    const hashBase =
      typeof appgenHashBase === "function" ? appgenHashBase() : "";
    if (
      typeof api.wtdModeFromHashBase === "function" &&
      api.wtdModeFromHashBase(hashBase)
    ) {
      api.dispatch(api.actions.hydrateModeFromHash(hashBase));
    } else if (seq > 0) {
      onWtdShellStoreChanged();
    } else if (fallbackWtdMode && fallbackWtdMode !== "2d") {
      api.dispatch(api.actions.setWtdMode(fallbackWtdMode));
    }
  }

  window.__appgenWtdStoreReady = bindWtdShellStore;
  if (window.AppgenWtdStore) bindWtdShellStore(window.AppgenWtdStore);

  function normalizeShellMode(mode) {
    return mode === "3d" || mode === "chess" || mode === "snl" ? mode : "2d";
  }

  /** Write-side entry: dispatch into Redux SSoT (fallback apply if store not ready). */
  function setWtdMode(mode) {
    const m = normalizeShellMode(mode);
    const api = window.AppgenWtdStore;
    if (api && api.store && api.actions) {
      api.dispatch(api.actions.setWtdMode(m));
      const state = api.store.getState();
      const seq = api.selectors.selectWtdModeChangeSeq(state);
      if (seq !== lastAppliedModeSeq) {
        lastAppliedModeSeq = seq;
        applyWtdShellMode(api.selectors.selectWtdMode(state));
      }
      return;
    }
    applyWtdShellMode(m);
  }

  function hydrateWtdModeFromHash(hashBase) {
    const api = window.AppgenWtdStore;
    if (api && api.store && api.actions) {
      api.dispatch(api.actions.hydrateModeFromHash(hashBase || ""));
      const state = api.store.getState();
      const seq = api.selectors.selectWtdModeChangeSeq(state);
      if (seq !== lastAppliedModeSeq) {
        lastAppliedModeSeq = seq;
        applyWtdShellMode(api.selectors.selectWtdMode(state));
      }
      return;
    }
    let mode = null;
    if (api && typeof api.wtdModeFromHashBase === "function") {
      mode = api.wtdModeFromHashBase(hashBase);
    } else if (
      typeof appgenIsSnakesRouteHash === "function" &&
      appgenIsSnakesRouteHash(hashBase)
    ) {
      mode = "snl";
    } else if (
      typeof appgenIsCognitiveRouteHash === "function" &&
      appgenIsCognitiveRouteHash(hashBase)
    ) {
      mode = "3d";
    } else if (
      typeof appgenIsChessRouteHash === "function" &&
      appgenIsChessRouteHash(hashBase)
    ) {
      mode = "chess";
    }
    if (mode) applyWtdShellMode(mode);
  }

  function renderStats() {
    const pts = $("wtdTotalPoints");
    const runs = $("wtdTotalRuns");
    if (pts) pts.textContent = String(totalPoints());
    if (runs) runs.textContent = String(loadBoard().length);
  }

  let playerAggCache = new Map();

  function aggregatePlayers(entries) {
    const map = new Map();
    (entries || []).forEach((e) => {
      const player = (e && e.player) || "Anonymous";
      let agg = map.get(player);
      if (!agg) {
        agg = {
          player,
          totalPoints: 0,
          runs: 0,
          byLevel: {}
        };
        map.set(player, agg);
      }
      const pts = Number(e.points) || 0;
      const timeMs = Number(e.timeMs) || 0;
      agg.totalPoints += pts;
      agg.runs += 1;
      const lid = e.levelId || "unknown";
      let lv = agg.byLevel[lid];
      if (!lv) {
        lv = { levelId: lid, points: 0, runs: 0, bestTimeMs: Infinity, lastAt: e.at || "" };
        agg.byLevel[lid] = lv;
      }
      lv.points += pts;
      lv.runs += 1;
      if (timeMs > 0 && timeMs < lv.bestTimeMs) lv.bestTimeMs = timeMs;
      if (e.at && (!lv.lastAt || Date.parse(e.at) >= Date.parse(lv.lastAt))) lv.lastAt = e.at;
    });
    return map;
  }

  function closePlayerBreakdown() {
    const modal = $("wtdPlayerBreakdownModal");
    if (modal) modal.hidden = true;
  }

  function normalizePlayerKey(name) {
    return String(name || "")
      .trim()
      .toLowerCase();
  }

  function isLeaderboardAdmin() {
    return !!(
      window.AppgenAuth &&
      typeof window.AppgenAuth.isAppAdmin === "function" &&
      window.AppgenAuth.isAppAdmin()
    );
  }

  function isOwnLeaderboardPlayer(displayName) {
    const key = normalizePlayerKey(displayName);
    if (!key) return false;
    return normalizePlayerKey(playerName()) === key;
  }

  function canViewPlayerBreakdown(player) {
    return isLeaderboardAdmin() || isOwnLeaderboardPlayer(player);
  }

  function openPlayerBreakdown(player) {
    const modal = $("wtdPlayerBreakdownModal");
    const title = $("wtdBreakdownTitle");
    const summary = $("wtdBreakdownSummary");
    const body = $("wtdBreakdownBody");
    if (!modal || !body) return;
    if (!canViewPlayerBreakdown(player)) return;
    const agg = playerAggCache.get(player);
    if (!agg) return;

    if (title) title.textContent = player + " — level breakdown";
    if (summary) {
      summary.textContent =
        "Total " +
        agg.totalPoints +
        " Dragon Points across " +
        agg.runs +
        " run" +
        (agg.runs === 1 ? "" : "s") +
        " · " +
        Object.keys(agg.byLevel).length +
        " level" +
        (Object.keys(agg.byLevel).length === 1 ? "" : "s");
    }

    const rows = Object.values(agg.byLevel).sort((a, b) => b.points - a.points);
    body.innerHTML = rows.length
      ? rows
          .map((lv) => {
            const meta = LEVELS.find((l) => l.id === lv.levelId);
            const best =
              lv.bestTimeMs !== Infinity && Number.isFinite(lv.bestTimeMs)
                ? formatMs(lv.bestTimeMs)
                : "—";
            const last = lv.lastAt ? new Date(lv.lastAt).toLocaleDateString() : "—";
            return (
              "<tr><td>" +
              escapeHtml(meta ? meta.name : lv.levelId) +
              "</td><td>" +
              lv.runs +
              "</td><td><strong>" +
              lv.points +
              "</strong></td><td>" +
              best +
              "</td><td>" +
              last +
              "</td></tr>"
            );
          })
          .join("")
      : '<tr><td colspan="5">No level data.</td></tr>';

    modal.hidden = false;
  }

  function ensureBreakdownModalBound() {
    const modal = $("wtdPlayerBreakdownModal");
    if (!modal || modal.dataset.wtdBound) return;
    modal.dataset.wtdBound = "1";
    const closeBtn = $("wtdBreakdownClose");
    if (closeBtn) closeBtn.addEventListener("click", closePlayerBreakdown);
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closePlayerBreakdown();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && modal && !modal.hidden) closePlayerBreakdown();
    });
  }

  function breakdownButtonHtml(player) {
    return (
      '<button type="button" class="btn ghost wtd-breakdown-btn" data-wtd-player="' +
      escapeHtml(player) +
      '">View Details</button>'
    );
  }

  function playerInitials(name) {
    const parts = String(name || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (!parts.length) return "?";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function leaderboardAvatarHtml(displayName) {
    const authUser =
      window.AppgenAuth && typeof window.AppgenAuth.getUser === "function"
        ? window.AppgenAuth.getUser()
        : null;
    if (isOwnLeaderboardPlayer(displayName) && authUser && authUser.picture) {
      return (
        '<img class="wtd-lb-avatar-img" src="' +
        escapeHtml(authUser.picture) +
        '" alt="" width="44" height="44" referrerpolicy="no-referrer">'
      );
    }
    return (
      '<span class="wtd-lb-avatar-initials" aria-hidden="true">' +
      escapeHtml(playerInitials(displayName)) +
      "</span>"
    );
  }

  function rankDisplayHtml(rank) {
    if (rank === 1) {
      return '<span class="wtd-lb-rank wtd-lb-rank--medal" aria-label="Rank 1"><span aria-hidden="true">🥇</span></span>';
    }
    if (rank === 2) {
      return '<span class="wtd-lb-rank wtd-lb-rank--medal" aria-label="Rank 2"><span aria-hidden="true">🥈</span></span>';
    }
    if (rank === 3) {
      return '<span class="wtd-lb-rank wtd-lb-rank--medal" aria-label="Rank 3"><span aria-hidden="true">🥉</span></span>';
    }
    return '<span class="wtd-lb-rank" aria-label="Rank ' + rank + '">' + rank + "</span>";
  }

  function renderLeaderboardListItem(r, index, admin) {
    const rank = index + 1;
    const own = isOwnLeaderboardPlayer(r.player);
    const showBreakdown = admin || own;
    const cardClass =
      "wtd-lb-card" +
      (own ? " is-you" : "") +
      (rank <= 3 ? " wtd-lb-card--podium" : "");
    let metaText = "";
    if (admin) {
      if (r.focusLevel) {
        const lvlName =
          (LEVELS.find((l) => l.id === r.focusLevel) || {}).name || r.focusLevel;
        metaText =
          lvlName + " · " + r.runs + " run" + (r.runs === 1 ? "" : "s");
      } else {
        const n = r.levelsPlayed;
        metaText =
          n +
          " level" +
          (n === 1 ? "" : "s") +
          " · " +
          r.runs +
          " run" +
          (r.runs === 1 ? "" : "s");
      }
    }
    const metaHtml = metaText
      ? '<p class="wtd-lb-card__meta">' + escapeHtml(metaText) + "</p>"
      : "";
    const actionsHtml = showBreakdown
      ? '<div class="wtd-lb-card__actions">' + breakdownButtonHtml(r.player) + "</div>"
      : "";
    return (
      '<li class="' +
      cardClass +
      '" role="listitem">' +
      rankDisplayHtml(rank) +
      '<div class="wtd-lb-card__avatar">' +
      leaderboardAvatarHtml(r.player) +
      "</div>" +
      '<div class="wtd-lb-card__main">' +
      '<div class="wtd-lb-card__headline">' +
      '<span class="wtd-lb-card__name">' +
      escapeHtml(r.player) +
      (own ? ' <span class="wtd-lb-you-badge">You</span>' : "") +
      "</span>" +
      '<span class="wtd-lb-card__points"><strong class="wtd-agg-points">' +
      r.totalPoints +
      '</strong><span class="wtd-lb-points-label"> pts</span></span>' +
      "</div>" +
      metaHtml +
      actionsHtml +
      "</div></li>"
    );
  }

  function renderLeaderboard() {
    const list = $("wtdBoardBody");
    const filter = $("wtdBoardLevel");
    const caption = $("wtdLeaderboardCaption");
    if (!list) return;
    ensureBreakdownModalBound();
    const admin = isLeaderboardAdmin();
    if (caption) {
      caption.textContent = admin
        ? "Ranked by aggregate points. Open a player for the per-level breakdown of their sum."
        : "Ranked by total Dragon Points. View Details on your row shows your level breakdown.";
    }
    const levelFilter = filter ? filter.value : "all";
    const modeIds = levelsForMode(getWtdMode()).map((l) => l.id);
    /* Scope board to levels that belong to the active training tab. */
    const allEntries = loadBoard()
      .slice()
      .filter((e) => modeIds.indexOf(e.levelId) !== -1);
    playerAggCache = aggregatePlayers(allEntries);

    let players = Array.from(playerAggCache.values());
    if (levelFilter !== "all") {
      players = players
        .filter((p) => p.byLevel[levelFilter])
        .map((p) => ({
          player: p.player,
          totalPoints: p.byLevel[levelFilter].points,
          runs: p.byLevel[levelFilter].runs,
          levelsPlayed: 1,
          focusLevel: levelFilter
        }));
    } else {
      players = players.map((p) => ({
        player: p.player,
        totalPoints: p.totalPoints,
        runs: p.runs,
        levelsPlayed: Object.keys(p.byLevel).length,
        focusLevel: null
      }));
    }
    players.sort((a, b) => b.totalPoints - a.totalPoints || a.player.localeCompare(b.player));
    const top = players.slice(0, 50);

    list.innerHTML = top.length
      ? top.map((r, i) => renderLeaderboardListItem(r, i, admin)).join("")
      : '<li class="wtd-lb-empty" role="listitem">No runs yet — complete a level to appear here.</li>';

    list.querySelectorAll(".wtd-breakdown-btn[data-wtd-player]").forEach((btn) => {
      btn.addEventListener("click", () => {
        openPlayerBreakdown(btn.getAttribute("data-wtd-player"));
      });
    });
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function persistRun(entry) {
    const board = loadBoard();
    board.unshift(entry);
    setBoardCache(board);
    renderStats();
    renderLevelList();
    renderLeaderboard();
    submitRunToCloud(entry);
  }

  function submitRun(entry) {
    const levelId = entry.levelId;
    const timeMs = entry.timeMs;
    const accuracyPct = entry.accuracyPct;
    const points =
      entry.points !== undefined ? entry.points : scoreForRun(levelId, timeMs, accuracyPct);
    const full = {
      id: entry.id || (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random()),
      player: entry.player || playerName(),
      levelId,
      timeMs: Math.round(timeMs),
      points: Math.round(points),
      accuracyPct: Math.round(accuracyPct),
      at: entry.at || new Date().toISOString()
    };
    persistRun(full);
    return Promise.resolve();
  }

  function finishRun(levelId, timeMs, accuracyPct) {
    stopTimer();
    const points = scoreForRun(levelId, timeMs, accuracyPct);
    const entry = {
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random(),
      player: playerName(),
      levelId,
      timeMs: Math.round(timeMs),
      points,
      accuracyPct: Math.round(accuracyPct),
      at: new Date().toISOString()
    };
    persistRun(entry);
    const lv = LEVELS.find((l) => l.id === levelId);
    mountEl.innerHTML =
      '<div class="wtd-result">' +
      "<h3>Level complete — " +
      escapeHtml(lv ? lv.name : levelId) +
      "</h3>" +
      '<p class="wtd-points">+' +
      points +
      " Dragon Points</p>" +
      "<p>Time: <strong>" +
      formatMs(timeMs) +
      "</strong> · Accuracy: <strong>" +
      Math.round(accuracyPct) +
      "%</strong></p>" +
      '<button type="button" class="btn" id="wtdPlayAgain">Play again</button> ' +
      '<button type="button" class="btn ghost" id="wtdPickLevel">Choose level</button>' +
      "</div>";
    $("wtdPlayAgain").addEventListener("click", () => startLevel(levelId));
    $("wtdPickLevel").addEventListener("click", () => {
      runState = null;
      if (window.AppgenWtdSessionModal) window.AppgenWtdSessionModal.close();
      render2dHud();
      renderArena();
    });
  }

  function arenaHtml(level) {
    return (
      '<div class="wtd-arena-intro">' +
      "<h3>" +
      escapeHtml(level.name) +
      "</h3>" +
      '<p class="wtd-science">' +
      escapeHtml(level.science) +
      "</p>" +
      "<p>" +
      escapeHtml(level.intro) +
      '</p><button type="button" class="btn big" id="wtdStartLevel">Start level</button></div>'
    );
  }

  function render2dHud() {
    const hudEl = $("wtd2dHud");
    if (!hudEl) return;
    hudEl.hidden = false;
    hudEl.removeAttribute("hidden");
    hudEl.innerHTML =
      "<h3>Cognitive Training</h3>" +
      '<p class="wtd-3d-metric">Neuroscience-inspired micro-training — inhibition, memory, switching, reasoning, attention. Pick a level from the sidebar to begin.</p>';
  }

  function renderArena() {
    mountEl = $("wtdArena");
    if (!mountEl) return;
    const level = LEVELS.find((l) => l.id === activeLevelId) || LEVELS[0];
    if (runState) return;
    mountEl.innerHTML = arenaHtml(level);
  }

  function ensureStartLevelDelegation() {
    if (document.documentElement.dataset.wtd2dDelegated) return;
    document.documentElement.dataset.wtd2dDelegated = "1";
    document.addEventListener("click", (e) => {
      const btn = e.target.closest("#wtdStartLevel");
      if (!btn) return;
      e.preventDefault();
      const level = LEVELS.find((l) => l.id === activeLevelId) || LEVELS[0];
      startLevel(level.id);
    });
  }

  function openSessionModalForLevel(levelId) {
    if (!window.AppgenWtdSessionModal) return;
    const lv = LEVELS.find((l) => l.id === levelId);
    window.AppgenWtdSessionModal.open({
      title: lv ? lv.name : "Training level",
      layout: "2d",
      nodeIds: ["wtdArena"],
      onRestart: () => {
        runState = null;
        stopTimer();
        startLevel(levelId);
      },
      onExit: () => {
        runState = null;
        stopTimer();
        render2dHud();
        renderArena();
      }
    });
    mountEl = $("wtdArena");
  }

  function startLevel(levelId) {
    openSessionModalForLevel(levelId);
    mountEl = $("wtdArena");
    if (!mountEl) return;
    if (levelId === "inhibit") runInhibit();
    else if (levelId === "memory") runMemory();
    else if (levelId === "switch") runSwitch();
    else if (levelId === "pattern") runPattern();
    else if (levelId === "sprint") runSprint();
  }

  function runInhibit() {
    const level = LEVELS.find((l) => l.id === "inhibit");
    let round = 0;
    let correct = 0;
    let getElapsed = null;
    runState = { levelId: "inhibit" };

    function nextRound() {
      if (round >= level.rounds) {
        const acc = (correct / level.rounds) * 100;
        finishRun("inhibit", getElapsed(), acc);
        runState = null;
        return;
      }
      const ink = COLORS[Math.floor(Math.random() * COLORS.length)];
      let word = ink;
      while (word.id === ink.id && Math.random() < 0.85) {
        word = COLORS[Math.floor(Math.random() * COLORS.length)];
      }
      round++;
      mountEl.innerHTML =
        '<div class="wtd-prompt">Round ' +
        round +
        " / " +
        level.rounds +
        ' · <span class="wtd-timer" id="wtdLiveTimer">0.00s</span></div>' +
        '<div class="wtd-stroop-word" style="color:' +
        ink.hex +
        '">' +
        word.label.toUpperCase() +
        '</div><div class="wtd-choices" id="wtdChoices"></div>';
      if (!getElapsed) {
        getElapsed = startClock((ms) => {
          const el = $("wtdLiveTimer");
          if (el) el.textContent = formatMs(ms);
        });
      }
      const box = $("wtdChoices");
      COLORS.forEach((c) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "wtd-choice";
        b.textContent = c.label;
        b.style.borderColor = c.hex;
        b.addEventListener("click", () => {
          if (c.id === ink.id) correct++;
          nextRound();
        });
        box.appendChild(b);
      });
    }
    nextRound();
  }

  function runMemory() {
    const level = LEVELS.find((l) => l.id === "memory");
    const seq = [];
    while (seq.length < level.span) {
      const ic = ICON_SVGS[Math.floor(Math.random() * ICON_SVGS.length)];
      if (seq[seq.length - 1] !== ic) seq.push(ic);
    }
    let phase = "show";
    let pickIdx = 0;
    let mistakes = 0;
    let getElapsed = null;
    runState = { levelId: "memory" };

    function renderShow() {
      mountEl.innerHTML =
        '<div class="wtd-prompt">Memorise the sequence · <span class="wtd-timer" id="wtdLiveTimer">0.00s</span></div>' +
        '<div class="wtd-seq-grid">' +
        seq.map((s) => '<div class="wtd-tile">' + s + "</div>").join("") +
        "</div>";
      if (!getElapsed) {
        getElapsed = startClock((ms) => {
          const el = $("wtdLiveTimer");
          if (el) el.textContent = formatMs(ms);
        });
      }
      setTimeout(() => {
        phase = "recall";
        renderRecall();
      }, 1800 + seq.length * 400);
    }

    function renderRecall() {
      const shuffled = seq.slice().sort(() => Math.random() - 0.5);
      mountEl.innerHTML =
        '<div class="wtd-prompt">Tap in order (' +
        (pickIdx + 1) +
        " / " +
        seq.length +
        ')</div><div class="wtd-seq-grid" id="wtdRecallGrid"></div>';
      const grid = $("wtdRecallGrid");
      shuffled.forEach((sym) => {
        const t = document.createElement("button");
        t.type = "button";
        t.className = "wtd-tile";
        t.innerHTML = sym;
        t.addEventListener("click", () => {
          if (phase !== "recall") return;
          if (sym === seq[pickIdx]) {
            pickIdx++;
            t.classList.add("selected");
            t.disabled = true;
            if (pickIdx >= seq.length) {
              const acc = Math.max(0, 100 - mistakes * 15);
              finishRun("memory", getElapsed(), acc);
              runState = null;
            }
          } else {
            mistakes++;
            t.classList.add("disabled");
            setTimeout(() => t.classList.remove("disabled"), 400);
          }
        });
        grid.appendChild(t);
      });
    }
    renderShow();
  }

  function runSwitch() {
    const level = LEVELS.find((l) => l.id === "switch");
    let round = 0;
    let correct = 0;
    let getElapsed = null;
    runState = { levelId: "switch" };

    function next() {
      if (round >= level.rounds) {
        finishRun("switch", getElapsed(), (correct / level.rounds) * 100);
        runState = null;
        return;
      }
      round++;
      const shapeIdx = Math.floor(Math.random() * SHAPES.length);
      const colorIdx = Math.floor(Math.random() * SHAPE_COLORS.length);
      const ruleShape = round % 2 === 1;
      const ruleText = ruleShape ? "MATCH SHAPE" : "MATCH COLOUR";
      const options = [];
      for (let i = 0; i < 4; i++) {
        options.push({
          shape: SHAPES[i % SHAPES.length],
          color: SHAPE_COLORS[i % SHAPE_COLORS.length],
          idx: i
        });
      }
      const correctOpt = ruleShape
        ? options.find((o) => o.shape === SHAPES[shapeIdx])
        : options.find((o) => o.color === SHAPE_COLORS[colorIdx]);
      mountEl.innerHTML =
        '<div class="wtd-prompt">Round ' +
        round +
        " / " +
        level.rounds +
        ' · <span class="wtd-timer" id="wtdLiveTimer">0.00s</span></div>' +
        '<div class="wtd-rule-banner">' +
        ruleText +
        '</div><div class="wtd-switch-card" style="color:' +
        SHAPE_COLORS[colorIdx] +
        '">' +
        SHAPES[shapeIdx] +
        '</div><div class="wtd-choices" id="wtdSwitchChoices"></div>';
      if (!getElapsed) {
        getElapsed = startClock((ms) => {
          const el = $("wtdLiveTimer");
          if (el) el.textContent = formatMs(ms);
        });
      }
      const box = $("wtdSwitchChoices");
      options.forEach((o) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "wtd-choice";
        b.style.color = o.color;
        b.textContent = o.shape;
        b.addEventListener("click", () => {
          if (o.idx === correctOpt.idx) correct++;
          next();
        });
        box.appendChild(b);
      });
    }
    next();
  }

  function runPattern() {
    const level = LEVELS.find((l) => l.id === "pattern");
    let solved = 0;
    let attempts = 0;
    let getElapsed = null;
    runState = { levelId: "pattern" };

    function buildPuzzle() {
      const step = 1 + Math.floor(Math.random() * 3);
      const start = Math.floor(Math.random() * 5);
      const grid = [];
      for (let i = 0; i < 9; i++) grid.push(start + i * step);
      const missingIdx = 4 + Math.floor(Math.random() * 4);
      if (missingIdx === 4) return buildPuzzle();
      const answer = grid[missingIdx];
      grid[missingIdx] = null;
      const wrong = [answer + step, answer - step, answer + 2].filter((x) => x !== answer && x > 0);
      const opts = [answer, wrong[0] || answer + 1, wrong[1] || answer + 2, answer + step * 2];
      const shuffled = opts.sort(() => Math.random() - 0.5);
      return { grid, answer, shuffled, missingIdx };
    }

    function showPuzzle() {
      if (solved >= level.puzzles) {
        const acc = attempts ? (solved / attempts) * 100 : 100;
        finishRun("pattern", getElapsed(), Math.min(100, acc));
        runState = null;
        return;
      }
      const p = buildPuzzle();
      mountEl.innerHTML =
        '<div class="wtd-prompt">Puzzle ' +
        (solved + 1) +
        " / " +
        level.puzzles +
        ' · <span class="wtd-timer" id="wtdLiveTimer">0.00s</span></div>' +
        '<div class="wtd-matrix">' +
        p.grid
          .map((v, i) =>
            v === null
              ? '<div class="wtd-matrix-cell missing">?</div>'
              : '<div class="wtd-matrix-cell">' + v + "</div>"
          )
          .join("") +
        '</div><div class="wtd-choices" id="wtdPatChoices"></div>';
      if (!getElapsed) {
        getElapsed = startClock((ms) => {
          const el = $("wtdLiveTimer");
          if (el) el.textContent = formatMs(ms);
        });
      }
      const box = $("wtdPatChoices");
      p.shuffled.forEach((val) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "wtd-choice";
        b.textContent = String(val);
        b.addEventListener("click", () => {
          attempts++;
          if (val === p.answer) {
            solved++;
            showPuzzle();
          } else {
            b.style.borderColor = "#c0392b";
          }
        });
        box.appendChild(b);
      });
    }
    showPuzzle();
  }

  function runSprint() {
    const level = LEVELS.find((l) => l.id === "sprint");
    let hits = 0;
    let misses = 0;
    let getElapsed = null;
    runState = { levelId: "sprint" };

    mountEl.innerHTML =
      '<div class="wtd-prompt">Attention sprint · <span class="wtd-timer" id="wtdLiveTimer">0.00s</span></div>' +
      '<p style="text-align:center;font-size:0.85rem;color:var(--muted)">Hits: <span id="wtdHits">0</span> · False taps: <span id="wtdMisses">0</span></p>' +
      '<div class="wtd-sprint-arena" id="wtdSprintArena"></div>';

    const arena = $("wtdSprintArena");
    getElapsed = startClock((ms) => {
      const el = $("wtdLiveTimer");
      if (el) el.textContent = formatMs(ms);
      if (ms >= level.durationMs) {
        stopTimer();
        const total = hits + misses || 1;
        const acc = (hits / total) * 100;
        finishRun("sprint", ms, acc);
        runState = null;
      }
    });

    function spawn() {
      if (!runState) return;
      const good = Math.random() < 0.55;
      const el = document.createElement("button");
      el.type = "button";
      el.className = "wtd-sprint-target " + (good ? "good" : "bad");
      el.innerHTML = good
        ? FRUIT_SVGS[Math.floor(Math.random() * FRUIT_SVGS.length)]
        : BOMB_SVG;
      el.style.left = 8 + Math.random() * (arena.clientWidth - 60) + "px";
      el.style.top = 8 + Math.random() * (arena.clientHeight - 60) + "px";
      el.addEventListener("click", () => {
        if (good) {
          hits++;
          $("wtdHits").textContent = String(hits);
          el.remove();
          return;
        }
        misses++;
        $("wtdMisses").textContent = String(misses);
        explodeBomb(el);
      });
      arena.appendChild(el);
      setTimeout(() => el.remove(), good ? 1400 : 1100);
    }

    /** Bomb hit: flash + burst + a short arena shake, then clear the node. */
    function explodeBomb(bomb) {
      if (!bomb || !bomb.isConnected) return;
      bomb.classList.add("exploding");
      bomb.style.pointerEvents = "none";
      const br = bomb.getBoundingClientRect();
      const ar = arena.getBoundingClientRect();
      const burst = document.createElement("span");
      burst.className = "wtd-sprint-burst";
      burst.style.left = br.left - ar.left + br.width / 2 + "px";
      burst.style.top = br.top - ar.top + br.height / 2 + "px";
      arena.appendChild(burst);
      arena.classList.remove("boom");
      void arena.offsetWidth; /* restart the shake */
      arena.classList.add("boom");
      setTimeout(() => burst.remove(), 560);
      setTimeout(() => {
        arena.classList.remove("boom");
        bomb.remove();
      }, 480);
    }

    const spawnIv = setInterval(spawn, 700);
    setTimeout(() => clearInterval(spawnIv), level.durationMs + 200);
    spawn();
  }

  function ensureLeaderboardAccessListener() {
    if (window.__wtdLeaderboardAccessBound) return;
    window.__wtdLeaderboardAccessBound = true;
    window.addEventListener("appgen-access-change", () => {
      renderLeaderboard();
    });
  }

  const GAME_HELP = {
    chess: {
      title: "Chess tutor — help",
      html:
        "<p>Learn and play chess on a shared 3D board with the same studio look as the other labs.</p>" +
        "<ul>" +
        "<li><strong>Practice drills</strong> — Chess 101 lessons with coach highlights on recommended squares.</li>" +
        "<li><strong>Play vs coach</strong> — take a side; the coach replies and can suggest moves.</li>" +
        "<li><strong>Invite a friend</strong> — share a link for a live online game.</li>" +
        "<li><strong>Settings (⚙)</strong> — backdrop, wood board textures, lighting, and coaching toggles (sync when signed in).</li>" +
        "</ul>" +
        "<p>Standard chess rules apply: check, checkmate, castling, en passant, and promotion.</p>"
    },
    snl: {
      title: "Snakes &amp; Ladders — help",
      html:
        "<p>Classic multiplayer race on a 10×10 board (squares 1–100). Up to four players share a lobby.</p>" +
        "<ul>" +
        "<li><strong>Lobby</strong> — 60-second join window (flip countdown). Host can <strong>Start game now</strong> early.</li>" +
        "<li><strong>Active users</strong> — signed-in lab players show device lat/lng, timezone, local time, and last update (for inviting).</li>" +
        "<li><strong>Your piece</strong> — pick a chess piece as your token (collapse the picker after choosing).</li>" +
        "<li><strong>Dice</strong> — on your turn tap the golden die in the centre of the 3D board for 1–6.</li>" +
        "<li><strong>Move</strong> — your piece walks each square, then rides a ladder up or a snake down if you land on one.</li>" +
        "<li><strong>Win</strong> — exact roll to land on 100; overshooting keeps you in place.</li>" +
        "<li><strong>Turn routes</strong> — expand the log under the HUD to see dice values and paths.</li>" +
        "<li><strong>Settings (⚙)</strong> — ladder/snake colours; board look follows Chess studio settings.</li>" +
        "</ul>"
    },
    "2d": {
      title: "2D mini-games — help",
      html:
        "<p>Short cognitive drills that award <strong>Dragon Points</strong> from speed and accuracy.</p>" +
        "<ul>" +
        "<li>Pick a level from the list, then start a timed run.</li>" +
        "<li>Follow on-screen prompts (targets to tap, distractors to ignore, memory/switching tasks).</li>" +
        "<li>Completed runs sync to the shared cloud leaderboard under your Google display name.</li>" +
        "</ul>"
    },
    "3d": {
      title: "3D spatial trainer — help",
      html:
        "<p>Practice spatial recall in a 3D scene (same studio backdrop family as Chess).</p>" +
        "<ul>" +
        "<li>Study the layout, then reproduce or navigate as the prompt asks.</li>" +
        "<li>Efficiency and accuracy feed your Dragon Points / session stats.</li>" +
        "<li>Use orbit controls to look around the scene when available.</li>" +
        "</ul>"
    },
  };

  function gameHelpForMode(mode) {
    return GAME_HELP[mode] || GAME_HELP["2d"];
  }

  function closeGameHelp() {
    const modal = $("wtdGameHelpModal");
    if (modal) modal.hidden = true;
    document.body.classList.remove("wtd-chess-env-modal-open");
  }

  function openGameHelp() {
    const help = gameHelpForMode(getWtdMode());
    const title = $("wtdGameHelpTitle");
    const body = $("wtdGameHelpBody");
    const modal = $("wtdGameHelpModal");
    if (title) title.innerHTML = help.title;
    if (body) body.innerHTML = help.html;
    if (modal) modal.hidden = false;
    document.body.classList.add("wtd-chess-env-modal-open");
  }

  function ensureWtdModeTabsBound() {
    const tabs = document.querySelector(
      '#wtdView .intake-mode-tabs[aria-label="Training mode"]'
    );
    if (!tabs || tabs.dataset.wtdModeBound) return;
    tabs.dataset.wtdModeBound = "1";
    tabs.addEventListener("click", (e) => {
      const btn = e.target.closest(".intake-mode-tab[id^='wtdTab']");
      if (!btn) return;
      const modeByTab = {
        wtdTab2d: "2d",
        wtdTab3d: "3d",
        wtdTabChess: "chess",
        wtdTabSnL: "snl"
      };
      const mode = modeByTab[btn.id];
      if (mode) setWtdMode(mode);
    });
  }

  function ensureGameHelpBound() {
    if (window.__wtdGameHelpBound) return;
    window.__wtdGameHelpBound = true;
    $("wtdGameHelpBtn")?.addEventListener("click", () => openGameHelp());
    const modal = $("wtdGameHelpModal");
    if (modal) {
      modal.addEventListener("click", (e) => {
        const t = e.target;
        if (t instanceof Element && t.closest("[data-wtd-game-help-close]")) {
          closeGameHelp();
        }
      });
    }
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      const m = $("wtdGameHelpModal");
      if (m && !m.hidden) closeGameHelp();
    });
  }

  function initWtdView() {
    ensureGameHelpBound();
    ensureWtdModeTabsBound();
    ensureWtdFullscreenBound();
    syncWtdFullscreenBtn();
    if (window.AppgenAuth && typeof window.AppgenAuth.isSignedIn === "function") {
      if (!window.AppgenAuth.isSignedIn()) return;
    }
    ensureLeaderboardAccessListener();
    ensureLeaderboardAsideBound();
    ensureStartLevelDelegation();
    const filter = $("wtdBoardLevel");
    if (filter && !filter.dataset.wtdBound) {
      filter.dataset.wtdBound = "1";
      filter.addEventListener("change", () => {
        renderLeaderboard();
      });
    }
    populateBoardLevelFilter();
    const base =
      typeof appgenHashBase === "function" ? appgenHashBase() : "chess";
    const api = window.AppgenWtdStore;
    if (api && typeof api.wtdModeFromHashBase === "function") {
      const fromHash = api.wtdModeFromHashBase(base);
      if (fromHash) {
        hydrateWtdModeFromHash(base);
      } else {
        setWtdMode("chess");
      }
    } else if (
      typeof appgenIsSnakesRouteHash === "function" &&
      appgenIsSnakesRouteHash(base)
    ) {
      setWtdMode("snl");
    } else if (
      typeof appgenIsCognitiveRouteHash === "function" &&
      appgenIsCognitiveRouteHash(base)
    ) {
      setWtdMode("3d");
    } else {
      setWtdMode("chess");
    }
    renderStats();
    renderLevelList();
    renderLeaderboard();
    renderArena();
    setCloudStatus("Syncing cloud leaderboard…");
    fetchLeaderboardFromCloud().then(() => flushPendingSync()).then(() => {
      renderStats();
      renderLevelList();
      renderLeaderboard();
    });
    if (!window.__wtdMobileChessMqBound) {
      window.__wtdMobileChessMqBound = true;
      window.matchMedia("(max-width: 720px)").addEventListener("change", () => {
        syncWtdMobileChessLabUi();
      });
    }
  }

  window.AppgenWtd = {
    init: initWtdView,
    onClose: onCloseWtd,
    getPlayerName: playerName,
    submitRun,
    setWtdMode,
    hydrateWtdModeFromHash,
    getWtdMode,
    getStats: () => ({ points: totalPoints(), runs: loadBoard().length }),
    openGameHelp,
    closeGameHelp,
    setLeaderboardOpen: setLeaderboardAsideOpen,
    syncLeaderboardToggleVisibility,
    isMobileChessLab: isWtdChessLabUiActive,
    syncMobileChessLabUi: syncWtdMobileChessLabUi,
    toggleBrowserFullscreen: toggleWtdBrowserFullscreen,
    exitBrowserFullscreen: exitWtdBrowserFullscreenIfActive
  };
})();
