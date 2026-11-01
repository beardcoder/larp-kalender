/** Generate all PWA artwork. Requires ImageMagick; run: bun scripts/make-icons.ts */
import { mkdirSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const root = join(import.meta.dir, "..");
const out = join(root, "public/icons");
mkdirSync(out, { recursive: true });
const temp = mkdtempSync(join(tmpdir(), "larp-icons-"));


function outline(cx: number, cy: number, r: number): string {
  return Array.from({ length: 120 }, (_, i) => {
    const a = i * Math.PI / 60;
    const radius = r * (1 + 0.025 * Math.sin(7 * a) + 0.014 * Math.sin(13 * a + 1.3) + 0.018 * Math.sin(3 * a + 0.4));
    return `${i ? "L" : "M"}${(cx + Math.cos(a) * radius).toFixed(2)},${(cy + Math.sin(a) * radius).toFixed(2)}`;
  }).join("") + "Z";
}
function star(cx: number, cy: number, outer: number, inner: number): string {
  return Array.from({ length: 16 }, (_, i) => {
    const a = i * Math.PI / 8 - Math.PI / 2;
    const r = i % 2 ? inner : i % 4 ? outer * 0.66 : outer;
    return `${i ? "L" : "M"}${(cx + Math.cos(a) * r).toFixed(2)},${(cy + Math.sin(a) * r).toFixed(2)}`;
  }).join("") + "Z";
}
const defs = "";
function mark(cx: number, cy: number, r: number, glyph = "star", simple = false): string {
  const shape = outline(cx, cy, r);
  const s = r / 100;
  let symbol = `<path d="${star(cx, cy, r * .53, r * (simple ? .19 : .13))}"/>`;
  if (glyph === "calendar") symbol = `<path d="M${cx-36*s} ${cy-30*s}h${72*s}v${65*s}h${-72*s}z M${cx-27*s} ${cy-3*s}v${29*s}h${54*s}v${-29*s}z" fill="#0e0b16" fill-rule="evenodd"/><path d="M${cx-25*s} ${cy-40*s}h${10*s}v${25*s}h${-10*s}z M${cx+15*s} ${cy-40*s}h${10*s}v${25*s}h${-10*s}z" fill="#0e0b16"/>`;
  if (glyph === "bookmark") symbol = `<path d="M${cx-26*s} ${cy-39*s}h${52*s}v${80*s}l${-26*s} ${-18*s}l${-26*s} ${18*s}z"/>`;
  if (glyph === "suggest") symbol = `<path d="M${cx-38*s} ${cy-6*s}h${32*s}v${-32*s}h${12*s}v${32*s}h${32*s}v${12*s}h${-32*s}v${32*s}h${-12*s}v${-32*s}h${-32*s}z" fill="#0e0b16"/>`;
  return `<path d="${shape}" fill="#ff3d9a" stroke="#c81f73" stroke-width="${r*.035}"/><circle cx="${cx}" cy="${cy+r*.025}" r="${r*.78}" fill="#a8165c"/><circle cx="${cx}" cy="${cy}" r="${r*.76}" fill="#f0318a" stroke="#a8165c" stroke-width="${r*.035}"/><circle cx="${cx}" cy="${cy-r*.012}" r="${r*.76}" fill="none" stroke="#ff9fd0" stroke-opacity=".55" stroke-width="${r*.018}"/>${simple ? "" : `<path d="M${cx-r*.66} ${cy-r*.57} Q${cx} ${cy-r*.99} ${cx+r*.57} ${cy-r*.66}" fill="none" stroke="#ffc6e4" stroke-opacity=".6" stroke-linecap="round" stroke-width="${r*.035}"/>`}<g color="#0e0b16" fill="#0e0b16">${symbol}</g>`;
}
function svg(size: number, radius: number, bg = "", glyph = "star", simple = false): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${defs}${bg ? `<rect width="100%" height="100%" fill="${bg}"/>` : ""}${mark(size/2,size/2,radius,glyph,simple)}</svg>`;
}
function run(args: string[]): void {
  const p = Bun.spawnSync(args, { stdout: "pipe", stderr: "pipe" });
  if (p.exitCode !== 0) throw new Error(`${args[0]}: ${p.stderr.toString()}`);
}
function png(name: string, content: string, width: number, height = width): void {
  const source = join(temp, "render.svg");
  writeFileSync(source, content);
  run(["magick", "-background", "none", "-density", "288", source, "-resize", `${width}x${height}!`, join(out, name)]);
}
try {
  const master = svg(512, 225);
  writeFileSync(join(out, "icon.svg"), master);
  for (const size of [192,512]) png(`icon-${size}.png`, svg(size, size * 225 / 512), size);
  png("icon-maskable-512.png", svg(512, 191, "#0e0b16"), 512);
  png("apple-touch-icon.png", svg(180, 72, "#0e0b16"), 180);
  for (const size of [16,32,48]) png(size === 48 ? "favicon-48.tmp.png" : `favicon-${size}.png`, svg(size, size*.46, "", "star", true), size);
  run(["magick", join(out,"favicon-16.png"), join(out,"favicon-32.png"), join(out,"favicon-48.tmp.png"), join(out,"favicon.ico")]);
  rmSync(join(out,"favicon-48.tmp.png"));
  png("badge-96.png", `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><path fill-rule="evenodd" d="${outline(48, 48, 42)} ${star(48, 48, 30, 8)}" fill="white"/></svg>`, 96);
  for (const glyph of ["calendar", "bookmark", "suggest"]) png(`shortcut-${glyph}.png`, svg(96, 43, "", glyph), 96);
  const og = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">${defs}<rect width="1200" height="630" fill="#0e0b16"/><path d="M0 510 Q300 400 600 540 T1200 465 V630 H0Z" fill="#17121f"/><path d="M85 80 H1115 M85 550 H1115" stroke="#ffc94d" stroke-opacity=".35" stroke-width="2"/>${mark(245,310,145)}</svg>`;
  png("og-image.png", og, 1200, 630);
  const display = join(root, "node_modules/@fontsource-variable/bricolage-grotesque/files/bricolage-grotesque-latin-wght-normal.woff2");
  const inter = join(root, "node_modules/@fontsource-variable/inter-tight/files/inter-tight-latin-wght-normal.woff2");
  run(["magick", join(out,"og-image.png"), "-font", display, "-fill", "#f4f0fa", "-pointsize", "72", "-annotate", "+450+295", "LARP-Kalender", "-font", inter, "-fill", "#ffc94d", "-pointsize", "27", "-annotate", "+453+352", "Kommende LARP-Veranstaltungen mit Anmeldelinks", join(out,"og-image.png")]);
  console.log("Icons written to", out);
} finally { rmSync(temp, { recursive: true, force: true }); }
