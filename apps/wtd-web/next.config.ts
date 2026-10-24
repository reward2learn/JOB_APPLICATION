import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appDir = path.dirname(fileURLToPath(import.meta.url));

const apiProxy =
  process.env.WTD_API_PROXY?.replace(/\/$/, "") ||
  process.env.APPGEN_API_ORIGIN?.replace(/\/$/, "") ||
  "http://127.0.0.1:3000";

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(appDir, "../.."),
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${apiProxy}/api/:path*`
      }
    ];
  },
  async redirects() {
    return [
      { source: "/wtd", destination: "/chess", permanent: false },
      { source: "/snakes&ladders", destination: "/snakes-ladders", permanent: false }
    ];
  }
};

export default nextConfig;
