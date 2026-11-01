/** Background geocoding of event addresses via OpenStreetMap Nominatim (max. 1 request per second). */

import type { Database } from "bun:sqlite";
import { listAdminEvents, today } from "./repo/events.ts";

export class Geocoder {
  private failed = new Set<string>();
  private running = false;
  private timer: Timer | null = null;

  constructor(
    private db: Database,
    private contact: string,
  ) {}

  private async lookup(params: Record<string, string>): Promise<{ lat: number; lng: number } | null> {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    for (const [k, v] of Object.entries(params)) if (v) url.searchParams.set(k, v);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("limit", "1");
    const res = await fetch(url, {
      headers: { "user-agent": `larp-kalender/1.0 (${this.contact})`, "accept-language": "de" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Nominatim ${res.status}`);
    const hits = (await res.json()) as { lat: string; lon: string }[];
    return hits[0] ? { lat: Number(hits[0].lat), lng: Number(hits[0].lon) } : null;
  }

  async run(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const pending = listAdminEvents(this.db, { from: today(), limit: 5000 }).filter(
        (e) => e.lat === null && (e.city || e.postalCode) && !this.failed.has(`${e.id}:${e.updatedAt}`),
      );
      for (const e of pending.slice(0, 30)) {
        const country = e.country.toLowerCase();
        let hit = await this.lookup({ street: e.street ?? "", postalcode: e.postalCode ?? "", city: e.city ?? "", countrycodes: country });
        if (!hit && e.street) {
          await Bun.sleep(1100);
          hit = await this.lookup({ postalcode: e.postalCode ?? "", city: e.city ?? "", countrycodes: country });
        }
        if (hit) {
          // Direct update without touching updated_at: coordinates are derived data.
          this.db.query("UPDATE events SET lat = ?, lng = ? WHERE id = ? AND lat IS NULL").run(hit.lat, hit.lng, e.id);
        } else {
          this.failed.add(`${e.id}:${e.updatedAt}`);
        }
        await Bun.sleep(1100);
      }
    } catch (err) {
      console.warn("[geocode]", (err as Error).message);
    } finally {
      this.running = false;
    }
  }

  /** Triggers a run soon (debounced), e.g. after events were saved. */
  nudge(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.run(), 5_000);
  }

  start(): void {
    setInterval(() => void this.run(), 30 * 60_000);
    this.nudge();
  }
}

export interface Place {
  label: string;
  lat: number;
  lng: number;
}

/**
 * Place search for the radius filter ("PLZ oder Ort"). Proxies Nominatim so that visitors' IPs are not sent
 * to a third party, caches results in memory and serializes requests to respect the 1 request/second policy.
 */
export class PlaceSearch {
  private cache = new Map<string, Place[]>();
  private queue: Promise<unknown> = Promise.resolve();
  private last = 0;

  constructor(private contact: string) {}

  async search(query: string): Promise<Place[]> {
    const q = query.trim().replace(/\s+/g, " ").slice(0, 100);
    const key = q.toLowerCase();
    if (q.length < 2) return [];
    const hit = this.cache.get(key);
    if (hit) return hit;

    const task = this.queue.then(async () => {
      const wait = this.last + 1100 - Date.now();
      if (wait > 0) await Bun.sleep(wait);
      this.last = Date.now();
      const url = new URL("https://nominatim.openstreetmap.org/search");
      // Pure postcodes need the structured parameter; plain names are limited to towns and villages.
      if (/^\d{4,5}$/.test(q)) url.searchParams.set("postalcode", q);
      else url.searchParams.set("q", q);
      if (!/\d/.test(q)) url.searchParams.set("featureType", "settlement");
      url.searchParams.set("format", "jsonv2");
      url.searchParams.set("addressdetails", "1");
      url.searchParams.set("limit", "6");
      url.searchParams.set("countrycodes", "de,at,ch,nl,be,lu,dk,pl,cz,fr");
      const res = await fetch(url, {
        headers: { "user-agent": `larp-kalender/1.0 (${this.contact})`, "accept-language": "de" },
        signal: AbortSignal.timeout(8_000),
      });
      if (!res.ok) throw new Error(`Nominatim ${res.status}`);
      return (await res.json()) as {
        lat: string;
        lon: string;
        name: string;
        address?: Record<string, string>;
      }[];
    });
    this.queue = task.catch(() => undefined);

    const raw = await task;
    const seen = new Set<string>();
    const places: Place[] = [];
    for (const r of raw) {
      const a = r.address ?? {};
      const city = a.city ?? a.town ?? a.village ?? a.municipality ?? r.name;
      const label = [a.postcode && /^\d/.test(q) ? a.postcode : "", city, a.state ?? a.country].filter(Boolean).join(", ");
      if (!label || seen.has(label)) continue;
      seen.add(label);
      places.push({ label, lat: Math.round(Number(r.lat) * 1000) / 1000, lng: Math.round(Number(r.lon) * 1000) / 1000 });
    }
    if (this.cache.size > 1000) this.cache.delete(this.cache.keys().next().value!);
    this.cache.set(key, places);
    return places;
  }
}
