import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  turbopack: {
    root: here,
  },
  images: {
    dangerouslyAllowSVG: true,
    contentDispositionType: "attachment",
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
    remotePatterns: [
      { protocol: "https", hostname: "github.com" },
      { protocol: "https", hostname: "avatars.githubusercontent.com" },
      { protocol: "https", hostname: "raw.githubusercontent.com" },
      { protocol: "https", hostname: "matthiasroder.com" },
      { protocol: "https", hostname: "exafunction.github.io" },
      { protocol: "https", hostname: "www.freelogovectors.net" },
      { protocol: "https", hostname: "aaif.io" },
      { protocol: "https", hostname: "trendshift.io" },
    ],
  },
};

export default config;
