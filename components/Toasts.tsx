"use client";

import { useSyncExternalStore } from "react";

type Toast = { id: number; text: string };
let toasts: Toast[] = [];
let nextId = 1;
const subs = new Set<() => void>();
const emit = () => subs.forEach((fn) => fn());

export function toast(text: string): void {
  const id = nextId++;
  toasts = [...toasts.slice(-2), { id, text }];
  emit();
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id);
    emit();
  }, 3200);
}

const none: Toast[] = [];

export function Toasts() {
  const list = useSyncExternalStore(
    (fn) => (subs.add(fn), () => subs.delete(fn)),
    () => toasts,
    () => none,
  );
  return (
    <div className="toasts" role="status" aria-live="polite">
      {list.map((t) => (
        <div className="toast" key={t.id}>
          {t.text}
        </div>
      ))}
    </div>
  );
}
