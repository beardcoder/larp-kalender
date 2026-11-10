/**
 * Swipe down to close a bottom sheet, like iOS: the sheet follows the finger when the drag starts on the grip/header
 * or while its content is scrolled to the top; released far enough (or flicked) it closes, otherwise it springs back.
 * Touch events (not pointer events) so the drag can take over from native scrolling on iOS.
 */

import { animate } from "motion/mini";
import { reducedMotion } from "./motion.ts";

export function attachSheetDrag(sheet: HTMLElement, body: HTMLElement, backdrop: HTMLElement | null, onClose: () => void): () => void {
  let startX = 0;
  let startY = 0;
  let startT = 0;
  let dy = 0;
  let tracking = false;
  let dragging = false;
  let fromHeader = false;

  const set = (y: number) => {
    sheet.style.translate = `0 ${y}px`;
    if (backdrop) backdrop.style.opacity = String(Math.max(1 - y / sheet.offsetHeight, 0));
  };

  const start = (e: TouchEvent) => {
    if (e.touches.length !== 1) return (tracking = false);
    const target = e.target as HTMLElement;
    // Sliders and horizontally scrolling chip rows keep their own gestures.
    if (target.closest("input[type=range], textarea, select")) return (tracking = false);
    tracking = true;
    dragging = false;
    dy = 0;
    startX = e.touches[0]!.clientX;
    startY = e.touches[0]!.clientY;
    startT = performance.now();
    fromHeader = !body.contains(target);
  };

  const move = (e: TouchEvent) => {
    if (!tracking) return;
    const t = e.touches[0]!;
    const my = t.clientY - startY;
    const mx = t.clientX - startX;
    if (!dragging) {
      if (Math.abs(mx) > 8 && Math.abs(mx) > Math.abs(my)) return void (tracking = false); // horizontal swipe
      if (my < 6) {
        if (my < -6) tracking = false; // scrolling up: leave it to the content
        return;
      }
      if (!fromHeader && body.scrollTop > 0) return void (tracking = false); // content scrolls first
      dragging = true;
      startY = t.clientY; // no jump at the moment the drag takes over
      startT = performance.now();
    }
    e.preventDefault();
    dy = Math.max(t.clientY - startY, 0);
    set(dy);
  };

  const end = () => {
    if (!tracking) return;
    tracking = false;
    if (!dragging) return;
    dragging = false;
    const velocity = dy / Math.max(performance.now() - startT, 1); // px per ms
    if (dy > sheet.offsetHeight * 0.25 || (velocity > 0.5 && dy > 30)) {
      navigator.vibrate?.(6);
      onClose();
    } else if (reducedMotion()) {
      sheet.style.translate = "";
      if (backdrop) backdrop.style.opacity = "";
    } else {
      const from = dy;
      void Promise.all([
        animate(sheet, { translate: [`0 ${from}px`, "0 0"] }, { duration: 0.32, ease: [0.32, 0.72, 0, 1] }),
        backdrop ? animate(backdrop, { opacity: [backdrop.style.opacity || "1", "1"] }, { duration: 0.25 }) : null,
      ]).then(() => {
        sheet.style.translate = "";
        if (backdrop) backdrop.style.opacity = "";
      });
    }
  };

  sheet.addEventListener("touchstart", start, { passive: true });
  sheet.addEventListener("touchmove", move, { passive: false });
  sheet.addEventListener("touchend", end);
  sheet.addEventListener("touchcancel", end);
  return () => {
    sheet.removeEventListener("touchstart", start);
    sheet.removeEventListener("touchmove", move);
    sheet.removeEventListener("touchend", end);
    sheet.removeEventListener("touchcancel", end);
  };
}
