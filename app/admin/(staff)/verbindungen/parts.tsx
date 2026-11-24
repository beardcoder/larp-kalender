"use client";

import { useActionState } from "react";
import { Icon } from "@/components/Icon.tsx";
import { toast } from "@/components/Toasts.tsx";
import { createToken } from "../../actions.ts";

const copy = (text: string, done = "Kopiert") => void navigator.clipboard.writeText(text).then(() => toast(done), () => toast("Kopieren nicht möglich"));

export function CopyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="copy-field">
      <span className="label">{label}</span>
      <div>
        <code>{value}</code>
        <button type="button" className="icon-btn" aria-label={`${label} kopieren`} onClick={() => copy(value)}>
          <Icon name="copy" size={18} />
        </button>
      </div>
    </div>
  );
}

export function CopyPromptButton({ text }: { text: string }) {
  return (
    <button className="btn ghost small" onClick={() => copy(text, "Prompt kopiert")}>
      <Icon name="copy" size={16} /> Prompt kopieren
    </button>
  );
}

/** Submit button of a server-action form that asks before submitting. */
export function ConfirmButton({ question, children }: { question: string; children: React.ReactNode }) {
  return (
    <button className="btn ghost small danger" onClick={(e) => confirm(question) || e.preventDefault()}>
      {children}
    </button>
  );
}

export function TokenForm() {
  const [state, action, pending] = useActionState(createToken, null);
  return (
    <>
      {state?.token ? (
        <div className="notice">
          <p>
            <strong>Neuer Token – jetzt kopieren, er wird nur einmal angezeigt:</strong>
          </p>
          <CopyField label="Token" value={state.token} />
        </div>
      ) : null}
      <form className="inline-form" action={action}>
        <input name="name" placeholder="Wofür? z. B. „Import-Skript“" required minLength={2} />
        <button className="btn primary small" disabled={pending}>
          Token erstellen
        </button>
      </form>
      {state?.error ? <p className="error">{state.error}</p> : null}
    </>
  );
}
