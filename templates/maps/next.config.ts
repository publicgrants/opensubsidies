import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  images: {
    // Public favicon services + funder homepages used by the OpenSubsidies
    // dashboard's <CardFaviconBackdrop> watermark and inline funder badges.
    remotePatterns: [
      // Google S2 favicon service — primary source.
      {
        protocol: "https",
        hostname: "www.google.com",
        pathname: "/s2/favicons*",
      },
      // DuckDuckGo icon service — fallback.
      {
        protocol: "https",
        hostname: "icons.duckduckgo.com",
      },
      // Direct funder favicons (publicly served at /favicon.ico).
      // We allow any https host here because every funder is a public
      // institution; in production we narrow this to an allowlist.
      {
        protocol: "https",
        hostname: "**",
      },
      // Original placeholder hosts kept for compatibility.
      {
        protocol: "https",
        hostname: "api.dicebear.com",
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
  },
};

// Expose Cloudflare bindings (D1, AI, Vectorize) to `next dev` via OpenNext.
initOpenNextCloudflareForDev();

export default nextConfig;
