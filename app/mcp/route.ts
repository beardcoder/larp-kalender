import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { getApp } from "@/lib/server/app.ts";
import { isStaff, requestBearerUser } from "@/lib/server/auth.ts";
import { baseOf, json } from "@/lib/server/http.ts";
import { createMcpServer } from "@/lib/server/mcp.ts";
import { wwwAuthenticate } from "@/lib/server/oauth.ts";

export const dynamic = "force-dynamic";

/** MCP over Streamable HTTP, stateless: a fresh server per request, authenticated by Bearer token. */
async function handle(request: Request): Promise<Response> {
  const user = requestBearerUser(request);
  if (!user)
    return json({ error: "unauthorized", error_description: "Bearer token required." }, 401, { "www-authenticate": wwwAuthenticate(baseOf(request)) });
  if (!isStaff(user)) return json({ error: "forbidden", error_description: "Only editors and administrators can use MCP." }, 403);

  const server = createMcpServer(getApp(), user, baseOf(request));
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  const response = await transport.handleRequest(request);
  if (request.method !== "GET") {
    await transport.close();
    await server.close();
  }
  return response;
}

export { handle as GET, handle as POST, handle as DELETE };
