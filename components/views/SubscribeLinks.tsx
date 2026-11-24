"use client";

import { useEffect, useState } from "react";
import { Icon } from "../Icon.tsx";
import { toast } from "../Toasts.tsx";

/** Buttons to subscribe to an iCal feed in common calendar apps. */
export function SubscribeLinks({ params }: { params: Record<string, string> }) {
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(location.origin), []);
  const qs = new URLSearchParams(params).toString();
  const https = `${origin}/kalender.ics${qs ? `?${qs}` : ""}`;
  const webcal = https.replace(/^https?:/, "webcal:");
  return (
    <div className="subscribe">
      <a className="btn primary" href={webcal}>
        <Icon name="calendar" size={18} /> Abonnieren
      </a>
      <a className="btn ghost" href={`https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcal)}`} target="_blank" rel="noopener noreferrer">
        Google Kalender
      </a>
      <a
        className="btn ghost"
        href={`https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(https)}&name=${encodeURIComponent(params.name ?? "LARP-Kalender")}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        Outlook
      </a>
      <button className="btn ghost" onClick={() => void navigator.clipboard.writeText(https).then(() => toast("Abo-Link kopiert"), () => toast("Kopieren nicht möglich"))}>
        <Icon name="copy" size={18} /> Link kopieren
      </button>
    </div>
  );
}
