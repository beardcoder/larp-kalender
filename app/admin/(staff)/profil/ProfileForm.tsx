"use client";

import { useActionState, useEffect } from "react";
import { toast } from "@/components/Toasts.tsx";
import { updateMe } from "../../actions.ts";

export function ProfileForm({ name, email }: { name: string; email: string }) {
  const [state, action, pending] = useActionState(updateMe, null);
  useEffect(() => {
    if (state?.ok) toast("Gespeichert");
  }, [state]);
  return (
    <form className="form panel narrow" action={action}>
      <label>
        Name
        <input name="name" defaultValue={name} required minLength={2} />
      </label>
      <label>
        E-Mail
        <input value={email} disabled />
      </label>
      <label>
        Aktuelles Passwort
        <input name="currentPassword" type="password" autoComplete="current-password" />
      </label>
      <label>
        Neues Passwort (mind. 10 Zeichen)
        <input name="password" type="password" minLength={10} autoComplete="new-password" />
      </label>
      {state?.error ? <p className="error">{state.error}</p> : null}
      <button className="btn primary" disabled={pending}>
        Speichern
      </button>
    </form>
  );
}
