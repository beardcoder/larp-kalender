# LARP-Kalender

Calendar of upcoming LARP events with registration links. Events are maintained through an admin backend or by AI
assistants via MCP (Claude, ChatGPT – e.g. a scheduled ChatGPT task that researches and adds new events).

Live: https://larp.letsbenow.de (not indexed by search engines)

## Features

- **Public PWA** (German): agenda list grouped by month, month calendar, event detail sheet, genre/type/country
  filters, radius search (device location stays on the device), bookmarks, "new since last visit" markers,
  offline support, installable, web push (new events per genre, reminders for bookmarked events: registration
  opens, deadline in ≤3 days, start in ≤7 days, cancellation), event suggestion form (lands as draft).
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
- Low memory: single compiled Bun binary with `--smol`, SQLite, ~20–50 MB RSS.

## Stack

Bun · Elysia · bun:sqlite · MCP TypeScript SDK · Zod · Preact · motion.dev (`motion/mini`) · self-hosted fonts
(Fraunces, Inter Tight).

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
| `PUBLIC_DIR` | `./dist/public` | Built frontend. |
| `GEOCODE` | `true` | Geocode addresses via Nominatim. |
| `ALLOW_INDEXING` | `false` | Allow search engines. |
| `HOST` / `PORT` | `0.0.0.0` / `3000` | HTTP listener. |

## Development

```bash
bun install
cp .env.example .env
bun scripts/seed-demo.ts   # fictional demo events (local only)
bun run dev                # client watcher + server on http://localhost:3000
bun test
bun run typecheck
bun run build              # dist/public + dist/larp-kalender (single binary)
```

CLI: `larp-kalender serve | health | user:create <email> <name> [admin|editor] | user:password <email>`
(password via `PASSWORD` env).

Icons are generated with `bun scripts/make-icons.ts` (needs ImageMagick).

## Deployment

Coolify on `forge.letsbenow.de`: project **LARP-Kalender**, application built from the `Dockerfile` on `main`
(auto deploy on push), persistent volume at `/data`, domain `https://larp.letsbenow.de`.

```bash
coolify deploy name "LARP-Kalender" --context letsbenow
```

`docker-compose.yml` is an alternative for running it behind the Coolify Traefik proxy without the Coolify app.
