import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = dirname(here);

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  turbopack: {
    root: workspaceRoot,
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
      { protocol: "https", hostname: "aaif.io" },
      { protocol: "https", hostname: "trendshift.io" },
      { protocol: "https", hostname: "api.producthunt.com" },
      { protocol: "https", hostname: "svgl.app" },
      { protocol: "https", hostname: "www.factory.ai" },
      { protocol: "https", hostname: "kiro.dev" },
      { protocol: "https", hostname: "continue.dev" },
    ],
  },
};

export default config;
