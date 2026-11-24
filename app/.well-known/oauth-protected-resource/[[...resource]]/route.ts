import { baseOf } from "@/lib/server/http.ts";
import { protectedResourceMetadata } from "@/lib/server/oauth.ts";

export const GET = (request: Request) => Response.json(protectedResourceMetadata(baseOf(request)));
