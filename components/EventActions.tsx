"use client";

import { useState } from "react";
import { eventKm, favoritesStore, originLabel, positionStore, toggleFavorite } from "@/lib/client/state.ts";
import { useStore } from "@/lib/client/store.ts";
import { addDaysIso, formatDateRange } from "@/lib/shared/format.ts";
import type { LarpEvent } from "@/lib/shared/types.ts";
import { Icon } from "./Icon.tsx";
import { toast } from "./Toasts.tsx";

const compact = (iso: string) => iso.replaceAll("-", "");

function calendarLinks(e: LarpEvent, url: string) {
  const details = [e.summary, e.registrationUrl ? `Anmeldung: ${e.registrationUrl}` : "", url].filter(Boolean).join("\n\n");
  const location = [e.venue, e.street, [e.postalCode, e.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const google = new URLSearchParams({ action: "TEMPLATE", text: e.title, dates: `${compact(e.startDate)}/${compact(addDaysIso(e.endDate, 1))}`, details, location });
  const outlook = new URLSearchParams({ path: "/calendar/action/compose", rru: "addevent", subject: e.title, startdt: e.startDate, enddt: addDaysIso(e.endDate, 1), allday: "true", body: details, location });
  return { google: `https://calendar.google.com/calendar/render?${google}`, outlook: `https://outlook.live.com/calendar/0/action/compose?${outlook}` };
}

/** Bookmark, calendar, share and route buttons of the event page. */
export function EventActions({ event: e, url, mapQuery }: { event: LarpEvent; url: string; mapQuery: string }) {
  const favorites = useStore(favoritesStore);
  const [calOpen, setCalOpen] = useState(false);
  const fav = favorites.includes(e.id);
  const links = calendarLinks(e, url);

  const share = async () => {
    if (navigator.share) return navigator.share({ title: e.title, text: `${e.title} – ${formatDateRange(e.startDate, e.endDate)}`, url }).catch(() => undefined);
    await navigator.clipboard.writeText(url).then(() => toast("Link kopiert"), () => undefined);
  };

  return (
    <>
      <div className="actions-row">
        <button
          className={`action${fav ? " is-on" : ""}`}
          aria-pressed={fav}
          onClick={() => {
            const added = toggleFavorite(e.id);
            navigator.vibrate?.(added ? [8, 40, 12] : 8);
            toast(added ? "Auf die Merkliste gesetzt" : "Von der Merkliste entfernt");
          }}
        >
          <Icon name="bookmark" />
          <span>{fav ? "Gemerkt" : "Merken"}</span>
        </button>
        <button className="action" onClick={() => setCalOpen((v) => !v)} aria-expanded={calOpen}>
          <Icon name="calendar" />
          <span>Kalender</span>
        </button>
        <button className="action" onClick={() => void share()}>
          <Icon name="share" />
          <span>Teilen</span>
        </button>
        {mapQuery ? (
          <a className="action" href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(mapQuery)}`} target="_blank" rel="noopener noreferrer">
            <Icon name="pin" />
            <span>Route</span>
          </a>
        ) : null}
      </div>
      {calOpen ? (
        <div className="cal-menu">
          <a className="btn ghost" href={`/termin/${e.slug}/kalender.ics`} download>
            <Icon name="download" size={18} /> Kalenderdatei (.ics)
          </a>
          <a className="btn ghost" href={links.google} target="_blank" rel="noopener noreferrer">
            Google Kalender
          </a>
          <a className="btn ghost" href={links.outlook} target="_blank" rel="noopener noreferrer">
            Outlook
          </a>
        </div>
      ) : null}
    </>
  );
}

/** "etwa 120 km von Köln" – the radius centre lives on the device, so this is rendered on the client. */
export function Distance({ event: e }: { event: LarpEvent }) {
  const origin = useStore(positionStore);
  const km = eventKm(e, origin);
  return km === null ? null : <>{` · etwa ${Math.round(km)} km von ${originLabel(origin)}`}</>;
}
