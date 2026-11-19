/**
 * Prepares the throwaway database for the end-to-end run (run by e2e-start.mjs before the build):
 * migrations, the store's products/zones/content from config, stock to sell, a discount code, and three team members.
 *   tsx --conditions=react-server tests/support/e2e-seed.ts
 */
import { getEngine } from "../../lib/db/core";
import { hashPassword } from "../../lib/passwords";
import { seedBase } from "../../lib/seed";
import { E2E_DB, E2E_PASSWORD, USERS } from "./e2e-env";

process.env.DATABASE_PATH = E2E_DB;

async function main() {
  const e = getEngine();
  await seedBase();
  e.sqlite.prepare("UPDATE inventory_items SET on_hand = 25").run();
  const hash = await hashPassword(E2E_PASSWORD);
  for (const u of Object.values(USERS))
    e.sqlite.prepare("INSERT INTO admin_users (id, email, name, role, active, password_hash) VALUES (?,?,?,?,1,?)").run(u.id, u.email, u.name, u.role, hash);
  e.sqlite
    .prepare("INSERT INTO discounts (id, code, type, value_x100, min_order_cents, usage_limit, active) VALUES (?,?,?,?,?,?,1)")
    .run("d0000000-0000-4000-8000-000000000001", "E2E10", "percent", 1000, 0, 100);
  e.close();
  console.log("e2e seed: ok");
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
