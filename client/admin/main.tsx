import { render } from "preact";
import { useEffect, useState } from "preact/hooks";
import "../app/styles.css";
import "./admin.css";
import { interceptLinks, useLocation } from "../lib/router.ts";
import { useStore } from "../lib/store.ts";
import { Icon, type IconName } from "../app/components.tsx";
import { Toasts } from "../app/toast.tsx";
import { applyTheme, themeStore } from "../lib/theme.ts";
import { api, userStore, type Meta, type User } from "./api.ts";
import { EventForm } from "./EventForm.tsx";
import { ConnectPage, EventsPage, LoginPage, ProfilePage, UsersPage } from "./pages.tsx";

function Admin() {
  const user = useStore(userStore);
  const loc = useLocation();
  const [meta, setMeta] = useState<Meta | null>(null);

  useEffect(() => {
    api<{ user: User }>("/me")
      .then((d) => userStore.set(d.user))
      .catch(() => userStore.set(null));
  }, []);

  const reloadMeta = () => void api<Meta>("/meta").then(setMeta).catch(() => undefined);
  useEffect(() => {
    if (user) reloadMeta();
  }, [user?.id, loc.path]);

  if (user === undefined) return null;
  if (user === null) return <LoginPage />;
  if (!meta) return null;

  const nav: { path: string; label: string; icon: IconName; admin?: boolean }[] = [
    { path: "/admin", label: "Veranstaltungen", icon: "list" },
    { path: "/admin/verbindungen", label: "KI & Schnittstellen", icon: "link" },
    { path: "/admin/benutzer", label: "Benutzer", icon: "users", admin: true },
    { path: "/admin/profil", label: "Profil", icon: "flag" },
  ];
  const isActive = (p: string) => (p === "/admin" ? loc.path === "/admin" || loc.path.startsWith("/admin/veranstaltung") : loc.path.startsWith(p));

  const editMatch = loc.path.match(/^\/admin\/veranstaltung\/(neu|\d+)$/);
  let page;
  if (editMatch) page = <EventForm key={editMatch[1]} id={editMatch[1] === "neu" ? null : Number(editMatch[1])} meta={meta} />;
  else if (loc.path === "/admin/verbindungen") page = <ConnectPage />;
  else if (loc.path === "/admin/benutzer" && user.role === "admin") page = <UsersPage meta={meta} />;
  else if (loc.path === "/admin/profil") page = <ProfilePage />;
  else page = <EventsPage meta={meta} reloadMeta={reloadMeta} />;

  return (
    <div class="shell admin">
      <aside class="sidebar">
        <a class="brand" href="/" data-native>
          <img src="/icons/icon.svg" alt="" width="34" height="34" />
          <span>Redaktion</span>
        </a>
        <nav class="side-nav" aria-label="Redaktion">
          {nav
            .filter((n) => !n.admin || user.role === "admin")
            .map((n) => (
              <a key={n.path} href={n.path} class={isActive(n.path) ? "is-active" : ""} aria-current={isActive(n.path) ? "page" : undefined}>
                <Icon name={n.icon} />
                <span>{n.label}</span>
                {n.path === "/admin" && meta.stats.drafts ? <span class="badge">{meta.stats.drafts}</span> : null}
              </a>
            ))}
        </nav>
        <p class="side-foot">
          {user.name} · v{meta.version}
        </p>
      </aside>
      <nav class="admin-topnav" aria-label="Redaktion">
        {nav
          .filter((n) => !n.admin || user.role === "admin")
          .map((n) => (
            <a key={n.path} href={n.path} class={isActive(n.path) ? "is-active" : ""}>
              <Icon name={n.icon} size={18} />
              <span>{n.label}</span>
            </a>
          ))}
      </nav>
      <main class="main">{page}</main>
      <Toasts />
    </div>
  );
}

applyTheme(themeStore.get());
const root = document.getElementById("app")!;
interceptLinks(root, "admin");
render(<Admin />, root);
