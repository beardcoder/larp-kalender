import Link from "next/link";
import { EmptyState } from "@/components/event-bits.tsx";

export default function NotFound() {
  return (
    <section className="view">
      <EmptyState title="Seite nicht gefunden">
        <p>Diese Adresse gibt es im LARP-Kalender nicht (mehr).</p>
        <Link className="btn" href="/">
          Zu den Terminen
        </Link>
      </EmptyState>
    </section>
  );
}
