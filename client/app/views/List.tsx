import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { COUNTRIES, EVENT_TYPES, GENRES, type Genre } from "../../../src/shared/vocab.ts";
import { useStore } from "../../lib/store.ts";
import { stampSeals } from "../../lib/motion.ts";
import { useLocation } from "../../lib/router.ts";
import { EmptyState, EventCard, groupByMonth, Icon } from "../components.tsx";
import {
  activeFilterCount,
  applyFilters,
  emptyFilters,
  eventsStore,
  favoritesStore,
  filtersStore,
  loadEvents,
  positionStore,
  requestPosition,
  type Filters,
} from "../state.ts";
import { Sheet } from "./Sheet.tsx";
import { toast } from "../toast.tsx";

let stamped = false;

export function ListView() {
  const { events, today, loading, error } = useStore(eventsStore);
  const filters = useStore(filtersStore);
  const favorites = useStore(favoritesStore);
  const position = useStore(positionStore);
  const loc = useLocation();
  const [sheetOpen, setSheetOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  // Link from a "new events" notification.
  useEffect(() => {
    if (loc.query.get("neu") === "1") filtersStore.set((f) => ({ ...f, onlyNew: true }));
  }, [loc.query]);

  const visible = useMemo(() => applyFilters(events, filters, position), [events, filters, position]);
  const groups = useMemo(() => groupByMonth(visible), [visible]);
  const active = activeFilterCount(filters);

  useEffect(() => {
    if (!stamped && listRef.current && visible.length) {
      stamped = true;
      stampSeals(listRef.current);
    }
  }, [visible.length]);

  const toggleGenre = (g: Genre) =>
    filtersStore.set((f) => ({ ...f, genres: f.genres.includes(g) ? f.genres.filter((x) => x !== g) : [...f.genres, g] }));

  return (
    <section class="view view-list" aria-labelledby="list-heading">
      <header class="view-head">
        <h1 id="list-heading" class="view-title">Kommende Termine</h1>
        <div class="searchbar">
          <label class="search">
            <Icon name="search" size={18} />
            <span class="sr-only">Suchen</span>
            <input
              type="search"
              placeholder="Titel, Ort, Veranstalter …"
              value={filters.q}
              onInput={(e) => filtersStore.set((f) => ({ ...f, q: (e.target as HTMLInputElement).value }))}
              enterKeyHint="search"
            />
          </label>
          <button class={`icon-btn filter-btn${active ? " has-count" : ""}`} onClick={() => setSheetOpen(true)} aria-label="Filter">
            <Icon name="filter" />
            {active ? <span class="count">{active}</span> : null}
          </button>
        </div>
        <div class="chips" role="group" aria-label="Genres">
          {(Object.keys(GENRES) as Genre[])
            .filter((g) => g !== "other")
            .map((g) => (
              <button
                key={g}
                class={`chip genre-${g}${filters.genres.includes(g) ? " is-on" : ""}`}
                aria-pressed={filters.genres.includes(g)}
                onClick={() => toggleGenre(g)}
              >
                {GENRES[g]}
              </button>
            ))}
        </div>
      </header>

      <div class="result-line">
        <span>
          {loading && !events.length ? "Lade Termine …" : `${visible.length} ${visible.length === 1 ? "Termin" : "Termine"}`}
        </span>
        {active || filters.q ? (
          <button class="link-btn" onClick={() => filtersStore.set(emptyFilters)}>
            Filter zurücksetzen
          </button>
        ) : null}
      </div>

      {error ? (
        <EmptyState title="Keine Verbindung">
          <p>{error}</p>
          <button class="btn" onClick={() => void loadEvents()}>
            Erneut laden
          </button>
        </EmptyState>
      ) : null}

      {!error && !loading && !visible.length ? (
        events.length ? (
          <EmptyState title="Nichts gefunden">
            <p>Keine Veranstaltung passt zu deinen Filtern.</p>
            <button class="btn" onClick={() => filtersStore.set(emptyFilters)}>
              Filter zurücksetzen
            </button>
          </EmptyState>
        ) : (
          <EmptyState title="Noch keine Termine">
            <p>Kennst du eine Veranstaltung, die hier fehlt?</p>
            <a class="btn" href="/vorschlagen">
              Veranstaltung vorschlagen
            </a>
          </EmptyState>
        )
      ) : null}

      <div class="months" ref={listRef}>
        {groups.map((g) => (
          <section class="month" key={g.key} aria-label={g.label}>
            <h2 class="month-head">{g.label}</h2>
            <div class="cards">
              {g.events.map((e) => (
                <EventCard key={e.id} event={e} today={today} favorite={favorites.includes(e.id)} position={position} />
              ))}
            </div>
          </section>
        ))}
      </div>

      {sheetOpen ? <FilterSheet filters={filters} onClose={() => setSheetOpen(false)} count={visible.length} /> : null}
    </section>
  );
}

function FilterSheet({ filters, onClose, count }: { filters: Filters; onClose: () => void; count: number }) {
  const position = useStore(positionStore);
  const set = (patch: Partial<Filters>) => filtersStore.set((f) => ({ ...f, ...patch }));
  const toggle = (key: "types" | "countries", value: string) =>
    filtersStore.set((f) => ({ ...f, [key]: f[key].includes(value) ? f[key].filter((x) => x !== value) : [...f[key], value] }));

  const pickRadius = async (km: number | null) => {
    if (km && !position) {
      const ok = await requestPosition();
      if (!ok) {
        toast("Standort nicht verfügbar. Erlaube den Zugriff im Browser.");
        return;
      }
    }
    set({ radiusKm: km });
  };

  return (
    <Sheet title="Filter" onClose={onClose}>
      {(close) => (
        <div class="filter-sheet">
          <fieldset>
            <legend>Anmeldung</legend>
            <label class="switch">
              <input type="checkbox" checked={filters.openOnly} onChange={(e) => set({ openOnly: (e.target as HTMLInputElement).checked })} />
              <span>Nur mit offener Anmeldung oder Warteliste</span>
            </label>
            <label class="switch">
              <input type="checkbox" checked={filters.onlyNew} onChange={(e) => set({ onlyNew: (e.target as HTMLInputElement).checked })} />
              <span>Nur neu eingetragene</span>
            </label>
          </fieldset>
          <fieldset>
            <legend>Art der Veranstaltung</legend>
            <div class="chips wrap">
              {Object.entries(EVENT_TYPES).map(([k, label]) => (
                <button key={k} class={`chip${filters.types.includes(k) ? " is-on" : ""}`} aria-pressed={filters.types.includes(k)} onClick={() => toggle("types", k)}>
                  {label}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend>Umkreis</legend>
            <div class="chips wrap">
              {[null, 50, 100, 200, 400].map((km) => (
                <button key={String(km)} class={`chip${filters.radiusKm === km ? " is-on" : ""}`} aria-pressed={filters.radiusKm === km} onClick={() => void pickRadius(km)}>
                  {km ? `${km} km` : "Überall"}
                </button>
              ))}
            </div>
            <p class="hint">
              {position ? "Dein ungefährer Standort bleibt auf diesem Gerät." : "Für den Umkreis wird einmalig dein Standort abgefragt."}
              {position ? (
                <button class="link-btn" onClick={() => void requestPosition().then((ok) => toast(ok ? "Standort aktualisiert" : "Standort nicht verfügbar"))}>
                  Standort aktualisieren
                </button>
              ) : null}
            </p>
          </fieldset>
          <fieldset>
            <legend>Land</legend>
            <div class="chips wrap">
              {Object.entries(COUNTRIES)
                .slice(0, 7)
                .map(([k, label]) => (
                  <button key={k} class={`chip${filters.countries.includes(k) ? " is-on" : ""}`} aria-pressed={filters.countries.includes(k)} onClick={() => toggle("countries", k)}>
                    {label}
                  </button>
                ))}
            </div>
          </fieldset>
          <div class="sheet-actions">
            <button class="btn ghost" onClick={() => filtersStore.set({ ...emptyFilters, q: filters.q })}>
              Zurücksetzen
            </button>
            <button class="btn primary" onClick={close}>
              {count} {count === 1 ? "Termin" : "Termine"} anzeigen
            </button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
