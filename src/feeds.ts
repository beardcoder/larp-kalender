/** Export formats: iCalendar (RFC 5545), CSV and RSS 2.0. */

import type { LarpEvent } from "./shared/types.ts";
import { COUNTRIES, EVENT_TYPES, GENRES, REGISTRATION_STATUS } from "./shared/vocab.ts";
import { formatDateRange } from "./shared/format.ts";
import { addDays } from "./repo/events.ts";
import { escapeHtml } from "./html.ts";

/* ---------- iCalendar ---------- */

const encoder = new TextEncoder();

/** Folds content lines at 75 octets without splitting UTF-8 sequences. */
function fold(line: string): string {
  if (encoder.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let current = "";
  let bytes = 0;
  for (const ch of line) {
    const len = encoder.encode(ch).length;
    const limit = parts.length ? 74 : 75;
    if (bytes + len > limit) {
      parts.push(current);
      current = "";
      bytes = 0;
    }
    current += ch;
    bytes += len;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

const icsText = (v: string) => v.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const icsDate = (iso: string) => iso.replaceAll("-", "");
const icsStamp = (iso: string) => iso.replace(/[-:]/g, "").replace(/\.\d+/, "");

const VTIMEZONE_BERLIN = [
  "BEGIN:VTIMEZONE",
  "TZID:Europe/Berlin",
  "BEGIN:DAYLIGHT",
  "TZOFFSETFROM:+0100",
  "TZOFFSETTO:+0200",
  "TZNAME:CEST",
  "DTSTART:19700329T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
  "END:DAYLIGHT",
  "BEGIN:STANDARD",
  "TZOFFSETFROM:+0200",
  "TZOFFSETTO:+0100",
  "TZNAME:CET",
  "DTSTART:19701025T030000",
  "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
  "END:STANDARD",
  "END:VTIMEZONE",
];

export function eventLocation(e: LarpEvent): string {
  const cityLine = [e.postalCode, e.city].filter(Boolean).join(" ");
  const country = e.country !== "DE" ? (COUNTRIES[e.country as keyof typeof COUNTRIES] ?? e.country) : null;
  return [e.venue, e.street, cityLine, country].filter(Boolean).join(", ");
}

function eventDescription(e: LarpEvent, base: string): string {
  const lines: string[] = [];
  if (e.status === "cancelled") lines.push("ABGESAGT");
  if (e.summary) lines.push(e.summary);
  if (e.registrationUrl) lines.push(`Anmeldung: ${e.registrationUrl}`);
  lines.push(REGISTRATION_STATUS[e.registrationStatus]);
  if (e.registrationDeadline) lines.push(`Anmeldeschluss: ${formatDateRange(e.registrationDeadline, e.registrationDeadline)}`);
  if (e.priceText) lines.push(`Preis: ${e.priceText}`);
  if (e.organizer) lines.push(`Veranstalter: ${e.organizer}`);
  if (e.websiteUrl) lines.push(`Website: ${e.websiteUrl}`);
  lines.push(`Details: ${base}/termin/${e.slug}`);
  return lines.join("\n");
}

function veventLines(e: LarpEvent, base: string, host: string): string[] {
  const lines = [
    "BEGIN:VEVENT",
    `UID:event-${e.id}@${host}`,
    `DTSTAMP:${icsStamp(new Date().toISOString())}`,
    `LAST-MODIFIED:${icsStamp(e.updatedAt)}`,
    `CREATED:${icsStamp(e.createdAt)}`,
  ];
  if (e.startTime) {
    lines.push(`DTSTART;TZID=Europe/Berlin:${icsDate(e.startDate)}T${e.startTime.replace(":", "")}00`);
    lines.push(`DTEND;TZID=Europe/Berlin:${icsDate(e.endDate)}T${(e.endTime ?? "23:59").replace(":", "")}00`);
  } else {
    lines.push(`DTSTART;VALUE=DATE:${icsDate(e.startDate)}`);
    lines.push(`DTEND;VALUE=DATE:${icsDate(addDays(e.endDate, 1))}`);
    lines.push("TRANSP:TRANSPARENT");
  }
  lines.push(`SUMMARY:${icsText((e.status === "cancelled" ? "[Abgesagt] " : "") + e.title)}`);
  lines.push(`DESCRIPTION:${icsText(eventDescription(e, base))}`);
  const loc = eventLocation(e);
  if (loc) lines.push(`LOCATION:${icsText(loc)}`);
  if (e.lat != null && e.lng != null) lines.push(`GEO:${e.lat.toFixed(6)};${e.lng.toFixed(6)}`);
  lines.push(`URL:${base}/termin/${e.slug}`);
  const cats = [...e.genres.map((g) => GENRES[g]), EVENT_TYPES[e.eventType]].filter(Boolean);
  if (cats.length) lines.push(`CATEGORIES:${cats.map(icsText).join(",")}`);
  if (e.organizer) lines.push(`ORGANIZER;CN=${icsText(e.organizer).replace(/"/g, "")}:${e.contactEmail ? `mailto:${e.contactEmail}` : `${base}/termin/${e.slug}`}`);
  lines.push(`STATUS:${e.status === "cancelled" ? "CANCELLED" : "CONFIRMED"}`);
  lines.push("END:VEVENT");
  return lines;
}

/** An all-day entry for the registration deadline, so subscribers do not miss it. */
function deadlineLines(e: LarpEvent, base: string, host: string): string[] {
  if (!e.registrationDeadline || e.status === "cancelled") return [];
  return [
    "BEGIN:VEVENT",
    `UID:deadline-${e.id}@${host}`,
    `DTSTAMP:${icsStamp(new Date().toISOString())}`,
    `LAST-MODIFIED:${icsStamp(e.updatedAt)}`,
    `DTSTART;VALUE=DATE:${icsDate(e.registrationDeadline)}`,
    `DTEND;VALUE=DATE:${icsDate(addDays(e.registrationDeadline, 1))}`,
    `SUMMARY:${icsText(`Anmeldeschluss: ${e.title}`)}`,
    `DESCRIPTION:${icsText([e.registrationUrl ? `Anmeldung: ${e.registrationUrl}` : "", `Details: ${base}/termin/${e.slug}`].filter(Boolean).join("\n"))}`,
    `URL:${e.registrationUrl ?? `${base}/termin/${e.slug}`}`,
    "TRANSP:TRANSPARENT",
    "END:VEVENT",
  ];
}

export function renderIcs(events: LarpEvent[], opts: { base: string; name: string; deadlines?: boolean }): string {
  const host = new URL(opts.base).hostname;
  const usesTime = events.some((e) => e.startTime);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//LARP-Kalender//DE",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${icsText(opts.name)}`,
    "X-WR-TIMEZONE:Europe/Berlin",
    "X-WR-CALDESC:LARP-Veranstaltungen mit Anmeldelinks",
    "REFRESH-INTERVAL;VALUE=DURATION:PT6H",
    "X-PUBLISHED-TTL:PT6H",
    ...(usesTime ? VTIMEZONE_BERLIN : []),
  ];
  for (const e of events) {
    lines.push(...veventLines(e, opts.base, host));
    if (opts.deadlines) lines.push(...deadlineLines(e, opts.base, host));
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

/* ---------- CSV ---------- */

const CSV_COLUMNS: [string, (e: LarpEvent, base: string) => string | number | null][] = [
  ["Titel", (e) => e.title],
  ["Beginn", (e) => e.startDate],
  ["Ende", (e) => e.endDate],
  ["Startzeit", (e) => e.startTime],
  ["Endzeit", (e) => e.endTime],
  ["Art", (e) => EVENT_TYPES[e.eventType]],
  ["Genres", (e) => e.genres.map((g) => GENRES[g]).join(", ")],
  ["Anmeldestatus", (e) => REGISTRATION_STATUS[e.registrationStatus]],
  ["Anmeldelink", (e) => e.registrationUrl],
  ["Anmeldung ab", (e) => e.registrationOpens],
  ["Anmeldeschluss", (e) => e.registrationDeadline],
  ["Preis", (e) => e.priceText],
  ["Preis ab (EUR)", (e) => e.priceMin],
  ["Veranstalter", (e) => e.organizer],
  ["Ort", (e) => e.venue],
  ["Straße", (e) => e.street],
  ["PLZ", (e) => e.postalCode],
  ["Stadt", (e) => e.city],
  ["Bundesland/Region", (e) => e.region],
  ["Land", (e) => e.country],
  ["Website", (e) => e.websiteUrl],
  ["Mindestalter", (e) => e.minAge],
  ["Plätze", (e) => e.capacity],
  ["Kurzbeschreibung", (e) => e.summary],
  ["Abgesagt", (e) => (e.status === "cancelled" ? "ja" : "")],
  ["Details", (e, base) => `${base}/termin/${e.slug}`],
];

export function renderCsv(events: LarpEvent[], base: string, sep = ";"): string {
  const cell = (v: string | number | null) => {
    if (v === null || v === undefined) return "";
    let s = String(v);
    // Neutralize spreadsheet formulas (CSV injection).
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /["\n\r]/.test(s) || s.includes(sep) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = [CSV_COLUMNS.map(([h]) => h).join(sep)];
  for (const e of events) rows.push(CSV_COLUMNS.map(([, get]) => cell(get(e, base))).join(sep));
  // BOM so that Excel detects UTF-8.
  return "\uFEFF" + rows.join("\r\n") + "\r\n";
}

/* ---------- RSS ---------- */

export function renderRss(events: LarpEvent[], base: string): string {
  const items = events
    .map((e) => {
      const desc = [formatDateRange(e.startDate, e.endDate), eventLocation(e), e.summary, e.registrationUrl ? `Anmeldung: ${e.registrationUrl}` : ""]
        .filter(Boolean)
        .join(" · ");
      return `<item><title>${escapeHtml(e.title)}</title><link>${base}/termin/${e.slug}</link>
<guid isPermaLink="false">event-${e.id}</guid><pubDate>${new Date(e.createdAt).toUTCString()}</pubDate>
<description>${escapeHtml(desc)}</description>${e.genres.map((g) => `<category>${escapeHtml(GENRES[g])}</category>`).join("")}</item>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>LARP-Kalender – neue Veranstaltungen</title><link>${base}</link>
<description>Neu eingetragene LARP-Veranstaltungen</description><language>de-de</language>
${items}
</channel></rss>`;
}
