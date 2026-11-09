import { useEffect, useRef, useState } from "preact/hooks";
import { useStore } from "../../lib/store.ts";
import { formatDate } from "../../../src/shared/format.ts";
import { EmptyState, Icon, type IconName } from "../components.tsx";
import { markAllSeen, markSeen, noticesStore, type Notice } from "../notifications.ts";
import { enablePush, needsInstallForPush, pushPrefsStore, pushSupported } from "../push.ts";
import { toast } from "../toast.tsx";

const rtf = new Intl.RelativeTimeFormat("de", { numeric: "auto" });

/** "gerade eben", "vor 3 Stunden", "gestern", "12. Oktober 2026" */
export function relativeTime(iso: string, now = Date.now()): string {
  const t = iso.length === 10 ? new Date(`${iso}T09:00:00`).getTime() : Date.parse(iso);
  const minutes = Math.round((now - t) / 60_000);
  if (minutes < 1) return "gerade eben";
  if (minutes < 60) return rtf.format(-minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (hours < 24 && new Date(t).toDateString() === new Date(now).toDateString()) return rtf.format(-hours, "hour");
  const days = Math.round((new Date(now).setHours(0, 0, 0, 0) - new Date(t).setHours(0, 0, 0, 0)) / 86_400_000);
  if (days < 7) return rtf.format(-days, "day");
  return formatDate(new Date(t).toLocaleDateString("sv-SE"));
}

function groupLabel(iso: string, now = Date.now()): string {
  const day = new Date(Date.parse(iso)).setHours(0, 0, 0, 0);
  const days = Math.round((new Date(now).setHours(0, 0, 0, 0) - day) / 86_400_000);
  if (days <= 0) return "Heute";
  if (days === 1) return "Gestern";
  if (days < 7) return "Diese Woche";
  return "Früher";
}

function iconFor(n: Notice): { icon: IconName; tone: string } {
  if (n.kind === "reminder") return n.reminder === "start" ? { icon: "flag", tone: "start" } : { icon: "clock", tone: "deadline" };
  if (n.kind === "new") return { icon: "sparkle", tone: "new" };
  if (n.cancelled) return { icon: "close", tone: "cancelled" };
  return { icon: "refresh", tone: "change" };
}

function NoticeRow({ n, unread }: { n: Notice; unread: boolean }) {
  const { icon, tone } = iconFor(n);
  const kicker = n.kind === "new" ? "Neu im Kalender" : n.kind === "change" ? (n.favorite ? "Merkliste · Änderung" : "Änderung") : null;
  return (
    <li>
      <a class={`notice${unread ? " is-unread" : ""}`} href={`/termin/${encodeURIComponent(n.slug)}`} data-overlay onClick={() => markSeen(n.id)}>
        <span class={`notice-icon tone-${tone}`} aria-hidden="true">
          <Icon name={icon} size={18} />
        </span>
        <span class="notice-body">
          {kicker ? <span class="notice-kicker">{kicker}</span> : null}
          <span class="notice-title">{n.title}</span>
          <span class="notice-text">{n.text}</span>
        </span>
        <span class="notice-meta">
          {n.kind === "reminder" ? null : <time dateTime={n.at}>{relativeTime(n.at)}</time>}
          {unread ? <span class="notice-dot" aria-label="Ungelesen" /> : null}
          {n.favorite && n.kind !== "reminder" ? <Icon name="bookmark" size={14} class="notice-fav" /> : null}
        </span>
      </a>
    </li>
  );
}

function PushPrompt() {
  const prefs = useStore(pushPrefsStore);
  const [busy, setBusy] = useState(false);
  if (prefs.enabled) return null;
  if (!pushSupported()) {
    if (!needsInstallForPush()) return null;
    return (
      <div class="notice-prompt">
        <Icon name="install" size={22} />
        <p>
          Installiere den LARP-Kalender auf dem Home-Bildschirm („Teilen“ → „Zum Home-Bildschirm“), dann melden wir uns auch, wenn die App geschlossen
          ist.
        </p>
      </div>
    );
  }
  return (
    <div class="notice-prompt">
      <Icon name="bell" size={22} />
      <div>
        <p>
          <strong>Auch aufs Handy?</strong> Mit Push-Benachrichtigungen erfährst du von Änderungen und Fristen, auch wenn die App geschlossen ist.
        </p>
        <button
          class="btn primary small"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await enablePush();
              toast("Benachrichtigungen aktiviert");
            } catch (err) {
              toast((err as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Push aktivieren
        </button>
      </div>
    </div>
  );
}

export function NotificationsView() {
  const { reminders, activity, unread } = useStore(noticesStore);
  const [filter, setFilter] = useState<"all" | "favorites">("all");
  // Unread markers stay visible during this visit, the badge clears right away.
  const highlight = useRef<Set<string> | null>(null);
  if (!highlight.current && (unread.size || reminders.length || activity.length)) highlight.current = new Set(unread);
  useEffect(() => {
    markAllSeen();
  }, [reminders.length, activity.length]);

  const isUnread = (n: Notice) => highlight.current?.has(n.id) ?? false;
  const list = filter === "favorites" ? activity.filter((n) => n.favorite) : activity;
  const groups: { label: string; items: Notice[] }[] = [];
  for (const n of list) {
    const label = groupLabel(n.at);
    const g = groups.at(-1);
    if (g?.label === label) g.items.push(n);
    else groups.push({ label, items: [n] });
  }

  return (
    <section class="view view-notices" aria-labelledby="notices-heading">
      <header class="view-head notices-head">
        <h1 id="notices-heading" class="view-title">
          Benachrichtigungen
        </h1>
        <a class="icon-btn" href="/mehr#benachrichtigungen" aria-label="Einstellungen für Benachrichtigungen">
          <Icon name="settings" />
        </a>
      </header>

      <PushPrompt />

      {reminders.length ? (
        <section class="notice-group" aria-labelledby="reminders-heading">
          <h2 id="reminders-heading">Fällig auf deiner Merkliste</h2>
          <ul class="notice-list">
            {reminders.map((n) => (
              <NoticeRow key={n.id} n={n} unread={isUnread(n)} />
            ))}
          </ul>
        </section>
      ) : null}

      {activity.length ? (
        <div class="segmented notices-filter" role="radiogroup" aria-label="Anzeigen">
          {(
            [
              ["all", "Alle"],
              ["favorites", "Nur Merkliste"],
            ] as const
          ).map(([value, label]) => (
            <button key={value} role="radio" aria-checked={filter === value} class={filter === value ? "is-on" : ""} onClick={() => setFilter(value)}>
              {label}
            </button>
          ))}
        </div>
      ) : null}

      {groups.map((g) => (
        <section class="notice-group" key={g.label}>
          <h2>{g.label}</h2>
          <ul class="notice-list">
            {g.items.map((n) => (
              <NoticeRow key={n.id} n={n} unread={isUnread(n)} />
            ))}
          </ul>
        </section>
      ))}

      {!list.length && !reminders.length ? (
        <EmptyState title={filter === "favorites" ? "Nichts Neues auf der Merkliste" : "Alles ruhig"}>
          <p>
            {filter === "favorites"
              ? "Sobald sich bei gemerkten Terminen etwas ändert, steht es hier."
              : "Neue Veranstaltungen, Änderungen und Erinnerungen an deine Merkliste erscheinen hier."}
          </p>
        </EmptyState>
      ) : list.length ? (
        <p class="hint notices-foot">Zeigt die letzten 30 Tage.</p>
      ) : null}
    </section>
  );
}
