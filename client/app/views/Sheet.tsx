import type { ComponentChildren } from "preact";
import { useEffect, useRef } from "preact/hooks";
import { sheetIn, sheetOut } from "../../lib/motion.ts";
import { Icon } from "../components.tsx";

const isWide = () => window.matchMedia("(min-width: 960px)").matches;

/**
 * Modal sheet: slides up from the bottom on phones, in from the right on wide screens.
 * Children get an animated `close` function.
 */
export function Sheet({
  title,
  onClose,
  children,
  variant = "dialog",
  hideTitle = false,
}: {
  title: string;
  onClose: () => void;
  children: (close: () => void) => ComponentChildren;
  variant?: "dialog" | "panel";
  hideTitle?: boolean;
}) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const closing = useRef(false);
  const side = variant === "panel" && isWide();

  const close = async () => {
    if (closing.current) return;
    closing.current = true;
    if (sheetRef.current) await sheetOut(sheetRef.current, backdropRef.current, side);
    onClose();
  };

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    if (sheetRef.current) {
      sheetIn(sheetRef.current, backdropRef.current, side);
      sheetRef.current.focus({ preventScroll: true });
    }
    document.body.classList.add("no-scroll");
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") void close();
      if (e.key === "Tab" && sheetRef.current) {
        // Keep focus inside the sheet.
        const focusable = sheetRef.current.querySelectorAll<HTMLElement>("a[href],button:not([disabled]),input,select,textarea,[tabindex='0']");
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) (last?.focus(), e.preventDefault());
        else if (!e.shiftKey && document.activeElement === last) (first?.focus(), e.preventDefault());
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.classList.remove("no-scroll");
      previous?.focus?.({ preventScroll: true });
    };
  }, []);

  return (
    <div class={`sheet-layer sheet-${variant}`}>
      <div class="sheet-backdrop" ref={backdropRef} onClick={() => void close()} />
      <div class="sheet" ref={sheetRef} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}>
        <div class="sheet-grip" aria-hidden="true" />
        <header class={`sheet-head${hideTitle ? " is-bare" : ""}`}>
          {hideTitle ? null : <h2>{title}</h2>}
          <button class="icon-btn" onClick={() => void close()} aria-label="Schließen">
            <Icon name="close" />
          </button>
        </header>
        <div class="sheet-body">{children(() => void close())}</div>
      </div>
    </div>
  );
}
