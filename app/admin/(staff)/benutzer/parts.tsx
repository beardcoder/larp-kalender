"use client";

import { useActionState, useEffect, useRef } from "react";
import { toast } from "@/components/Toasts.tsx";
import type { User } from "@/lib/shared/types.ts";
import { USER_ROLES, type UserRole } from "@/lib/shared/vocab.ts";
import { addUser, changeUser, removeUser } from "../../actions.ts";

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" }) : "–");

export function UserRow({ user: u, isMe }: { user: User; isMe: boolean }) {
  const change = async (patch: Parameters<typeof changeUser>[1]) => {
    const { error } = await changeUser(u.id, patch);
    toast(error ?? "Gespeichert");
  };
  return (
    <tr className={u.disabled ? "is-cancelled" : ""}>
      <td>
        <span className="row-title">{u.name}</span>
        <span className="row-sub">{u.email}</span>
      </td>
      <td>
        <select defaultValue={u.role} disabled={isMe} onChange={(e) => void change({ role: e.target.value as UserRole })} aria-label={`Rolle von ${u.name}`}>
          {Object.entries(USER_ROLES).map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
      </td>
      <td>
        <span className="row-sub">{fmt(u.lastLoginAt)}</span>
      </td>
      <td className="nowrap">
        {isMe ? (
          <span className="row-sub">Das bist du</span>
        ) : (
          <>
            <button
              className="btn ghost small"
              onClick={() => {
                const password = prompt(`Neues Passwort für ${u.name} (mind. 10 Zeichen):`);
                if (password) void change({ password });
              }}
            >
              Passwort
            </button>{" "}
            <button className="btn ghost small" onClick={() => void change({ disabled: !u.disabled })}>
              {u.disabled ? "Aktivieren" : "Sperren"}
            </button>{" "}
            <button className="btn ghost small danger" onClick={() => confirm(`${u.name} löschen? Veranstaltungen bleiben erhalten.`) && void removeUser(u.id)}>
              Löschen
            </button>
          </>
        )}
      </td>
    </tr>
  );
}

export function AddUserForm() {
  const [state, action, pending] = useActionState(addUser, null);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) toast("Benutzer angelegt");
  }, [state]);
  return (
    <form className="form panel narrow" action={action} ref={form}>
      <h2>Benutzer hinzufügen</h2>
      <label>
        Name
        <input name="name" required minLength={2} />
      </label>
      <label>
        E-Mail
        <input name="email" type="email" required />
      </label>
      <label>
        Startpasswort (mind. 10 Zeichen)
        <input name="password" type="text" required minLength={10} autoComplete="new-password" />
      </label>
      <label>
        Rolle
        <select name="role" defaultValue="editor">
          {Object.entries(USER_ROLES).map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
      </label>
      {state?.error ? <p className="error">{state.error}</p> : null}
      <button className="btn primary" disabled={pending}>
        Anlegen
      </button>
    </form>
  );
}
