/** Web push subscription handling for the PWA. */

import type { Genre } from "../../src/shared/vocab.ts";
import { persistentStore } from "../lib/store.ts";
import { favoritesStore } from "./state.ts";

export interface PushPrefs {
  enabled: boolean;
  notifyNew: boolean;
  /** Missing in preferences stored by older versions: treated as enabled. */
  notifyUpdates?: boolean;
  reminders: boolean;
  genres: Genre[];
}

export const pushPrefsStore = persistentStore<PushPrefs>("lk.push", { enabled: false, notifyNew: true, reminders: true, genres: [] });

export const pushSupported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

/** iOS only allows push for installed home screen apps. */
export const needsInstallForPush = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.matchMedia("(display-mode: standalone)").matches;

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

async function sync(sub: PushSubscription): Promise<void> {
  const prefs = pushPrefsStore.get();
  const res = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      subscription: sub.toJSON(),
      notifyNew: prefs.notifyNew,
      notifyUpdates: prefs.notifyUpdates !== false,
      reminders: prefs.reminders,
      genres: prefs.genres,
      favorites: favoritesStore.get(),
    }),
  });
  if (!res.ok) throw new Error("Anmeldung für Benachrichtigungen fehlgeschlagen.");
}

export async function enablePush(): Promise<void> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Benachrichtigungen sind im Browser blockiert. Erlaube sie in den Website-Einstellungen.");
  const reg = await navigator.serviceWorker.ready;
  const { publicKey } = (await (await fetch("/api/push/key")).json()) as { publicKey: string };
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) }));
  pushPrefsStore.set((p) => ({ ...p, enabled: true }));
  await sync(sub);
}

export async function disablePush(): Promise<void> {
  const sub = await currentSubscription();
  if (sub) {
    await fetch("/api/push/unsubscribe", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    }).catch(() => undefined);
    await sub.unsubscribe();
  }
  pushPrefsStore.set((p) => ({ ...p, enabled: false }));
}

export async function testPush(): Promise<boolean> {
  const sub = await currentSubscription();
  if (!sub) return false;
  const res = await fetch("/api/push/test", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ endpoint: sub.endpoint }),
  });
  return ((await res.json()) as { ok: boolean }).ok;
}

let timer: ReturnType<typeof setTimeout> | null = null;

/** Keeps the server-side copy of preferences and bookmarks (for reminders) up to date. */
export function startPushSync(): void {
  const schedule = () => {
    if (!pushPrefsStore.get().enabled || !pushSupported()) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(async () => {
      const sub = await currentSubscription().catch(() => null);
      if (sub) await sync(sub).catch(() => undefined);
      else pushPrefsStore.set((p) => ({ ...p, enabled: false }));
    }, 800);
  };
  favoritesStore.subscribe(schedule);
  pushPrefsStore.subscribe(schedule);
  schedule();
}
