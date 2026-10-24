/**
 * Lets OrbitControls stay user-driven after the first drag/zoom/rotate
 * until {@link clearManualOrbitExplore} (e.g. "reset view" / game snap).
 */

/**
 * @returns {{
 *   bind: (orbit: import("three/addons/controls/OrbitControls.js").OrbitControls) => void;
 *   isManualExplore: () => boolean;
 *   clearManualOrbitExplore: () => void;
 * }}
 */
export function createOrbitFreeExplore() {
  /** @type {boolean} */
  let manualExplore = false;

  /**
   * @param {import("three/addons/controls/OrbitControls.js").OrbitControls} orbit
   */
  function bind(orbit) {
    if (!orbit || orbit.userData?.wtdOrbitFreeBound) return;
    orbit.userData = orbit.userData || {};
    orbit.userData.wtdOrbitFreeBound = true;
    const mark = () => {
      manualExplore = true;
    };
    orbit.addEventListener("start", mark);
    orbit.addEventListener("wheel", mark, { passive: true });
  }

  function isManualExplore() {
    return manualExplore;
  }

  function clearManualOrbitExplore() {
    manualExplore = false;
  }

  return { bind, isManualExplore, clearManualOrbitExplore };
}

/** Default OrbitControls limits for board games (full grid + top-down). */
export const WTD_BOARD_ORBIT_LIMITS = Object.freeze({
  minPolarAngle: 0.08,
  maxPolarAngle: Math.PI / 2 - 0.04,
  minDistance: 2.4,
  maxDistance: 20,
  rotateSpeed: 0.75,
  zoomSpeed: 0.9,
  enablePan: true,
  enableRotate: true
});

/**
 * @param {import("three/addons/controls/OrbitControls.js").OrbitControls} orbit
 * @param {Partial<typeof WTD_BOARD_ORBIT_LIMITS>} [overrides]
 */
export function applyBoardOrbitLimits(orbit, overrides = {}) {
  if (!orbit) return;
  const p = { ...WTD_BOARD_ORBIT_LIMITS, ...overrides };
  orbit.minPolarAngle = p.minPolarAngle;
  orbit.maxPolarAngle = p.maxPolarAngle;
  orbit.minDistance = p.minDistance;
  orbit.maxDistance = p.maxDistance;
  orbit.rotateSpeed = p.rotateSpeed;
  orbit.zoomSpeed = p.zoomSpeed;
  orbit.enablePan = p.enablePan;
  orbit.enableRotate = p.enableRotate;
}
