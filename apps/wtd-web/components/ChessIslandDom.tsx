/** DOM ids required by appgen-wtd-chess.js (subset of Application_Generator.html). */
export function ChessIslandDom() {
  return (
    <div
      id="wtdPanelChess"
      className="wtd-panel wtd-chess-panel intake-panel"
      role="tabpanel"
      aria-labelledby="wtdTabChess"
      tabIndex={0}
    >
      <section id="wtdChessPlay" className="wtd-chess-play wtd-3d-light" aria-label="Chess tutor game">
        <div id="wtdChessHud" className="wtd-3d-hud" />
        <div className="wtd-chess-layout">
          <div
            id="wtdChessBoard"
            className="wtd-3d-canvas-host wtd-3d-light"
            aria-label="Chess board (3D)"
          />
          <aside
            id="wtdChessCoachAside"
            className="wtd-chess-coach wtd-chess-coach-aside"
            aria-labelledby="wtdChessCoachHeading"
            hidden
          >
            <div className="wtd-chess-coach-aside-head">
              <h3 id="wtdChessCoachHeading">Coach says</h3>
              <button
                type="button"
                className="btn ghost wtd-chess-icon-btn wtd-chess-coach-aside-close"
                id="wtdChessCoachAsideClose"
                aria-label="Collapse coach panel"
                title="Collapse coach panel"
              >
                ×
              </button>
            </div>
            <div id="wtdChessGoldenRule" className="wtd-chess-golden-rule" hidden>
              <p id="wtdChessGoldenRuleName" className="wtd-chess-golden-rule-name" />
              <p id="wtdChessGoldenRulePattern" className="wtd-chess-golden-rule-pattern" />
            </div>
            <p id="wtdChessCoachText" className="wtd-chess-coach-text">
              Ready when you are.
            </p>
            <div id="wtdChessLessonList" className="wtd-chess-lesson-list" hidden aria-label="Winning strategies" />
          </aside>
        </div>
        <div
          id="wtdChessMobileStep"
          className="wtd-chess-mobile-step wtd-chess-mobile-step--collapsed"
          hidden
          aria-label="Curriculum step"
        >
          <button
            type="button"
            id="wtdChessMobileStepToggle"
            className="btn ghost wtd-chess-mobile-step-toggle"
            aria-expanded="false"
            aria-controls="wtdChessMobileStepBody"
            aria-label="Expand lesson details"
            title="Lesson details"
          >
            ▼
          </button>
          <div id="wtdChessMobileStepBody" className="wtd-chess-mobile-step-body" hidden>
            <div className="wtd-chess-mobile-step-main">
              <span id="wtdChessMobileStepBadge" className="wtd-chess-mobile-step-badge">
                1/20
              </span>
              <div className="wtd-chess-mobile-step-copy">
                <span id="wtdChessMobileStepTitle" className="wtd-chess-mobile-step-title">
                  Winning strategies
                </span>
                <p id="wtdChessMobileCoach" className="wtd-chess-mobile-coach" />
              </div>
            </div>
            <div id="wtdChessMobileStepActions" className="wtd-chess-mobile-step-actions" />
          </div>
        </div>
        <div id="wtdChessControls" className="wtd-3d-controls" />
        <div id="wtdChess101Panel" className="wtd-chess-101-panel" hidden aria-label="Chess 101 practice drills" />
      </section>
      <div
        id="wtdChessEnvModal"
        className="wtd-chess-env-modal"
        hidden
        role="dialog"
        aria-modal="true"
        aria-labelledby="wtdChessEnvModalTitle"
      >
        <div className="wtd-chess-env-modal-backdrop" data-wtd-chess-env-close tabIndex={-1} aria-hidden="true" />
        <div className="wtd-chess-env-modal-panel">
          <header className="wtd-chess-env-modal-header">
            <h2 id="wtdChessEnvModalTitle">Chess settings</h2>
            <button type="button" className="btn ghost wtd-chess-env-modal-x" data-wtd-chess-env-close aria-label="Close">
              ×
            </button>
          </header>
          <div id="wtdChessEnvSettingsBody" className="wtd-chess-env-settings-body" />
          <footer className="wtd-chess-env-modal-footer">
            <div className="wtd-chess-env-modal-footer-start">
              <button type="button" className="btn ghost" id="wtdChessEnvExport">
                Export settings
              </button>
              <button type="button" className="btn ghost" id="wtdChessEnvImport">
                Import settings
              </button>
              <input type="file" id="wtdChessEnvImportFile" accept="application/json,.json" hidden />
            </div>
            <p id="wtdChessEnvStatus" className="wtd-chess-env-status" role="status" aria-live="polite" />
            <div className="wtd-chess-env-modal-footer-end">
              <button type="button" className="btn ghost" data-wtd-chess-env-close>
                Cancel
              </button>
              <button type="button" className="btn big" id="wtdChessEnvModalApply">
                Apply changes
              </button>
            </div>
          </footer>
        </div>
      </div>
      <div
        id="wtdChessGameOverModal"
        className="wtd-chess-env-modal wtd-snl-gameover-modal"
        hidden
        role="dialog"
        aria-modal="true"
        aria-labelledby="wtdChessGameOverTitle"
      >
        <div className="wtd-chess-env-modal-backdrop" tabIndex={-1} aria-hidden="true" />
        <div className="wtd-chess-env-modal-panel">
          <header className="wtd-chess-env-modal-header wtd-snl-gameover-header">
            <h2 id="wtdChessGameOverTitle">Game over</h2>
          </header>
          <div className="wtd-snl-gameover-body-wrap">
            <p id="wtdChessGameOverLabel" className="wtd-snl-gameover-winner-label">
              Result
            </p>
            <p id="wtdChessGameOverBody" className="wtd-snl-gameover-body" role="status" />
          </div>
          <footer className="wtd-chess-env-modal-footer wtd-snl-gameover-footer">
            <button
              type="button"
              className="btn ghost wtd-chess-icon-btn wtd-snl-gameover-restart"
              id="wtdChessGameOverRestart"
              aria-label="Play again"
              title="Play again"
            >
              ↻
            </button>
          </footer>
        </div>
      </div>
    </div>
  );
}
