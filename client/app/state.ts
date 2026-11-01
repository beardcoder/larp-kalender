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
}

export const emptyFilters: Filters = { q: "", genres: [], types: [], countries: [], openOnly: false, radiusKm: null, onlyNew: false };
export const filtersStore = persistentStore<Filters>("lk.filters", emptyFilters);

export const activeFilterCount = (f: Filters) =>
  f.genres.length + f.types.length + f.countries.length + (f.openOnly ? 1 : 0) + (f.radiusKm ? 1 : 0) + (f.onlyNew ? 1 : 0);

/* ---------- position (rounded, stays on the device) ---------- */

export const positionStore = persistentStore<{ lat: number; lng: number } | null>("lk.position", null);

export function requestPosition(): Promise<boolean> {
  return new Promise((resolve) => {
    if (!("geolocation" in navigator)) return resolve(false);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        positionStore.set({ lat: Math.round(p.coords.latitude * 100) / 100, lng: Math.round(p.coords.longitude * 100) / 100 });
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

export function applyFilters(events: LarpEvent[], f: Filters, position: { lat: number; lng: number } | null): LarpEvent[] {
  const terms = f.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  return events.filter((e) => {
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
}

export { applyTheme, themeStore, type Theme } from "../lib/theme.ts";
