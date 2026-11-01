import { useStore } from "../../lib/store.ts";
import { accountStore, rotateFeed } from "../account.ts";
import { toast } from "../toast.tsx";
import { EmptyState, EventCard } from "../components.tsx";
import { eventsStore, favoritesStore, positionStore } from "../state.ts";
import { SubscribeLinks } from "./More.tsx";

export function FavoritesView() {
  const { events, today } = useStore(eventsStore);
  const favorites = useStore(favoritesStore);
  const position = useStore(positionStore);
  const account = useStore(accountStore);
  const list = events.filter((e) => favorites.includes(e.id));

  return (
    <section class="view view-favorites" aria-labelledby="fav-heading">
      <header class="view-head">
        <h1 id="fav-heading" class="view-title">Merkliste</h1>
        <p class="view-lead">
          {account ? (
            "Deine Merkliste ist mit deinem Konto verbunden und auf allen Geräten gleich."
          ) : (
            <>
              Gespeichert auf diesem Gerät. <a href="/mehr#konto">Melde dich an</a>, um sie überall dabei zu haben.
            </>
          )}
        </p>
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
            {account ? (
              <>
                <p>Dein persönlicher Feed: Neu gemerkte Termine erscheinen automatisch in deiner Kalender-App. Teile den Link nicht.</p>
                <SubscribeLinks params={{ feed: account.feedToken, name: "LARP – Meine Merkliste", deadlines: "1" }} />
                <button
                  class="link-btn small-link"
                  onClick={() => {
                    if (window.confirm("Neuen Link erzeugen? Bestehende Abos mit dem alten Link hören dann auf zu funktionieren."))
                      void rotateFeed().then(() => toast("Neuer Abo-Link erzeugt"));
                  }}
                >
                  Link zurücksetzen
                </button>
              </>
            ) : (
              <>
                <p>Abonniere genau diese Termine in deiner Kalender-App. Ohne Konto kommen neu gemerkte Termine erst mit einem neuen Abo-Link dazu.</p>
                <SubscribeLinks params={{ ids: favorites.join(","), name: "LARP – Meine Merkliste", deadlines: "1" }} />
              </>
            )}
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
