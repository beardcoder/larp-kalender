import { render } from "preact";
import "./styles.css";
import { interceptLinks } from "../lib/router.ts";
import { App } from "./App.tsx";
import { startPushSync } from "./push.ts";
import { loadAccount } from "./account.ts";
import { applyTheme, eventsStore, loadEvents, markVisited, themeStore } from "./state.ts";
import { setupPullToRefresh, updateApp } from "../lib/pull-refresh.ts";
import { toast } from "./toast.tsx";

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

void loadEvents();
void loadAccount();
markVisited();

// Pull down at the top of the page to reload data and pick up new app versions (PWA has no reload button).
setupPullToRefresh(async () => {
  await Promise.all([loadEvents(), loadAccount()]);
  if (await updateApp()) return;
  const { error, offline } = eventsStore.get();
  toast(offline ? "Offline – zeige gespeicherte Termine" : error ? "Aktualisieren fehlgeschlagen" : "Termine aktualisiert");
});

// Refresh when the app comes back to the foreground after a while.
let lastLoad = Date.now();
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && Date.now() - lastLoad > 10 * 60_000) {
    lastLoad = Date.now();
    void loadEvents();
  }
});
window.addEventListener("online", () => void loadEvents());
window.addEventListener("offline", () => eventsStore.set((s) => ({ ...s, offline: true })));

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then(() => startPushSync())
      .catch((err) => console.warn("Service worker registration failed", err));
  });
}
