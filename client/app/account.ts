/** Frontend account: login/registration (same accounts as the backend) and bookmark sync across devices. */

import type { User } from "../../src/shared/types.ts";
import { createStore } from "../lib/store.ts";
import { favoritesStore } from "./state.ts";

export interface Account {
  user: User;
  favorites: number[];
  feedToken: string;
  staff: boolean;
}

/** undefined = not loaded yet, null = signed out. */
export const accountStore = createStore<Account | null | undefined>(undefined);

async function call<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const res = await fetch(`/api/account${path}`, {
    method,
    headers: { "x-requested-with": "larp-kalender", ...(body !== undefined ? { "content-type": "application/json" } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: "same-origin",
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `Fehler ${res.status}`);
  return data;
}

let syncing = false;

/** Merges local and server bookmarks after sign-in, so nothing marked on this device gets lost. */
async function adopt(account: Account): Promise<void> {
  syncing = true;
  const merged = [...new Set([...account.favorites, ...favoritesStore.get()])];
  favoritesStore.set(merged);
  syncing = false;
  accountStore.set({ ...account, favorites: merged });
  if (merged.length !== account.favorites.length) await pushFavorites();
}

let timer: ReturnType<typeof setTimeout> | null = null;
async function pushFavorites(): Promise<void> {
  if (!accountStore.get()) return;
  try {
    const { favorites } = await call<{ favorites: number[] }>("/favorites", "PUT", { ids: favoritesStore.get() });
    const current = accountStore.get();
    if (current) accountStore.set({ ...current, favorites });
  } catch {
    /* offline – retried with the next change or sign-in */
  }
}

favoritesStore.subscribe(() => {
  if (syncing || !accountStore.get()) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void pushFavorites(), 600);
});

export async function loadAccount(): Promise<void> {
  try {
    const data = await call<Account | { user: null }>("/me");
    if (data.user) await adopt(data as Account);
    else accountStore.set(null);
  } catch {
    accountStore.set(null);
  }
}

export async function login(email: string, password: string): Promise<void> {
  await adopt(await call<Account>("/login", "POST", { email, password }));
}

export async function register(input: { email: string; name: string; password: string; website?: string }): Promise<void> {
  const data = await call<Account | { user: null }>("/register", "POST", input);
  if (data.user) await adopt(data as Account);
}

export async function logout(): Promise<void> {
  await call("/logout", "POST", {});
  accountStore.set(null);
}

export async function updateProfile(input: { name?: string; password?: string; currentPassword?: string }): Promise<void> {
  const data = await call<Account>("/me", "PUT", input);
  accountStore.set({ ...data, favorites: favoritesStore.get() });
}

export async function deleteAccount(password: string): Promise<void> {
  await call("/me", "DELETE", { password });
  accountStore.set(null);
}

export async function rotateFeed(): Promise<void> {
  const { feedToken } = await call<{ feedToken: string }>("/feed-token", "POST", {});
  const current = accountStore.get();
  if (current) accountStore.set({ ...current, feedToken });
}
