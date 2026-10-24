/**
 * Fetch helpers — extensions (e.g. Urban VPN “200.js”) sometimes wrap fetch and throw M_ID errors.
 */

export function isExtensionFetchNoise(err) {
  const blob = String(err?.message || err?.stack || err || "");
  return /M_ID|200\.js/i.test(blob);
}

export function warnExtensionFetchOnce() {
  if (typeof globalThis !== "undefined" && globalThis.__appgenExtFetchWarned) return;
  if (typeof globalThis !== "undefined") globalThis.__appgenExtFetchWarned = true;
  console.warn(
    "[Application Generator] A browser extension is interfering with network calls (200.js / M_ID). " +
      "This is not AppGen code — disable VPN/ad extensions for this site if WTD games or saves misbehave."
  );
}

/** Same-origin fetch; never throws on extension noise (returns null). */
export async function appgenFetch(input, init) {
  try {
    return await fetch(input, init);
  } catch (e) {
    if (isExtensionFetchNoise(e)) {
      warnExtensionFetchOnce();
      return null;
    }
    throw e;
  }
}
