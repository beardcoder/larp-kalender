"use client";

/** Device-local state: bookmarks, filters, radius centre, theme, "new since last visit". */

import type { LarpEvent } from "../shared/types.ts";
import type { Genre } from "../shared/vocab.ts";
import { persistentStore } from "./store.ts";

export const favoritesStore = persistentStore<number[]>("lk.favorites", []);

export function toggleFavorite(id: number): boolean {
  const has = favoritesStore.get().includes(id);
  favoritesStore.set((f) => (has ? f.filter((x) => x !== id) : [...f, id]));
  return !has;
}

export interface Filters {
  q: string;
  genres: Genre[];
  types: string[];
  countries: string[];
  openOnly: boolean;
  radiusKm: number | null;
  onlyNew: boolean;
  sortByDistance: boolean;
}

export const emptyFilters: Filters = { q: "", genres: [], types: [], countries: [], openOnly: false, radiusKm: null, onlyNew: false, sortByDistance: false };
export const filtersStore = persistentStore<Filters>("lk.filters", emptyFilters);

export const activeFilterCount = (f: Filters) =>
  f.genres.length + f.types.length + f.countries.length + (f.openOnly ? 1 : 0) + (f.radiusKm ? 1 : 0) + (f.onlyNew ? 1 : 0);

export const toggleIn = <T,>(list: T[], value: T) => (list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);

/* ---------- radius centre: device position or a chosen place (rounded, stays on the device) ---------- */

export interface Origin {
  lat: number;
  lng: number;
  label?: string;
  source?: "device" | "place";
}

export const positionStore = persistentStore<Origin | null>("lk.position", null);

/** Label for the radius centre; the device position is phrased in the grammatical case of the sentence. */
export function originLabel(o: Origin | null, kasus: "nom" | "acc" | "dat" = "dat"): string {
  if (o?.source === "place" && o.label) return o.label.split(", ").slice(0, 2).join(", ");
  return { nom: "Mein Standort", acc: "deinen Standort", dat: "deinem Standort" }[kasus];
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

export const eventKm = (e: LarpEvent, o: Origin | null) => (o && e.lat != null && e.lng != null ? distanceKm(o, { lat: e.lat, lng: e.lng }) : null);

/* ---------- "new since last visit" ---------- */

/** Timestamp of the previous visit; events created after it are marked "Neu". Written once per page load. */
export const lastVisitStore = persistentStore<string | null>("lk.lastVisit", null);

/* ---------- appearance ---------- */

export type Theme = "auto" | "dark" | "light";
export const themeStore = persistentStore<Theme>("lk.theme", "auto");

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === "auto") delete root.dataset.theme;
  else root.dataset.theme = theme;
  const dark = theme === "dark" || (theme === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#15110e" : "#f5efe6");
}

/* ---------- filtering ---------- */

export function applyFilters(events: LarpEvent[], f: Filters, origin: Origin | null, newSince: string | null): LarpEvent[] {
  const terms = f.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const result = events.filter((e) => {
    if (f.genres.length && !e.genres.some((g) => f.genres.includes(g))) return false;
    if (f.types.length && !f.types.includes(e.eventType)) return false;
    if (f.countries.length && !f.countries.includes(e.country)) return false;
    if (f.openOnly && !["open", "waitlist"].includes(e.registrationStatus)) return false;
    if (f.onlyNew && !(e.createdAt > (newSince ?? weekAgo) || e.createdAt > weekAgo)) return false;
    if (f.radiusKm && origin) {
      const km = eventKm(e, origin);
      if (km === null || km > f.radiusKm) return false;
    }
    if (terms.length) {
      const hay = [e.title, e.summary, e.organizer, e.city, e.venue, e.region, e.postalCode, ...e.tags].join(" ").toLowerCase();
      if (!terms.every((t) => hay.includes(t))) return false;
    }
    return true;
  });
  if (f.sortByDistance && origin) {
    const d = (e: LarpEvent) => eventKm(e, origin) ?? Infinity;
    return result.map((e) => [e, d(e)] as const).sort((a, b) => a[1] - b[1] || a[0].startDate.localeCompare(b[0].startDate)).map(([e]) => e);
  }
  return result;
}

/** Events hidden by the radius filter only because they have no coordinates yet. */
export function countWithoutLocation(events: LarpEvent[], f: Filters, origin: Origin | null): number {
  if (!f.radiusKm || !origin) return 0;
  return applyFilters(events, { ...f, radiusKm: null, sortByDistance: false }, null, null).filter((e) => e.lat == null || e.lng == null).length;
}
