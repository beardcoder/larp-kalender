"use client";

/** Tiny observable store mirrored to localStorage, read in components with `useStore`. */

import { useSyncExternalStore } from "react";

export interface Store<T> {
  get(): T;
  set(next: T | ((prev: T) => T)): void;
  subscribe(fn: () => void): () => void;
  /** Value used for server rendering and the first client render (before localStorage is read). */
  initial: T;
}

export function persistentStore<T>(key: string, initial: T): Store<T> {
  let value: T | undefined;
  const subs = new Set<() => void>();
  const read = (): T => {
    if (value !== undefined) return value;
    if (typeof window === "undefined") return initial;
    try {
      const raw = localStorage.getItem(key);
      value = raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      value = initial;
    }
    return value;
  };
  return {
    initial,
    get: read,
    set(next) {
      value = typeof next === "function" ? (next as (prev: T) => T)(read()) : next;
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch {
        /* storage unavailable (private mode) */
      }
      for (const fn of subs) fn();
    },
    subscribe(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
  };
}

export const useStore = <T,>(store: Store<T>): T => useSyncExternalStore(store.subscribe, store.get, () => store.initial);
