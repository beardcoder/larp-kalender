"use client";

import Link from "next/link";
import { rotateFeedToken } from "@/app/actions.ts";
import { favoritesStore } from "@/lib/client/state.ts";
import { useStore } from "@/lib/client/store.ts";
import { useAppData } from "../AppData.tsx";
import { EmptyState } from "../event-bits.tsx";
import { toast } from "../Toasts.tsx";
import { Cards } from "./EventList.tsx";
import { SubscribeLinks } from "./SubscribeLinks.tsx";

export function FavoritesView() {
  const { events, account } = useAppData();
  const favorites = useStore(favoritesStore);
  const list = events.filter((e) => favorites.includes(e.id));

  return (
    <section className="view view-favorites" aria-labelledby="fav-heading">
      <header className="view-head">
        <h1 id="fav-heading" className="view-title">
          Merkliste
        </h1>
        <p className="view-lead">
          {account ? (
            "Deine Merkliste ist mit deinem Konto verbunden und auf allen Geräten gleich."
          ) : (
            <>
              Gespeichert auf diesem Gerät. <Link href="/mehr#konto">Melde dich an</Link>, um sie überall dabei zu haben.
            </>
          )}
        </p>
      </header>
      {list.length ? (
        <>
          <Cards events={list} />
          <section className="panel">
            <h2>Merkliste im Kalender</h2>
            {account ? (
              <>
                <p>Dein persönlicher Feed: Neu gemerkte Termine erscheinen automatisch in deiner Kalender-App. Teile den Link nicht.</p>
                <SubscribeLinks params={{ feed: account.feedToken, name: "LARP – Meine Merkliste", deadlines: "1" }} />
                <button
                  className="link-btn small-link"
                  onClick={() => {
                    if (confirm("Neuen Link erzeugen? Bestehende Abos mit dem alten Link hören dann auf zu funktionieren."))
                      void rotateFeedToken().then(() => toast("Neuer Abo-Link erzeugt"));
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
          <Link className="btn" href="/">
            Termine ansehen
          </Link>
        </EmptyState>
      )}
    </section>
  );
}
