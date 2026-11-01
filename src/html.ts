/** HTML helpers and server-side meta tags for the single page app shell. */

import type { LarpEvent } from "./shared/types.ts";
import { formatDateRange } from "./shared/format.ts";

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export interface PageMeta {
  title: string;
  description: string;
  url: string;
  image?: string | null;
}

export const DEFAULT_DESCRIPTION =
  "Alle kommenden LARP-Veranstaltungen mit Anmeldelinks – filtern, merken, als Kalender abonnieren.";

export function eventMeta(e: LarpEvent, base: string): PageMeta {
  const place = [e.venue, e.city].filter(Boolean).join(", ");
  return {
    title: `${e.title} – LARP-Kalender`,
    description: [formatDateRange(e.startDate, e.endDate), place, e.summary].filter(Boolean).join(" · ").slice(0, 300),
    url: `${base}/termin/${e.slug}`,
    image: e.imageUrl,
  };
}

/** Injects title and Open Graph tags into the built index.html (placeholder `<!--meta-->`). */
export function renderShell(template: string, meta: PageMeta, allowIndexing: boolean, preload?: unknown): string {
  const tags = [
    `<title>${escapeHtml(meta.title)}</title>`,
    `<meta name="description" content="${escapeHtml(meta.description)}">`,
    `<meta name="robots" content="${allowIndexing ? "index,follow" : "noindex,nofollow,noarchive"}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="LARP-Kalender">`,
    `<meta property="og:title" content="${escapeHtml(meta.title)}">`,
    `<meta property="og:description" content="${escapeHtml(meta.description)}">`,
    `<meta property="og:url" content="${escapeHtml(meta.url)}">`,
    meta.image ? `<meta property="og:image" content="${escapeHtml(meta.image)}">` : "",
    `<link rel="alternate" type="application/rss+xml" title="Neue LARP-Veranstaltungen" href="/feed.xml">`,
    `<link rel="alternate" type="text/calendar" title="LARP-Kalender (iCal)" href="/kalender.ics">`,
    preload !== undefined
      ? `<script id="preload" type="application/json">${JSON.stringify(preload).replace(/</g, "\\u003c")}</script>`
      : "",
  ].join("\n");
  return template.replace("<!--meta-->", tags);
}
