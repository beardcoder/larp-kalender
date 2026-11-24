/* Service worker: offline fallback for pages, cached event data, push notifications. Plain JS, no build step. */

const CACHE = "lk-v2";
const OFFLINE_PAGES = ["/", "/kalender", "/merkliste", "/benachrichtigungen", "/mehr"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(OFFLINE_PAGES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/** Network first, cached copy when offline. */
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) (await caches.open(CACHE)).put(request, response.clone());
    return response;
  } catch {
    return (await caches.match(request)) ?? (await caches.match("/")) ?? Response.error();
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (/^\/(admin|oauth|mcp|api\/live)/.test(url.pathname)) return;
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    // Hashed or rarely changing files: cache first.
    event.respondWith(caches.match(request).then((hit) => hit ?? fetch(request).then((r) => (r.ok && caches.open(CACHE).then((c) => c.put(request, r.clone())), r))));
  } else if (request.mode === "navigate") {
    event.respondWith(networkFirst(request));
  }
});

self.addEventListener("push", (event) => {
  let data = { title: "LARP-Kalender", body: "", url: "/" };
  try {
    data = { ...data, ...event.data.json() };
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
      }),
      data.tag === "test" ? undefined : self.navigator.setAppBadge?.().catch(() => undefined),
      // Open windows refresh right away.
      self.clients.matchAll({ type: "window" }).then((list) => list.forEach((c) => c.postMessage({ type: "push", title: data.title }))),
    ]),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url ?? "/", self.location.origin);
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      const client = list.find((c) => c.focused) ?? list[0];
      if (!client) return self.clients.openWindow(url.href);
      // Navigate inside the running app (no reload).
      client.postMessage({ type: "navigate", url: url.pathname + url.search });
      return client.focus();
    }),
  );
});
