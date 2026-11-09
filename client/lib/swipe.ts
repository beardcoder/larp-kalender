/**
 * iOS-style swipe to dismiss for list rows: drag the row to the left, release past ~35 % of its width (or flick)
 * and it slides out while the row collapses. Vertical scrolling keeps working (`touch-action: pan-y` on the row).
 */

import { animate } from "motion/mini";
import { reducedMotion } from "./motion.ts";

const EASE = [0.32, 0.72, 0, 1] as const;

/** Slides the row out, collapses its list item, then calls `done`. Also used by the dismiss button. */
export async function dismissRow(row: HTMLElement, item: HTMLElement, done: () => void): Promise<void> {
  if (!reducedMotion()) {
    item.classList.add("is-armed");
    await animate(row, { translate: [row.style.translate || "0px 0", `${-item.offsetWidth - 24}px 0`] }, { duration: 0.22, ease: [0.4, 0, 1, 1] });
    item.style.overflow = "hidden";
    await animate(item, { height: [`${item.offsetHeight}px`, "0px"], opacity: [1, 0] }, { duration: 0.22, ease: EASE });
  }
  done();
}

/**
 * Attaches the gesture to `row` (the moving part) inside `item` (the list item that collapses).
 * Returns a cleanup function. Clicks right after a drag are swallowed so the row's link does not open.
 */
export function attachSwipe(row: HTMLElement, item: HTMLElement, onDismiss: () => void): () => void {
  let startX = 0;
  let startY = 0;
  let startT = 0;
  let dx = 0;
  let pointer: number | null = null;
  let dragging = false;
  let armed = false;
  let swallowClick = false;

  const setOffset = (x: number) => {
    row.style.translate = `${x}px 0`;
    item.style.setProperty("--reveal", String(Math.min(Math.abs(Math.min(x, 0)) / (item.offsetWidth * 0.35), 1)));
  };

  const down = (e: PointerEvent) => {
    if (e.button !== 0 || pointer !== null) return;
    pointer = e.pointerId;
    startX = e.clientX;
    startY = e.clientY;
    startT = performance.now();
    dx = 0;
    dragging = false;
    armed = false;
  };

  const move = (e: PointerEvent) => {
    if (e.pointerId !== pointer) return;
    const mx = e.clientX - startX;
    const my = e.clientY - startY;
    if (!dragging) {
      if (Math.abs(my) > 10 && Math.abs(my) > Math.abs(mx)) return void (pointer = null); // vertical scroll
      if (Math.abs(mx) < 10 || Math.abs(mx) < Math.abs(my) * 1.2) return;
      dragging = true;
      item.classList.add("is-swiping");
      row.setPointerCapture(e.pointerId);
    }
    // Free movement to the left, rubber band to the right.
    dx = mx < 0 ? mx : mx * 0.2;
    setOffset(dx);
    const past = dx < -item.offsetWidth * 0.35;
    if (past !== armed) {
      armed = past;
      item.classList.toggle("is-armed", armed);
      if (armed) navigator.vibrate?.(8);
    }
  };

  const up = (e: PointerEvent) => {
    if (e.pointerId !== pointer) return;
    pointer = null;
    if (!dragging) return;
    dragging = false;
    swallowClick = true;
    setTimeout(() => (swallowClick = false), 50);
    item.classList.remove("is-swiping");
    const velocity = dx / Math.max(performance.now() - startT, 1); // px per ms
    if (armed || (velocity < -0.6 && dx < -40)) {
      void dismissRow(row, item, onDismiss);
    } else {
      item.classList.remove("is-armed");
      const from = dx;
      void animate(row, { translate: [`${from}px 0`, "0px 0"] }, { duration: 0.3, ease: EASE }).then(() => {
        row.style.translate = "";
        item.style.removeProperty("--reveal");
      });
    }
  };

  const click = (e: MouseEvent) => {
    if (!swallowClick) return;
    e.preventDefault();
    e.stopPropagation();
  };

  row.addEventListener("pointerdown", down);
  row.addEventListener("pointermove", move);
  row.addEventListener("pointerup", up);
  row.addEventListener("pointercancel", up);
  row.addEventListener("click", click, true);
  return () => {
    row.removeEventListener("pointerdown", down);
    row.removeEventListener("pointermove", move);
    row.removeEventListener("pointerup", up);
    row.removeEventListener("pointercancel", up);
    row.removeEventListener("click", click, true);
  };
}
