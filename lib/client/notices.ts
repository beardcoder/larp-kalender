"use client";

/**
 * Notification center: announced activity from the server (same for everyone, last 30 days) plus reminders for
 * bookmarked events, computed on the device with the same rules as the push reminders. Only the ids of seen and
 * dismissed entries are stored, on the device, and pruned once they leave the feed.
 */

import { useEffect, useMemo } from "react";
import { reminderFor, type ReminderKind } from "../shared/reminders.ts";
import type { ActivityItem, LarpEvent } from "../shared/types.ts";
import { favoritesStore } from "./state.ts";
import { persistentStore, useStore } from "./store.ts";

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

/** `seeded` is false until the first complete list was stored: on the first visit nothing counts as unread. */
const seenStore = persistentStore<{ seeded: boolean; ids: string[] }>("lk.seen", { seeded: false, ids: [] });
const dismissedStore = persistentStore<string[]>("lk.dismissed", []);

export function useNotices(events: LarpEvent[], activity: ActivityItem[], today: string) {
  const favorites = useStore(favoritesStore);
  const seen = useStore(seenStore);
  const dismissed = useStore(dismissedStore);

  const all = useMemo(() => {
    const byId = new Map(events.map((e) => [e.id, e]));
    const reminders: Notice[] = [];
    for (const id of favorites) {
      const e = byId.get(id);
      const r = e && reminderFor(e, today);
      if (e && r)
        reminders.push({ id: `${r.kind}-${e.id}`, kind: "reminder", reminder: r.kind, eventId: e.id, slug: e.slug, title: r.title, text: r.body, at: r.since, favorite: true, cancelled: false });
    }
    reminders.sort((a, b) => byId.get(a.eventId)!.startDate.localeCompare(byId.get(b.eventId)!.startDate));
    const items: Notice[] = activity.map((i) => ({
      ...i,
      favorite: favorites.includes(i.eventId),
      cancelled: i.kind === "change" && /^abgesagt/i.test(i.text),
    }));
    return { reminders, items };
  }, [events, activity, favorites, today]);

  const ids = useMemo(() => [...all.reminders, ...all.items].map((n) => n.id), [all]);

  useEffect(() => {
    if (!seen.seeded) return seenStore.set({ seeded: true, ids });
    // Forget ids that left the feed so local storage stays tiny.
    const current = new Set(ids);
    if (seen.ids.some((id) => !current.has(id))) seenStore.set({ seeded: true, ids: seen.ids.filter((id) => current.has(id)) });
    if (dismissed.some((id) => !current.has(id))) dismissedStore.set(dismissed.filter((id) => current.has(id)));
  }, [ids, seen, dismissed]);

  const hidden = new Set(dismissed);
  const known = new Set(seen.ids);
  const visible = (n: Notice) => !hidden.has(n.id);
  const unread = new Set(seen.seeded ? ids.filter((id) => !hidden.has(id) && !known.has(id)) : []);
  return { reminders: all.reminders.filter(visible), activity: all.items.filter(visible), unread };
}

export function dismiss(ids: string[]): void {
  seenStore.set((s) => ({ ...s, ids: [...new Set([...s.ids, ...ids])] }));
  dismissedStore.set((d) => [...new Set([...d, ...ids])]);
}

export function markSeen(ids: string[]): void {
  seenStore.set((s) => ({ seeded: true, ids: [...new Set([...s.ids, ...ids])] }));
}

/** Unread count on the app icon (Badging API, where supported). */
export function setAppBadge(count: number): void {
  const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
  void (count ? nav.setAppBadge?.(count) : nav.clearAppBadge?.())?.catch(() => undefined);
}
