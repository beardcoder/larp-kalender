import { useEffect, useRef, useState } from "preact/hooks";
import { useStore } from "../../lib/store.ts";
import { Icon } from "../components.tsx";
import { filtersStore, originLabel, positionStore, requestPosition, searchPlaces, setPlace } from "../state.ts";
import { toast } from "../toast.tsx";

const RADII = [25, 50, 100, 200, 400];

type Place = { label: string; lat: number; lng: number };

/** Radius filter: centre from postcode/town search or device location, radius and distance sorting. */
export function RadiusPicker() {
  const filters = useStore(filtersStore);
  const origin = useStore(positionStore);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Place[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced search: the server forwards to OpenStreetMap at most once per second.
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setError(null);
      return;
    }
    timer.current = setTimeout(async () => {
      setBusy(true);
      try {
        const places = await searchPlaces(q);
        setResults(places);
        setError(places.length ? null : "Kein Ort gefunden. Versuche eine Postleitzahl oder einen anderen Namen.");
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy(false);
      }
    }, 450);
  }, [query]);

  const choose = (p: Place) => {
    setPlace(p);
    setQuery("");
    setResults([]);
    filtersStore.set((f) => ({ ...f, radiusKm: f.radiusKm ?? 100 }));
  };

  const useDevice = async () => {
    setBusy(true);
    const ok = await requestPosition();
    setBusy(false);
    if (!ok) return toast("Standort nicht verfügbar. Erlaube den Zugriff im Browser oder gib einen Ort ein.");
    filtersStore.set((f) => ({ ...f, radiusKm: f.radiusKm ?? 100 }));
    toast("Standort übernommen");
  };

  return (
    <fieldset class="radius">
      <legend>Umkreis</legend>

      <div class="radius-origin">
        <label class="search small">
          <Icon name="pin" size={18} />
          <span class="sr-only">Postleitzahl oder Ort</span>
          <input
            type="search"
            placeholder={origin ? `Mittelpunkt: ${originLabel(origin, "nom")}` : "PLZ oder Ort, z. B. 50667 oder Kassel"}
            value={query}
            onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && results[0]) {
                e.preventDefault();
                choose(results[0]);
              }
            }}
            autocomplete="postal-code"
            enterKeyHint="search"
            aria-autocomplete="list"
            aria-controls="place-results"
          />
        </label>
        <button class="icon-btn" onClick={() => void useDevice()} aria-label="Meinen Standort verwenden" title="Meinen Standort verwenden" disabled={busy}>
          <Icon name="locate" />
        </button>
      </div>

      {results.length ? (
        <ul class="place-results" id="place-results" role="listbox" aria-label="Gefundene Orte">
          {results.map((p) => (
            <li key={p.label}>
              <button role="option" aria-selected="false" onClick={() => choose(p)}>
                <Icon name="pin" size={16} />
                {p.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {busy && query.trim().length >= 2 ? <p class="hint">Suche …</p> : null}
      {error ? <p class="hint">{error}</p> : null}

      <div class="chips wrap" role="group" aria-label="Radius">
        <button class={`chip${!filters.radiusKm ? " is-on" : ""}`} aria-pressed={!filters.radiusKm} onClick={() => filtersStore.set((f) => ({ ...f, radiusKm: null }))}>
          Überall
        </button>
        {RADII.map((km) => (
          <button
            key={km}
            class={`chip${filters.radiusKm === km ? " is-on" : ""}`}
            aria-pressed={filters.radiusKm === km}
            disabled={!origin}
            onClick={() => filtersStore.set((f) => ({ ...f, radiusKm: km }))}
          >
            {km} km
          </button>
        ))}
      </div>

      {origin ? (
        <label class="switch">
          <input
            type="checkbox"
            checked={!!filters.sortByDistance}
            onChange={(e) => filtersStore.set((f) => ({ ...f, sortByDistance: (e.target as HTMLInputElement).checked }))}
          />
          <span>Nach Entfernung sortieren</span>
        </label>
      ) : null}

      <p class="hint">
        {origin
          ? `Entfernungen werden ab ${originLabel(origin)} berechnet (Luftlinie). Der Mittelpunkt bleibt auf diesem Gerät.`
          : "Gib eine Postleitzahl oder einen Ort ein oder nutze deinen Standort."}
        {origin ? (
          <>
            {" "}
            <button
              class="link-btn"
              onClick={() => {
                positionStore.set(null);
                filtersStore.set((f) => ({ ...f, radiusKm: null, sortByDistance: false }));
              }}
            >
              Mittelpunkt entfernen
            </button>
          </>
        ) : null}
      </p>
    </fieldset>
  );
}

/** Compact indicator above the list while a radius is active. */
export function RadiusChip({ hiddenWithoutLocation }: { hiddenWithoutLocation: number }) {
  const filters = useStore(filtersStore);
  const origin = useStore(positionStore);
  if (!origin || (!filters.radiusKm && !filters.sortByDistance)) return null;
  return (
    <div class="radius-chip">
      <span>
        <Icon name="pin" size={16} />
        {filters.radiusKm ? `Bis ${filters.radiusKm} km um ${originLabel(origin, "acc")}` : `Sortiert nach Entfernung zu ${originLabel(origin)}`}
      </span>
      <button
        class="icon-btn small"
        aria-label="Umkreis aufheben"
        onClick={() => filtersStore.set((f) => ({ ...f, radiusKm: null, sortByDistance: false }))}
      >
        <Icon name="close" size={16} />
      </button>
      {hiddenWithoutLocation ? (
        <small>
          {hiddenWithoutLocation} {hiddenWithoutLocation === 1 ? "Termin ohne genauen Ort ist" : "Termine ohne genauen Ort sind"} ausgeblendet.
        </small>
      ) : null}
    </div>
  );
}
