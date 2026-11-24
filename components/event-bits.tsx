/** Small presentational pieces of an event, usable from server and client components. */

import Link from "next/link";
import type { LarpEvent } from "@/lib/shared/types.ts";
import { COUNTRIES, EVENT_TYPES, GENRES, REGISTRATION_STATUS } from "@/lib/shared/vocab.ts";
import { daysBetween, formatDateRange, monthShort, parseDate } from "@/lib/shared/format.ts";
import { Icon } from "./Icon.tsx";

/** Colour of the date tile: registration open, soon/waitlist, closed/unknown, past. */
export function sealTone(e: LarpEvent, today: string): "open" | "soon" | "closed" | "past" {
  if (e.status === "cancelled" || e.endDate < today) return "past";
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
    <div className={`seal seal-${sealTone(e, today)} seal-${size}${multi && sameMonth ? " seal-multi" : ""}`} aria-hidden="true">
      <span className="seal-day">
        {s.getDate()}
        {multi && sameMonth ? <span className="seal-to">–{end.getDate()}</span> : null}
      </span>
      <span className="seal-month">
        {monthShort(s.getMonth())}
        {multi && !sameMonth ? `–${monthShort(end.getMonth())}` : ""}
      </span>
    </div>
  );
}

export function GenreTags({ genres }: { genres: LarpEvent["genres"] }) {
  if (!genres.length) return null;
  return (
    <span className="genres">
      {genres.map((g) => (
        <span className={`genre genre-${g}`} key={g}>
          {GENRES[g]}
        </span>
      ))}
    </span>
  );
}

export function StatusText({ event: e, today }: { event: LarpEvent; today: string }) {
  if (e.status === "cancelled") return <span className="status status-cancelled">Abgesagt</span>;
  if (e.endDate < today) return <span className="status status-past">Vorbei</span>;
  const deadline = e.registrationDeadline && e.registrationDeadline >= today ? daysBetween(today, e.registrationDeadline) : null;
  const opensLater = e.registrationStatus === "soon" && e.registrationOpens && e.registrationOpens > today;
  return (
    <span className={`status status-${e.registrationStatus}`}>
      {opensLater ? `Anmeldung ab ${formatDateRange(e.registrationOpens!, e.registrationOpens!).replace(/ \d{4}$/, "")}` : REGISTRATION_STATUS[e.registrationStatus]}
      {deadline !== null && ["open", "waitlist"].includes(e.registrationStatus) && deadline <= 14 ? (
        <span className="deadline"> · {deadline === 0 ? "nur noch heute" : `noch ${deadline} ${deadline === 1 ? "Tag" : "Tage"}`}</span>
      ) : null}
    </span>
  );
}

export function placeLine(e: LarpEvent): string {
  const country = e.country !== "DE" ? (COUNTRIES[e.country as keyof typeof COUNTRIES] ?? e.country) : "";
  return [e.city || e.venue, country].filter(Boolean).join(", ");
}

export const canRegister = (e: LarpEvent, today: string) =>
  !!e.registrationUrl && e.status !== "cancelled" && e.endDate >= today && ["open", "waitlist"].includes(e.registrationStatus);

export function EventCard({ event: e, today, favorite, isNew, km }: { event: LarpEvent; today: string; favorite: boolean; isNew: boolean; km: number | null }) {
  const place = placeLine(e);
  return (
    <article className={`card${e.status === "cancelled" ? " is-cancelled" : ""}`}>
      <Link className="card-link" href={`/termin/${e.slug}`} aria-label={`${e.title}, ${formatDateRange(e.startDate, e.endDate)}`} />
      <Seal event={e} today={today} />
      <div className="card-body">
        <h3 className="card-title">
          {e.title}
          {isNew ? <span className="new-tag">Neu</span> : null}
          {favorite ? <Icon name="bookmark" size={15} className="fav-mark" /> : null}
        </h3>
        <p className="card-meta">
          <span>{EVENT_TYPES[e.eventType]}</span>
          {place ? <span>{place}</span> : null}
          {km !== null ? <span>{Math.round(km)} km</span> : null}
        </p>
        <div className="card-foot">
          <StatusText event={e} today={today} />
          <GenreTags genres={e.genres} />
        </div>
      </div>
      {canRegister(e, today) ? (
        <a className="card-cta" href={e.registrationUrl!} target="_blank" rel="noopener noreferrer" aria-label={`Zur Anmeldung: ${e.title}`}>
          Anmelden
        </a>
      ) : null}
    </article>
  );
}

export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-seal" aria-hidden="true" />
      <h2>{title}</h2>
      {children}
    </div>
  );
}
