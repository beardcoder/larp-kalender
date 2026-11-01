/** Admin API client (session cookie + CSRF header). */

import type { AdminLarpEvent, ApiToken, User } from "../../src/shared/types.ts";
import { createStore } from "../lib/store.ts";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: Record<string, unknown>,
  ) {
    super(message);
  }
}

export const userStore = createStore<User | null | undefined>(undefined);

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`/api/admin${path}`, {
    method: init.method ?? "GET",
    headers: {
      "x-requested-with": "larp-kalender",
      ...(init.body !== undefined ? { "content-type": "application/json" } : {}),
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    credentials: "same-origin",
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.status === 401 && path !== "/login") userStore.set(null);
  if (!res.ok) throw new ApiError(String(body.error ?? `Fehler ${res.status}`), res.status, body);
  return body as T;
}

export interface Meta {
  stats: { upcoming: number; openRegistration: number; drafts: number; past: number; total: number; lastUpdate: string | null };
  pushSubscribers: number;
  version: string;
  vocab: {
    genres: Record<string, string>;
    eventTypes: Record<string, string>;
    registrationStatus: Record<string, string>;
    status: Record<string, string>;
    countries: Record<string, string>;
    roles: Record<string, string>;
  };
}

export type { AdminLarpEvent, ApiToken, User };

export interface Connection {
  clientId: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
}

export const fmtDateTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" }) : "–";
