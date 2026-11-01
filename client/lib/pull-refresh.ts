/**
 * Pull-to-refresh for touch devices (needed in the installed PWA, which has no browser reload).
 * Pull down at the top of the page, release past the threshold to run `onRefresh`.
 */

const THRESHOLD = 72;
const MAX_PULL = 120;

export function setupPullToRefresh(onRefresh: () => Promise<void>): void {
  if (!window.matchMedia("(pointer: coarse)").matches) return;

  const indicator = document.createElement("div");
  indicator.className = "ptr";
  indicator.setAttribute("aria-hidden", "true");
  indicator.innerHTML =
    '<svg viewBox="0 0 24 24" width="22" height="22"><path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  document.body.append(indicator);

  let startY = 0;
  let startX = 0;
  let pull = 0;
  let tracking = false;
  let armed = false;
  let busy = false;

  const render = () => {
    const progress = Math.min(pull / THRESHOLD, 1);
    indicator.style.transform = `translate(-50%, ${pull - 56}px) rotate(${progress * 270}deg)`;
    indicator.style.opacity = String(Math.min(progress * 1.4, 1));
    indicator.classList.toggle("is-armed", pull >= THRESHOLD);
  };

  const reset = () => {
    indicator.classList.add("is-settling");
    pull = 0;
    render();
    setTimeout(() => indicator.classList.remove("is-settling", "is-busy"), 250);
  };

  window.addEventListener(
    "touchstart",
    (e) => {
      // Only at the very top, not while a sheet/dialog is open.
      if (busy || window.scrollY > 0 || document.body.classList.contains("no-scroll") || e.touches.length !== 1) return;
      startY = e.touches[0]!.clientY;
      startX = e.touches[0]!.clientX;
      tracking = true;
      armed = false;
      pull = 0;
    },
    { passive: true },
  );

  window.addEventListener(
    "touchmove",
    (e) => {
      if (!tracking) return;
      const dy = e.touches[0]!.clientY - startY;
      const dx = e.touches[0]!.clientX - startX;
      // Horizontal swipes (genre chips) and upward scrolling are not pulls.
      if (dy <= 0 || Math.abs(dx) > dy || window.scrollY > 0) {
        if (pull) reset();
        tracking = pull > 0 && dy > 0;
        return;
      }
      pull = Math.min(dy * 0.55, MAX_PULL);
      if (pull >= THRESHOLD && !armed) {
        armed = true;
        navigator.vibrate?.(8);
      } else if (pull < THRESHOLD) armed = false;
      render();
    },
    { passive: true },
  );

  window.addEventListener("touchend", async () => {
    if (!tracking) return;
    tracking = false;
    if (pull < THRESHOLD) return reset();
    busy = true;
    indicator.classList.add("is-busy", "is-settling");
    pull = THRESHOLD;
    render();
    try {
      await onRefresh();
    } finally {
      busy = false;
      reset();
    }
  });
}

/** Checks for a new app version; if one is installed, reloads the page so it takes effect. */
export async function updateApp(): Promise<boolean> {
  if (!("serviceWorker" in navigator)) return false;
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return false;
  await reg.update().catch(() => undefined);
  if (!reg.installing && !reg.waiting) return false;
  // The service worker activates itself (skipWaiting); wait for it to take control, then reload.
  await new Promise<void>((resolve) => {
    navigator.serviceWorker.addEventListener("controllerchange", () => resolve(), { once: true });
    setTimeout(resolve, 6000);
  });
  location.reload();
  return true;
}
