import { getApp } from "@/lib/server/app.ts";
import { json } from "@/lib/server/http.ts";

export const dynamic = "force-dynamic";

export const GET = () => json({ publicKey: getApp().push.publicKey });
