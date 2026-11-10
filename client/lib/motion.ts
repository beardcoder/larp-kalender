/**
 * Motion helpers (motion.dev). Uses the small WAAPI-based `motion/mini` animate with Motion's
 * stagger generators, animating the individual CSS transform properties (translate, scale, rotate).
 * Everything respects prefers-reduced-motion.
 */

import { animate } from "motion/mini";
import { stagger } from "motion";

export const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** The one orchestrated moment: seals are pressed into the page on first load. */
export function stampSeals(root: Element): void {
  if (reducedMotion()) return;
  const seals = [...root.querySelectorAll<HTMLElement>(".seal")].slice(0, 14);
  if (!seals.length) return;
  animate(
    seals,
    { scale: [1.35, 0.96, 1], rotate: ["-12deg", "2deg", "0deg"], opacity: [0, 1, 1] },
    { duration: 0.55, delay: stagger(0.045, { startDelay: 0.1 }), ease: [0.2, 0.9, 0.3, 1] },
  );
}

/** iOS-like deceleration without overshoot. */
const SHEET_EASE = [0.32, 0.72, 0, 1] as const;
const hidden = (fromSide: boolean) => (fromSide ? "100% 0" : "0 100%");

/**
 * Slides a sheet in. Must run before the first paint (useLayoutEffect): the start position is set inline
 * synchronously, so the sheet never flashes at its final position.
 */
export function sheetIn(sheet: HTMLElement, backdrop: HTMLElement | null, fromSide: boolean): void {
  if (reducedMotion()) return;
  sheet.style.translate = hidden(fromSide);
  if (backdrop) backdrop.style.opacity = "0";
  const a = animate(sheet, { translate: [hidden(fromSide), "0 0"] }, { duration: 0.36, ease: SHEET_EASE });
  const b = backdrop ? animate(backdrop, { opacity: [0, 1] }, { duration: 0.25, ease: "easeOut" }) : null;
  void Promise.all([a, b]).then(() => {
    sheet.style.translate = "";
    if (backdrop) backdrop.style.opacity = "";
  });
}

/** Slides a sheet out and keeps it hidden until it is unmounted (no snap back after the animation). */
export async function sheetOut(sheet: HTMLElement, backdrop: HTMLElement | null, fromSide: boolean): Promise<void> {
  if (reducedMotion()) return;
  // Start where the sheet is now (it may have been dragged down by the finger).
  const a = animate(sheet, { translate: [sheet.style.translate || "0 0", hidden(fromSide)] }, { duration: 0.24, ease: [0.4, 0, 1, 1] });
  const b = backdrop ? animate(backdrop, { opacity: [Number(backdrop.style.opacity || 1), 0] }, { duration: 0.22 }) : null;
  await Promise.all([a, b]);
  sheet.style.translate = hidden(fromSide);
  if (backdrop) backdrop.style.opacity = "0";
}

export function pop(el: Element): void {
  if (reducedMotion()) return;
  animate(el, { scale: [1, 1.18, 1] }, { duration: 0.35, ease: "easeOut" });
}

export function fadeIn(el: Element): void {
  if (reducedMotion()) return;
  animate(el, { opacity: [0, 1], translate: ["0 6px", "0 0"] }, { duration: 0.25 });
}
