"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { dismiss, markSeen, useNotices, type Notice } from "@/lib/client/notices.ts";
import { enablePush, needsInstallForPush, pushPrefsStore, pushSupported } from "@/lib/client/push.ts";
import { useStore } from "@/lib/client/store.ts";
import { formatDate } from "@/lib/shared/format.ts";
import { useAppData } from "../AppData.tsx";
import { EmptyState } from "../event-bits.tsx";
import { Icon, type IconName } from "../Icon.tsx";
import { toast } from "../Toasts.tsx";

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

function groupLabel(iso: string): string {
  const days = Math.round((new Date().setHours(0, 0, 0, 0) - new Date(iso).setHours(0, 0, 0, 0)) / 86_400_000);
  return days <= 0 ? "Heute" : days === 1 ? "Gestern" : days < 7 ? "Diese Woche" : "Früher";
}

function iconFor(n: Notice): { icon: IconName; tone: string } {
  if (n.kind === "reminder") return n.reminder === "start" ? { icon: "flag", tone: "start" } : { icon: "clock", tone: "deadline" };
  if (n.kind === "new") return { icon: "sparkle", tone: "new" };
  return n.cancelled ? { icon: "close", tone: "cancelled" } : { icon: "refresh", tone: "change" };
}

function NoticeRow({ n, unread }: { n: Notice; unread: boolean }) {
  const { icon, tone } = iconFor(n);
  const kicker = n.kind === "new" ? "Neu im Kalender" : n.kind === "change" ? (n.favorite ? "Merkliste · Änderung" : "Änderung") : null;
  return (
    <li className="notice-item">
      <Link className={`notice${unread ? " is-unread" : ""}`} href={`/termin/${encodeURIComponent(n.slug)}`}>
        <span className={`notice-icon tone-${tone}`} aria-hidden="true">
          <Icon name={icon} size={18} />
        </span>
        <span className="notice-body">
          {kicker ? <span className="notice-kicker">{kicker}</span> : null}
          <span className="notice-title">{n.title}</span>
          <span className="notice-text">{n.text}</span>
        </span>
        <span className="notice-meta">
          {n.kind === "reminder" ? null : <time dateTime={n.at}>{relativeTime(n.at)}</time>}
          {unread ? <span className="notice-dot" aria-label="Ungelesen" /> : null}
          {n.favorite && n.kind !== "reminder" ? <Icon name="bookmark" size={14} className="notice-fav" /> : null}
        </span>
      </Link>
      <button className="notice-close" aria-label={`Entfernen: ${n.title}`} onClick={() => dismiss([n.id])}>
        <Icon name="close" size={14} />
      </button>
    </li>
  );
}

/** Section heading with a clear button: tap the ×, then confirm with "Löschen". */
function GroupHead({ id, label, ids }: { id?: string; label: string; ids: string[] }) {
  const [confirming, setConfirming] = useState(false);
  useEffect(() => {
    if (!confirming) return;
    const t = setTimeout(() => setConfirming(false), 3000);
    return () => clearTimeout(t);
  }, [confirming]);
  return (
    <div className="notice-group-head">
      <h2 id={id}>{label}</h2>
      {confirming ? (
        <button className="notice-clear is-confirm" onClick={() => dismiss(ids)}>
          Löschen
        </button>
      ) : (
        <button className="notice-clear" aria-label={`${label} entfernen`} onClick={() => setConfirming(true)}>
          <Icon name="close" size={14} />
        </button>
      )}
    </div>
  );
}

function PushPrompt() {
  const prefs = useStore(pushPrefsStore);
  const [busy, setBusy] = useState(false);
  const [support, setSupport] = useState<"yes" | "install" | "no" | null>(null);
  useEffect(() => setSupport(pushSupported() ? "yes" : needsInstallForPush() ? "install" : "no"), []);
  if (prefs.enabled || !support || support === "no") return null;
  if (support === "install")
    return (
      <div className="notice-prompt">
        <Icon name="install" size={22} />
        <p>Installiere den LARP-Kalender auf dem Home-Bildschirm („Teilen“ → „Zum Home-Bildschirm“), dann melden wir uns auch, wenn die App geschlossen ist.</p>
      </div>
    );
  return (
    <div className="notice-prompt">
      <Icon name="bell" size={22} />
      <div>
        <p>
          <strong>Auch aufs Handy?</strong> Mit Push-Benachrichtigungen erfährst du von Änderungen und Fristen, auch wenn die App geschlossen ist.
        </p>
        <button
          className="btn primary small"
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
  const { events, activity: feed, today } = useAppData();
  const { reminders, activity, unread } = useNotices(events, feed, today);
  const [filter, setFilter] = useState<"all" | "favorites">("all");
  // Unread markers stay visible during this visit; the badge clears right away.
  const highlight = useRef<Set<string> | null>(null);
  if (!highlight.current && unread.size) highlight.current = new Set(unread);
  useEffect(() => {
    if (unread.size) markSeen([...unread]);
  }, [unread]);

  const list = filter === "favorites" ? activity.filter((n) => n.favorite) : activity;
  const groups: { label: string; items: Notice[] }[] = [];
  for (const n of list) {
    const label = groupLabel(n.at);
    const g = groups.at(-1);
    if (g?.label === label) g.items.push(n);
    else groups.push({ label, items: [n] });
  }
  const isUnread = (n: Notice) => highlight.current?.has(n.id) ?? false;

  return (
    <section className="view view-notices" aria-labelledby="notices-heading">
      <header className="view-head notices-head">
        <h1 id="notices-heading" className="view-title">
          Benachrichtigungen
        </h1>
        <Link className="icon-btn" href="/mehr#benachrichtigungen" aria-label="Einstellungen für Benachrichtigungen">
          <Icon name="settings" />
        </Link>
      </header>

      <PushPrompt />

      {reminders.length ? (
        <section className="notice-group" aria-labelledby="reminders-heading">
          <GroupHead id="reminders-heading" label="Fällig auf deiner Merkliste" ids={reminders.map((n) => n.id)} />
          <ul className="notice-list">
            {reminders.map((n) => (
              <NoticeRow key={n.id} n={n} unread={isUnread(n)} />
            ))}
          </ul>
        </section>
      ) : null}

      {activity.length ? (
        <div className="segmented notices-filter" role="radiogroup" aria-label="Anzeigen">
          {(
            [
              ["all", "Alle"],
              ["favorites", "Nur Merkliste"],
            ] as const
          ).map(([value, label]) => (
            <button key={value} role="radio" aria-checked={filter === value} className={filter === value ? "is-on" : ""} onClick={() => setFilter(value)}>
              {label}
            </button>
          ))}
        </div>
      ) : null}

      {groups.map((g) => (
        <section className="notice-group" key={g.label}>
          <GroupHead label={g.label} ids={g.items.map((n) => n.id)} />
          <ul className="notice-list">
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
        <p className="hint notices-foot">Ältere Einträge verschwinden nach 30 Tagen von selbst.</p>
      ) : null}
    </section>
  );
}
