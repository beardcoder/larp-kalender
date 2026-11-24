"use client";

import { useEffect, useState } from "react";
import { filtersStore, originLabel, positionStore, requestPosition } from "@/lib/client/state.ts";
import { useStore } from "@/lib/client/store.ts";
import { Icon } from "../Icon.tsx";
import { toast } from "../Toasts.tsx";

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

  // Debounced: the server forwards to OpenStreetMap at most once per second.
  useEffect(() => {
    const q = query.trim();
    setError(null);
    if (q.length < 2) return setResults([]);
    const t = setTimeout(async () => {
      setBusy(true);
      try {
        const res = await fetch(`/api/places?q=${encodeURIComponent(q)}`);
        const body = (await res.json()) as { places?: Place[]; error?: string };
        if (!res.ok) throw new Error(body.error ?? "Ortssuche fehlgeschlagen.");
        setResults(body.places ?? []);
        if (!body.places?.length) setError("Kein Ort gefunden. Versuche eine Postleitzahl oder einen anderen Namen.");
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy(false);
      }
    }, 450);
    return () => clearTimeout(t);
  }, [query]);

  const withRadius = () => filtersStore.set((f) => ({ ...f, radiusKm: f.radiusKm ?? 100 }));

  const choose = (p: Place) => {
    positionStore.set({ ...p, source: "place" });
    setQuery("");
    setResults([]);
    withRadius();
  };

  const useDevice = async () => {
    setBusy(true);
    const ok = await requestPosition();
    setBusy(false);
    if (!ok) return toast("Standort nicht verfügbar. Erlaube den Zugriff im Browser oder gib einen Ort ein.");
    withRadius();
    toast("Standort übernommen");
  };

  return (
    <fieldset className="radius">
      <legend>Umkreis</legend>
      <div className="radius-origin">
        <label className="search small">
          <Icon name="pin" size={18} />
          <span className="sr-only">Postleitzahl oder Ort</span>
          <input
            type="search"
            placeholder={origin ? `Mittelpunkt: ${originLabel(origin, "nom")}` : "PLZ oder Ort, z. B. 50667 oder Kassel"}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && results[0]) {
                e.preventDefault();
                choose(results[0]);
              }
            }}
            autoComplete="postal-code"
            enterKeyHint="search"
          />
        </label>
        <button type="button" className="icon-btn" onClick={() => void useDevice()} aria-label="Meinen Standort verwenden" disabled={busy}>
          <Icon name="locate" />
        </button>
      </div>

      {results.length ? (
        <ul className="place-results" aria-label="Gefundene Orte">
          {results.map((p) => (
            <li key={p.label}>
              <button type="button" onClick={() => choose(p)}>
                <Icon name="pin" size={16} />
                {p.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {busy && query.trim().length >= 2 ? <p className="hint">Suche …</p> : null}
      {error ? <p className="hint">{error}</p> : null}

      <div className="chips wrap" role="group" aria-label="Radius">
        <button type="button" className={`chip${!filters.radiusKm ? " is-on" : ""}`} aria-pressed={!filters.radiusKm} onClick={() => filtersStore.set((f) => ({ ...f, radiusKm: null }))}>
          Überall
        </button>
        {RADII.map((km) => (
          <button
            type="button"
            key={km}
            className={`chip${filters.radiusKm === km ? " is-on" : ""}`}
            aria-pressed={filters.radiusKm === km}
            disabled={!origin}
            onClick={() => filtersStore.set((f) => ({ ...f, radiusKm: km }))}
          >
            {km} km
          </button>
        ))}
      </div>

      {origin ? (
        <label className="switch">
          <input type="checkbox" checked={filters.sortByDistance} onChange={(e) => filtersStore.set((f) => ({ ...f, sortByDistance: e.target.checked }))} />
          <span>Nach Entfernung sortieren</span>
        </label>
      ) : null}

      <p className="hint">
        {origin
          ? `Entfernungen werden ab ${originLabel(origin)} berechnet (Luftlinie). Der Mittelpunkt bleibt auf diesem Gerät. `
          : "Gib eine Postleitzahl oder einen Ort ein oder nutze deinen Standort."}
        {origin ? (
          <button
            type="button"
            className="link-btn"
            onClick={() => {
              positionStore.set(null);
              filtersStore.set((f) => ({ ...f, radiusKm: null, sortByDistance: false }));
            }}
          >
            Mittelpunkt entfernen
          </button>
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
    <div className="radius-chip">
      <span>
        <Icon name="pin" size={16} />
        {filters.radiusKm ? `Bis ${filters.radiusKm} km um ${originLabel(origin, "acc")}` : `Sortiert nach Entfernung zu ${originLabel(origin)}`}
      </span>
      <button className="icon-btn small" aria-label="Umkreis aufheben" onClick={() => filtersStore.set((f) => ({ ...f, radiusKm: null, sortByDistance: false }))}>
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
