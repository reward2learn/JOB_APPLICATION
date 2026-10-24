/** DOM ids required by appgen-wtd-snl.js (subset of Application_Generator.html). */
export function SnlIslandDom() {
  return (
    <div
      id="wtdPanelSnL"
      className="wtd-panel wtd-snl-panel intake-panel"
      role="tabpanel"
      aria-labelledby="wtdTabSnL"
      tabIndex={0}
    >
      <section id="wtdSnLPlay" className="wtd-chess-play wtd-snl-play wtd-3d-light" aria-label="Snakes and ladders game">
        <div id="wtdSnLHud" className="wtd-3d-hud" />
        <div className="wtd-snl-board-wrap">
          <div
            id="wtdSnLBoard"
            className="wtd-3d-canvas-host wtd-3d-light"
            aria-label="Snakes and ladders board (3D)"
          />
          <button
            type="button"
            id="wtdSnLRollDiceBtn"
            className="wtd-snl-roll-dice-btn"
            hidden
            aria-label="Roll dice"
            title="Roll dice"
          >
            <span className="wtd-snl-roll-dice-btn-label">Tap to roll</span>
          </button>
          <div id="wtdSnLTitleChip" className="wtd-snl-title-chip" hidden aria-live="polite" />
          <div id="wtdSnLLobbyOverlay" className="wtd-snl-lobby-overlay" hidden aria-live="polite">
            <div className="wtd-snl-lobby-bar" role="group" aria-label="Lobby countdown">
              <span id="wtdSnLLobbyCountdown" className="wtd-snl-lobby-count">
                00
              </span>
              <span id="wtdSnLLobbyPlayers" className="wtd-snl-lobby-count">
                0/4
              </span>
              <span id="wtdSnLLobbyGrid" className="wtd-snl-lobby-count">
                —
              </span>
            </div>
          </div>
        </div>
        <div id="wtdSnLControls" className="wtd-3d-controls wtd-snl-dock" />
      </section>
      <div
        id="wtdSnLGameOverModal"
        className="wtd-chess-env-modal wtd-snl-gameover-modal"
        hidden
        role="dialog"
        aria-modal="true"
        aria-labelledby="wtdSnLGameOverTitle"
      >
        <div className="wtd-chess-env-modal-backdrop" tabIndex={-1} aria-hidden="true" />
        <div className="wtd-chess-env-modal-panel">
          <header className="wtd-chess-env-modal-header wtd-snl-gameover-header">
            <h2 id="wtdSnLGameOverTitle">Game over</h2>
          </header>
          <div className="wtd-snl-gameover-body-wrap">
            <p className="wtd-snl-gameover-winner-label">Winner</p>
            <p id="wtdSnLGameOverBody" className="wtd-snl-gameover-body" role="status" />
            <div
              id="wtdSnLGameOverStandings"
              className="wtd-snl-gameover-standings-wrap"
              aria-label="Final standings"
            />
          </div>
          <footer className="wtd-chess-env-modal-footer wtd-snl-gameover-footer">
            <button
              type="button"
              className="btn ghost wtd-chess-icon-btn wtd-snl-gameover-restart"
              id="wtdSnLGameOverRestart"
              aria-label="Play again"
              title="Play again"
            >
              ↻
            </button>
          </footer>
        </div>
      </div>
      <div
        id="wtdSnLSettingsModal"
        className="wtd-chess-env-modal"
        hidden
        role="dialog"
        aria-modal="true"
        aria-labelledby="wtdSnLSettingsModalTitle"
      >
        <div className="wtd-chess-env-modal-backdrop" data-wtd-snl-settings-close tabIndex={-1} aria-hidden="true" />
        <div className="wtd-chess-env-modal-panel">
          <header className="wtd-chess-env-modal-header">
            <h2 id="wtdSnLSettingsModalTitle">Snakes &amp; Ladders settings</h2>
            <button type="button" className="btn ghost wtd-chess-env-modal-x" data-wtd-snl-settings-close aria-label="Close">
              ×
            </button>
          </header>
          <div id="wtdSnLSettingsBody" className="wtd-chess-env-settings-body" />
          <footer className="wtd-chess-env-modal-footer">
            <div className="wtd-chess-env-modal-footer-start">
              <button type="button" className="btn ghost" id="wtdSnLSettingsResetColors">
                Reset blue / red
              </button>
            </div>
            <p id="wtdSnLSettingsStatus" className="wtd-chess-env-status" role="status" aria-live="polite" />
            <div className="wtd-chess-env-modal-footer-end">
              <button type="button" className="btn ghost" data-wtd-snl-settings-close>
                Cancel
              </button>
              <button type="button" className="btn big" id="wtdSnLSettingsApply">
                Apply
              </button>
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}
