import { cookies } from "next/headers";
import { getApp } from "@/lib/server/app.ts";
import { SESSION_COOKIE, sessionCookieHeader } from "@/lib/server/auth.ts";
import { ipOf } from "@/lib/server/http.ts";
import { handleAuthorizeGet, handleAuthorizePost } from "@/lib/server/oauth.ts";
import { limits } from "@/lib/server/rate-limit.ts";

const session = async () => (await cookies()).get(SESSION_COOKIE)?.value;

export async function GET(request: Request) {
  return handleAuthorizeGet(getApp().db, request, await session());
}

export async function POST(request: Request) {
  let token: string | null = null;
  const res = await handleAuthorizePost(getApp().db, request, await session(), (t) => (token = t), () => limits.login!.allow(ipOf(request)));
  if (token) res.headers.append("set-cookie", sessionCookieHeader(token));
  return res;
}
