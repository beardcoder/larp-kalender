"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { setAppBadge, useNotices } from "@/lib/client/notices.ts";
import { favoritesStore } from "@/lib/client/state.ts";
import { useStore } from "@/lib/client/store.ts";
import { useAppData } from "./AppData.tsx";
import { Icon, type IconName } from "./Icon.tsx";
import { Toasts } from "./Toasts.tsx";

const TABS: { path: string; label: string; icon: IconName }[] = [
  { path: "/", label: "Termine", icon: "list" },
  { path: "/kalender", label: "Kalender", icon: "calendar" },
  { path: "/merkliste", label: "Merkliste", icon: "bookmark" },
  { path: "/mehr", label: "Mehr", icon: "more" },
];

function Brand() {
  return (
    <Link className="brand" href="/" aria-label="LARP-Kalender, zur Startseite">
      <img src="/icons/icon.svg" alt="" width={34} height={34} />
      <span>LARP-Kalender</span>
    </Link>
  );
}

/** App frame: sidebar on wide screens, top bar and tab bar on phones. */
export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { account, events, activity, today } = useAppData();
  const favorites = useStore(favoritesStore);
  const { unread } = useNotices(events, activity, today);
  useEffect(() => setAppBadge(unread.size), [unread.size]);

  const active = (p: string) => (p === "/" ? path === "/" : path.startsWith(p));
  const current = (p: string) => (active(p) ? { className: "is-active", "aria-current": "page" as const } : {});
  const bellLabel = unread.size ? `Benachrichtigungen, ${unread.size} neu` : "Benachrichtigungen";
  const initial = account?.name.slice(0, 1).toUpperCase();

  return (
    <div className="shell">
      <aside className="sidebar">
        <Brand />
        <nav className="side-nav" aria-label="Hauptnavigation">
          {TABS.map((t) => (
            <Link key={t.path} href={t.path} {...current(t.path)}>
              <Icon name={t.icon} />
              <span>{t.label}</span>
              {t.path === "/merkliste" && favorites.length ? <span className="badge">{favorites.length}</span> : null}
            </Link>
          ))}
          <Link href="/benachrichtigungen" {...current("/benachrichtigungen")} aria-label={bellLabel}>
            <Icon name="bell" />
            <span>Benachrichtigungen</span>
            {unread.size ? <span className="badge">{unread.size}</span> : null}
          </Link>
        </nav>
        <Link className="btn ghost side-suggest" href="/vorschlagen">
          <Icon name="plus" size={18} /> Termin vorschlagen
        </Link>
        <Link className="side-account" href="/mehr#konto">
          {account ? <span className="avatar small">{initial}</span> : <Icon name="users" size={18} />}
          <span>{account ? account.name : "Anmelden oder registrieren"}</span>
        </Link>
      </aside>

      <header className="topbar">
        <Brand />
        <span className="topbar-end">
          <Link className={`bell-link${active("/benachrichtigungen") ? " is-active" : ""}`} href="/benachrichtigungen" aria-label={bellLabel}>
            <Icon name="bell" size={22} />
            {unread.size ? <span className="bell-count">{unread.size > 9 ? "9+" : unread.size}</span> : null}
          </Link>
          <Link className="account-link" href="/mehr#konto" aria-label={account ? `Konto: ${account.name}` : "Anmelden"}>
            {account ? <span className="avatar small">{initial}</span> : <span>Anmelden</span>}
          </Link>
        </span>
      </header>

      <main className="main" id="main">
        {children}
      </main>

      <nav className="tabbar" aria-label="Hauptnavigation">
        {TABS.map((t) => (
          <Link key={t.path} href={t.path} {...current(t.path)}>
            <span className="tab-icon">
              <Icon name={t.icon} size={22} />
              {t.path === "/merkliste" && favorites.length ? <span className="dot" /> : null}
            </span>
            <span>{t.label}</span>
          </Link>
        ))}
      </nav>
      <Toasts />
    </div>
  );
}
