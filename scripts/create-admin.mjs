// Create (or promote) an admin user. Run once after applying the SQL migration:
//   node --env-file=.env.local scripts/create-admin.mjs you@example.com "Your Name" owner
// Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. Prompts nothing: the password is generated and printed once.
import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";

const [email, name = "", role = "owner"] = process.argv.slice(2);
if (!email || !["owner", "manager", "staff"].includes(role)) {
  console.error('Usage: node --env-file=.env.local scripts/create-admin.mjs <email> "<name>" <owner|manager|staff>');
  process.exit(1);
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in the environment.");
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { persistSession: false } });

const password = crypto.randomBytes(12).toString("base64url");
let userId;
const created = await supabase.auth.admin.createUser({ email, password, email_confirm: true });
if (created.error) {
  // Already registered: look the user up and just (re)grant the role.
  const list = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  userId = list.data?.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())?.id;
  if (!userId) {
    console.error("Could not create or find the user:", created.error.message);
    process.exit(1);
  }
  console.log("User already existed. Keeping their current password.");
} else {
  userId = created.data.user.id;
  console.log(`\nTemporary password (shown once, change it after signing in): ${password}\n`);
}

const { error } = await supabase.from("admin_users").upsert({ id: userId, email, name, role, active: true }, { onConflict: "id" });
if (error) {
  console.error("Could not write admin_users:", error.message);
  process.exit(1);
}
console.log(`${email} is now an active ${role}. Sign in at /admin/login`);
