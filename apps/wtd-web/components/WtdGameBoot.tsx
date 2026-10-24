"use client";

import { useEffect, useState } from "react";
import { bootWtdGame, type WtdGameMode } from "@/lib/load-wtd-game";
import { syncLegacyInviteFromSearchParams } from "@/lib/wtd-invite-bridge";

type Props = {
  mode: WtdGameMode;
};

export function WtdGameBoot({ mode }: Props) {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    syncLegacyInviteFromSearchParams(mode);
    bootWtdGame(mode).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    });

    return () => {
      if (mode === "chess") window.AppgenWtdChess?.onClose?.();
      if (mode === "snl") window.AppgenWtdSnL?.onClose?.();
    };
  }, [mode]);

  if (error) {
    return (
      <p className="wtd-boot-error" role="alert">
        Could not load the game module: {error}
      </p>
    );
  }

  return null;
}
