# LARP-Kalender

Calendar of upcoming LARP events with registration links. Events are maintained through an admin backend or by AI
assistants via MCP (Claude, ChatGPT – e.g. a scheduled ChatGPT task that researches and adds new events).

Live: https://larp.letsbenow.de (not indexed by search engines)

## Features

- **Public PWA** (German): agenda list grouped by month, month calendar, event detail sheet, genre/type/country
  filters, radius search around a postcode/town (`/api/places`, proxied to OpenStreetMap Nominatim with cache
  and 1 req/s throttle) or the device location, optional sorting by distance, bookmarks, "new since last visit" markers,
  offline fallback, installable, web push (new events and relevant changes – registration open,
  waitlist/sold out, cancelled, new date or place – batched per device and filtered by genre; changes of bookmarked
  events always; reminders: registration opens, deadline in ≤3 days, start in ≤7 days), in-app notification center
  (`/benachrichtigungen`, fed by `/api/notifications` plus on-device reminders for bookmarks – works without push too,
  unread count on the bell and the app icon via the Badging API; dismiss per entry or per section; only seen/dismissed
  ids are kept on the device and pruned when entries leave the 30-day feed – nothing is stored per person on the server),
  live updates while the app is open (Server-Sent Events on `/api/live`: hints to refresh, connection only while the
  app is visible), notification taps routed inside the open app (service worker messages), event suggestion form
  (lands as draft).
- **Accounts**: one login for frontend and backend. Visitors can register as *member* (`/mehr#konto`) to sync
  bookmarks across devices and get a private, auto-updating bookmark feed (`/kalender.ics?feed=<token>`).
  Only *admin* and *editor* accounts can open `/admin`, create API tokens, use MCP or connect AI clients.
- **Calendar export**: subscribable iCal feed `/kalender.ics` (filters `genre`, `type`, `country`,
  `registration`, `q`, `ids`, `deadlines=1` adds registration deadlines as separate entries), single event
  `.ics`, Google/Outlook links, CSV export `/veranstaltungen.csv` (Excel friendly, `;` + BOM, `?sep=,`), RSS
  `/feed.xml`, JSON `/api/events`.
- **Admin backend** `/admin` (German): events with drafts/suggestions review, duplicate warnings, users with roles
  (admin/editor), personal API tokens, OAuth connections, MCP setup guide incl. a ready-to-use ChatGPT task prompt.
- **MCP server** `/mcp` (Streamable HTTP, stateless) with OAuth 2.1 (dynamic client registration, PKCE) for
  claude.ai and ChatGPT connectors, or Bearer API tokens (`lk_…`) for Claude Code and scripts.
- Duplicate detection (same link or similar title within a week) for every create.
- Background geocoding via OpenStreetMap Nominatim (for radius search and maps).
- `noindex` everywhere (`X-Robots-Tag`, meta tag, `robots.txt`) unless `ALLOW_INDEXING=true`.
- Next.js standalone server on Bun with `--smol`, SQLite, ~100 MB RSS.

## Stack

Next.js 16 (App Router) on Bun · React 19 · bun:sqlite · MCP TypeScript SDK · Zod · web-push · next/font (Bricolage
Grotesque, Inter Tight, self-hosted at build time).

## Project layout

| Path | What lives there |
| --- | --- |
| `app/(app)/` | Public pages. The layout loads upcoming events, activity and the account once; pages render them. |
| `app/termin/…`, `app/(app)/termin/[slug]` | Event page (server rendered, Open Graph tags) and single-event `.ics`. |
| `app/admin/` | Editorial backend: server components for lists, server actions (`actions.ts`) for every change. |
| `app/actions.ts` | Server actions of the public app: login, registration, profile, bookmark sync, suggestions. |
| `app/api/`, `app/kalender.ics`, `app/veranstaltungen.csv`, `app/feed.xml` | Route handlers: JSON API, feeds, push, places, live (SSE). |
| `app/mcp`, `app/oauth`, `app/.well-known` | MCP endpoint and the OAuth 2.1 server for AI clients. |
| `components/` | UI. `AppData.tsx` holds the client context plus app-wide effects (theme, live refresh, service worker). |
| `lib/server/` | Framework-free domain code: database, events, users, push, feeds, OAuth, MCP, geocoding. `getApp()` is the per-process singleton. |
| `lib/client/` | Device-local state (bookmarks, filters, radius centre, push preferences, notification read state). |
| `lib/shared/` | Vocabularies, types, date formatting and reminder rules used on both sides. |
| `public/sw.js` | Service worker (offline fallback, push), plain JavaScript. |

Mutations from the UI are server actions (Next.js checks their origin, so no custom CSRF header). Open windows refresh
via `router.refresh()` when `/api/live` hints that events or activity changed.

## MCP tools

| Tool | Purpose |
| --- | --- |
| `list_events` | Compact list of events (default: upcoming) to know what exists. |
| `get_event` | Full event by id or slug. |
| `find_duplicates` | Check whether an event already exists. |
| `create_event` / `create_events` | Add one / up to 25 events; refuses likely duplicates. |
| `update_event` | Change fields, marks the event as checked. |
| `delete_event` | Delete (use `status=cancelled` for cancellations). |
| `calendar_info` | Stats, vocabularies, feed links. |
| `search` / `fetch` | Generic tools for ChatGPT deep research compatibility. |

Connect Claude Code: `claude mcp add --transport http --scope user larp-kalender https://larp.letsbenow.de/mcp`

## Configuration

| Variable | Default | Description |
| --- | --- | --- |
| `PUBLIC_URL` | from request | Public base URL, e.g. `https://larp.letsbenow.de`. |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | – | Bootstrap admin, created on start when no user exists. |
| `CONTACT_EMAIL` | `ADMIN_EMAIL` | Contact for web push (VAPID) and Nominatim. |
| `DATA_DIR` | `./.data` | SQLite location (VAPID keys are stored in the DB). |
| `GEOCODE` | `true` | Geocode addresses via Nominatim. |
| `ALLOW_INDEXING` | `false` | Allow search engines. |
| `OAUTH_REDIRECT_HOSTS` | – | Extra hosts allowed as OAuth redirect targets (built in: claude.ai, claude.com, chatgpt.com, chat.openai.com, platform.openai.com; http://localhost always). |
| `HOSTNAME` / `PORT` | `0.0.0.0` / `3000` | HTTP listener (Next.js standalone server). |

## Development

```bash
bun install
cp .env.example .env
bun scripts/seed-demo.ts   # fictional demo events (local only)
bun run dev                # http://localhost:3000
bun test
bun run typecheck
bun run build              # .next/standalone, run with: bun --smol .next/standalone/server.js
```

Users on the command line: `PASSWORD=… bun scripts/user.ts create <email> <name> [admin|editor|member]` and
`PASSWORD=… bun scripts/user.ts password <email>`.

Icons (favicons, app/maskable/Apple icons, notification badge, shortcut icons, `og-image.png`) are generated
with `bun scripts/make-icons.ts` (needs ImageMagick).

## Deployment

Coolify on `forge.letsbenow.de`: project **LARP-Kalender**, application built from the `Dockerfile` on `main`
(auto deploy on push), persistent volume at `/data`, domain `https://larp.letsbenow.de`.

```bash
coolify deploy name "LARP-Kalender" --context letsbenow
```

`docker-compose.yml` is an alternative for running it behind the Coolify Traefik proxy without the Coolify app.
