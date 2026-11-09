/**
 * Web push notifications: VAPID keys (generated once and stored in the database), subscriptions with
 * preferences, batched announcements of new events and relevant changes, reminders for bookmarked events.
 */

import type { Database } from "bun:sqlite";
import webpush from "web-push";
import { z } from "zod";
import { getSetting, nowIso, setSetting } from "./db.ts";
import { listPublicEvents, today } from "./repo/events.ts";
import type { ActivityItem, LarpEvent } from "./shared/types.ts";
import { EVENT_TYPES, GENRES, REGISTRATION_STATUS, keys } from "./shared/vocab.ts";
import { formatDateRange } from "./shared/format.ts";
import { reminderFor } from "./shared/reminders.ts";

/** Only known browser push services may be used as endpoints (prevents SSRF via push delivery). */
const PUSH_HOSTS = ["fcm.googleapis.com", "android.googleapis.com", "push.services.mozilla.com", "notify.windows.com", "push.apple.com"];

function isPushServiceUrl(value: string): boolean {
  try {
    const u = new URL(value);
    const host = u.hostname.toLowerCase();
    return u.protocol === "https:" && PUSH_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

const MAX_SUBSCRIPTIONS = 20_000;

export const subscriptionSchema = z.object({
  subscription: z.object({
    endpoint: z
      .string()
      .url()
      .max(1000)
      .refine(isPushServiceUrl, "Unbekannter Push-Dienst"),
    keys: z.object({ p256dh: z.string().max(200), auth: z.string().max(100) }),
  }),
  notifyNew: z.boolean().default(true),
  notifyUpdates: z.boolean().default(true),
  reminders: z.boolean().default(true),
  genres: z.array(z.enum(keys(GENRES))).default([]),
  favorites: z.array(z.number().int().positive()).max(500).default([]),
});

export type SubscriptionInput = z.infer<typeof subscriptionSchema>;

interface SubRow {
  id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
  notify_new: number;
  notify_updates: number;
  reminders: number;
  genres: string;
  favorites: string;
}

export interface Payload {
  title: string;
  body: string;
  url: string;
  tag?: string;
}

/** Delivery function; replaceable in tests. Returns the HTTP status or throws with statusCode. */
export type Sender = (sub: { endpoint: string; keys: { p256dh: string; auth: string } }, payload: string) => Promise<unknown>;

/** German one-line descriptions of the changes that matter to players. Empty if nothing relevant changed. */
export function describeChanges(before: LarpEvent, after: LarpEvent): string[] {
  const out: string[] = [];
  if (after.status === "cancelled" && before.status !== "cancelled") return ["abgesagt"];
  if (before.status === "cancelled" && after.status === "published") out.push("findet doch statt");
  if (before.registrationStatus !== after.registrationStatus && after.registrationStatus !== "unknown") {
    out.push(after.registrationStatus === "open" ? "Anmeldung jetzt offen" : REGISTRATION_STATUS[after.registrationStatus]);
  }
  if (before.startDate !== after.startDate || before.endDate !== after.endDate)
    out.push(`neues Datum: ${formatDateRange(after.startDate, after.endDate)}`);
  if ((before.city ?? "") !== (after.city ?? "") && after.city) out.push(`neuer Ort: ${after.city}`);
  if (!before.registrationUrl && after.registrationUrl) out.push("Anmeldelink ergänzt");
  if (before.registrationDeadline !== after.registrationDeadline && after.registrationDeadline)
    out.push(`Anmeldeschluss: ${formatDateRange(after.registrationDeadline, after.registrationDeadline)}`);
  return out;
}

export class Push {
  private vapid: { publicKey: string; privateKey: string };
  private timer: Timer | null = null;
  private debounce: Timer | null = null;
  /** Called after new activity was announced (live update of open app windows). */
  onAnnounced?: () => void;

  constructor(
    private db: Database,
    private contact: string,
    private sender?: Sender,
  ) {
    const stored = getSetting(db, "vapid");
    if (stored) {
      this.vapid = JSON.parse(stored);
    } else {
      this.vapid = webpush.generateVAPIDKeys();
      setSetting(db, "vapid", JSON.stringify(this.vapid));
    }
  }

  get publicKey(): string {
    return this.vapid.publicKey;
  }

  subscribe(input: SubscriptionInput): boolean {
    const exists = this.db.query("SELECT 1 FROM push_subscriptions WHERE endpoint = ?").get(input.subscription.endpoint);
    if (!exists && this.count() >= MAX_SUBSCRIPTIONS) return false;
    const now = nowIso();
    this.db
      .query(
        `INSERT INTO push_subscriptions (endpoint, p256dh, auth, notify_new, notify_updates, reminders, genres, favorites, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth, notify_new = excluded.notify_new,
           notify_updates = excluded.notify_updates, reminders = excluded.reminders, genres = excluded.genres, favorites = excluded.favorites,
           updated_at = excluded.updated_at, failures = 0`,
      )
      .run(
        input.subscription.endpoint,
        input.subscription.keys.p256dh,
        input.subscription.keys.auth,
        input.notifyNew ? 1 : 0,
        input.notifyUpdates ? 1 : 0,
        input.reminders ? 1 : 0,
        JSON.stringify(input.genres),
        JSON.stringify(input.favorites),
        now,
        now,
      );
    return true;
  }

  unsubscribe(endpoint: string): void {
    this.db.query("DELETE FROM push_subscriptions WHERE endpoint = ?").run(endpoint);
  }

  count(): number {
    return (this.db.query("SELECT COUNT(*) n FROM push_subscriptions").get() as { n: number }).n;
  }

  private async send(sub: SubRow, payload: Payload): Promise<boolean> {
    try {
      const target = { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } };
      if (this.sender) await this.sender(target, JSON.stringify(payload));
      else
        await webpush.sendNotification(target, JSON.stringify(payload), {
          TTL: 60 * 60 * 24,
          timeout: 10_000,
          vapidDetails: { subject: `mailto:${this.contact}`, ...this.vapid },
        });
      if (sub.id) this.db.query("UPDATE push_subscriptions SET failures = 0 WHERE id = ?").run(sub.id);
      return true;
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        this.db.query("DELETE FROM push_subscriptions WHERE id = ?").run(sub.id);
      } else {
        console.warn(`[push] send failed (${status ?? "network"}): ${(err as Error).message}`);
        this.db.query("UPDATE push_subscriptions SET failures = failures + 1 WHERE id = ?").run(sub.id);
        this.db.query("DELETE FROM push_subscriptions WHERE failures >= 10").run();
      }
      return false;
    }
  }

  /**
   * Recent announced activity (new events and relevant changes) for the in-app notification center.
   * Only what was already announced, so the app and push notifications tell the same story.
   */
  activity(days = 30, limit = 80): ActivityItem[] {
    const since = new Date(Date.now() - days * 86_400_000).toISOString();
    const t = today();
    const fresh = this.db
      .query(
        `SELECT id, announced_at AS at FROM events
         WHERE announced_at >= ? AND status IN ('published', 'cancelled') AND end_date >= ?
         ORDER BY announced_at DESC LIMIT ?`,
      )
      .all(since, t, limit) as { id: number; at: string }[];
    const changes = this.db
      .query(
        `SELECT c.id, c.event_id, c.summary, c.announced_at AS at FROM event_changes c JOIN events e ON e.id = c.event_id
         WHERE c.announced_at >= ? AND e.status IN ('published', 'cancelled') AND e.end_date >= ?
         ORDER BY c.announced_at DESC, c.id DESC LIMIT ?`,
      )
      .all(since, t, limit) as { id: number; event_id: number; summary: string; at: string }[];
    const ids = [...new Set([...fresh.map((r) => r.id), ...changes.map((r) => r.event_id)])];
    const events = new Map(ids.length ? listPublicEvents(this.db, { ids, includePast: true }).map((e) => [e.id, e]) : []);
    const items: ActivityItem[] = [];
    for (const r of fresh) {
      const e = events.get(r.id);
      if (!e) continue;
      const text = [formatDateRange(e.startDate, e.endDate), EVENT_TYPES[e.eventType], e.city].filter(Boolean).join(" · ");
      items.push({ id: `new-${e.id}`, kind: "new", eventId: e.id, slug: e.slug, title: e.title, text, at: r.at });
    }
    // One entry per event: the newest change, earlier ones appended ("Warteliste · vorher: Anmeldung jetzt offen").
    const byEvent = new Map<number, typeof changes>();
    for (const r of changes) byEvent.set(r.event_id, [...(byEvent.get(r.event_id) ?? []), r]);
    for (const [eventId, rows] of byEvent) {
      const e = events.get(eventId);
      if (!e) continue;
      const [latest, ...earlier] = rows;
      const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
      const older = [...new Set(earlier.map((r) => r.summary))].filter((t) => t !== latest!.summary).slice(0, 2);
      const text = cap(latest!.summary) + (older.length ? ` · vorher: ${older.join(", ")}` : "");
      items.push({ id: `change-${latest!.id}`, kind: "change", eventId: e.id, slug: e.slug, title: e.title, text, at: latest!.at });
    }
    return items.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
  }

  /** Changes whenever new activity was announced (for ETags). */
  activityVersion(): string {
    const r = this.db
      .query("SELECT (SELECT MAX(announced_at) FROM events) a, (SELECT MAX(announced_at) FROM event_changes) b")
      .get() as { a: string | null; b: string | null };
    return `${r.a ?? ""}|${r.b ?? ""}`;
  }

  /** Sends a test notification to one endpoint. */
  async test(endpoint: string): Promise<boolean> {
    const sub = this.db.query("SELECT * FROM push_subscriptions WHERE endpoint = ?").get(endpoint) as SubRow | null;
    if (!sub) return false;
    return this.send(sub, { title: "Benachrichtigungen aktiv", body: "So sehen Hinweise vom LARP-Kalender aus.", url: "/", tag: "test" });
  }

  /** Records relevant changes of an already announced event; they are pushed with the next batch. */
  recordChanges(before: LarpEvent, after: LarpEvent): boolean {
    if (after.status === "draft") return false;
    const row = this.db.query("SELECT announced_at FROM events WHERE id = ?").get(after.id) as { announced_at: string | null } | null;
    if (!row?.announced_at) return false; // not announced yet: the "new" announcement covers it
    if (after.endDate < today()) return false;
    const changes = describeChanges(before, after);
    if (!changes.length) return false;
    this.db.query("INSERT INTO event_changes (event_id, summary, created_at) VALUES (?, ?, ?)").run(after.id, changes.join(", "), nowIso());
    return true;
  }

  /** Call after events were published or changed. Bursts (e.g. an AI research run) end up in one message. */
  scheduleAnnouncement(): void {
    if (this.debounce) clearTimeout(this.debounce);
    this.debounce = setTimeout(() => void this.announce(), 2 * 60_000);
  }

  /** Sends pending "new event" and "event changed" notifications, batched per subscriber. */
  async announce(): Promise<{ newEvents: number; changes: number; sent: number }> {
    this.debounce = null;
    const now = nowIso();
    const pendingNew = (this.db.query("SELECT id FROM events WHERE announced_at IS NULL AND status = 'published'").all() as { id: number }[]).map(
      (r) => r.id,
    );
    const changeRows = this.db.query("SELECT id, event_id, summary FROM event_changes WHERE announced_at IS NULL ORDER BY id").all() as {
      id: number;
      event_id: number;
      summary: string;
    }[];
    if (!pendingNew.length && !changeRows.length) return { newEvents: 0, changes: 0, sent: 0 };

    const newEvents = pendingNew.length ? listPublicEvents(this.db, { statuses: ["published"], ids: pendingNew }) : [];
    if (pendingNew.length)
      this.db.query(`UPDATE events SET announced_at = ? WHERE id IN (${pendingNew.map(() => "?").join(",")})`).run(now, ...pendingNew);
    this.db.query("UPDATE event_changes SET announced_at = ? WHERE announced_at IS NULL").run(now);

    // Merge several changes of the same event into one line.
    const changedIds = [...new Set(changeRows.map((c) => c.event_id))];
    const changedEvents = changedIds.length ? listPublicEvents(this.db, { ids: changedIds, includePast: false }) : [];
    const changes = changedEvents.map((e) => ({
      event: e,
      summary: [...new Set(changeRows.filter((c) => c.event_id === e.id).flatMap((c) => c.summary.split(", ")))].join(", "),
    }));

    const subs = this.db.query("SELECT * FROM push_subscriptions").all() as SubRow[];
    let sent = 0;
    for (const sub of subs) {
      const genres: string[] = JSON.parse(sub.genres);
      const favorites: number[] = JSON.parse(sub.favorites);
      const genreMatch = (e: LarpEvent) => !genres.length || e.genres.some((g) => genres.includes(g));

      const fresh = sub.notify_new ? newEvents.filter(genreMatch) : [];
      if (fresh.length && (await this.send(sub, newPayload(fresh)))) sent++;

      const relevant = changes.filter(
        (c) => (sub.reminders && favorites.includes(c.event.id)) || (sub.notify_updates && genreMatch(c.event)),
      );
      if (relevant.length && (await this.send(sub, changePayload(relevant, favorites)))) sent++;
    }
    this.onAnnounced?.();
    console.log(`[push] announced ${newEvents.length} new event(s) and ${changes.length} change(s): ${sent} notification(s) to ${subs.length} device(s)`);
    return { newEvents: newEvents.length, changes: changes.length, sent };
  }

  /** Reminders for bookmarked events: registration opens, deadline approaching, start in a week, cancellation. */
  async sendReminders(): Promise<void> {
    const hour = Number(new Date().toLocaleString("en-US", { timeZone: "Europe/Berlin", hour: "numeric", hour12: false }));
    if (hour < 9 || hour > 20) return;
    const subs = this.db.query("SELECT * FROM push_subscriptions WHERE reminders = 1 AND favorites != '[]'").all() as SubRow[];
    if (!subs.length) return;
    const t = today();
    const cache = new Map<number, LarpEvent>();
    for (const e of listPublicEvents(this.db, {})) cache.set(e.id, e);

    for (const sub of subs) {
      for (const id of JSON.parse(sub.favorites) as number[]) {
        const e = cache.get(id);
        if (!e) continue;
        const reminder = reminderFor(e, t);
        if (!reminder) continue;
        const already = this.db
          .query("SELECT 1 FROM push_sent WHERE subscription_id = ? AND event_id = ? AND kind = ?")
          .get(sub.id, e.id, reminder.kind);
        if (already) continue;
        this.db
          .query("INSERT INTO push_sent (subscription_id, event_id, kind, sent_at) VALUES (?, ?, ?, ?)")
          .run(sub.id, e.id, reminder.kind, nowIso());
        await this.send(sub, { title: reminder.title, body: reminder.body, url: `/termin/${e.slug}`, tag: `${reminder.kind}-${e.id}` });
      }
    }
  }

  start(): void {
    // Hourly: reminders and any pending announcements (e.g. after a restart).
    const tick = async () => {
      try {
        await this.announce();
        await this.sendReminders();
      } catch (err) {
        console.error("[push] scheduler error", err);
      }
    };
    this.timer = setInterval(() => void tick(), 60 * 60_000);
    setTimeout(() => void tick(), 30_000);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    if (this.debounce) clearTimeout(this.debounce);
  }
}

function newPayload(events: LarpEvent[]): Payload {
  const first = events[0]!;
  if (events.length === 1)
    return {
      title: `Neu: ${first.title}`,
      body: [formatDateRange(first.startDate, first.endDate), EVENT_TYPES[first.eventType], first.city].filter(Boolean).join(" · "),
      url: `/termin/${first.slug}`,
      tag: `new-${first.id}`,
    };
  return {
    title: `${events.length} neue Veranstaltungen`,
    body: events.slice(0, 3).map((e) => e.title).join(", ") + (events.length > 3 ? " …" : ""),
    url: "/?neu=1",
    tag: "new-batch",
  };
}

function changePayload(changes: { event: LarpEvent; summary: string }[], favorites: number[]): Payload {
  const first = changes[0]!;
  if (changes.length === 1)
    return {
      title: `${favorites.includes(first.event.id) ? "Merkliste" : "Update"}: ${first.event.title}`,
      body: first.summary.charAt(0).toUpperCase() + first.summary.slice(1),
      url: `/termin/${first.event.slug}`,
      tag: `update-${first.event.id}`,
    };
  const allFavorites = changes.every((c) => favorites.includes(c.event.id));
  return {
    title: `${changes.length} Veranstaltungen aktualisiert`,
    body: changes
      .slice(0, 3)
      .map((c) => `${c.event.title}: ${c.summary}`)
      .join(" · "),
    url: allFavorites ? "/merkliste" : "/",
    tag: "update-batch",
  };
}
