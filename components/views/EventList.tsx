"use client";

import Link from "next/link";
import { useMemo, useRef } from "react";
import { activeFilterCount, applyFilters, countWithoutLocation, emptyFilters, eventKm, favoritesStore, filtersStore, originLabel, positionStore, toggleIn } from "@/lib/client/state.ts";
import { useStore } from "@/lib/client/store.ts";
import type { LarpEvent } from "@/lib/shared/types.ts";
import { COUNTRIES, EVENT_TYPES, GENRES, type Genre } from "@/lib/shared/vocab.ts";
import { useAppData } from "../AppData.tsx";
import { EmptyState, EventCard } from "../event-bits.tsx";
import { Icon } from "../Icon.tsx";
import { RadiusChip, RadiusPicker } from "./Radius.tsx";

function groupByMonth(events: LarpEvent[]) {
  const groups = new Map<string, LarpEvent[]>();
  for (const e of events) groups.set(e.startDate.slice(0, 7), [...(groups.get(e.startDate.slice(0, 7)) ?? []), e]);
  return [...groups].map(([key, list]) => ({
    key,
    label: new Date(`${key}-15`).toLocaleDateString("de-DE", { month: "long", year: "numeric" }),
    events: list,
  }));
}

/** Cards for a list of events, with bookmark, "new" and distance markers. */
export function Cards({ events }: { events: LarpEvent[] }) {
  const { today, newSince } = useAppData();
  const favorites = useStore(favoritesStore);
  const origin = useStore(positionStore);
  return (
    <div className="cards">
      {events.map((e) => (
        <EventCard key={e.id} event={e} today={today} favorite={favorites.includes(e.id)} isNew={!!newSince && e.createdAt > newSince} km={eventKm(e, origin)} />
      ))}
    </div>
  );
}

export function EventList({ onlyNew }: { onlyNew: boolean }) {
  const { events, newSince } = useAppData();
  const stored = useStore(filtersStore);
  const origin = useStore(positionStore);
  const dialog = useRef<HTMLDialogElement>(null);
  // Link from a "new events" notification (/?neu=1).
  const filters = onlyNew ? { ...stored, onlyNew: true } : stored;

  const visible = useMemo(() => applyFilters(events, filters, origin, newSince), [events, filters, origin, newSince]);
  const byDistance = filters.sortByDistance && !!origin;
  const groups = byDistance ? [{ key: "distance", label: "Nach Entfernung", events: visible }] : groupByMonth(visible);
  const active = activeFilterCount(filters);
  const set = (patch: Partial<typeof filters>) => filtersStore.set((f) => ({ ...f, ...patch }));

  return (
    <section className="view view-list" aria-labelledby="list-heading">
      <header className="view-head">
        <h1 id="list-heading" className="view-title">
          Kommende Termine
        </h1>
        <div className="searchbar">
          <label className="search">
            <Icon name="search" size={18} />
            <span className="sr-only">Suchen</span>
            <input type="search" placeholder="Titel, Ort, Veranstalter …" value={filters.q} onChange={(e) => set({ q: e.target.value })} enterKeyHint="search" />
          </label>
          <button className={`icon-btn filter-btn${active ? " has-count" : ""}`} onClick={() => dialog.current?.showModal()} aria-label="Filter">
            <Icon name="filter" />
            {active ? <span className="count">{active}</span> : null}
          </button>
        </div>
        <div className="chips" role="group" aria-label="Schnellfilter">
          <button className={`chip chip-radius${filters.radiusKm && origin ? " is-on" : ""}`} onClick={() => dialog.current?.showModal()}>
            <Icon name="pin" size={16} />
            {filters.radiusKm && origin ? `${filters.radiusKm} km · ${originLabel(origin, "nom").split(",")[0]}` : "Umkreis"}
          </button>
          <button className={`chip chip-type${filters.types.includes("tavern") ? " is-on" : ""}`} aria-pressed={filters.types.includes("tavern")} onClick={() => set({ types: toggleIn(filters.types, "tavern") })}>
            <Icon name="mug" size={16} />
            LARP-Taverne
          </button>
          {(Object.keys(GENRES) as Genre[])
            .filter((g) => g !== "other")
            .map((g) => (
              <button key={g} className={`chip genre-${g}${filters.genres.includes(g) ? " is-on" : ""}`} aria-pressed={filters.genres.includes(g)} onClick={() => set({ genres: toggleIn(filters.genres, g) })}>
                {GENRES[g]}
              </button>
            ))}
        </div>
      </header>

      <div className="result-line">
        <span>
          {visible.length} {visible.length === 1 ? "Termin" : "Termine"}
        </span>
        {active || filters.q ? (
          <button className="link-btn" onClick={() => filtersStore.set(emptyFilters)}>
            Filter zurücksetzen
          </button>
        ) : null}
      </div>

      <RadiusChip hiddenWithoutLocation={countWithoutLocation(events, filters, origin)} />

      {!visible.length ? (
        events.length ? (
          <EmptyState title="Nichts gefunden">
            <p>Keine Veranstaltung passt zu deinen Filtern.</p>
            <button className="btn" onClick={() => filtersStore.set(emptyFilters)}>
              Filter zurücksetzen
            </button>
          </EmptyState>
        ) : (
          <EmptyState title="Noch keine Termine">
            <p>Kennst du eine Veranstaltung, die hier fehlt?</p>
            <Link className="btn" href="/vorschlagen">
              Veranstaltung vorschlagen
            </Link>
          </EmptyState>
        )
      ) : null}

      <div className="months">
        {groups.map((g) => (
          <section className="month" key={g.key} aria-label={g.label}>
            {byDistance ? null : <h2 className="month-head">{g.label}</h2>}
            <Cards events={g.events} />
          </section>
        ))}
      </div>

      <dialog className="sheet" ref={dialog} aria-labelledby="filter-heading" onClick={(e) => e.target === dialog.current && dialog.current.close()}>
        <header className="sheet-head">
          <h2 id="filter-heading">Filter</h2>
          <button className="icon-btn" onClick={() => dialog.current?.close()} aria-label="Schließen">
            <Icon name="close" />
          </button>
        </header>
        <div className="sheet-body">
          <RadiusPicker />
          <fieldset>
            <legend>Anmeldung</legend>
            <label className="switch">
              <input type="checkbox" checked={filters.openOnly} onChange={(e) => set({ openOnly: e.target.checked })} />
              <span>Nur mit offener Anmeldung oder Warteliste</span>
            </label>
            <label className="switch">
              <input type="checkbox" checked={stored.onlyNew} onChange={(e) => set({ onlyNew: e.target.checked })} />
              <span>Nur neu eingetragene</span>
            </label>
          </fieldset>
          <fieldset>
            <legend>Art der Veranstaltung</legend>
            <div className="chips wrap">
              {Object.entries(EVENT_TYPES).map(([k, label]) => (
                <button key={k} className={`chip${filters.types.includes(k) ? " is-on" : ""}`} aria-pressed={filters.types.includes(k)} onClick={() => set({ types: toggleIn(filters.types, k) })}>
                  {label}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend>Land</legend>
            <div className="chips wrap">
              {Object.entries(COUNTRIES)
                .slice(0, 7)
                .map(([k, label]) => (
                  <button key={k} className={`chip${filters.countries.includes(k) ? " is-on" : ""}`} aria-pressed={filters.countries.includes(k)} onClick={() => set({ countries: toggleIn(filters.countries, k) })}>
                    {label}
                  </button>
                ))}
            </div>
          </fieldset>
          <div className="sheet-actions">
            <button className="btn ghost" onClick={() => filtersStore.set({ ...emptyFilters, q: filters.q })}>
              Zurücksetzen
            </button>
            <button className="btn primary" onClick={() => dialog.current?.close()}>
              {visible.length} {visible.length === 1 ? "Termin" : "Termine"} anzeigen
            </button>
          </div>
        </div>
      </dialog>
    </section>
  );
}
