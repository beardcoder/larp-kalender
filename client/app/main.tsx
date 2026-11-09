import { render } from "preact";
import "./styles.css";
import { interceptLinks, locationStore, navigate } from "../lib/router.ts";
import { App } from "./App.tsx";
import { startPushSync } from "./push.ts";
import { loadAccount } from "./account.ts";
import { applyTheme, eventsStore, loadEvents, markVisited, themeStore } from "./state.ts";
import { setupPullToRefresh, updateApp } from "../lib/pull-refresh.ts";
import { toast } from "./toast.tsx";
import { loadActivity, startNotices } from "./notifications.ts";
import { startLive } from "../lib/live.ts";

try {
  const preload = document.getElementById("preload");
  if (preload?.textContent) window.__preload = JSON.parse(preload.textContent);
} catch {
  /* ignore malformed preload */
}

applyTheme(themeStore.get());
const root = document.getElementById("app")!;
interceptLinks(root);
render(<App />, root);

startNotices();
void loadEvents();
void loadActivity();
void loadAccount();
markVisited();

// Live: changes made in the editorial backend show up in open windows within seconds.
startLive({ events: () => void loadEvents(), activity: () => void loadActivity() }, () => {
  void loadEvents();
  void loadActivity();
});

// Pull down at the top of the page to reload data and pick up new app versions (PWA has no reload button).
setupPullToRefresh(async () => {
  await Promise.all([loadEvents(), loadAccount(), loadActivity()]);
  if (await updateApp()) return;
  const { error, offline } = eventsStore.get();
  toast(offline ? "Offline – zeige gespeicherte Termine" : error ? "Aktualisieren fehlgeschlagen" : "Termine aktualisiert");
});

// Coming back to the foreground: the live connection reopens and catches up (see startLive).
window.addEventListener("online", () => (void loadEvents(), void loadActivity()));
window.addEventListener("offline", () => eventsStore.set((s) => ({ ...s, offline: true })));

/** In-app navigation that opens event pages as a sheet above the current view. */
function openInApp(url: string): void {
  const overlay = url.startsWith("/termin/");
  const current = locationStore.get();
  navigate(url, { background: overlay ? (current.background ?? location.pathname + location.search) : null });
}

// Installed app opened again via a link or shortcut (launch_handler "focus-existing"): route inside the running app.
const launchQueue = (window as { launchQueue?: { setConsumer(fn: (params: { targetURL?: string }) => void): void } }).launchQueue;
launchQueue?.setConsumer((params) => {
  if (!params.targetURL) return;
  const target = new URL(params.targetURL);
  if (target.origin === location.origin && target.pathname + target.search !== location.pathname + location.search) openInApp(target.pathname + target.search);
});

if ("serviceWorker" in navigator) {
  // Messages from the service worker: a push arrived, or a notification was tapped while the app is open.
  navigator.serviceWorker.addEventListener("message", (e) => {
    const msg = e.data as { type?: string; url?: string; payload?: { title?: string } };
    if (msg?.type === "push") {
      void loadActivity();
      if (document.visibilityState === "visible" && msg.payload?.title) toast(msg.payload.title);
    } else if (msg?.type === "navigate" && msg.url?.startsWith("/")) {
      openInApp(msg.url);
      void loadActivity();
    }
  });

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then(() => startPushSync())
      .catch((err) => console.warn("Service worker registration failed", err));
  });
}
