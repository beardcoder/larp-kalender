import { persistentStore } from "./store.ts";

/* ---------- appearance ---------- */

export type Theme = "auto" | "dark" | "light";
export const themeStore = persistentStore<Theme>("lk.theme", "auto");

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === "auto") delete root.dataset.theme;
  else root.dataset.theme = theme;
  const dark = theme === "dark" || (theme === "auto" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#0e0b16" : "#f6f4fb");
}
themeStore.subscribe(applyTheme);
