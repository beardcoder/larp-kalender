/** Session cookie, current user and access checks for pages, server actions and route handlers. */

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import type { User } from "../shared/types.ts";
import { STAFF_ROLES } from "../shared/vocab.ts";
import { getApp } from "./app.ts";
import { bearerUser, createSession, deleteSession, SESSION_DAYS, sessionUser } from "./users.ts";

export const SESSION_COOKIE = "lk_session";

export const isStaff = (user: User | null | undefined): boolean => !!user && STAFF_ROLES.includes(user.role);

export async function currentUser(): Promise<User | null> {
  return sessionUser(getApp().db, (await cookies()).get(SESSION_COOKIE)?.value);
}

export async function signIn(userId: number): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, createSession(getApp().db, userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: getApp().cfg.secureCookies,
    path: "/",
    maxAge: SESSION_DAYS * 86_400,
  });
}

export async function signOut(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) deleteSession(getApp().db, token);
  jar.delete(SESSION_COOKIE);
}

/** For admin pages and actions: staff only, everyone else goes to the login page. */
export async function requireStaff(): Promise<User> {
  const user = await currentUser();
  if (!user || !isStaff(user)) redirect("/admin/login");
  return user;
}

export async function requireAdmin(): Promise<User> {
  const user = await requireStaff();
  if (user.role !== "admin") redirect("/admin");
  return user;
}

/** Bearer token (personal API token or OAuth access token) of a route handler request. */
export function requestBearerUser(request: Request): User | null {
  const auth = request.headers.get("authorization");
  return auth?.startsWith("Bearer ") ? bearerUser(getApp().db, auth.slice(7).trim()) : null;
}

/** Public base URL: PUBLIC_URL, or derived from the (proxied) request. */
export async function baseUrl(): Promise<string> {
  const { publicUrl } = getApp().cfg;
  if (publicUrl) return publicUrl;
  const h = await headers();
  return `${h.get("x-forwarded-proto") ?? "http"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
}

/** Client address; the reverse proxy (Traefik) appends the real one as the last entry. */
export async function clientIp(): Promise<string> {
  return (await headers()).get("x-forwarded-for")?.split(",").at(-1)?.trim() || "local";
}

/** Set-Cookie header value for responses built by hand (OAuth consent page). */
export function sessionCookieHeader(token: string): string {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86_400}${getApp().cfg.secureCookies ? "; Secure" : ""}`;
}
