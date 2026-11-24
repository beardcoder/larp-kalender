/** User management on the command line: `bun scripts/user.ts create <email> <name> [admin|editor|member]` or `password <email>`, password via PASSWORD env. */

import { loadConfig } from "../lib/server/config.ts";
import { openDb } from "../lib/server/db.ts";
import { createUser, updateUser } from "../lib/server/users.ts";
import type { UserRole } from "../lib/shared/vocab.ts";

const [command, email, name, role = "editor"] = process.argv.slice(2);
const password = process.env.PASSWORD;
const db = openDb(loadConfig().dataDir);

if (command === "create" && email && name && password) {
  const user = await createUser(db, { email, name, password, role: role as UserRole });
  console.log(`Created user #${user.id} ${user.email} (${user.role})`);
} else if (command === "password" && email && password) {
  const row = db.query("SELECT id FROM users WHERE email = ?").get(email.toLowerCase()) as { id: number } | null;
  if (!row) throw new Error("User not found");
  await updateUser(db, row.id, { password });
  console.log("Password updated.");
} else {
  console.error("Usage: PASSWORD=… bun scripts/user.ts create <email> <name> [admin|editor|member]\n       PASSWORD=… bun scripts/user.ts password <email>");
  process.exit(1);
}
