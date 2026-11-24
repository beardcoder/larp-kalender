"use server";

/** Server actions of the public app: account, synced bookmarks, event suggestions. Next.js checks their origin (CSRF). */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { feedToken, setFavorites } from "@/lib/server/account.ts";
import { getApp } from "@/lib/server/app.ts";
import { clientIp, currentUser, isStaff, signIn, signOut } from "@/lib/server/auth.ts";
import { eventCreateSchema } from "@/lib/server/events.ts";
import { zodMessage } from "@/lib/server/http.ts";
import { limits } from "@/lib/server/rate-limit.ts";
import { createUser, deleteUser, updateUser, verifyLogin } from "@/lib/server/users.ts";

export type FormResult = { ok?: boolean; error?: string } | null;

const text = (f: FormData, key: string) => String(f.get(key) ?? "").trim();
const refreshAll = () => revalidatePath("/", "layout");

export async function login(_: FormResult, form: FormData): Promise<FormResult> {
  if (!limits.login!.allow(await clientIp())) return { error: "Zu viele Anmeldeversuche. Bitte in 15 Minuten erneut versuchen." };
  const user = await verifyLogin(getApp().db, text(form, "email"), String(form.get("password") ?? ""));
  if (!user) return { error: "E-Mail oder Passwort ist falsch." };
  await signIn(user.id);
  refreshAll();
  return { ok: true };
}

const registerSchema = z.object({
  email: z.string().trim().email("Bitte eine gültige E-Mail-Adresse angeben."),
  name: z.string().trim().min(2, "Name: mindestens 2 Zeichen").max(60),
  password: z.string().min(10, "Passwort: mindestens 10 Zeichen").max(200),
});

export async function register(_: FormResult, form: FormData): Promise<FormResult> {
  if (text(form, "website")) return { ok: true }; // honeypot: bots fill it in, humans never see it
  if (!limits.signup!.allow(await clientIp())) return { error: "Zu viele Registrierungen. Bitte später erneut versuchen." };
  const parsed = registerSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };
  try {
    const user = await createUser(getApp().db, { ...parsed.data, role: "member" });
    await signIn(user.id);
  } catch {
    return { error: "Für diese E-Mail-Adresse gibt es schon ein Konto. Melde dich an." };
  }
  refreshAll();
  return { ok: true };
}

export async function logout(): Promise<void> {
  await signOut();
  refreshAll();
}

export async function updateProfile(_: FormResult, form: FormData): Promise<FormResult> {
  const user = await currentUser();
  if (!user) return { error: "Nicht angemeldet." };
  const name = text(form, "name");
  const password = String(form.get("password") ?? "");
  if (name.length < 2 || name.length > 60) return { error: "Name: 2 bis 60 Zeichen" };
  if (password) {
    if (password.length < 10) return { error: "Passwort: mindestens 10 Zeichen" };
    if (!(await verifyLogin(getApp().db, user.email, String(form.get("currentPassword") ?? "")))) return { error: "Das aktuelle Passwort ist falsch." };
  }
  await updateUser(getApp().db, user.id, { name, password: password || undefined });
  // A password change ends all sessions; keep this device signed in.
  if (password) await signIn(user.id);
  refreshAll();
  return { ok: true };
}

export async function deleteAccount(_: FormResult, form: FormData): Promise<FormResult> {
  const user = await currentUser();
  if (!user) return { error: "Nicht angemeldet." };
  if (isStaff(user)) return { error: "Redaktionskonten werden im Backend verwaltet." };
  if (!(await verifyLogin(getApp().db, user.email, String(form.get("password") ?? "")))) return { error: "Das Passwort ist falsch." };
  deleteUser(getApp().db, user.id);
  await signOut();
  refreshAll();
  return { ok: true };
}

/** Replaces the bookmarks of the signed-in account (the device list is the source, merged on sign-in). */
export async function saveFavorites(ids: number[]): Promise<number[] | null> {
  const user = await currentUser();
  if (!user || !Array.isArray(ids)) return null;
  return setFavorites(getApp().db, user.id, ids.map(Number));
}

export async function rotateFeedToken(): Promise<void> {
  const user = await currentUser();
  if (!user) return;
  feedToken(getApp().db, user.id, true);
  refreshAll();
}

const suggestionSchema = eventCreateSchema
  .pick({ title: true, startDate: true, endDate: true, city: true, postalCode: true, venue: true, organizer: true, websiteUrl: true, registrationUrl: true, genres: true, eventType: true, summary: true, priceText: true })
  .extend({ submitter: z.string().trim().max(200).optional() });

export async function suggestEvent(_: FormResult, form: FormData): Promise<FormResult> {
  if (text(form, "website")) return { ok: true }; // honeypot
  if (!limits.suggest!.allow(await clientIp())) return { error: "Zu viele Vorschläge in kurzer Zeit. Bitte später erneut versuchen." };
  const raw: Record<string, unknown> = { genres: form.getAll("genres").map(String) };
  for (const [k, v] of form) if (k !== "genres" && typeof v === "string" && v.trim()) raw[k] = v.trim();
  const parsed = suggestionSchema.safeParse(raw);
  if (!parsed.success) return { error: zodMessage(parsed.error) };
  const { submitter, ...data } = parsed.data;
  try {
    getApp().createEvent({ ...data, status: "draft", notesInternal: `Vorschlag über das Formular${submitter ? ` von ${submitter}` : ""}.` }, null, "suggestion", true);
  } catch (e) {
    return { error: (e as Error).message };
  }
  return { ok: true };
}
