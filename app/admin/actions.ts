"use server";

/** Server actions of the editorial backend. Every action checks the role itself (pages are no security boundary). */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getApp } from "@/lib/server/app.ts";
import { clientIp, requireAdmin, requireStaff, signIn, signOut, isStaff } from "@/lib/server/auth.ts";
import { eventCreateSchema, eventUpdateSchema, EventValidationError, type DuplicateCandidate } from "@/lib/server/events.ts";
import { zodMessage } from "@/lib/server/http.ts";
import { revokeConnection } from "@/lib/server/oauth.ts";
import { limits } from "@/lib/server/rate-limit.ts";
import { createApiToken, createUser, deleteApiToken, deleteUser, updateUser, verifyLogin } from "@/lib/server/users.ts";
import { USER_ROLES, keys } from "@/lib/shared/vocab.ts";

export type ActionState = { ok?: boolean; error?: string; duplicates?: DuplicateCandidate[]; values?: Record<string, string>; token?: string } | null;

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export async function adminLogin(_: ActionState, form: FormData): Promise<ActionState> {
  if (!limits.login!.allow(await clientIp())) return { error: "Zu viele Anmeldeversuche. Bitte in 15 Minuten erneut versuchen." };
  const user = await verifyLogin(getApp().db, s(form, "email"), String(form.get("password") ?? ""));
  if (!user) return { error: "E-Mail oder Passwort ist falsch." };
  if (!isStaff(user)) return { error: "Dieses Konto hat keinen Zugang zur Redaktion." };
  await signIn(user.id);
  redirect("/admin");
}

export async function adminLogout(): Promise<void> {
  await signOut();
  redirect("/admin/login");
}

/* ---------- events ---------- */

const TEXT_FIELDS = [
  "title", "summary", "description", "startDate", "endDate", "startTime", "endTime", "eventType", "organizer", "venue", "street",
  "postalCode", "city", "region", "country", "websiteUrl", "registrationUrl", "registrationOpens", "registrationDeadline",
  "registrationStatus", "priceText", "imageUrl", "contactEmail", "status", "sourceUrl", "notesInternal",
] as const;
const NUMBER_FIELDS = ["lat", "lng", "priceMin", "priceMax", "minAge", "capacity"] as const;

/** Form fields -> event payload: empty means "clear", numbers accept a decimal comma. */
function eventPayload(form: FormData): Record<string, unknown> {
  const p: Record<string, unknown> = {
    genres: form.getAll("genres").map(String),
    tags: s(form, "tags").split(",").map((t) => t.trim()).filter(Boolean),
  };
  for (const k of TEXT_FIELDS) p[k] = s(form, k) || null;
  for (const k of NUMBER_FIELDS) p[k] = s(form, k) ? Number(s(form, k).replace(",", ".")) : null;
  for (const k of ["eventType", "registrationStatus", "status", "country"]) if (p[k] === null) delete p[k];
  return p;
}

export async function saveEvent(_: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireStaff();
  const app = getApp();
  const id = Number(form.get("id")) || null;
  const intent = s(form, "intent");
  const values = Object.fromEntries([...form].filter(([k]) => k !== "genres").map(([k, v]) => [k, String(v)]));
  values.genres = form.getAll("genres").join(",");
  const payload = eventPayload(form);
  if (intent === "publish") payload.status = "published";
  try {
    if (id) {
      const parsed = eventUpdateSchema.safeParse(payload);
      if (!parsed.success) return { error: zodMessage(parsed.error), values };
      if (!app.updateEvent(id, parsed.data, user, intent === "check")) return { error: "Nicht gefunden." };
    } else {
      const parsed = eventCreateSchema.safeParse(payload);
      if (!parsed.success) return { error: zodMessage(parsed.error), values };
      const result = app.createEvent(parsed.data, user, "manual", intent === "duplicate");
      if (!result.created) return { duplicates: result.duplicates, values };
      revalidatePath("/admin");
      redirect(`/admin/veranstaltung/${result.event.id}?neu=1`);
    }
  } catch (e) {
    if (e instanceof EventValidationError) return { error: e.message, values };
    throw e;
  }
  revalidatePath("/admin", "layout");
  return { ok: true };
}

export async function publishEvent(form: FormData): Promise<void> {
  const user = await requireStaff();
  getApp().updateEvent(Number(form.get("id")), { status: "published" }, user);
  revalidatePath("/admin", "layout");
}

export async function deleteEvent(form: FormData): Promise<void> {
  await requireStaff();
  getApp().deleteEvent(Number(form.get("id")));
  revalidatePath("/admin", "layout");
  redirect("/admin");
}

/* ---------- API tokens and OAuth connections ---------- */

export async function createToken(_: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireStaff();
  const name = s(form, "name");
  if (name.length < 2) return { error: "Bitte einen Namen angeben." };
  const { token } = createApiToken(getApp().db, user.id, name.slice(0, 80));
  revalidatePath("/admin/verbindungen");
  return { ok: true, token };
}

export async function deleteToken(form: FormData): Promise<void> {
  const user = await requireStaff();
  deleteApiToken(getApp().db, user.id, Number(form.get("id")));
  revalidatePath("/admin/verbindungen");
}

export async function disconnect(form: FormData): Promise<void> {
  const user = await requireStaff();
  revokeConnection(getApp().db, user.id, s(form, "clientId"));
  revalidatePath("/admin/verbindungen");
}

/* ---------- users (administrators only) ---------- */

const userCreateSchema = z.object({
  email: z.string().trim().email(),
  name: z.string().trim().min(2).max(100),
  password: z.string().min(10, "Passwort: mindestens 10 Zeichen").max(200),
  role: z.enum(keys(USER_ROLES)).default("editor"),
});

export async function addUser(_: ActionState, form: FormData): Promise<ActionState> {
  await requireAdmin();
  const parsed = userCreateSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: zodMessage(parsed.error) };
  try {
    await createUser(getApp().db, parsed.data);
  } catch {
    return { error: "Diese E-Mail-Adresse wird bereits verwendet." };
  }
  revalidatePath("/admin/benutzer");
  return { ok: true };
}

const userPatchSchema = z.object({
  role: z.enum(keys(USER_ROLES)).optional(),
  disabled: z.boolean().optional(),
  password: z.string().min(10, "Passwort: mindestens 10 Zeichen").max(200).optional(),
});

export async function changeUser(id: number, patch: z.infer<typeof userPatchSchema>): Promise<{ error?: string }> {
  const me = await requireAdmin();
  const parsed = userPatchSchema.safeParse(patch);
  if (!parsed.success) return { error: zodMessage(parsed.error) };
  if (id === me.id) return { error: "Du kannst dein eigenes Konto hier nicht ändern." };
  await updateUser(getApp().db, id, parsed.data);
  revalidatePath("/admin/benutzer");
  return {};
}

export async function removeUser(id: number): Promise<void> {
  const me = await requireAdmin();
  if (id !== me.id) deleteUser(getApp().db, id);
  revalidatePath("/admin/benutzer");
}

/* ---------- own profile ---------- */

export async function updateMe(_: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireStaff();
  const name = s(form, "name");
  const password = String(form.get("password") ?? "");
  if (name.length < 2) return { error: "Name: mindestens 2 Zeichen" };
  if (password) {
    if (password.length < 10) return { error: "Passwort: mindestens 10 Zeichen" };
    if (!(await verifyLogin(getApp().db, user.email, String(form.get("currentPassword") ?? "")))) return { error: "Das aktuelle Passwort ist falsch." };
  }
  await updateUser(getApp().db, user.id, { name, password: password || undefined });
  if (password) await signIn(user.id);
  revalidatePath("/admin", "layout");
  return { ok: true };
}
