import { useStore } from "../lib/store.ts";
import { useLocation } from "../lib/router.ts";
import { EmptyState, Icon, type IconName } from "./components.tsx";
import { eventsStore, favoritesStore } from "./state.ts";
import { accountStore } from "./account.ts";
import { Toasts } from "./toast.tsx";
import { CalendarView } from "./views/Calendar.tsx";
import { DetailView } from "./views/Detail.tsx";
import { FavoritesView } from "./views/Favorites.tsx";
import { ListView } from "./views/List.tsx";
import { MoreView } from "./views/More.tsx";
import { NotificationsView } from "./views/Notifications.tsx";
import { noticesStore } from "./notifications.ts";
import { SuggestView } from "./views/Suggest.tsx";

const TABS: { path: string; label: string; icon: IconName }[] = [
  { path: "/", label: "Termine", icon: "list" },
  { path: "/kalender", label: "Kalender", icon: "calendar" },
  { path: "/merkliste", label: "Merkliste", icon: "bookmark" },
  { path: "/mehr", label: "Mehr", icon: "more" },
];

function View({ path }: { path: string }) {
  switch (path) {
    case "/":
      return <ListView />;
    case "/kalender":
      return <CalendarView />;
    case "/merkliste":
      return <FavoritesView />;
    case "/mehr":
      return <MoreView />;
    case "/vorschlagen":
      return <SuggestView />;
    case "/benachrichtigungen":
      return <NotificationsView />;
    default:
      return (
        <section class="view">
          <EmptyState title="Seite nicht gefunden">
            <p>Diese Adresse gibt es im LARP-Kalender nicht.</p>
            <a class="btn" href="/">
              Zu den Terminen
            </a>
          </EmptyState>
        </section>
      );
  }
}

function Brand() {
  return (
    <a class="brand" href="/" aria-label="LARP-Kalender, zur Startseite">
      <img src="/icons/icon.svg" alt="" width="34" height="34" />
      <span>LARP-Kalender</span>
    </a>
  );
}

export function App() {
  const loc = useLocation();
  const favorites = useStore(favoritesStore);
  const { offline } = useStore(eventsStore);
  const account = useStore(accountStore);
  const { unread } = useStore(noticesStore);
  const unreadLabel = unread.size ? `Benachrichtigungen, ${unread.size} neu` : "Benachrichtigungen";
  const accountLink = (
    <a class="account-link" href="/mehr#konto" aria-label={account ? `Konto: ${account.user.name}` : "Anmelden"}>
      {account ? <span class="avatar small">{account.user.name.slice(0, 1).toUpperCase()}</span> : <span>Anmelden</span>}
    </a>
  );
  const detail = loc.path.match(/^\/termin\/([^/]+)\/?$/);
  const basePath = detail ? new URL(loc.background ?? "/", location.origin).pathname : loc.path;
  const active = (p: string) => (p === "/" ? basePath === "/" : basePath.startsWith(p));

  return (
    <div class="shell">
      <aside class="sidebar">
        <Brand />
        <nav class="side-nav" aria-label="Hauptnavigation">
          {TABS.map((t) => (
            <a key={t.path} href={t.path} class={active(t.path) ? "is-active" : ""} aria-current={active(t.path) ? "page" : undefined}>
              <Icon name={t.icon} />
              <span>{t.label}</span>
              {t.path === "/merkliste" && favorites.length ? <span class="badge">{favorites.length}</span> : null}
            </a>
          ))}
          <a href="/benachrichtigungen" class={active("/benachrichtigungen") ? "is-active" : ""} aria-current={active("/benachrichtigungen") ? "page" : undefined} aria-label={unreadLabel}>
            <Icon name="bell" />
            <span>Benachrichtigungen</span>
            {unread.size ? <span class="badge">{unread.size}</span> : null}
          </a>
        </nav>
        <a class="btn ghost side-suggest" href="/vorschlagen">
          <Icon name="plus" size={18} /> Termin vorschlagen
        </a>
        {account !== undefined ? (
          <a class="side-account" href="/mehr#konto">
            {account ? (
              <>
                <span class="avatar small">{account.user.name.slice(0, 1).toUpperCase()}</span>
                <span>{account.user.name}</span>
              </>
            ) : (
              <>
                <Icon name="users" size={18} />
                <span>Anmelden oder registrieren</span>
              </>
            )}
          </a>
        ) : null}
      </aside>

      <div class="topbar">
        <Brand />
        <span class="topbar-end">
          {offline ? <span class="offline">Offline</span> : null}
          <a class={`bell-link${active("/benachrichtigungen") ? " is-active" : ""}`} href="/benachrichtigungen" aria-label={unreadLabel}>
            <Icon name="bell" size={22} />
            {unread.size ? <span class="bell-count">{unread.size > 9 ? "9+" : unread.size}</span> : null}
          </a>
          {account !== undefined ? accountLink : null}
        </span>
      </div>

      <main class="main" id="main">
        <View path={basePath} />
      </main>

      <nav class="tabbar" aria-label="Hauptnavigation">
        {TABS.map((t) => (
          <a key={t.path} href={t.path} class={active(t.path) ? "is-active" : ""} aria-current={active(t.path) ? "page" : undefined}>
            <span class="tab-icon">
              <Icon name={t.icon} size={22} />
              {t.path === "/merkliste" && favorites.length ? <span class="dot" /> : null}
            </span>
            <span>{t.label}</span>
          </a>
        ))}
      </nav>

      {detail ? <DetailView key={detail[1]} slug={decodeURIComponent(detail[1]!)} /> : null}
      <Toasts />
    </div>
  );
}
