import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Distance, EventActions } from "@/components/EventActions.tsx";
import { GenreTags, placeLine, Seal, StatusText } from "@/components/event-bits.tsx";
import { Icon } from "@/components/Icon.tsx";
import { getApp } from "@/lib/server/app.ts";
import { baseUrl } from "@/lib/server/auth.ts";
import { toPublicEvent, today as todayIso } from "@/lib/server/events.ts";
import { daysBetween, durationDays, formatDate, formatDateRange } from "@/lib/shared/format.ts";
import { EVENT_TYPES } from "@/lib/shared/vocab.ts";

type Props = { params: Promise<{ slug: string }> };

async function load(params: Props["params"]) {
  const e = getApp().getEvent(decodeURIComponent((await params).slug));
  return e && e.status !== "draft" ? toPublicEvent(e) : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const e = await load(params);
  if (!e) return { title: "Nicht gefunden" };
  const description = [formatDateRange(e.startDate, e.endDate), [e.venue, e.city].filter(Boolean).join(", "), e.summary].filter(Boolean).join(" · ").slice(0, 300);
  return {
    title: e.title,
    description,
    openGraph: { title: e.title, description, url: `/termin/${e.slug}`, ...(e.imageUrl ? { images: [e.imageUrl] } : {}) },
  };
}

/** Plain text with paragraphs and clickable links. */
function RichText({ text }: { text: string }) {
  return text.split(/\n{2,}/).map((para, i) => (
    <p key={i}>
      {para.split(/(https?:\/\/[^\s<]+)/g).map((part, j) =>
        /^https?:\/\//.test(part) ? (
          <a key={j} href={part} target="_blank" rel="noopener noreferrer">
            {part.replace(/^https?:\/\/(www\.)?/, "").slice(0, 48)}
          </a>
        ) : (
          part.split("\n").flatMap((line, k) => (k ? [<br key={`${j}-${k}`} />, line] : [line]))
        ),
      )}
    </p>
  ));
}

export default async function EventPage({ params }: Props) {
  const e = await load(params);
  if (!e) notFound();
  const today = todayIso();
  const url = `${await baseUrl()}/termin/${e.slug}`;
  const days = durationDays(e.startDate, e.endDate);
  const until = daysBetween(today, e.startDate);
  const address = [e.venue, e.street, [e.postalCode, e.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const mapQuery = e.lat != null && e.lng != null ? `${e.lat},${e.lng}` : address;
  const registerOpen = !!e.registrationUrl && e.status !== "cancelled" && e.endDate >= today && !["closed", "sold_out"].includes(e.registrationStatus);

  return (
    <article className={`view detail${e.status === "cancelled" ? " is-cancelled" : ""}`}>
      <Link className="back-link" href="/">
        <Icon name="back" size={16} /> Alle Termine
      </Link>
      {e.imageUrl ? <img className="detail-image" src={e.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" /> : null}
      <header className="detail-head">
        <Seal event={e} today={today} size="lg" />
        <div>
          <p className="detail-type">
            {EVENT_TYPES[e.eventType]}
            {e.organizer ? ` von ${e.organizer}` : ""}
          </p>
          <h1 className="detail-title">{e.title}</h1>
          <GenreTags genres={e.genres} />
        </div>
      </header>

      {e.status === "cancelled" ? <p className="banner banner-cancelled">Diese Veranstaltung wurde abgesagt.</p> : null}

      <section className={`register register-${e.registrationStatus}`} aria-label="Anmeldung">
        <StatusText event={e} today={today} />
        {e.registrationDeadline ? <p className="register-line">Anmeldeschluss: {formatDate(e.registrationDeadline, true)}</p> : null}
        {e.registrationOpens && e.registrationOpens > today ? <p className="register-line">Anmeldung öffnet am {formatDate(e.registrationOpens, true)}</p> : null}
        {e.priceText ? <p className="register-line">{e.priceText}</p> : null}
        {registerOpen ? (
          <a className="btn accent big" href={e.registrationUrl!} target="_blank" rel="noopener noreferrer">
            Zur Anmeldung <Icon name="external" size={18} />
          </a>
        ) : e.websiteUrl && e.status !== "cancelled" ? (
          <a className="btn big" href={e.websiteUrl} target="_blank" rel="noopener noreferrer">
            Zur Website <Icon name="external" size={18} />
          </a>
        ) : null}
      </section>

      <EventActions event={e} url={url} mapQuery={mapQuery} />

      <dl className="facts">
        <div>
          <dt>
            <Icon name="calendar" size={18} />
            <span className="sr-only">Datum</span>
          </dt>
          <dd>
            {formatDateRange(e.startDate, e.endDate)}
            <span className="sub">
              {days > 1 ? `${days} Tage` : "Ein Tag"}
              {e.startTime ? ` · ab ${e.startTime} Uhr` : ""}
              {e.endTime ? ` · bis ${e.endTime} Uhr` : ""}
              {until > 0 ? ` · in ${until} ${until === 1 ? "Tag" : "Tagen"}` : until === 0 ? " · heute" : ""}
            </span>
          </dd>
        </div>
        {address || e.city ? (
          <div>
            <dt>
              <Icon name="pin" size={18} />
              <span className="sr-only">Ort</span>
            </dt>
            <dd>
              {address || placeLine(e)}
              <span className="sub">
                {e.region}
                <Distance event={e} />
                {mapQuery ? (
                  <>
                    {" "}
                    <a href={`https://www.openstreetmap.org/search?query=${encodeURIComponent(mapQuery)}`} target="_blank" rel="noopener noreferrer">
                      Karte
                    </a>
                  </>
                ) : null}
              </span>
            </dd>
          </div>
        ) : null}
        {e.minAge || e.capacity ? (
          <div>
            <dt>
              <Icon name="users" size={18} />
              <span className="sr-only">Teilnahme</span>
            </dt>
            <dd>{[e.minAge ? `ab ${e.minAge} Jahren` : "", e.capacity ? `bis ${e.capacity} Teilnehmende` : ""].filter(Boolean).join(" · ")}</dd>
          </div>
        ) : null}
        {e.websiteUrl ? (
          <div>
            <dt>
              <Icon name="link" size={18} />
              <span className="sr-only">Website</span>
            </dt>
            <dd>
              <a href={e.websiteUrl} target="_blank" rel="noopener noreferrer">
                {e.websiteUrl.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}
              </a>
            </dd>
          </div>
        ) : null}
      </dl>

      {e.summary ? <p className="detail-summary">{e.summary}</p> : null}
      {e.description ? (
        <div className="detail-text">
          <RichText text={e.description} />
        </div>
      ) : null}
      {e.tags.length ? (
        <p className="tags">
          {e.tags.map((t) => (
            <span key={t} className="tag">
              {t}
            </span>
          ))}
        </p>
      ) : null}

      <footer className="detail-foot">
        {e.lastCheckedAt ? `Zuletzt geprüft am ${formatDate(e.lastCheckedAt.slice(0, 10))}. ` : ""}
        Angaben ohne Gewähr – maßgeblich sind die Informationen der Veranstalter.
        {e.contactEmail ? (
          <>
            {" "}
            Kontakt: <a href={`mailto:${e.contactEmail}`}>{e.contactEmail}</a>
          </>
        ) : null}
      </footer>
    </article>
  );
}
