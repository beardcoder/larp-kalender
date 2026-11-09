import { useEffect, useRef, useState } from "preact/hooks";
import type { LarpEvent } from "../../../src/shared/types.ts";
import { EVENT_TYPES } from "../../../src/shared/vocab.ts";
import { addDaysIso, daysBetween, durationDays, formatDate, formatDateRange } from "../../../src/shared/format.ts";
import { useStore } from "../../lib/store.ts";
import { pop } from "../../lib/motion.ts";
import { back, useLocation } from "../../lib/router.ts";
import { copyText, GenreTags, Icon, placeLine, Seal, StatusText } from "../components.tsx";
import { distanceKm, eventsStore, favoritesStore, originLabel, positionStore, toggleFavorite } from "../state.ts";
import { toast } from "../toast.tsx";
import { Sheet } from "./Sheet.tsx";

declare global {
  interface Window {
    __preload?: { event?: LarpEvent };
  }
}

function useEvent(slug: string): { event: LarpEvent | null; missing: boolean } {
  const { events } = useStore(eventsStore);
  const known = events.find((e) => e.slug === slug) ?? (window.__preload?.event?.slug === slug ? window.__preload.event : null);
  const [fetched, setFetched] = useState<LarpEvent | null>(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    if (known) return;
    let alive = true;
    fetch(`/api/events/${encodeURIComponent(slug)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { event: LarpEvent }) => alive && setFetched(d.event))
      .catch(() => alive && setMissing(true));
    return () => {
      alive = false;
    };
  }, [slug, !!known]);
  return { event: known ?? fetched, missing };
}

const compact = (iso: string) => iso.replaceAll("-", "");

function googleCalendarUrl(e: LarpEvent, url: string): string {
  const p = new URLSearchParams({
    action: "TEMPLATE",
    text: e.title,
    dates: `${compact(e.startDate)}/${compact(addDaysIso(e.endDate, 1))}`,
    details: [e.summary, e.registrationUrl ? `Anmeldung: ${e.registrationUrl}` : "", url].filter(Boolean).join("\n\n"),
    location: [e.venue, e.street, [e.postalCode, e.city].filter(Boolean).join(" ")].filter(Boolean).join(", "),
  });
  return `https://calendar.google.com/calendar/render?${p}`;
}

function outlookUrl(e: LarpEvent, url: string): string {
  const p = new URLSearchParams({
    path: "/calendar/action/compose",
    rru: "addevent",
    subject: e.title,
    startdt: e.startDate,
    enddt: addDaysIso(e.endDate, 1),
    allday: "true",
    body: [e.summary, e.registrationUrl ? `Anmeldung: ${e.registrationUrl}` : "", url].filter(Boolean).join("\n\n"),
    location: [e.venue, e.city].filter(Boolean).join(", "),
  });
  return `https://outlook.live.com/calendar/0/action/compose?${p}`;
}

/** Renders plain text with paragraphs and clickable links. */
function RichText({ text }: { text: string }) {
  return (
    <>
      {text.split(/\n{2,}/).map((para, i) => (
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
      ))}
    </>
  );
}

export function DetailView({ slug }: { slug: string }) {
  const { event: e, missing } = useEvent(slug);
  const { today } = useStore(eventsStore);
  const favorites = useStore(favoritesStore);
  const position = useStore(positionStore);
  const loc = useLocation();
  const favRef = useRef<HTMLButtonElement>(null);
  const [calOpen, setCalOpen] = useState(false);

  useEffect(() => {
    if (e) document.title = `${e.title} – LARP-Kalender`;
    return () => {
      document.title = "LARP-Kalender";
    };
  }, [e?.title]);

  const onClose = () => back(loc.background ?? "/");

  if (!e) {
    return (
      <Sheet title="Veranstaltung" onClose={onClose} variant="panel">
        {() => <div class="detail-loading">{missing ? <p>Diese Veranstaltung gibt es nicht (mehr).</p> : <p>Lade …</p>}</div>}
      </Sheet>
    );
  }

  const url = `${location.origin}/termin/${e.slug}`;
  const fav = favorites.includes(e.id);
  const days = durationDays(e.startDate, e.endDate);
  const until = daysBetween(today, e.startDate);
  const km = position && e.lat != null && e.lng != null ? Math.round(distanceKm(position, { lat: e.lat, lng: e.lng })) : null;
  const address = [e.venue, e.street, [e.postalCode, e.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const mapQuery = e.lat != null && e.lng != null ? `${e.lat},${e.lng}` : address;
  const canRegister = !!e.registrationUrl && e.status !== "cancelled" && e.endDate >= today && !["closed", "sold_out"].includes(e.registrationStatus);

  const share = async () => {
    const data = { title: e.title, text: `${e.title} – ${formatDateRange(e.startDate, e.endDate)}`, url };
    if (navigator.share) {
      try {
        await navigator.share(data);
      } catch {
        /* dismissed */
      }
    } else if (await copyText(url)) toast("Link kopiert");
  };

  const onFav = () => {
    const added = toggleFavorite(e.id);
    navigator.vibrate?.(added ? [8, 40, 12] : 8);
    if (favRef.current) pop(favRef.current);
    toast(added ? "Auf die Merkliste gesetzt" : "Von der Merkliste entfernt");
  };

  return (
    <Sheet title={e.title} onClose={onClose} variant="panel" hideTitle>
      {() => (
        <article class={`detail${e.status === "cancelled" ? " is-cancelled" : ""}`}>
          {e.imageUrl ? <img class="detail-image" src={e.imageUrl} alt="" loading="lazy" referrerpolicy="no-referrer" /> : null}
          <header class="detail-head">
            <Seal event={e} today={today} size="lg" />
            <div>
              <p class="detail-type">
                {EVENT_TYPES[e.eventType]}
                {e.organizer ? ` von ${e.organizer}` : ""}
              </p>
              <h2 class="detail-title">{e.title}</h2>
              <GenreTags genres={e.genres} />
            </div>
          </header>

          {e.status === "cancelled" ? <p class="banner banner-cancelled">Diese Veranstaltung wurde abgesagt.</p> : null}

          <section class={`register register-${e.registrationStatus}`} aria-label="Anmeldung">
            <StatusText event={e} today={today} />
            {e.registrationDeadline ? <p class="register-line">Anmeldeschluss: {formatDate(e.registrationDeadline, true)}</p> : null}
            {e.registrationOpens && e.registrationOpens > today ? <p class="register-line">Anmeldung öffnet am {formatDate(e.registrationOpens, true)}</p> : null}
            {e.priceText ? <p class="register-line">{e.priceText}</p> : null}
            {canRegister ? (
              <a class="btn accent big" href={e.registrationUrl!} target="_blank" rel="noopener noreferrer">
                Zur Anmeldung <Icon name="external" size={18} />
              </a>
            ) : e.websiteUrl && e.status !== "cancelled" ? (
              <a class="btn big" href={e.websiteUrl} target="_blank" rel="noopener noreferrer">
                Zur Website <Icon name="external" size={18} />
              </a>
            ) : null}
          </section>

          <div class="actions-row">
            <button ref={favRef} class={`action${fav ? " is-on" : ""}`} onClick={onFav} aria-pressed={fav}>
              <Icon name="bookmark" />
              <span>{fav ? "Gemerkt" : "Merken"}</span>
            </button>
            <button class="action" onClick={() => setCalOpen((v) => !v)} aria-expanded={calOpen}>
              <Icon name="calendar" />
              <span>Kalender</span>
            </button>
            <button class="action" onClick={() => void share()}>
              <Icon name="share" />
              <span>Teilen</span>
            </button>
            {mapQuery ? (
              <a class="action" href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(mapQuery)}`} target="_blank" rel="noopener noreferrer">
                <Icon name="pin" />
                <span>Route</span>
              </a>
            ) : null}
          </div>

          {calOpen ? (
            <div class="cal-menu">
              <a class="btn ghost" href={`/termin/${e.slug}/kalender.ics`} download>
                <Icon name="download" size={18} /> Kalenderdatei (.ics)
              </a>
              <a class="btn ghost" href={googleCalendarUrl(e, url)} target="_blank" rel="noopener noreferrer">
                Google Kalender
              </a>
              <a class="btn ghost" href={outlookUrl(e, url)} target="_blank" rel="noopener noreferrer">
                Outlook
              </a>
            </div>
          ) : null}

          <dl class="facts">
            <div>
              <dt>
                <Icon name="calendar" size={18} />
                <span class="sr-only">Datum</span>
              </dt>
              <dd>
                {formatDateRange(e.startDate, e.endDate)}
                <span class="sub">
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
                  <span class="sr-only">Ort</span>
                </dt>
                <dd>
                  {address || placeLine(e)}
                  <span class="sub">
                    {[e.region, km !== null ? `etwa ${km} km von ${originLabel(position)}` : ""].filter(Boolean).join(" · ")}
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
                  <span class="sr-only">Teilnahme</span>
                </dt>
                <dd>{[e.minAge ? `ab ${e.minAge} Jahren` : "", e.capacity ? `bis ${e.capacity} Teilnehmende` : ""].filter(Boolean).join(" · ")}</dd>
              </div>
            ) : null}
            {e.websiteUrl ? (
              <div>
                <dt>
                  <Icon name="link" size={18} />
                  <span class="sr-only">Website</span>
                </dt>
                <dd>
                  <a href={e.websiteUrl} target="_blank" rel="noopener noreferrer">
                    {e.websiteUrl.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}
                  </a>
                </dd>
              </div>
            ) : null}
          </dl>

          {e.summary ? <p class="detail-summary">{e.summary}</p> : null}
          {e.description ? (
            <div class="detail-text">
              <RichText text={e.description} />
            </div>
          ) : null}
          {e.tags.length ? (
            <p class="tags">
              {e.tags.map((t) => (
                <span key={t} class="tag">
                  {t}
                </span>
              ))}
            </p>
          ) : null}

          <footer class="detail-foot">
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
      )}
    </Sheet>
  );
}
