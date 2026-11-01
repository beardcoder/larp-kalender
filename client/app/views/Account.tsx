import { useState } from "preact/hooks";
import { useStore } from "../../lib/store.ts";
import { accountStore, deleteAccount, login, logout, register, updateProfile } from "../account.ts";
import { Icon } from "../components.tsx";
import { toast } from "../toast.tsx";

function useSubmit() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => Promise<void>, done?: string) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      if (done) toast(done);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, run };
}

const formData = (e: Event) => Object.fromEntries(new FormData(e.target as HTMLFormElement)) as Record<string, string>;

function SignIn() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const { busy, error, run } = useSubmit();
  const submit = (e: Event) => {
    e.preventDefault();
    const f = formData(e);
    void run(
      () => (mode === "login" ? login(f.email!, f.password!) : register({ email: f.email!, name: f.name!, password: f.password!, website: f.website })),
      mode === "login" ? "Angemeldet" : "Konto erstellt",
    );
  };
  return (
    <>
      <p>Mit einem Konto ist deine Merkliste auf allen Geräten da, und du bekommst einen eigenen Kalender-Feed dafür.</p>
      <div class="segmented" role="tablist" aria-label="Anmelden oder registrieren">
        <button role="tab" aria-selected={mode === "login"} class={mode === "login" ? "is-on" : ""} onClick={() => setMode("login")}>
          Anmelden
        </button>
        <button role="tab" aria-selected={mode === "register"} class={mode === "register" ? "is-on" : ""} onClick={() => setMode("register")}>
          Konto erstellen
        </button>
      </div>
      <form class="form account-form" onSubmit={submit}>
        {mode === "register" ? (
          <label>
            Name
            <input name="name" required minLength={2} maxLength={60} autocomplete="nickname" />
          </label>
        ) : null}
        <label>
          E-Mail
          <input name="email" type="email" required autocomplete="username" />
        </label>
        <label>
          Passwort{mode === "register" ? " (mind. 10 Zeichen)" : ""}
          <input
            name="password"
            type="password"
            required
            minLength={mode === "register" ? 10 : 1}
            autocomplete={mode === "register" ? "new-password" : "current-password"}
          />
        </label>
        <label class="hp" aria-hidden="true">
          Website
          <input name="website" tabIndex={-1} autocomplete="off" />
        </label>
        {error ? (
          <p class="error" role="alert">
            {error}
          </p>
        ) : null}
        <button class="btn primary" disabled={busy}>
          {busy ? "Einen Moment …" : mode === "login" ? "Anmelden" : "Konto erstellen"}
        </button>
      </form>
    </>
  );
}

function Profile() {
  const account = useStore(accountStore)!;
  const [open, setOpen] = useState(false);
  const { busy, error, run } = useSubmit();
  const del = useSubmit();
  const { user } = account;

  const save = (e: Event) => {
    e.preventDefault();
    const f = formData(e);
    void run(async () => {
      await updateProfile({ name: f.name, password: f.password || undefined, currentPassword: f.currentPassword || undefined });
      (e.target as HTMLFormElement).querySelectorAll<HTMLInputElement>("input[type=password]").forEach((i) => (i.value = ""));
    }, "Gespeichert");
  };

  return (
    <>
      <div class="account-head">
        <span class="avatar" aria-hidden="true">
          {user.name.slice(0, 1).toUpperCase()}
        </span>
        <div>
          <strong>{user.name}</strong>
          <span class="muted">{user.email}</span>
        </div>
      </div>
      <p>
        <Icon name="check" size={16} class="inline-icon" /> Deine Merkliste wird mit deinem Konto synchronisiert ({account.favorites.length}{" "}
        {account.favorites.length === 1 ? "Termin" : "Termine"}).
      </p>
      <div class="subscribe">
        {account.staff ? (
          <a class="btn ghost" href="/admin" data-native>
            Zur Redaktion
          </a>
        ) : null}
        <button class="btn ghost" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          Konto bearbeiten
        </button>
        <button class="btn ghost" onClick={() => void logout().then(() => toast("Abgemeldet"))}>
          Abmelden
        </button>
      </div>
      {open ? (
        <div class="account-edit">
          <form class="form" onSubmit={save}>
            <label>
              Name
              <input name="name" defaultValue={user.name} required minLength={2} maxLength={60} />
            </label>
            <label>
              Neues Passwort (optional, mind. 10 Zeichen)
              <input name="password" type="password" minLength={10} autocomplete="new-password" />
            </label>
            <label>
              Aktuelles Passwort (nur für Passwortänderung)
              <input name="currentPassword" type="password" autocomplete="current-password" />
            </label>
            {error ? <p class="error">{error}</p> : null}
            <button class="btn primary" disabled={busy}>
              Speichern
            </button>
          </form>
          {!account.staff ? (
            <form
              class="form danger-zone"
              onSubmit={(e) => {
                e.preventDefault();
                const f = formData(e);
                if (window.confirm("Konto und gespeicherte Merkliste endgültig löschen?")) void del.run(() => deleteAccount(f.password!), "Konto gelöscht");
              }}
            >
              <label>
                Konto löschen – zur Bestätigung Passwort eingeben
                <input name="password" type="password" required autocomplete="current-password" />
              </label>
              {del.error ? <p class="error">{del.error}</p> : null}
              <button class="btn ghost danger" disabled={del.busy}>
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
  const account = useStore(accountStore);
  if (account === undefined) return null;
  return (
    <section class="panel" id="konto">
      <h2>Konto</h2>
      {account ? <Profile /> : <SignIn />}
    </section>
  );
}
