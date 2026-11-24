"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { deleteAccount, login, logout, register, updateProfile, type FormResult } from "@/app/actions.ts";
import { favoritesStore } from "@/lib/client/state.ts";
import { useStore } from "@/lib/client/store.ts";
import { useAppData } from "../AppData.tsx";
import { Icon } from "../Icon.tsx";
import { toast } from "../Toasts.tsx";

/** Shows a toast once an action reports success. */
function useDone(state: FormResult, message: string) {
  useEffect(() => {
    if (state?.ok) toast(message);
  }, [state, message]);
}

const ErrorLine = ({ state }: { state: FormResult }) =>
  state?.error ? (
    <p className="error" role="alert">
      {state.error}
    </p>
  ) : null;

function SignIn() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [state, action, pending] = useActionState(mode === "login" ? login : register, null);
  useDone(state, mode === "login" ? "Angemeldet" : "Konto erstellt");
  return (
    <>
      <p>Mit einem Konto ist deine Merkliste auf allen Geräten da, und du bekommst einen eigenen Kalender-Feed dafür.</p>
      <div className="segmented" role="tablist" aria-label="Anmelden oder registrieren">
        {(
          [
            ["login", "Anmelden"],
            ["register", "Konto erstellen"],
          ] as const
        ).map(([value, label]) => (
          <button key={value} role="tab" aria-selected={mode === value} className={mode === value ? "is-on" : ""} onClick={() => setMode(value)}>
            {label}
          </button>
        ))}
      </div>
      <form className="form account-form" action={action} key={mode}>
        {mode === "register" ? (
          <label>
            Name
            <input name="name" required minLength={2} maxLength={60} autoComplete="nickname" />
          </label>
        ) : null}
        <label>
          E-Mail
          <input name="email" type="email" required autoComplete="username" />
        </label>
        <label>
          Passwort{mode === "register" ? " (mind. 10 Zeichen)" : ""}
          <input name="password" type="password" required minLength={mode === "register" ? 10 : 1} autoComplete={mode === "register" ? "new-password" : "current-password"} />
        </label>
        <label className="hp" aria-hidden="true">
          Website
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
        <ErrorLine state={state} />
        <button className="btn primary" disabled={pending}>
          {pending ? "Einen Moment …" : mode === "login" ? "Anmelden" : "Konto erstellen"}
        </button>
      </form>
    </>
  );
}

function Profile() {
  const { account } = useAppData();
  const [open, setOpen] = useState(false);
  const [saved, save, saving] = useActionState(updateProfile, null);
  const [deleted, del, deleting] = useActionState(deleteAccount, null);
  useDone(saved, "Gespeichert");
  useDone(deleted, "Konto gelöscht");
  const user = account!;
  const favoriteCount = useStore(favoritesStore).length;

  return (
    <>
      <div className="account-head">
        <span className="avatar" aria-hidden="true">
          {user.name.slice(0, 1).toUpperCase()}
        </span>
        <div>
          <strong>{user.name}</strong>
          <span className="muted">{user.email}</span>
        </div>
      </div>
      <p>
        <Icon name="check" size={16} className="inline-icon" /> Deine Merkliste wird mit deinem Konto synchronisiert ({favoriteCount} {favoriteCount === 1 ? "Termin" : "Termine"}).
      </p>
      <div className="subscribe">
        {user.staff ? (
          <Link className="btn ghost" href="/admin">
            Zur Redaktion
          </Link>
        ) : null}
        <button className="btn ghost" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          Konto bearbeiten
        </button>
        <button className="btn ghost" onClick={() => void logout().then(() => toast("Abgemeldet"))}>
          Abmelden
        </button>
      </div>
      {open ? (
        <div className="account-edit">
          <form className="form" action={save}>
            <label>
              Name
              <input name="name" defaultValue={user.name} required minLength={2} maxLength={60} />
            </label>
            <label>
              Neues Passwort (optional, mind. 10 Zeichen)
              <input name="password" type="password" minLength={10} autoComplete="new-password" />
            </label>
            <label>
              Aktuelles Passwort (nur für Passwortänderung)
              <input name="currentPassword" type="password" autoComplete="current-password" />
            </label>
            <ErrorLine state={saved} />
            <button className="btn primary" disabled={saving}>
              Speichern
            </button>
          </form>
          {!user.staff ? (
            <form
              className="form danger-zone"
              action={(form) => {
                if (!confirm("Konto und gespeicherte Merkliste endgültig löschen?")) return;
                favoritesStore.set([]);
                del(form);
              }}
            >
              <label>
                Konto löschen – zur Bestätigung Passwort eingeben
                <input name="password" type="password" required autoComplete="current-password" />
              </label>
              <ErrorLine state={deleted} />
              <button className="btn ghost danger" disabled={deleting}>
                Konto löschen
              </button>
            </form>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

export function AccountSection() {
  const { account } = useAppData();
  return (
    <section className="panel" id="konto">
      <h2>Konto</h2>
      {account ? <Profile /> : <SignIn />}
    </section>
  );
}
