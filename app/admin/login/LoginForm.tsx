"use client";

import Link from "next/link";
import { useActionState } from "react";
import { adminLogin } from "../actions.ts";

export function LoginForm() {
  const [state, action, pending] = useActionState(adminLogin, null);
  return (
    <main className="login">
      <form className="form panel" action={action}>
        <img src="/icons/icon.svg" alt="" width={56} height={56} />
        <h1 className="view-title">Redaktion</h1>
        <label>
          E-Mail
          <input name="email" type="email" autoComplete="username" required autoFocus />
        </label>
        <label>
          Passwort
          <input name="password" type="password" autoComplete="current-password" required />
        </label>
        {state?.error ? (
          <p className="error" role="alert">
            {state.error}
          </p>
        ) : null}
        <button className="btn primary big" disabled={pending}>
          {pending ? "Anmelden …" : "Anmelden"}
        </button>
        <Link className="muted" href="/">
          Zurück zum Kalender
        </Link>
      </form>
    </main>
  );
}
