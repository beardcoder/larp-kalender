/** Generates the wax-seal app icon (SVG) and PNG variants via ImageMagick. Run once: bun scripts/make-icons.ts */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const out = join(import.meta.dir, "..", "public", "icons");
mkdirSync(out, { recursive: true });

/** Wobbly seal outline: a circle whose radius varies with a few sine waves. */
function sealPath(cx: number, cy: number, r: number, wobble: number, points = 96): string {
  const pts: string[] = [];
  for (let i = 0; i < points; i++) {
    const a = (i / points) * Math.PI * 2;
    const rr = r + wobble * (Math.sin(a * 7) * 0.6 + Math.sin(a * 13 + 1.3) * 0.3 + Math.sin(a * 3 + 0.4) * 0.5);
    pts.push(`${(cx + Math.cos(a) * rr).toFixed(2)},${(cy + Math.sin(a) * rr).toFixed(2)}`);
  }
  return `M${pts.join("L")}Z`;
}

/** Eight-pointed star (compass rose), embossed into the seal. */
function star(cx: number, cy: number, outer: number, inner: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 === 0 ? (i % 4 === 0 ? outer : outer * 0.62) : inner;
    pts.push(`${(cx + Math.cos(a) * r).toFixed(2)},${(cy + Math.sin(a) * r).toFixed(2)}`);
  }
  return `M${pts.join("L")}Z`;
}

function seal(size: number, scale: number, background: string | null): string {
  const c = size / 2;
  const r = (size / 2) * scale;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">

${background ? `<rect width="${size}" height="${size}" fill="${background}"/>` : ""}
<path d="${sealPath(c, c, r, r * 0.045)}" fill="#a8243a"/>
<ellipse cx="${c - r * 0.25}" cy="${c - r * 0.3}" rx="${r * 0.55}" ry="${r * 0.42}" fill="#d4425a" fill-opacity=".45"/>
<path d="${sealPath(c, c, r, r * 0.045)}" fill="none" stroke="#6e1222" stroke-width="${r * 0.03}"/>
<circle cx="${c}" cy="${c}" r="${r * 0.72}" fill="#8e1a2e"/>
<circle cx="${c}" cy="${c}" r="${r * 0.72}" fill="none" stroke="#e98a99" stroke-opacity=".55" stroke-width="${r * 0.035}"/>
<circle cx="${c}" cy="${c}" r="${r * 0.64}" fill="none" stroke="#5c0e1b" stroke-opacity=".6" stroke-width="${r * 0.02}"/>
<path d="${star(c, c, r * 0.5, r * 0.11)}" fill="#f2c3ca" fill-opacity=".92"/>
<circle cx="${c}" cy="${c}" r="${r * 0.07}" fill="#8e1a2e"/>
</svg>`;
}

function badge(size: number): string {
  const c = size / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
<path d="${star(c, c, size * 0.46, size * 0.1)}" fill="#fff"/></svg>`;
}

const BG = "#13221c";
const files: [string, string][] = [
  ["icon.svg", seal(512, 0.86, null)],
  ["icon-any.svg", seal(512, 0.9, null)],
  ["icon-maskable.svg", seal(512, 0.62, BG)],
  ["icon-apple.svg", seal(180, 0.74, BG)],
  ["badge.svg", badge(96)],
];
for (const [name, svg] of files) writeFileSync(join(out, name), svg);

const run = (args: string[]) => {
  const p = Bun.spawnSync(["magick", "-background", "none", ...args]);
  if (p.exitCode !== 0) throw new Error(p.stderr.toString());
};
run([join(out, "icon-any.svg"), "-resize", "192x192", join(out, "icon-192.png")]);
run([join(out, "icon-any.svg"), "-resize", "512x512", join(out, "icon-512.png")]);
run([join(out, "icon-maskable.svg"), "-resize", "512x512", join(out, "icon-maskable-512.png")]);
run([join(out, "icon-apple.svg"), "-resize", "180x180", join(out, "apple-touch-icon.png")]);
run([join(out, "badge.svg"), "-resize", "96x96", join(out, "badge-96.png")]);
run([join(out, "icon-any.svg"), "-define", "icon:auto-resize=48,32,16", join(out, "favicon.ico")]);
console.log("Icons written to", out);
