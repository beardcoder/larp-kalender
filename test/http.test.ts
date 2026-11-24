import { beforeAll, describe, expect, test } from "bun:test";

// The app singleton reads its config from the environment on first use.
process.env.DATA_DIR = ":memory:";
process.env.GEOCODE = "false";
process.env.PUBLIC_URL = "http://test.local";

const { getApp } = await import("../lib/server/app.ts");
const { createApiToken, createUser } = await import("../lib/server/users.ts");
const { addDays, today } = await import("../lib/server/events.ts");
const { handleAuthorizePost } = await import("../lib/server/oauth.ts");
const mcp = await import("../app/mcp/route.ts");
const events = await import("../app/api/events/route.ts");
const ics = await import("../app/kalender.ics/route.ts");
const subscribe = await import("../app/api/push/subscribe/route.ts");
const register = await import("../app/oauth/register/route.ts");
const token = await import("../app/oauth/token/route.ts");
const live = await import("../app/api/live/route.ts");

const url = (path: string) => `http://test.local${path}`;
let apiToken = "";

beforeAll(async () => {
  const user = await createUser(getApp().db, { email: "a@b.de", name: "Tester", password: "passwort-123", role: "admin" });
  apiToken = createApiToken(getApp().db, user.id, "test").token;
});

const callTool = (name: string, args: object, auth = `Bearer ${apiToken}`) =>
  mcp.POST(
    new Request(url("/mcp"), {
      method: "POST",
      headers: { authorization: auth, "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
    }),
  );

describe("mcp", () => {
  test("requires a token and advertises OAuth", async () => {
    const res = await callTool("list_events", {}, "");
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toContain("oauth-protected-resource");
  });

  test("create_event shows up in the public API and the iCal feed, with ETag", async () => {
    const body = await (await callTool("create_event", { title: "MCP-Testcon", startDate: addDays(today(), 30), registrationUrl: "https://example.org/a" })).json();
    expect(body.result.content[0].text).toContain("Created #");

    const res = await events.GET(new Request(url("/api/events")));
    const list = await res.json();
    expect(list.events.map((e: { title: string }) => e.title)).toContain("MCP-Testcon");
    const again = await events.GET(new Request(url("/api/events"), { headers: { "if-none-match": res.headers.get("etag")! } }));
    expect(again.status).toBe(304);

    expect(await (await ics.GET(new Request(url("/kalender.ics")))).text()).toContain("SUMMARY:MCP-Testcon");
  });

  test("members cannot use MCP", async () => {
    const member = await createUser(getApp().db, { email: "m@b.de", name: "Mitglied", password: "passwort-123", role: "member" });
    const res = await callTool("list_events", {}, `Bearer ${createApiToken(getApp().db, member.id, "x").token}`);
    expect(res.status).toBe(403);
  });
});

describe("oauth", () => {
  test("rejects unknown redirect hosts, issues and rotates tokens", async () => {
    const post = (body: object) => new Request(url("/oauth/register"), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    expect((await register.POST(post({ client_name: "Evil", redirect_uris: ["https://evil.example/cb"] }))).status).toBe(400);

    const redirect = "https://chatgpt.com/connector_platform_oauth_redirect";
    const client = await (await register.POST(post({ client_name: "ChatGPT", redirect_uris: [redirect] }))).json();
    const verifier = "v".repeat(50);
    const challenge = new Bun.CryptoHasher("sha256").update(verifier).digest("base64url");
    const form = new URLSearchParams({
      client_id: client.client_id, redirect_uri: redirect, code_challenge: challenge, code_challenge_method: "S256",
      response_type: "code", state: "s", email: "a@b.de", password: "passwort-123", action: "allow",
    });
    const auth = await handleAuthorizePost(getApp().db, new Request(url("/oauth/authorize"), { method: "POST", body: form }), undefined, () => {}, () => true);
    const code = new URL(auth.headers.get("location")!).searchParams.get("code")!;

    const tokenReq = (params: Record<string, string>) => new Request(url("/oauth/token"), { method: "POST", body: new URLSearchParams(params) });
    const tok = await (await token.POST(tokenReq({ grant_type: "authorization_code", code, client_id: client.client_id, redirect_uri: redirect, code_verifier: verifier }))).json();
    expect(tok.access_token).toStartWith("lka_");
    const refreshed = await (await token.POST(tokenReq({ grant_type: "refresh_token", refresh_token: tok.refresh_token, client_id: client.client_id }))).json();
    expect(refreshed.refresh_token).not.toBe(tok.refresh_token);
    expect((await token.POST(tokenReq({ grant_type: "refresh_token", refresh_token: tok.refresh_token, client_id: client.client_id }))).status).toBe(400);
  });
});

describe("push and live", () => {
  test("only browser push services are accepted", async () => {
    const res = await subscribe.POST(
      new Request(url("/api/push/subscribe"), {
        method: "POST",
        body: JSON.stringify({ subscription: { endpoint: "https://internal.example:8443/x", keys: { p256dh: "a", auth: "b" } } }),
      }),
    );
    expect(res.status).toBe(400);
  });

  test("live endpoint streams server-sent events", async () => {
    const abort = new AbortController();
    const res = live.GET(new Request(url("/api/live"), { signal: abort.signal }));
    expect(res.headers.get("content-type")).toStartWith("text/event-stream");
    abort.abort();
  });
});
