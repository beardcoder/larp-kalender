import { render } from "preact";
import "./styles.css";
import { interceptLinks } from "../lib/router.ts";
import { App } from "./App.tsx";
import { startPushSync } from "./push.ts";
import { loadAccount } from "./account.ts";
import { applyTheme, eventsStore, loadEvents, markVisited, themeStore } from "./state.ts";

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
