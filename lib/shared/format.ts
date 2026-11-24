/** German date formatting shared between server (feeds, meta tags) and client. */

const MONTHS = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
const MONTHS_SHORT = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
const WEEKDAYS = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

export const monthName = (m: number) => MONTHS[m]!;
export const monthShort = (m: number) => MONTHS_SHORT[m]!;
export const weekdayShort = (d: number) => WEEKDAYS[d]!;

export function parseDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y!, m! - 1, d!);
}

/** "12.–14. Juni 2026", "30. Mai – 2. Juni 2026", "12. Juni 2026" */
export function formatDateRange(start: string, end: string): string {
  const s = parseDate(start);
  const e = parseDate(end);
  if (start === end) return `${s.getDate()}. ${monthName(s.getMonth())} ${s.getFullYear()}`;
  if (s.getFullYear() !== e.getFullYear())
    return `${s.getDate()}. ${monthName(s.getMonth())} ${s.getFullYear()} – ${e.getDate()}. ${monthName(e.getMonth())} ${e.getFullYear()}`;
  if (s.getMonth() !== e.getMonth())
    return `${s.getDate()}. ${monthName(s.getMonth())} – ${e.getDate()}. ${monthName(e.getMonth())} ${e.getFullYear()}`;
  return `${s.getDate()}.–${e.getDate()}. ${monthName(s.getMonth())} ${s.getFullYear()}`;
}

export function formatDate(iso: string, withWeekday = false): string {
  const d = parseDate(iso);
  return `${withWeekday ? `${weekdayShort(d.getDay())}, ` : ""}${d.getDate()}. ${monthName(d.getMonth())} ${d.getFullYear()}`;
}

/** Whole days between two ISO dates (b - a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / 86_400_000);
}

export function durationDays(start: string, end: string): number {
  return daysBetween(start, end) + 1;
}

/** Adds days to an ISO date (timezone safe). */
export function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
