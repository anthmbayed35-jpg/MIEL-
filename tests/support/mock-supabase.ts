/**
 * TEST-ONLY stand-in for Supabase, so the production build can be exercised end to end with `npm start`
 * (login, checkout, new-order alert, image upload, revalidation, health) without a real project.
 * It speaks just enough of the three HTTP APIs the app uses:
 *   GoTrue    /auth/v1/token, /user, /logout, /recover, /invite
 *   PostgREST /rest/v1/<table> (GET, HEAD, POST, PATCH, DELETE) and /rest/v1/rpc/<name>
 *   Storage   /storage/v1/object/<bucket>/<name>
 * Data lives in tests/support/local-db.ts (in memory). Nothing here ships with the app.
 *
 * Run:  npx tsx --conditions=react-server tests/support/mock-supabase.ts   (PORT via MOCK_PORT, default 3402)
 * Test-only hooks live under /__test/.
 */
import http from "node:http";
import crypto from "node:crypto";
import { createLocalClient, dumpLocalDb } from "./local-db";

export const MOCK_OWNER = { id: "00000000-0000-4000-8000-0000000000a1", email: "owner@e2e.test", password: "e2e-only-not-a-real-password" };

const accounts = new Map<string, { id: string; password: string }>([[MOCK_OWNER.email, { id: MOCK_OWNER.id, password: MOCK_OWNER.password }]]);
const refreshTokens = new Map<string, string>(); // refresh token -> email
const storage = new Map<string, Buffer>();
const log = { recover: [] as string[] };
let ready = false; // /__test/ping answers 503 until seeding is done, so nothing builds against an empty database
let dbDown = false; // test hook: make the database answer 500 (health check must then return 503)

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwtFor = (id: string, email: string) => {
  const now = Math.floor(Date.now() / 1000);
  const body = { aud: "authenticated", role: "authenticated", sub: id, email, aal: "aal1", amr: [{ method: "password", timestamp: now }], session_id: crypto.randomUUID(), iat: now, exp: now + 3600 };
  const head = b64({ alg: "HS256", typ: "JWT" });
  return `${head}.${b64(body)}.${crypto.createHmac("sha256", "mock").update(`${head}.${b64(body)}`).digest("base64url")}`;
};
const userObj = (id: string, email: string) => ({ id, aud: "authenticated", role: "authenticated", email, app_metadata: {}, user_metadata: {}, factors: [], created_at: new Date().toISOString() });
const session = (email: string) => {
  const a = accounts.get(email)!;
  const refresh_token = crypto.randomUUID();
  refreshTokens.set(refresh_token, email);
  return { access_token: jwtFor(a.id, email), token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token, user: userObj(a.id, email) };
};

// ---------- PostgREST ----------
const RESERVED = new Set(["select", "order", "limit", "offset", "on_conflict", "columns"]);

/** URL values are strings; coerce to the type the column holds so the in-memory engine's strict comparisons work. */
function coerce(table: string, col: string, v: string): any {
  const sample = (dumpLocalDb().tables[table] ?? []).find((r) => r[col] != null)?.[col];
  if (v === "null") return null;
  if (typeof sample === "number") return Number(v);
  if (typeof sample === "boolean") return v === "true";
  return v;
}
const unquote = (s: string) => s.replace(/^"(.*)"$/, "$1");

function restQuery(table: string, method: string, params: URLSearchParams, headers: http.IncomingHttpHeaders, body: any) {
  const db = createLocalClient() as any;
  const prefer = String(headers.prefer ?? "");
  const wantRows = /return=representation/.test(prefer);
  let q = db.from(table);
  if (method === "GET" || method === "HEAD") q = q.select("*", { count: /count=exact/.test(prefer) ? "exact" : undefined, head: method === "HEAD" });
  else if (method === "POST") {
    q = /resolution=merge-duplicates/.test(prefer) ? q.upsert(body, { onConflict: params.get("on_conflict") ?? undefined }) : q.insert(body);
    if (wantRows) q = q.select();
  } else if (method === "PATCH") {
    q = q.update(body);
    if (wantRows) q = q.select();
  } else if (method === "DELETE") {
    q = q.delete();
    if (wantRows) q = q.select();
  }
  for (const [key, raw] of params) {
    if (RESERVED.has(key)) continue;
    if (key === "or") { q = q.or(raw.replace(/^\(|\)$/g, "")); continue; }
    const dot = raw.indexOf(".");
    const op = raw.slice(0, dot);
    const val = raw.slice(dot + 1);
    if (op === "in") q = q.in(key, val.replace(/^\(|\)$/g, "").split(",").map((x) => coerce(table, key, unquote(x))));
    else if (op === "is") q = q.is(key, val === "null" ? null : val === "true");
    else if (op === "ilike" || op === "like") q = q[op](key, val);
    else if (["eq", "neq", "gt", "gte", "lt", "lte"].includes(op)) q = q[op](key, coerce(table, key, val));
  }
  const order = params.get("order");
  if (order) for (const part of order.split(",")) { const [col, dir] = part.split("."); q = q.order(col, { ascending: dir !== "desc" }); }
  const limit = params.get("limit");
  const offset = Number(params.get("offset") ?? 0);
  if (limit !== null) q = offset ? q.range(offset, offset + Number(limit) - 1) : q.limit(Number(limit));
  else if (offset) q = q.range(offset, offset + 100000);
  if (/pgrst\.object/.test(String(headers.accept ?? ""))) q = q.single();
  return q as PromiseLike<{ data: any; error: { message: string; code?: string } | null; count?: number | null }>;
}

// ---------- plumbing ----------
const readBody = (req: http.IncomingMessage) =>
  new Promise<Buffer>((resolve) => { const c: Buffer[] = []; req.on("data", (d) => c.push(d)); req.on("end", () => resolve(Buffer.concat(c))); });
const send = (res: http.ServerResponse, status: number, body?: unknown, extra: Record<string, string> = {}) => {
  const data = body === undefined ? "" : JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json", ...extra });
  res.end(data);
};

async function handle(req: http.IncomingMessage, res: http.ServerResponse) {
  const url = new URL(req.url ?? "/", "http://mock");
  const p = url.pathname;
  const method = req.method ?? "GET";
  const raw = await readBody(req);
  const ctype = String(req.headers["content-type"] ?? "");
  const json = () => (raw.length && ctype.includes("json") ? JSON.parse(raw.toString("utf8")) : {});

  // test hooks
  if (p === "/__test/db-down") { dbDown = url.searchParams.get("on") === "1"; return send(res, 200, { dbDown }); }
  if (p === "/__test/storage") return send(res, 200, { objects: [...storage.keys()] });
  if (p === "/__test/recover") return send(res, 200, log.recover);
  if (p === "/__test/ping") return send(res, ready ? 200 : 503, { ok: ready });

  // ---- GoTrue
  if (p === "/auth/v1/token") {
    const body = json();
    const grant = url.searchParams.get("grant_type");
    if (grant === "password") {
      const a = accounts.get(String(body.email ?? "").toLowerCase());
      if (!a || a.password !== body.password) return send(res, 400, { code: 400, error_code: "invalid_credentials", msg: "Invalid login credentials" });
      return send(res, 200, session(String(body.email).toLowerCase()));
    }
    if (grant === "refresh_token") {
      const email = refreshTokens.get(body.refresh_token);
      if (!email) return send(res, 400, { code: 400, error_code: "refresh_token_not_found", msg: "Invalid Refresh Token" });
      return send(res, 200, session(email));
    }
    return send(res, 400, { msg: "unsupported grant" });
  }
  if (p === "/auth/v1/user") {
    const token = String(req.headers.authorization ?? "").replace(/^Bearer /, "");
    try {
      const claims = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
      if (!claims.exp || claims.exp * 1000 < Date.now()) throw new Error("expired");
      return send(res, 200, userObj(claims.sub, claims.email));
    } catch {
      return send(res, 401, { code: 401, error_code: "bad_jwt", msg: "invalid JWT" });
    }
  }
  if (p === "/auth/v1/logout") { res.writeHead(204); return res.end(); }
  if (p === "/auth/v1/recover") { log.recover.push(String(json().email ?? "")); return send(res, 200, {}); }

  // ---- Storage
  if (p.startsWith("/storage/v1/object/")) {
    const rest = p.slice("/storage/v1/object/".length);
    if (method === "POST" || method === "PUT") {
      // multipart/form-data from supabase-js: keep the raw body (the file part is all we need to prove the upload arrived)
      storage.set(rest, raw);
      return send(res, 200, { Key: rest, Id: crypto.randomUUID() });
    }
    const obj = storage.get(rest.replace(/^public\//, ""));
    if (!obj) return send(res, 404, { message: "not found" });
    res.writeHead(200, { "Content-Type": "image/webp" });
    return res.end(obj);
  }

  // ---- PostgREST
  if (p.startsWith("/rest/v1/")) {
    if (dbDown) return send(res, 500, { message: "database is down (test)", code: "XX000" });
    const name = p.slice("/rest/v1/".length);
    if (name.startsWith("rpc/")) {
      const out = await createLocalClient().rpc(name.slice(4), json());
      return out.error ? send(res, 400, { message: out.error.message }) : send(res, 200, out.data);
    }
    const r = await restQuery(name, method, url.searchParams, req.headers, json());
    if (r.error) {
      const single = r.error.code === "PGRST116";
      return send(res, single ? 406 : r.error.code === "23505" ? 409 : 400, { message: r.error.message, code: r.error.code ?? "PGRST000", details: null, hint: null });
    }
    const headers: Record<string, string> = {};
    if (r.count != null) headers["Content-Range"] = `0-${Math.max(0, r.count - 1)}/${r.count}`;
    if (method === "HEAD") { res.writeHead(200, headers); return res.end(); }
    if (r.data === null) { res.writeHead(method === "POST" ? 201 : 204, headers); return res.end(); }
    return send(res, method === "POST" ? 201 : 200, r.data, headers);
  }

  return send(res, 404, { message: `mock: no route for ${method} ${p}` });
}

async function seed(port: number) {
  // Seed through the app's own seeding code, talking to this very server over HTTP (so the PostgREST layer is exercised too).
  Object.assign(process.env, {
    NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${port}`,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "mock-anon",
    SUPABASE_SERVICE_ROLE_KEY: "mock-service",
  });
  const { seedBase } = await import("../../lib/seed");
  await seedBase();
  const db = createLocalClient() as any;
  await db.from("admin_users").insert({ id: MOCK_OWNER.id, email: MOCK_OWNER.email, name: "E2E Owner", role: "owner", active: true });
  for (const item of dumpLocalDb().tables.inventory_items ?? []) item.on_hand = 25; // stock to sell
}

export async function startMock(port = Number(process.env.MOCK_PORT ?? 3402)) {
  const server = http.createServer((req, res) => handle(req, res).catch((e) => send(res, 500, { message: String(e?.message ?? e) })));
  await new Promise<void>((r) => server.listen(port, "127.0.0.1", r));
  await seed(port);
  ready = true;
  return server;
}

if (process.argv[1] && /mock-supabase\.ts$/.test(process.argv[1].replace(/\\/g, "/"))) {
  startMock().then(() => console.log(`mock supabase ready on ${process.env.MOCK_PORT ?? 3402}`));
}
