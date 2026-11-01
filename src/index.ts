#!/usr/bin/env bun
/** CLI entry point: `serve` (default), `health`, `user:create`, `user:password`. */

import { loadConfig } from "./config.ts";
import { openDb } from "./db.ts";
import { countUsers, createUser, updateUser } from "./repo/users.ts";
import { startServer } from "./server.ts";
import { App } from "./service.ts";
import type { UserRole } from "./shared/vocab.ts";

const cfg = loadConfig();
const [command = "serve", ...args] = process.argv.slice(2);

async function serve(): Promise<void> {
  const db = openDb(cfg.dataDir);
  if (countUsers(db) === 0) {
    if (cfg.adminEmail && cfg.adminPassword) {
      await createUser(db, { email: cfg.adminEmail, name: "Administrator", password: cfg.adminPassword, role: "admin" });
      console.log(`[setup] Administrator ${cfg.adminEmail} angelegt.`);
    } else {
      console.warn("[setup] Kein Benutzer vorhanden. ADMIN_EMAIL und ADMIN_PASSWORD setzen oder `user:create` ausführen.");
    }
  }
  const app = new App(db, cfg);
  startServer(app, cfg);
  app.start();

  const shutdown = () => {
    app.push.stop();
    db.close();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

async function health(): Promise<void> {
  try {
    const res = await fetch(`http://127.0.0.1:${cfg.port}/health`, { signal: AbortSignal.timeout(4000) });
    process.exit(res.ok ? 0 : 1);
  } catch {
    process.exit(1);
  }
}

async function userCreate(): Promise<void> {
  const [email, name, role = "editor"] = args;
  const password = process.env.PASSWORD;
  if (!email || !name || !password) {
    console.error("Usage: PASSWORD=... larp-kalender user:create <email> <name> [admin|editor]");
    process.exit(1);
  }
  const db = openDb(cfg.dataDir);
  const user = await createUser(db, { email, name, password, role: role as UserRole });
  console.log(`Created user #${user.id} ${user.email} (${user.role})`);
}

async function userPassword(): Promise<void> {
  const [email] = args;
  const password = process.env.PASSWORD;
  if (!email || !password) {
    console.error("Usage: PASSWORD=... larp-kalender user:password <email>");
    process.exit(1);
  }
  const db = openDb(cfg.dataDir);
  const row = db.query("SELECT id FROM users WHERE email = ?").get(email.toLowerCase()) as { id: number } | null;
  if (!row) {
    console.error("User not found");
    process.exit(1);
  }
  await updateUser(db, row.id, { password });
  console.log("Password updated.");
}

const commands: Record<string, () => Promise<void>> = {
  serve,
  health,
  "user:create": userCreate,
  "user:password": userPassword,
};

const run = commands[command];
if (!run) {
  console.error(`Unknown command "${command}". Available: ${Object.keys(commands).join(", ")}`);
  process.exit(1);
}
await run();
