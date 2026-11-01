/**
 * Builds the frontend into dist/public: hashed JS/CSS/font bundles for the public PWA and the admin backend,
 * HTML shells, web app manifest, service worker (with precache list), copied icons, and precompressed
 * .br/.gz variants. `--watch` rebuilds on changes in client/ and src/shared/.
 */

import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, watch, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";

const root = join(import.meta.dir, "..");
const out = join(root, "dist", "public");
const watchMode = process.argv.includes("--watch");

const manifest = {
  name: "LARP-Kalender",
  short_name: "LARP-Kalender",
  description: "Kommende LARP-Veranstaltungen mit Anmeldelinks",
  lang: "de",
  start_url: "/?source=pwa",
  scope: "/",
  id: "/",
  display: "standalone",
  display_override: ["standalone", "minimal-ui"],
  orientation: "portrait-primary",
  background_color: "#2d2a2e",
  theme_color: "#2d2a2e",
  categories: ["entertainment", "lifestyle", "events"],
  icons: [
    { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
    { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    { src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
  ],
  shortcuts: [
    { name: "Kalender", url: "/kalender", icons: [{ src: "/icons/shortcut-calendar.png", sizes: "96x96", type: "image/png" }] },
    { name: "Merkliste", url: "/merkliste", icons: [{ src: "/icons/shortcut-bookmark.png", sizes: "96x96", type: "image/png" }] },
    { name: "Veranstaltung vorschlagen", url: "/vorschlagen", icons: [{ src: "/icons/shortcut-suggest.png", sizes: "96x96", type: "image/png" }] },
  ],
};

function compress(file: string): void {
  const data = readFileSync(file);
  if (data.length < 1024) return;
  writeFileSync(`${file}.gz`, gzipSync(data, { level: 9 }));
  writeFileSync(`${file}.br`, brotliCompressSync(data, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }));
}

async function build(): Promise<void> {
  const started = performance.now();
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });

  const result = await Bun.build({
    entrypoints: [join(root, "client/app/main.tsx"), join(root, "client/admin/main.tsx")],
    root: join(root, "client"),
    outdir: out,
    target: "browser",
    format: "esm",
    splitting: true,
    minify: true,
    sourcemap: "none",
    publicPath: "/",
    naming: {
      entry: "assets/[dir]-[name]-[hash].[ext]",
      chunk: "assets/chunk-[hash].[ext]",
      asset: "assets/[name]-[hash].[ext]",
    },
    define: { "process.env.NODE_ENV": '"production"' },
    // Font files are copied separately (see below) and referenced by absolute URL.
    external: ["/assets/fonts/*"],
  });
  if (!result.success) {
    for (const log of result.logs) console.error(log);
    throw new Error("Client build failed");
  }

  // Self-hosted fonts (no third-party requests). The version in the file name busts the immutable cache.
  const fonts: [string, string][] = [
    ["@fontsource-variable/bricolage-grotesque/files/bricolage-grotesque-latin-wght-normal.woff2", "bricolage-grotesque-5.3.0.woff2"],
    ["@fontsource-variable/inter-tight/files/inter-tight-latin-wght-normal.woff2", "inter-tight-5.3.0.woff2"],
  ];
  mkdirSync(join(out, "assets", "fonts"), { recursive: true });
  for (const [src, name] of fonts) cpSync(join(root, "node_modules", src), join(out, "assets", "fonts", name));

  const files = result.outputs.map((o) => "/" + relative(out, o.path).replaceAll("\\", "/"));
  const pick = (dir: "app" | "admin", ext: string) => files.filter((f) => f.startsWith(`/assets/${dir}-`) && f.endsWith(ext));

  const tags = (dir: "app" | "admin") =>
    [
      ...pick(dir, ".css").map((f) => `<link rel="stylesheet" href="${f}">`),
      ...fonts.map(([, f]) => `<link rel="preload" href="/assets/fonts/${f}" as="font" type="font/woff2" crossorigin>`),
      ...pick(dir, ".js").map((f) => `<script type="module" src="${f}"></script>`),
    ].join("\n    ");

  const template = readFileSync(join(root, "client/index.html"), "utf8");
  writeFileSync(join(out, "index.html"), template.replace("<!--assets-->", tags("app")));
  writeFileSync(
    join(out, "admin.html"),
    template
      .replace("<!--assets-->", tags("admin"))
      .replace('<link rel="manifest" href="/manifest.webmanifest" />', "")
      .replace(/<noscript>.*<\/noscript>/s, ""),
  );
  writeFileSync(join(out, "manifest.webmanifest"), JSON.stringify(manifest, null, 2));
  cpSync(join(root, "public"), out, { recursive: true });

  // Service worker: precache the public app (not the admin bundle).
  const precache = files.filter((f) => !f.startsWith("/assets/admin-") && !f.endsWith(".map"));
  precache.push(...fonts.map(([, f]) => `/assets/fonts/${f}`));
  precache.push("/manifest.webmanifest", "/icons/icon.svg", "/icons/icon-192.png", "/icons/badge-96.png");
  const version = new Bun.CryptoHasher("sha1").update(files.join("|")).digest("hex").slice(0, 10);
  const sw = await Bun.build({
    entrypoints: [join(root, "client/sw.ts")],
    target: "browser",
    minify: true,
    define: { __VERSION__: JSON.stringify(version), __PRECACHE__: JSON.stringify(precache) },
  });
  if (!sw.success) throw new Error("Service worker build failed");
  writeFileSync(join(out, "sw.js"), await sw.outputs[0]!.text());

  for (const f of [...files.map((f) => join(out, f)), join(out, "sw.js"), join(out, "manifest.webmanifest")]) {
    if (/\.(js|css|svg|webmanifest|html)$/.test(f) && existsSync(f)) compress(f);
  }

  const size = (f: string) => (readFileSync(join(out, f)).length / 1024).toFixed(1);
  console.log(`[client] built in ${Math.round(performance.now() - started)} ms (version ${version})`);
  for (const f of files) console.log(`  ${f.padEnd(52)} ${size(f)} kB`);
}

await build();

if (watchMode) {
  let timer: Timer | null = null;
  const rebuild = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => build().catch((e) => console.error(e)), 150);
  };
  for (const dir of ["client", "src/shared", "public"]) watch(join(root, dir), { recursive: true }, rebuild);
  console.log("[client] watching for changes …");
}
