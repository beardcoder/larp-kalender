import type { ComponentChildren } from "preact";
import type { LarpEvent } from "../../src/shared/types.ts";
import { EVENT_TYPES, GENRES, REGISTRATION_STATUS, COUNTRIES } from "../../src/shared/vocab.ts";
import { daysBetween, formatDateRange, monthShort, parseDate } from "../../src/shared/format.ts";
import { distanceKm, isNew } from "./state.ts";

/* ---------- icons (24px stroke icons) ---------- */

const PATHS = {
  list: "M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01",
  calendar: "M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z",
  bookmark: "M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1Z",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM20 20l-4-4",
  filter: "M4 6h16M7 12h10M10 18h4",
  close: "M6 6l12 12M18 6 6 18",
  back: "M15 18l-6-6 6-6",
  next: "M9 6l6 6-6 6",
  share: "M12 3v12M8 7l4-4 4 4M5 13v6a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-6",
  external: "M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5",
  pin: "M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21ZM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7v5l3 2",
  bell: "M6 16V11a6 6 0 1 1 12 0v5l2 2H4l2-2ZM10 21h4",
  download: "M12 4v11M7 10l5 5 5-5M5 20h14",
  link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  plus: "M12 5v14M5 12h14",
  check: "M5 12.5l4.5 4.5L19 7",
  locate: "M12 19a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM12 2v3M12 19v3M2 12h3M19 12h3",
  coin: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM15 9.5a3.5 3.5 0 1 0 0 5M8 11h5M8 13h5",
  users: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM2 21a7 7 0 0 1 14 0M16 3.5a4 4 0 0 1 0 7M22 21a7 7 0 0 0-4-6.3",
  flag: "M5 21V4M5 4h11l-2 4 2 4H5",
  rss: "M5 5a14 14 0 0 1 14 14M5 11a8 8 0 0 1 8 8M5.5 18.5h.01",
  install: "M12 3v12M7 10l5 5 5-5M4 21h16",
  sparkle: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z",
  copy: "M9 9h10v10H9zM5 15V5h10",
  refresh: "M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7",
  settings: "M4 7h9M17 7h3M15 5v4M4 17h3M11 17h9M9 15v4",
  mug: "M5 8h11v10a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V8ZM16 10h2a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-2M5 8a3 3 0 0 1 3-3 3 3 0 0 1 5 0 3 3 0 0 1 3 3",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 20, class: cls }: { name: IconName; size?: number; class?: string }) {
  return (
    <svg class={`icon ${cls ?? ""}`} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d={PATHS[name]} fill="none" stroke="currentColor" stroke-width={name === "more" ? 3.2 : 1.8} stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  );
}

/* ---------- date tile whose colour encodes the registration state ---------- */

export function sealTone(e: LarpEvent, today: string): string {
  if (e.status === "cancelled") return "past";
  if (e.endDate < today) return "past";
  if (e.registrationStatus === "open") return "open";
  if (e.registrationStatus === "waitlist" || e.registrationStatus === "soon") return "soon";
  return "closed";
}

export function Seal({ event: e, today, size = "md" }: { event: LarpEvent; today: string; size?: "md" | "lg" }) {
  const s = parseDate(e.startDate);
  const end = parseDate(e.endDate);
  const sameMonth = s.getMonth() === end.getMonth();
  const multi = e.startDate !== e.endDate;
  return (
    <div class={`seal seal-${sealTone(e, today)} seal-${size}${multi && sameMonth ? " seal-multi" : ""}`} aria-hidden="true">
      <span class="seal-day">
        {s.getDate()}
        {multi && sameMonth ? <span class="seal-to">–{end.getDate()}</span> : null}
      </span>
      <span class="seal-month">{monthShort(s.getMonth())}{multi && !sameMonth ? `–${monthShort(end.getMonth())}` : ""}</span>
    </div>
  );
}

/* ---------- small pieces ---------- */

export function GenreTags({ genres }: { genres: LarpEvent["genres"] }) {
  if (!genres.length) return null;
  return (
    <span class="genres">
      {genres.map((g) => (
        <span class={`genre genre-${g}`} key={g}>
          {GENRES[g]}
        </span>
      ))}
    </span>
  );
}

export function StatusText({ event: e, today }: { event: LarpEvent; today: string }) {
  if (e.status === "cancelled") return <span class="status status-cancelled">Abgesagt</span>;
  if (e.endDate < today) return <span class="status status-past">Vorbei</span>;
  const deadline = e.registrationDeadline && e.registrationDeadline >= today ? daysBetween(today, e.registrationDeadline) : null;
  return (
    <span class={`status status-${e.registrationStatus}`}>
      {e.registrationStatus === "soon" && e.registrationOpens && e.registrationOpens > today
        ? `Anmeldung ab ${formatDateRange(e.registrationOpens, e.registrationOpens).replace(/ \d{4}$/, "")}`
        : REGISTRATION_STATUS[e.registrationStatus]}
      {deadline !== null && ["open", "waitlist"].includes(e.registrationStatus) && deadline <= 14 ? (
        <span class="deadline"> · {deadline === 0 ? "nur noch heute" : `noch ${deadline} ${deadline === 1 ? "Tag" : "Tage"}`}</span>
      ) : null}
    </span>
  );
}

export function placeLine(e: LarpEvent): string {
  const country = e.country !== "DE" ? (COUNTRIES[e.country as keyof typeof COUNTRIES] ?? e.country) : "";
  return [e.city || e.venue, country].filter(Boolean).join(", ");
}

/* ---------- event card ---------- */

export function EventCard({
  event: e,
  today,
  favorite,
  position,
}: {
  event: LarpEvent;
  today: string;
  favorite: boolean;
  position: { lat: number; lng: number } | null;
}) {
  const km = position && e.lat != null && e.lng != null ? Math.round(distanceKm(position, { lat: e.lat, lng: e.lng })) : null;
  const place = placeLine(e);
  return (
    <article class={`card${e.status === "cancelled" ? " is-cancelled" : ""}`}>
      <a class="card-link" href={`/termin/${e.slug}`} data-overlay aria-label={`${e.title}, ${formatDateRange(e.startDate, e.endDate)}`} />
      <Seal event={e} today={today} />
      <div class="card-body">
        <h3 class="card-title">
          {e.title}
          {isNew(e) ? <span class="new-tag">Neu</span> : null}
          {favorite ? <Icon name="bookmark" size={15} class="fav-mark" /> : null}
        </h3>
        <p class="card-meta">
          <span>{EVENT_TYPES[e.eventType]}</span>
          {place ? <span>{place}</span> : null}
          {km !== null ? <span>{km} km</span> : null}
        </p>
        <div class="card-foot">
          <StatusText event={e} today={today} />
          <GenreTags genres={e.genres} />
        </div>
      </div>
      {e.registrationUrl && ["open", "waitlist"].includes(e.registrationStatus) && e.status !== "cancelled" && e.endDate >= today ? (
        <a class="card-cta" href={e.registrationUrl} target="_blank" rel="noopener noreferrer" aria-label={`Zur Anmeldung: ${e.title}`}>
          Anmelden
        </a>
      ) : null}
    </article>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ComponentChildren }) {
  return (
    <div class="empty">
      <div class="empty-seal" aria-hidden="true" />
      <h2>{title}</h2>
      {children}
    </div>
  );
}

/** Groups events by the month they start in. */
export function groupByMonth(events: LarpEvent[]): { key: string; label: string; events: LarpEvent[] }[] {
  const groups = new Map<string, LarpEvent[]>();
  for (const e of events) {
    const key = e.startDate.slice(0, 7);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(e);
  }
  return [...groups].map(([key, evs]) => {
    const d = parseDate(`${key}-01`);
    return { key, label: `${d.toLocaleDateString("de-DE", { month: "long" })} ${d.getFullYear()}`, events: evs };
  });
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
