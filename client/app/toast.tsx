import { useEffect, useRef } from "preact/hooks";
import { createStore, useStore } from "../lib/store.ts";
import { fadeIn } from "../lib/motion.ts";

interface Toast {
  id: number;
  text: string;
}

const toastStore = createStore<Toast[]>([]);
let nextId = 1;

export function toast(text: string): void {
  const id = nextId++;
  toastStore.set((t) => [...t.slice(-2), { id, text }]);
  setTimeout(() => toastStore.set((t) => t.filter((x) => x.id !== id)), 3200);
}

function ToastItem({ text }: { text: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) fadeIn(ref.current);
  }, []);
  return (
    <div class="toast" ref={ref}>
      {text}
    </div>
  );
}

export function Toasts() {
  const toasts = useStore(toastStore);
  return (
    <div class="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <ToastItem key={t.id} text={t.text} />
      ))}
    </div>
  );
}
