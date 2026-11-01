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
