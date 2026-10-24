import Link from "next/link";
import { LegacyHashRedirect } from "@/components/LegacyHashRedirect";

const appgenOrigin = process.env.NEXT_PUBLIC_APPGEN_ORIGIN ?? "https://apply4job.vercel.app";

export default function HomePage() {
  return (
    <>
      <LegacyHashRedirect />
      <div className="wtd-hub">
        <h1>Walk the Dragon — game routes</h1>
        <p>M3 Next.js shell: dynamic islands load the same ESM modules as the monolith.</p>
        <ul>
          <li>
            <Link href="/chess">Chess tutor → /chess</Link>
          </li>
          <li>
            <Link href="/snakes-ladders">Snakes &amp; Ladders → /snakes-ladders</Link>
          </li>
          <li>
            <a href={`${appgenOrigin}/`}>Application Generator (CV + full lab)</a>
          </li>
          <li>
            <a href={`${appgenOrigin}/#chess`}>Legacy hash chess (redirects here when opened via hub)</a>
          </li>
        </ul>
      </div>
    </>
  );
}
