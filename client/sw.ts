/// <reference lib="webworker" />
/** Service worker: offline app shell, cached event data, push notifications. */

import { get, set } from "idb-keyval";

declare const self: ServiceWorkerGlobalScope;
declare const __VERSION__: string;
declare const __PRECACHE__: string[];

const CACHE = `lk-${__VERSION__}`;
const DATA_CACHE = "lk-data";
const BADGE_KEY = "lk.badge";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(["/", ...__PRECACHE__]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== DATA_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function networkFirst(request: Request, cacheName: string, fallback?: string): Promise<Response> {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      await cache.put(fallback ?? request, response.clone());
    }
    return response;
  } catch {
    const cached = (await caches.match(request)) ?? (fallback ? await caches.match(fallback) : undefined);
    if (cached) return cached;
    throw new Error("offline");
  }
}

async function cacheFirst(request: Request): Promise<Response> {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) (await caches.open(CACHE)).put(request, response.clone());
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  const path = url.pathname;
  if (path.startsWith("/admin") || path.startsWith("/oauth") || path.startsWith("/mcp") || path.startsWith("/api/admin")) return;

  if ((path === "/api/events" || path === "/api/notifications") && !url.search) {
    event.respondWith(networkFirst(request, DATA_CACHE));
  } else if (path.startsWith("/assets/") || path.startsWith("/icons/")) {
    event.respondWith(cacheFirst(request));
  } else if (request.mode === "navigate") {
    // Pages: always try the network (fresh meta tags), fall back to the cached shell offline.
    event.respondWith(networkFirst(request, CACHE, "/").catch(() => caches.match("/") as Promise<Response>));
  }
});

interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag?: string;
}

/** Unread count shown on the app icon; the app writes the exact value, pushes count up from there. */
async function bumpBadge(): Promise<void> {
  const nav = self.navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void> };
  const count = ((await get<number>(BADGE_KEY).catch(() => 0)) ?? 0) + 1;
  await set(BADGE_KEY, count).catch(() => undefined);
  await nav.setAppBadge?.(count).catch(() => undefined);
}

async function windows(): Promise<readonly WindowClient[]> {
  return self.clients.matchAll({ type: "window", includeUncontrolled: true });
}

self.addEventListener("push", (event) => {
  let data: PushPayload = { title: "LARP-Kalender", body: "", url: "/" };
  try {
    data = { ...data, ...(event.data?.json() as PushPayload) };
  } catch {
    if (event.data) data.body = event.data.text();
  }
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(data.title, {
        body: data.body,
        icon: "/icons/icon-192.png",
        badge: "/icons/badge-96.png",
        tag: data.tag,
        data: { url: data.url },
        lang: "de",
        timestamp: Date.now(),
      } as NotificationOptions),
      data.tag === "test" ? undefined : bumpBadge(),
      // Open windows refresh their notification center right away.
      windows().then((list) => list.forEach((c) => c.postMessage({ type: "push", payload: data }))),
    ]),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL((event.notification.data as { url?: string })?.url ?? "/", self.location.origin);
  const path = url.pathname + url.search;
  event.waitUntil(
    windows().then(async (list) => {
      const client = list.find((c) => c.focused) ?? list[0];
      if (client) {
        // Navigate inside the running app (no reload, the event opens as a sheet).
        client.postMessage({ type: "navigate", url: path });
        return client.focus();
      }
      return self.clients.openWindow(url.href);
    }),
  );
});
