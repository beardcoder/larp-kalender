import { useStore } from "../../lib/store.ts";
import { EmptyState, EventCard } from "../components.tsx";
import { eventsStore, favoritesStore, positionStore } from "../state.ts";
import { SubscribeLinks } from "./More.tsx";

export function FavoritesView() {
  const { events, today } = useStore(eventsStore);
  const favorites = useStore(favoritesStore);
  const position = useStore(positionStore);
  const list = events.filter((e) => favorites.includes(e.id));

  return (
    <section class="view view-favorites" aria-labelledby="fav-heading">
      <header class="view-head">
        <h1 id="fav-heading" class="view-title">Merkliste</h1>
        <p class="view-lead">Gemerkte Veranstaltungen bleiben auf diesem Gerät gespeichert.</p>
      </header>
      {list.length ? (
        <>
          <div class="cards">
            {list.map((e) => (
              <EventCard key={e.id} event={e} today={today} favorite position={position} />
            ))}
          </div>
          <section class="panel">
            <h2>Merkliste im Kalender</h2>
            <p>Abonniere genau diese Termine in deiner Kalender-App. Neu gemerkte Termine kommen erst mit einem neuen Abo-Link dazu.</p>
            <SubscribeLinks params={{ ids: favorites.join(","), name: "LARP – Meine Merkliste", deadlines: "1" }} />
          </section>
        </>
      ) : (
        <EmptyState title="Noch nichts gemerkt">
          <p>Öffne eine Veranstaltung und tippe auf „Merken“. Mit Benachrichtigungen erinnern wir dich an Anmeldeschluss und Beginn.</p>
          <a class="btn" href="/">
            Termine ansehen
          </a>
        </EmptyState>
      )}
    </section>
  );
}
