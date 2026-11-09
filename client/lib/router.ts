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

type TransitionDoc = Document & { startViewTransition?: (update: () => Promise<void>) => unknown };

/**
 * Applies a route change inside a View Transition (cross-fade between views, like a native app) where supported.
 * Overlays (event sheets) have their own animation and switch without it.
 */
function commit(update: () => void, animate: boolean): void {
  const doc = document as TransitionDoc;
  if (!animate || !doc.startViewTransition || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return update();
  doc.startViewTransition(async () => {
    update();
    // Let Preact render the new view before the "after" snapshot is taken.
    await new Promise((r) => setTimeout(r, 0));
  });
}

window.addEventListener("popstate", () => {
  const next = read();
  const prev = locationStore.get();
  commit(() => locationStore.set(next), !next.background && !prev.background && next.path !== prev.path);
});

export function navigate(to: string, opts: { replace?: boolean; background?: string | null } = {}): void {
  if (to === window.location.pathname + window.location.search && !opts.replace) return;
  const state = opts.background ? { background: opts.background } : null;
  const prev = locationStore.get();
  if (opts.replace) history.replaceState(state, "", to);
  else history.pushState(state, "", to);
  const next = read();
  const hash = to.split("#")[1];
  commit(
    () => {
      locationStore.set(next);
      if (!hash && !opts.background) window.scrollTo({ top: 0 });
    },
    !opts.background && !prev.background && next.path !== prev.path,
  );
  if (hash) setTimeout(() => document.getElementById(hash)?.scrollIntoView({ block: "start" }), 60);
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
