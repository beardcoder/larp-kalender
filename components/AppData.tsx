"use client";

/**
 * Data the public layout loads on the server (events, activity, account), shared with client components,
 * plus the app-wide side effects: theme, bookmark sync, live refresh, service worker and push.
 */

import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { saveFavorites } from "@/app/actions.ts";
import { startPushSync } from "@/lib/client/push.ts";
import { applyTheme, favoritesStore, lastVisitStore, themeStore } from "@/lib/client/state.ts";
import { useStore } from "@/lib/client/store.ts";
import type { ActivityItem, LarpEvent } from "@/lib/shared/types.ts";
import { toast } from "./Toasts.tsx";

export interface Account {
  name: string;
  email: string;
  favorites: number[];
  feedToken: string;
  staff: boolean;
}

export interface AppDataValue {
  events: LarpEvent[];
  activity: ActivityItem[];
  today: string;
  account: Account | null;
  /** Events created after this moment are marked "Neu" (previous visit; null on the first visit). */
  newSince: string | null;
}

const Ctx = createContext<AppDataValue | null>(null);
export const useAppData = () => useContext(Ctx)!;

export function AppData({ children, ...data }: Omit<AppDataValue, "newSince"> & { children: React.ReactNode }) {
  const router = useRouter();
  const theme = useStore(themeStore);
  const favorites = useStore(favoritesStore);
  const [newSince, setNewSince] = useState<string | null>(null);

  useEffect(() => applyTheme(theme), [theme]);

  // Remember this visit for the "Neu" markers of the next one.
  useEffect(() => {
    setNewSince(lastVisitStore.get());
    const t = setTimeout(() => lastVisitStore.set(new Date().toISOString()), 10_000);
    return () => clearTimeout(t);
  }, []);

  // Signed in: merge device and account bookmarks once, then push every change to the account.
  const merged = useRef(false);
  const email = data.account?.email;
  useEffect(() => {
    merged.current = false;
    if (!data.account) return;
    const union = [...new Set([...data.account.favorites, ...favoritesStore.get()])];
    favoritesStore.set(union);
    merged.current = true;
    // Runs once per sign-in; the account's favorites are read at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email]);
  useEffect(() => {
    if (!merged.current) return;
    const t = setTimeout(() => void saveFavorites(favorites), 600);
    return () => clearTimeout(t);
  }, [favorites]);

  // Live: the server hints that events or activity changed, the page re-renders with fresh server data.
  useEffect(() => {
    let source: EventSource | null = null;
    let wasOpen = false;
    const refresh = () => router.refresh();
    const open = () => {
      if (source) return;
      source = new EventSource("/api/live");
      source.addEventListener("events", refresh);
      source.addEventListener("activity", refresh);
      source.addEventListener("open", () => (wasOpen ? refresh() : (wasOpen = true)));
    };
    const close = () => (source?.close(), (source = null));
    const onVisibility = () => (document.visibilityState === "visible" ? open() : close());
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", refresh);
    onVisibility();
    return () => {
      close();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", refresh);
    };
  }, [router]);

  // Service worker: offline shell and push. Messages: a push arrived, or a notification was tapped.
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then(() => startPushSync())
      .catch((err) => console.warn("Service worker registration failed", err));
    const onMessage = (e: MessageEvent) => {
      const msg = e.data as { type?: string; url?: string; title?: string };
      if (msg?.type === "push") {
        router.refresh();
        if (msg.title) toast(msg.title);
      } else if (msg?.type === "navigate" && msg.url?.startsWith("/")) router.push(msg.url);
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [router]);

  return <Ctx.Provider value={{ ...data, newSince }}>{children}</Ctx.Provider>;
}
