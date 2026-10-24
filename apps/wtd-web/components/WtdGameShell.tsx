import Link from "next/link";
import type { ReactNode } from "react";

const appgenOrigin = process.env.NEXT_PUBLIC_APPGEN_ORIGIN ?? "https://apply4job.vercel.app";

type Props = {
  title: string;
  children: ReactNode;
};

export function WtdGameShell({ title, children }: Props) {
  return (
    <div id="wtdView" className="wtd-view wtd-game-lab">
      <header className="appgen-top-bar wtd-next-top-bar">
        <div className="wtd-next-top-bar__start">
          <Link href="/" className="btn ghost appgen-nav-btn">
            ← Games hub
          </Link>
          <span className="wtd-next-top-bar__title">{title}</span>
        </div>
        <div className="wtd-next-top-bar__end">
          <a href={appgenOrigin} className="btn ghost appgen-nav-btn">
            CV app (legacy)
          </a>
        </div>
      </header>
      <main id="wtdMain" className="wtd-main wtd-next-main">
        {children}
      </main>
    </div>
  );
}
