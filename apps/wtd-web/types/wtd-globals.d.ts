export {};

declare global {
  interface Window {
    AppgenWtd?: {
      init?: () => void;
      onClose?: () => void;
      getPlayerName?: () => string;
      submitRun?: (entry: unknown) => Promise<void>;
      setWtdMode?: (mode: string) => void;
      hydrateWtdModeFromHash?: (hashBase: string) => void;
      getWtdMode?: () => string;
      openGameHelp?: () => void;
      closeGameHelp?: () => void;
      setLeaderboardOpen?: (open: boolean) => void;
      isMobileChessLab?: () => boolean;
      syncMobileChessLabUi?: () => void;
    };
    AppgenWtdStore?: {
      dispatch: (action: unknown) => void;
      actions: Record<string, (...args: unknown[]) => unknown>;
      store?: { subscribe: (fn: () => void) => () => void; getState: () => unknown };
    };
    AppgenWtdChess?: { init?: () => void; onClose?: () => void };
    AppgenWtdSnL?: { init?: () => void; onClose?: () => void };
    AppgenAuth?: {
      isSignedIn?: () => boolean;
      getUser?: () => { name?: string; sub?: string } | null;
    };
    AppgenWtdSessionModal?: {
      open?: (opts: unknown) => void;
      close?: (silent?: boolean) => void;
      isOpen?: () => boolean;
    };
  }
}
