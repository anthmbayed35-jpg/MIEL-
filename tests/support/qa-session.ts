/** QA tooling: create a session for a role directly in the QA database and write the cookie value to a file (never printed). */
import fs from "node:fs";
import { createSession } from "../../lib/session";
import { USERS } from "./e2e-env";

const [dbPath, who, out] = process.argv.slice(2);
process.env.DATABASE_PATH = dbPath;
const { token } = createSession(USERS[who as keyof typeof USERS].id, { mfaOk: true });
fs.writeFileSync(out, token);
