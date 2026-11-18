/**
 * One-time: register the FIRST owner and email them a link to choose their own password.
 *
 *   npm run create-owner -- --email you@example.com [--name "Your Name"]
 *
 * It never creates, generates, prints or logs a password. It refuses to run if any owner already exists
 * (use Settings → Team inside the admin for everyone after the first owner).
 * Needs NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SITE_URL
 * in the environment (`node --env-file=.env.local` style, via the npm script).
 */
import { createClient } from "@supabase/supabase-js";
import { assertEnv } from "../lib/env";

function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

async function main() {
  const email = (arg("email") ?? "").trim().toLowerCase();
  const name = (arg("name") ?? "").trim();
  if (!/^\S+@\S+\.\S+$/.test(email)) fail("Usage: npm run create-owner -- --email you@example.com [--name \"Your Name\"]");

  const need = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "NEXT_PUBLIC_SITE_URL"].filter((k) => !process.env[k]);
  if (need.length) fail(`Missing environment variables: ${need.join(", ")} (see docs/OPERATIONS.md).`);
  try {
    assertEnv();
  } catch (e) {
    fail((e as Error).message);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const anon = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const redirectTo = `${process.env.NEXT_PUBLIC_SITE_URL!.replace(/\/$/, "")}/admin/auth/confirm?next=/admin/set-password`;

  const owners = await admin.from("admin_users").select("id").eq("role", "owner");
  if (owners.error) fail(`Couldn't read admin_users (did you run the SQL migrations?): ${owners.error.message}`);
  if ((owners.data ?? []).length > 0) fail("An owner already exists. This script only creates the first one. Use Settings → Team in the admin.");

  let id: string | undefined;
  const invited = await admin.auth.admin.inviteUserByEmail(email, { data: { name }, redirectTo });
  if (invited.data?.user) id = invited.data.user.id;
  else if (/already|registered/i.test(invited.error?.message ?? "")) {
    // The account exists (e.g. created in the dashboard): send a password-reset link instead.
    const list = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    id = list.data?.users.find((u) => u.email?.toLowerCase() === email)?.id;
    if (!id) fail("That email is registered but couldn't be looked up. Check the Supabase Authentication → Users page.");
    const reset = await anon.auth.resetPasswordForEmail(email, { redirectTo });
    if (reset.error) fail(`Couldn't send the reset link: ${reset.error.message}`);
  } else fail(`Couldn't send the invite: ${invited.error?.message ?? "unknown error"}. Check Supabase email settings.`);

  const ins = await admin.from("admin_users").insert({ id, email, name, role: "owner", active: true });
  if (ins.error) fail(`Invite sent, but registering the owner failed: ${ins.error.message}`);
  await admin.from("audit_log").insert({ actor_email: "system", action: "owner_created", entity: "admin_user", entity_id: id, details: { email } });

  console.log(`\nDone. An email with a link was sent to ${email}.`);
  console.log("Open the link, choose your password, and sign in at /admin/login.");
}

function fail(msg: string): never {
  console.error(`\n${msg}\n`);
  process.exit(1);
}

main().catch((e) => fail(String(e?.message ?? e)));
