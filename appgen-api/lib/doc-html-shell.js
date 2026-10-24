// Shared print/preview HTML shell for letter & CV (batch PDF ZIP + public share links).

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const LAYOUTS = new Set(["classic", "compact", "banner", "sidebar"]);

const __dirname = dirname(fileURLToPath(import.meta.url));

const cssCache = new Map();
export function loadAssetCss(filename) {
  if (cssCache.has(filename)) return cssCache.get(filename);
  let text = "";
  try {
    text = readFileSync(join(__dirname, "../appgen/assets", filename), "utf8");
  } catch (e) {
    console.warn("doc-html-shell: could not read CSS", filename, e && e.message ? e.message : e);
  }
  cssCache.set(filename, text);
  return text;
}

function mixWithWhite(hex, t) {
  const m = String(hex).trim().match(/^#?([0-9a-f]{6})$/i);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const ch = v => Math.round(v + (255 - v) * t);
  return (
    "rgb(" +
    ch((n >> 16) & 255) +
    ", " +
    ch((n >> 8) & 255) +
    ", " +
    ch(n & 255) +
    ")"
  );
}

export function normalizeAppearance(raw) {
  const a = raw && typeof raw === "object" ? raw : {};
  const layout = LAYOUTS.has(a.layout) ? a.layout : "classic";
  const accent =
    (typeof a.accent === "string" && a.accent) ||
    (typeof a.primary === "string" && a.primary) ||
    "#0d5c63";
  const accent2 =
    (typeof a.accent2 === "string" && a.accent2) ||
    (typeof a.secondary === "string" && a.secondary) ||
    "#ff6600";
  const dark = a.copyBackground === "black" || a.copyBg === "black";
  const heading =
    typeof a.heading === "string" && a.heading
      ? a.heading
      : dark
        ? mixWithWhite(accent, 0.62)
        : accent;
  const accentSoft =
    typeof a.accentSoft === "string" && a.accentSoft
      ? a.accentSoft
      : accent.toLowerCase() === "#0d5c63"
        ? "#e6f2f3"
        : mixWithWhite(accent, 0.9);
  return { layout, dark, accent, accent2, heading, accentSoft };
}

export function appearanceCssBlock(appearance) {
  const a = normalizeAppearance(appearance);
  return `:root {
  --accent: ${a.accent};
  --accent-2: ${a.accent2};
  --heading: ${a.heading};
  --accent-soft: ${a.accentSoft};
}`;
}

export function printShell(title, sheetClass, innerHtml, appearance, options) {
  const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  const docCss = loadAssetCss("appgen-doc.css");
  const printCss = loadAssetCss("appgen-print.css");
  const a = normalizeAppearance(appearance);
  const shareUi = !!(options && options.shareUi);
  const bodyClasses = ["appgen-print", "layout-" + a.layout];
  if (a.dark) bodyClasses.push("dark-copy");
  if (shareUi) bodyClasses.push("share-page");

  const shareChrome = shareUi
    ? `
.share-toolbar {
  max-width: 820px;
  margin: 12px auto 0;
  padding: 0 56px;
  font-size: 13px;
  color: #5c6b7a;
}
.share-toolbar button,
.share-footer button {
  font: inherit;
  font-weight: 600;
  cursor: pointer;
  background: #f0f4f6;
  border: 1px solid #c8d4dc;
  border-radius: 6px;
  padding: 8px 14px;
  color: #15202b;
}
.share-toolbar button:hover,
.share-footer button:hover { filter: brightness(0.98); }
.share-footer {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 40;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 14px;
  padding: 10px 16px calc(10px + env(safe-area-inset-bottom, 0px));
  background: rgba(255, 255, 255, 0.94);
  backdrop-filter: blur(10px);
  border-top: 1px solid #c8d4dc;
  box-shadow: 0 -6px 24px rgba(21, 32, 43, 0.08);
  font-size: 13px;
  color: #5c6b7a;
}
.share-footer span { flex: 1 1 12rem; min-width: 0; }
body.share-page { padding-bottom: calc(72px + env(safe-area-inset-bottom, 0px)); }
@media print {
  .share-toolbar,
  .share-footer,
  .no-print { display: none !important; }
}`
    : "";

  const shareMarkup = shareUi
    ? `<div class="share-toolbar no-print"><button type="button" onclick="window.print()">Print / Save as PDF</button></div>
<article class="sheet ${sheetClass}">${innerHtml}</article>
<footer class="share-footer no-print">
  <button type="button" id="shareCopyUrlBtn">Copy this document URL</button>
  <span>Paste into job forms that ask for a CV or letter link.</span>
</footer>
<script>
(function () {
  var btn = document.getElementById("shareCopyUrlBtn");
  if (!btn) return;
  var label = btn.textContent;
  btn.addEventListener("click", function () {
    var url = window.location.href;
    function done(ok) {
      btn.textContent = ok ? "URL copied" : "Copy failed";
      setTimeout(function () { btn.textContent = label; }, 2200);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(function () { done(true); }).catch(function () { done(false); });
      return;
    }
    try {
      var ta = document.createElement("textarea");
      ta.value = url;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      done(document.execCommand("copy"));
      document.body.removeChild(ta);
    } catch (e) {
      done(false);
    }
  });
})();
</script>`
    : `<article class="sheet ${sheetClass}">${innerHtml}</article>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, nofollow">
<title>${esc(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,600;0,9..40,700&family=Fraunces:opsz,wght@9..144,600;9..144,700&display=swap" rel="stylesheet">
<style>
${appearanceCssBlock(appearance)}
${docCss}
${printCss}
body {
  margin: 0;
  background: #fff;
  color: #15202b;
  font-family: "DM Sans", sans-serif;
  font-size: 15px;
  line-height: 1.6;
}
.sheet {
  max-width: 820px;
  margin: 0 auto;
  padding: 52px 56px 48px;
  border: none;
  box-shadow: none;
}
${shareChrome}
@media print {
  body { background: #fff; }
  .sheet { max-width: none; margin: 0; padding: 14mm 12mm; }
}
</style>
</head>
<body class="${bodyClasses.join(" ")}">
${shareMarkup}
</body>
</html>`;
}
