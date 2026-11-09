/**
 * In-app notification center: recent activity from the server (new events, relevant changes) plus
 * reminders for bookmarked events, computed on the device with the same rules as the push reminders.
 *
 * Nothing is stored per person on the server: the feed is the same for everyone (last 30 days). On the device
 * we keep only the ids of seen and dismissed entries, and only while they are still in the feed, so this stays
 * a few kilobytes at most. The unread count is mirrored to the app icon badge.
 */

import { set as idbSet } from "idb-keyval";
import type { ActivityItem } from "../../src/shared/types.ts";
import { reminderFor, type ReminderKind } from "../../src/shared/reminders.ts";
import { createStore, load, persistentStore, save } from "../lib/store.ts";
import { eventsStore, favoritesStore } from "./state.ts";

export interface Notice {
  id: string;
  kind: "new" | "change" | "reminder";
  reminder?: ReminderKind;
  eventId: number;
  slug: string;
  title: string;
  text: string;
  /** ISO timestamp (activity) or ISO date (reminders). */
  at: string;
  favorite: boolean;
  cancelled: boolean;
}

interface ActivityState {
  items: ActivityItem[];
  loaded: boolean;
}

export const activityStore = createStore<ActivityState>({ items: load<ActivityItem[]>("lk.activity", []), loaded: false });

export async function loadActivity(): Promise<void> {
  try {
    const res = await fetch("/api/notifications", { headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { items } = (await res.json()) as { items: ActivityItem[] };
    activityStore.set({ items, loaded: true });
    save("lk.activity", items);
  } catch {
    // Offline: keep the stored copy, but count it as loaded so the read state can settle.
    activityStore.set((s) => ({ ...s, loaded: true }));
  }
}

/** Ids the user has already seen. `seeded` is false until the first complete list was stored. */
interface SeenState {
  seeded: boolean;
  ids: string[];
}
const seenStore = persistentStore<SeenState>("lk.seen", { seeded: false, ids: [] });
/** Entries swiped away. */
const dismissedStore = persistentStore<string[]>("lk.dismissed", []);

export interface NoticesState {
  reminders: Notice[];
  activity: Notice[];
  unread: Set<string>;
}

export const noticesStore = createStore<NoticesState>({ reminders: [], activity: [], unread: new Set() });

function compute(): void {
  const { events, today, loading } = eventsStore.get();
  const favorites = new Set(favoritesStore.get());
  const activity = activityStore.get();
  const byId = new Map(events.map((e) => [e.id, e]));

  const reminders: Notice[] = [];
  for (const id of favorites) {
    const e = byId.get(id);
    const r = e && reminderFor(e, today);
    if (!e || !r) continue;
    reminders.push({ id: `${r.kind}-${e.id}`, kind: "reminder", reminder: r.kind, eventId: e.id, slug: e.slug, title: r.title, text: r.body, at: r.since, favorite: true, cancelled: false });
  }
  reminders.sort((a, b) => (byId.get(a.eventId)!.startDate < byId.get(b.eventId)!.startDate ? -1 : 1));

  const items: Notice[] = activity.items.map((i) => {
    const e = byId.get(i.eventId);
    return {
      ...i,
      slug: e?.slug ?? i.slug,
      favorite: favorites.has(i.eventId),
      cancelled: i.kind === "change" && /^abgesagt/i.test(i.text),
    };
  });

  const dismissed = new Set(dismissedStore.get());
  const all = [...reminders, ...items];
  let seen = seenStore.get();
  // First run: everything that already exists counts as seen, only later news is "new".
  if (!seen.seeded && activity.loaded && !loading) {
    seen = { seeded: true, ids: all.map((n) => n.id) };
    seenStore.set(seen);
  }
  const known = new Set(seen.ids);
  const visible = (n: Notice) => !dismissed.has(n.id);
  const unread = new Set(seen.seeded ? all.filter((n) => visible(n) && !known.has(n.id)).map((n) => n.id) : []);
  noticesStore.set({ reminders: reminders.filter(visible), activity: items.filter(visible), unread });
  updateBadge(unread.size);
  if (activity.loaded && !loading && seen.seeded) prune(new Set(all.map((n) => n.id)));
}

/** Forgets ids that left the feed (older than 30 days, reminder no longer due), so local storage stays tiny. */
function prune(current: Set<string>): void {
  const seen = seenStore.get();
  const keepSeen = seen.ids.filter((id) => current.has(id));
  if (keepSeen.length !== seen.ids.length) seenStore.set({ ...seen, ids: keepSeen });
  const dismissed = dismissedStore.get();
  const keepDismissed = dismissed.filter((id) => current.has(id));
  if (keepDismissed.length !== dismissed.length) dismissedStore.set(keepDismissed);
}

/** Removes entries from the center (swipe or "clear"). They count as read, too. */
export function dismiss(ids: string[]): void {
  if (!ids.length) return;
  seenStore.set((s) => ({ ...s, ids: [...new Set([...s.ids, ...ids])] }));
  dismissedStore.set((d) => [...new Set([...d, ...ids])]);
}

let lastBadge = -1;
function updateBadge(count: number): void {
  if (count === lastBadge) return;
  lastBadge = count;
  const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
  try {
    void (count ? nav.setAppBadge?.(count) : nav.clearAppBadge?.())?.catch(() => undefined);
  } catch {
    /* not supported */
  }
  // The service worker counts up from here when a push arrives while the app is closed.
  void idbSet("lk.badge", count).catch(() => undefined);
}

/** Marks everything currently listed as seen. */
export function markAllSeen(): void {
  const { reminders, activity } = noticesStore.get();
  const ids = new Set([...seenStore.get().ids, ...reminders.map((n) => n.id), ...activity.map((n) => n.id)]);
  seenStore.set({ seeded: true, ids: [...ids] });
}

export function markSeen(id: string): void {
  seenStore.set((s) => (s.ids.includes(id) ? s : { ...s, ids: [...s.ids, id] }));
}

let started = false;
export function startNotices(): void {
  if (started) return;
  started = true;
  eventsStore.subscribe(compute);
  favoritesStore.subscribe(compute);
  activityStore.subscribe(compute);
  seenStore.subscribe(compute);
  dismissedStore.subscribe(compute);
  compute();
}
