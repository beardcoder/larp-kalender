/** Application services shared by pages, server actions, route handlers and the MCP server. */

import type { Database } from "bun:sqlite";
import { loadConfig, type Config } from "./config.ts";
import { openDb } from "./db.ts";
import { configureOAuth } from "./oauth.ts";
import { cleanupExpired, countUsers, createUser } from "./users.ts";
import { Geocoder } from "./geocode.ts";
import { Live } from "./live.ts";
import { Push } from "./push.ts";
import {
  createEvent,
  deleteEvent,
  findDuplicates,
  getEvent,
  updateEvent,
  type DuplicateCandidate,
  type EventCreateInput,
  type EventUpdateInput,
} from "./events.ts";
import type { AdminLarpEvent, User } from "../shared/types.ts";

export type CreateResult =
  | { created: true; event: AdminLarpEvent }
  | { created: false; duplicates: DuplicateCandidate[] };

export class App {
  readonly push: Push;
  readonly geocoder: Geocoder;
  readonly live = new Live();

  constructor(
    readonly db: Database,
    readonly cfg: Config,
  ) {
    this.push = new Push(db, cfg.contactEmail);
    this.push.onAnnounced = () => this.live.notify("activity", 0);
    this.geocoder = new Geocoder(db, cfg.contactEmail);
  }

  createEvent(
    input: EventCreateInput,
    user: User | null,
    source: "manual" | "mcp" | "api" | "suggestion",
    allowDuplicate = false,
  ): CreateResult {
    if (!allowDuplicate) {
      const duplicates = findDuplicates(this.db, input);
      if (duplicates.length) return { created: false, duplicates };
    }
    const event = createEvent(this.db, input, { userId: user?.id ?? null, source });
    this.afterSave(event);
    return { created: true, event };
  }

  updateEvent(id: number, patch: EventUpdateInput, user: User | null, checked = false): AdminLarpEvent | null {
    const current = getEvent(this.db, id);
    if (!current) return null;
    // Re-geocode when the address changed but the coordinates were not edited along with it.
    const addressKeys = ["street", "postalCode", "city", "country"] as const;
    const addressChanged = addressKeys.some((k) => k in patch && (patch[k] ?? null) !== (current[k] ?? null));
    const coordsEdited = ("lat" in patch && patch.lat !== current.lat) || ("lng" in patch && patch.lng !== current.lng);
    if (addressChanged && !coordsEdited) Object.assign(patch, { lat: null, lng: null });
    const event = updateEvent(this.db, id, patch, { userId: user?.id ?? null, checked });
    if (!event) return null;
    if (this.push.recordChanges(current, event)) this.push.scheduleAnnouncement();
    this.afterSave(event);
    return event;
  }

  deleteEvent(id: number): boolean {
    const deleted = deleteEvent(this.db, id);
    if (deleted) this.live.notify("events");
    return deleted;
  }

  getEvent(idOrSlug: number | string): AdminLarpEvent | null {
    return getEvent(this.db, idOrSlug);
  }

  private afterSave(event: AdminLarpEvent): void {
    if (event.status !== "draft") this.live.notify("events");
    if (event.status === "published") this.push.scheduleAnnouncement();
    if (this.cfg.geocode && event.lat === null && (event.city || event.postalCode)) this.geocoder.nudge();
  }

  start(): void {
    this.push.start();
    if (this.cfg.geocode) this.geocoder.start();
    setInterval(() => cleanupExpired(this.db), 6 * 3600_000);
  }
}

/**
 * The one App instance per server process. Kept on globalThis so that dev-mode hot reloads
 * do not open a second database or start the schedulers twice.
 */
const holder = globalThis as unknown as { __larpApp?: App };

export function getApp(): App {
  if (holder.__larpApp) return holder.__larpApp;
  const cfg = loadConfig();
  configureOAuth(cfg.oauthRedirectHosts);
  const app = new App(openDb(cfg.dataDir), cfg);
  holder.__larpApp = app;
  app.start();
  if (countUsers(app.db) === 0) {
    if (cfg.adminEmail && cfg.adminPassword)
      void createUser(app.db, { email: cfg.adminEmail, name: "Administrator", password: cfg.adminPassword, role: "admin" }).then(() =>
        console.log(`[setup] Administrator ${cfg.adminEmail} angelegt.`),
      );
    else console.warn("[setup] Kein Benutzer vorhanden. ADMIN_EMAIL und ADMIN_PASSWORD setzen oder `bun run user:create` ausführen.");
  }
  return app;
}
