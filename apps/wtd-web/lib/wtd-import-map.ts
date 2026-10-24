/** ESM import map — must match Application_Generator.html (Three, chess.js, RTK). */
export const WTD_IMPORT_MAP = {
  imports: {
    three: "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js",
    "three/addons/":
      "https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/",
    "cannon-es": "https://cdn.jsdelivr.net/npm/cannon-es@0.20.0/dist/cannon-es.js",
    "chess.js": "https://cdn.jsdelivr.net/npm/chess.js@1.4.0/+esm",
    "@reduxjs/toolkit":
      "https://cdn.jsdelivr.net/npm/@reduxjs/toolkit@2.2.7/+esm"
  }
} as const;

export const WTD_ASSET_VERSION = "20261022-chess-session-guard";
