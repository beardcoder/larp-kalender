import { baseOf } from "@/lib/server/http.ts";
import { authorizationServerMetadata } from "@/lib/server/oauth.ts";

export const GET = (request: Request) => Response.json(authorizationServerMetadata(baseOf(request)));
