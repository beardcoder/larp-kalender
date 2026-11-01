/**
 * Motion helpers (motion.dev). Uses the small WAAPI-based `motion/mini` animate with Motion's spring and
 * stagger generators, animating the individual CSS transform properties (translate, scale, rotate).
 * Everything respects prefers-reduced-motion.
 */

import { animate } from "motion/mini";
import { spring, stagger } from "motion";

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

export function sheetIn(sheet: Element, backdrop: Element | null, fromSide: boolean): void {
  if (reducedMotion()) return;
  animate(sheet, { translate: fromSide ? ["100% 0", "0 0"] : ["0 100%", "0 0"] }, { type: spring, stiffness: 380, damping: 38 });
  if (backdrop) animate(backdrop, { opacity: [0, 1] }, { duration: 0.2 });
}

export async function sheetOut(sheet: Element, backdrop: Element | null, fromSide: boolean): Promise<void> {
  if (reducedMotion()) return;
  const a = animate(sheet, { translate: fromSide ? ["0 0", "100% 0"] : ["0 0", "0 100%"] }, { duration: 0.22, ease: [0.4, 0, 1, 1] });
  if (backdrop) animate(backdrop, { opacity: [1, 0] }, { duration: 0.2 });
  await a;
}

export function pop(el: Element): void {
  if (reducedMotion()) return;
  animate(el, { scale: [1, 1.18, 1] }, { duration: 0.35, ease: "easeOut" });
}

export function fadeIn(el: Element): void {
  if (reducedMotion()) return;
  animate(el, { opacity: [0, 1], translate: ["0 6px", "0 0"] }, { duration: 0.25 });
}
