import { getApp } from "@/lib/server/app.ts";
import { handleToken } from "@/lib/server/oauth.ts";

export const POST = (request: Request) => handleToken(getApp().db, request);
