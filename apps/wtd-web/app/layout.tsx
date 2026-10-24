import type { Metadata } from "next";
import { WtdImportMap } from "@/components/WtdImportMap";
import "./globals.css";

export const metadata: Metadata = {
  title: "Walk the Dragon — Games",
  description: "Chess tutor and Snakes & Ladders (Next.js shell, M3 scaffold)"
};

const appgenOrigin = process.env.NEXT_PUBLIC_APPGEN_ORIGIN ?? "https://apply4job.vercel.app";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <WtdImportMap />
        <link rel="stylesheet" href="/appgen/assets/appgen-wtd.css?v=20261022-chess-orbit-redux" />
        {/* Legacy CV + full WTD lab remain on monolith until cutover */}
        <link rel="prefetch" href={`${appgenOrigin}/`} />
      </head>
      <body>{children}</body>
    </html>
  );
}
