/** Minimal history-based router. */

import { createStore, useStore } from "./store.ts";

export interface Location {
  path: string;
  query: URLSearchParams;
  /** Path of the view below an overlay (event detail sheet). */
  background: string | null;
}

const read = (): Location => ({
  path: window.location.pathname,
  query: new URLSearchParams(window.location.search),
  background: (history.state as { background?: string } | null)?.background ?? null,
});

export const locationStore = createStore<Location>(read());

window.addEventListener("popstate", () => locationStore.set(read()));

export function navigate(to: string, opts: { replace?: boolean; background?: string | null } = {}): void {
  if (to === window.location.pathname + window.location.search && !opts.replace) return;
  const state = opts.background ? { background: opts.background } : null;
  if (opts.replace) history.replaceState(state, "", to);
  else history.pushState(state, "", to);
  locationStore.set(read());
  const hash = to.split("#")[1];
  if (hash) setTimeout(() => document.getElementById(hash)?.scrollIntoView({ block: "start" }), 60);
  else if (!opts.background) window.scrollTo({ top: 0 });
}

/** Go back if the previous entry belongs to the app, otherwise navigate to the fallback. */
export function back(fallback: string): void {
  if ((history.state as { background?: string } | null)?.background) history.back();
  else navigate(fallback, { replace: true });
}

export const useLocation = () => useStore(locationStore);

/** Intercepts clicks on internal links (<a href="/...">) for client-side navigation. */
export function interceptLinks(root: HTMLElement, scope: "app" | "admin" = "app"): void {
  root.addEventListener("click", (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = (e.target as HTMLElement).closest("a");
    if (!a || a.target || a.hasAttribute("download") || a.dataset.native !== undefined) return;
    const href = a.getAttribute("href");
    if (!href?.startsWith("/") || href.startsWith("//") || /\.(ics|csv|xml)(\?|$)/.test(href)) return;
    if ((scope === "admin") !== href.startsWith("/admin")) return;
    e.preventDefault();
    const overlay = a.dataset.overlay !== undefined;
    navigate(href, { background: overlay ? (locationStore.get().background ?? window.location.pathname + window.location.search) : null });
  });
}
