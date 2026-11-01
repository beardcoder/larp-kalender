/**
 * Web push notifications: VAPID keys (generated once and stored in the database), subscriptions with
 * preferences, batched "new events" announcements and reminders for bookmarked events.
 */

import type { Database } from "bun:sqlite";
import webpush from "web-push";
import { z } from "zod";
import { getSetting, nowIso, setSetting } from "./db.ts";
import { listPublicEvents, today } from "./repo/events.ts";
import type { LarpEvent } from "./shared/types.ts";
import { GENRES, keys } from "./shared/vocab.ts";
import { daysBetween, formatDateRange } from "./shared/format.ts";

export const subscriptionSchema = z.object({
  subscription: z.object({
    endpoint: z.string().url().max(1000),
    keys: z.object({ p256dh: z.string().max(200), auth: z.string().max(100) }),
  }),
  notifyNew: z.boolean().default(true),
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
  reminders: number;
  genres: string;
  favorites: string;
}

interface Payload {
  title: string;
  body: string;
  url: string;
  tag?: string;
}

export class Push {
  private vapid: { publicKey: string; privateKey: string };
  private timer: Timer | null = null;
  private debounce: Timer | null = null;

  constructor(
    private db: Database,
    private contact: string,
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

  subscribe(input: SubscriptionInput): void {
    const now = nowIso();
    this.db
      .query(
        `INSERT INTO push_subscriptions (endpoint, p256dh, auth, notify_new, reminders, genres, favorites, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth, notify_new = excluded.notify_new,
           reminders = excluded.reminders, genres = excluded.genres, favorites = excluded.favorites,
           updated_at = excluded.updated_at, failures = 0`,
      )
      .run(
        input.subscription.endpoint,
        input.subscription.keys.p256dh,
        input.subscription.keys.auth,
        input.notifyNew ? 1 : 0,
        input.reminders ? 1 : 0,
        JSON.stringify(input.genres),
        JSON.stringify(input.favorites),
        now,
        now,
      );
  }

  unsubscribe(endpoint: string): void {
    this.db.query("DELETE FROM push_subscriptions WHERE endpoint = ?").run(endpoint);
  }

  count(): number {
    return (this.db.query("SELECT COUNT(*) n FROM push_subscriptions").get() as { n: number }).n;
  }

  private async send(sub: SubRow, payload: Payload): Promise<boolean> {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload),
        {
          TTL: 60 * 60 * 24,
          vapidDetails: { subject: `mailto:${this.contact}`, ...this.vapid },
        },
      );
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

  /** Sends a test notification to one endpoint. */
  async test(endpoint: string): Promise<boolean> {
    const sub = this.db.query("SELECT * FROM push_subscriptions WHERE endpoint = ?").get(endpoint) as SubRow | null;
    if (!sub) return false;
    return this.send(sub, { title: "Benachrichtigungen aktiv", body: "So sehen Hinweise vom LARP-Kalender aus.", url: "/", tag: "test" });
  }

  /** Call after an event was published; announcements are batched to one message per subscriber. */
  scheduleAnnouncement(): void {
    if (this.debounce) clearTimeout(this.debounce);
    this.debounce = setTimeout(() => void this.announceNew(), 3 * 60_000);
  }

  async announceNew(): Promise<void> {
    this.debounce = null;
    const pending = (this.db.query("SELECT id FROM events WHERE announced_at IS NULL AND status = 'published'").all() as { id: number }[]).map(
      (r) => r.id,
    );
    if (!pending.length) return;
    const events = listPublicEvents(this.db, { statuses: ["published"], ids: pending });
    // Past events are marked as announced too, but never pushed.
    this.db
      .query(`UPDATE events SET announced_at = ? WHERE id IN (${pending.map(() => "?").join(",")})`)
      .run(nowIso(), ...pending);
    if (!events.length) return;

    const subs = this.db.query("SELECT * FROM push_subscriptions WHERE notify_new = 1").all() as SubRow[];
    for (const sub of subs) {
      const genres: string[] = JSON.parse(sub.genres);
      const matching = genres.length ? events.filter((e) => e.genres.some((g) => genres.includes(g))) : events;
      if (!matching.length) continue;
      const first = matching[0]!;
      const payload: Payload =
        matching.length === 1
          ? {
              title: `Neu: ${first.title}`,
              body: [formatDateRange(first.startDate, first.endDate), first.city].filter(Boolean).join(" · "),
              url: `/termin/${first.slug}`,
              tag: `new-${first.id}`,
            }
          : {
              title: `${matching.length} neue Veranstaltungen`,
              body: matching
                .slice(0, 3)
                .map((e) => e.title)
                .join(", ") + (matching.length > 3 ? " …" : ""),
              url: "/?neu=1",
              tag: "new-batch",
            };
      await this.send(sub, payload);
    }
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
        const reminder = this.reminderFor(e, t);
        if (!reminder) continue;
        const already = this.db
          .query("SELECT 1 FROM push_sent WHERE subscription_id = ? AND event_id = ? AND kind = ?")
          .get(sub.id, e.id, reminder.kind);
        if (already) continue;
        this.db
          .query("INSERT INTO push_sent (subscription_id, event_id, kind, sent_at) VALUES (?, ?, ?, ?)")
          .run(sub.id, e.id, reminder.kind, nowIso());
        await this.send(sub, { ...reminder.payload, url: `/termin/${e.slug}`, tag: `${reminder.kind}-${e.id}` });
      }
    }
  }

  private reminderFor(e: LarpEvent, t: string): { kind: string; payload: Omit<Payload, "url"> } | null {
    if (e.status === "cancelled") return { kind: "cancelled", payload: { title: `Abgesagt: ${e.title}`, body: "Die Veranstaltung findet nicht statt." } };
    const open = ["open", "waitlist"].includes(e.registrationStatus);
    if (e.registrationDeadline && open) {
      const d = daysBetween(t, e.registrationDeadline);
      if (d >= 0 && d <= 3)
        return {
          kind: "deadline",
          payload: {
            title: d === 0 ? `Heute Anmeldeschluss: ${e.title}` : `Anmeldeschluss in ${d} ${d === 1 ? "Tag" : "Tagen"}`,
            body: `${e.title} – jetzt anmelden, solange es geht.`,
          },
        };
    }
    if (e.registrationOpens && e.registrationOpens <= t && daysBetween(e.registrationOpens, t) <= 2 && e.registrationStatus !== "closed" && e.registrationStatus !== "sold_out")
      return { kind: "opens", payload: { title: `Anmeldung offen: ${e.title}`, body: "Die Anmeldung ist gestartet." } };
    const until = daysBetween(t, e.startDate);
    if (until >= 0 && until <= 7)
      return {
        kind: "start",
        payload: {
          title: until === 0 ? `Heute geht's los: ${e.title}` : `In ${until} ${until === 1 ? "Tag" : "Tagen"}: ${e.title}`,
          body: [e.venue, e.city].filter(Boolean).join(", ") || "Gute Reise und viel Spaß im Spiel!",
        },
      };
    return null;
  }

  start(): void {
    // Hourly: reminders and any pending announcements (e.g. after a restart).
    const tick = async () => {
      try {
        await this.announceNew();
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
