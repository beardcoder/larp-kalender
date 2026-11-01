/** Client state: events, bookmarks, filters, position, push preferences. */

import type { LarpEvent } from "../../src/shared/types.ts";
import type { Genre } from "../../src/shared/vocab.ts";
import { createStore, load, persistentStore, save } from "../lib/store.ts";

export interface EventsState {
  events: LarpEvent[];
  today: string;
  loading: boolean;
  error: string | null;
  offline: boolean;
}

export const eventsStore = createStore<EventsState>({
  events: load<LarpEvent[]>("lk.events", []),
  today: new Date().toLocaleDateString("sv-SE"),
  loading: true,
  error: null,
  offline: false,
});

export async function loadEvents(): Promise<void> {
  eventsStore.set((s) => ({ ...s, loading: true }));
  try {
    const res = await fetch("/api/events", { headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { events: LarpEvent[]; today: string };
    eventsStore.set({ events: data.events, today: data.today, loading: false, error: null, offline: false });
    // Small offline copy for the next cold start.
    save("lk.events", data.events);
  } catch {
    eventsStore.set((s) => ({
      ...s,
      loading: false,
      offline: !navigator.onLine,
      error: s.events.length ? null : "Die Termine konnten nicht geladen werden. Prüfe deine Verbindung und versuche es erneut.",
    }));
  }
}

/* ---------- bookmarks ---------- */

export const favoritesStore = persistentStore<number[]>("lk.favorites", []);

export function toggleFavorite(id: number): boolean {
  const has = favoritesStore.get().includes(id);
  favoritesStore.set((f) => (has ? f.filter((x) => x !== id) : [...f, id]));
  return !has;
}

/* ---------- filters ---------- */

export interface Filters {
  q: string;
  genres: Genre[];
  types: string[];
  countries: string[];
  openOnly: boolean;
  radiusKm: number | null;
  onlyNew: boolean;
  /** Sort by distance to the chosen centre instead of by date. */
  sortByDistance?: boolean;
}

export const emptyFilters: Filters = {
  q: "",
  genres: [],
  types: [],
  countries: [],
  openOnly: false,
  radiusKm: null,
  onlyNew: false,
  sortByDistance: false,
};
export const filtersStore = persistentStore<Filters>("lk.filters", emptyFilters);

export const activeFilterCount = (f: Filters) =>
  f.genres.length + f.types.length + f.countries.length + (f.openOnly ? 1 : 0) + (f.radiusKm ? 1 : 0) + (f.onlyNew ? 1 : 0);

/* ---------- radius centre: device position or a chosen place (rounded, stays on the device) ---------- */

export interface Origin {
  lat: number;
  lng: number;
  /** "Mein Standort" or the chosen place, e.g. "50667, Köln, Nordrhein-Westfalen". */
  label?: string;
  source?: "device" | "place";
}

export const positionStore = persistentStore<Origin | null>("lk.position", null);

/** Label for the radius centre; the device position is phrased in the grammatical case of the sentence. */
export function originLabel(o: Origin | null, kasus: "nom" | "acc" | "dat" = "dat"): string {
  if (o?.source === "place" && o.label) return o.label.split(", ").slice(0, 2).join(", ");
  return { nom: "Mein Standort", acc: "deinen Standort", dat: "deinem Standort" }[kasus];
}

export function setPlace(place: { label: string; lat: number; lng: number }): void {
  positionStore.set({ lat: place.lat, lng: place.lng, label: place.label, source: "place" });
}

export async function searchPlaces(q: string): Promise<{ label: string; lat: number; lng: number }[]> {
  const res = await fetch(`/api/places?q=${encodeURIComponent(q)}`);
  const body = (await res.json()) as { places?: { label: string; lat: number; lng: number }[]; error?: string };
  if (!res.ok) throw new Error(body.error ?? "Ortssuche fehlgeschlagen.");
  return body.places ?? [];
}

export function requestPosition(): Promise<boolean> {
  return new Promise((resolve) => {
    if (!("geolocation" in navigator)) return resolve(false);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        positionStore.set({
          lat: Math.round(p.coords.latitude * 100) / 100,
          lng: Math.round(p.coords.longitude * 100) / 100,
          label: "Mein Standort",
          source: "device",
        });
        resolve(true);
      },
      () => resolve(false),
      { maximumAge: 3600_000, timeout: 10_000 },
    );
  });
}

export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

/* ---------- "new since last visit" ---------- */

const previousVisit = load<string | null>("lk.lastVisit", null);
/** Events created after this moment are marked as new. First visit: nothing is new. */
export const newSince: string = previousVisit ?? new Date().toISOString();
/** Called by the public app only (not the admin backend). */
export function markVisited(): void {
  setTimeout(() => save("lk.lastVisit", new Date().toISOString()), 10_000);
}

export const isNew = (e: LarpEvent) => e.createdAt > newSince;

/* ---------- filtering ---------- */

export function applyFilters(events: LarpEvent[], f: Filters, position: Origin | null): LarpEvent[] {
  const terms = f.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const result = events.filter((e) => {
    if (f.genres.length && !e.genres.some((g) => f.genres.includes(g))) return false;
    if (f.types.length && !f.types.includes(e.eventType)) return false;
    if (f.countries.length && !f.countries.includes(e.country)) return false;
    if (f.openOnly && !["open", "waitlist"].includes(e.registrationStatus)) return false;
    if (f.onlyNew && !(isNew(e) || e.createdAt > weekAgo)) return false;
    if (f.radiusKm && position) {
      if (e.lat == null || e.lng == null) return false;
      if (distanceKm(position, { lat: e.lat, lng: e.lng }) > f.radiusKm) return false;
    }
    if (terms.length) {
      const hay = [e.title, e.summary, e.organizer, e.city, e.venue, e.region, e.postalCode, ...e.tags].join(" ").toLowerCase();
      if (!terms.every((t) => hay.includes(t))) return false;
    }
    return true;
  });
  if (f.sortByDistance && position) {
    const d = (e: LarpEvent) => (e.lat == null || e.lng == null ? Infinity : distanceKm(position, { lat: e.lat, lng: e.lng }));
    return result.map((e) => [e, d(e)] as const).sort((a, b) => a[1] - b[1] || a[0].startDate.localeCompare(b[0].startDate)).map(([e]) => e);
  }
  return result;
}

/** Events hidden by the radius filter only because their location has no coordinates yet. */
export function countWithoutLocation(events: LarpEvent[], f: Filters, position: Origin | null): number {
  if (!f.radiusKm || !position) return 0;
  return applyFilters(events, { ...f, radiusKm: null, sortByDistance: false }, null).filter((e) => e.lat == null || e.lng == null).length;
}

export { applyTheme, themeStore, type Theme } from "../lib/theme.ts";
