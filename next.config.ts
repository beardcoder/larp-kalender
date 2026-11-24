import type { NextConfig } from "next";

const indexing = process.env.ALLOW_INDEXING === "true";
const cors = [{ key: "access-control-allow-origin", value: "*" }];

const config: NextConfig = {
  output: "standalone",
  // bun:sqlite is a Bun builtin: keep it out of the bundle and resolve it at runtime.
  serverExternalPackages: ["bun:sqlite"],
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "x-robots-tag", value: indexing ? "all" : "noindex, nofollow, noarchive" },
          { key: "x-content-type-options", value: "nosniff" },
          { key: "referrer-policy", value: "strict-origin-when-cross-origin" },
          { key: "x-frame-options", value: "DENY" },
          { key: "permissions-policy", value: "camera=(), microphone=(), geolocation=(self)" },
        ],
      },
      // Feeds and the public API may be read from other origins (calendar tools, widgets).
      { source: "/api/events/:path*", headers: cors },
      { source: "/:file(.*\\.ics)", headers: cors },
      { source: "/termin/:slug/kalender.ics", headers: cors },
      { source: "/.well-known/:path*", headers: cors },
      { source: "/sw.js", headers: [{ key: "cache-control", value: "no-cache" }, { key: "service-worker-allowed", value: "/" }] },
    ];
  },
};

export default config;
