"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Client-only bridge: `/#chess`, `/#snakes-ladders`, and hash invite params → path routes.
 * (Server middleware cannot read location.hash.)
 */
export function LegacyHashRedirect() {
  const router = useRouter();

  useEffect(() => {
    const hash = (window.location.hash || "").replace(/^#/, "");
    if (!hash) return;

    const [base, query = ""] = hash.split("?");
    const params = new URLSearchParams(query);

    if (base === "chess" || base === "wtd") {
      const invite = params.get("chessInvite");
      router.replace(invite ? `/chess?chessInvite=${encodeURIComponent(invite)}` : "/chess");
      return;
    }
    if (base === "snakes-ladders" || base === "snakes&ladders") {
      const invite = params.get("snlInvite");
      router.replace(invite ? `/snakes-ladders?snlInvite=${encodeURIComponent(invite)}` : "/snakes-ladders");
    }
  }, [router]);

  return null;
}
