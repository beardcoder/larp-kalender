import { getApp } from "@/lib/server/app.ts";
import { handleRevoke } from "@/lib/server/oauth.ts";

export const POST = (request: Request) => handleRevoke(getApp().db, request);
