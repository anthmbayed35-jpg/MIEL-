/**
 * One-time: register the FIRST owner by emailing them an invite link to choose their own password.
 *
 *   npm run create-owner -- --email you@example.com [--name "Your Name"]
 *
 * It never accepts, creates, prints or logs a password, and it refuses to run if any owner already exists (use
 * Settings > Team inside the admin for everyone after the first owner). Needs the same environment as the app
 * (DATABASE_PATH, AUTH_SECRET, NEXT_PUBLIC_SITE_URL, MAIL_FROM and the mail credentials). Run it on the server
 * (Railway shell) so DATABASE_PATH points at the real volume.
 */
import { assertEnv } from "../lib/env";
import { getEngine } from "../lib/db/core";
import { createInvite } from "../lib/invites";

function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

async function main() {
  const email = (arg("email") ?? "").trim().toLowerCase();
  const name = (arg("name") ?? "").trim();
  if (!/^\S+@\S+\.\S+$/.test(email)) fail('Usage: npm run create-owner -- --email you@example.com [--name "Your Name"]');
  try {
    assertEnv();
  } catch (e) {
    fail((e as Error).message);
  }
  const db = getEngine().sqlite;
  const owners = (db.prepare("SELECT COUNT(*) AS n FROM admin_users WHERE role = 'owner'").get() as { n: number }).n;
  if (owners > 0) fail("An owner already exists. This script only creates the first one. Use Settings > Team in the admin.");

  await createInvite({ email, name, role: "owner", invitedBy: null });
  db.prepare("INSERT INTO audit_log (id, actor_email, action, entity, entity_id, details) VALUES (?, 'system', 'owner_invited', 'admin_user', ?, ?)").run(crypto.randomUUID(), email, JSON.stringify({ email }));
  console.log(`\nDone. An email with a one-time link was sent to ${email} (valid 48 hours).`);
  console.log("Open the link, choose your password, then sign in at /admin/login and turn on two-factor in My account.");
}

function fail(msg: string): never {
  console.error(`\n${msg}\n`);
  process.exit(1);
}

main().catch((e) => fail(String(e?.message ?? e)));
