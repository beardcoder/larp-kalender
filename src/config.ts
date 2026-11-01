import { join } from "node:path";

export interface Config {
  host: string;
  port: number;
  /** Directory holding the SQLite database. */
  dataDir: string;
  /** Directory with the built frontend (dist/public). */
  publicDir: string;
  /** Public base URL without trailing slash, e.g. https://larp.letsbenow.de. Derived from the request if empty. */
  publicUrl: string;
  /** Bootstrap admin, created on startup when no user exists yet. */
  adminEmail: string;
  adminPassword: string;
  /** Contact for VAPID (web push) and Nominatim. */
  contactEmail: string;
  /** Resolve addresses to coordinates via OpenStreetMap Nominatim. */
  geocode: boolean;
  /** Allow search engines to index the site. */
  allowIndexing: boolean;
  /** Use secure cookies (HTTPS). */
  secureCookies: boolean;
  /** Additional hosts allowed as OAuth redirect targets for MCP clients. */
  oauthRedirectHosts: string[];
}

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const publicUrl = (env.PUBLIC_URL ?? "").replace(/\/+$/, "");
  return {
    host: env.HOST || "0.0.0.0",
    port: Number(env.PORT ?? 3000),
    dataDir: env.DATA_DIR || join(process.cwd(), ".data"),
    publicDir: env.PUBLIC_DIR || join(process.cwd(), "dist", "public"),
    publicUrl,
    adminEmail: (env.ADMIN_EMAIL ?? "").trim().toLowerCase(),
    adminPassword: env.ADMIN_PASSWORD ?? "",
    contactEmail: env.CONTACT_EMAIL || env.ADMIN_EMAIL || "admin@example.org",
    geocode: (env.GEOCODE ?? "true") !== "false",
    allowIndexing: env.ALLOW_INDEXING === "true",
    oauthRedirectHosts: (env.OAUTH_REDIRECT_HOSTS ?? "").split(",").map((h) => h.trim()).filter(Boolean),
    secureCookies: env.SECURE_COOKIES ? env.SECURE_COOKIES === "true" : publicUrl.startsWith("https://"),
  };
}
