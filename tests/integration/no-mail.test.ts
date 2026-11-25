import { spawn } from "node:child_process";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", async () => (await import("../support/mocks")).navigationMock);
vi.mock("next/headers", async () => (await import("../support/mocks")).headersMock);
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { getEngine } from "../../lib/db/core";
import { mailConfigured, mailStatus, warnIfMailMissing } from "@/lib/mail-config";
import { sendMail } from "@/lib/mail";
import { peekToken, consumeToken } from "@/lib/invites";
import { notifyNewOrder } from "@/lib/notify";
import { h, ID, jar, outbox, reqHeaders, resetState, testDir } from "../support/state";
import { checkoutInput } from "../support/checkout";
import { seedStore } from "../support/seed";

const sql = () => getEngine().sqlite;
const form = (o: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(o)) fd.set(k, v);
  return fd;
};
const noMail = () => {
  delete process.env.MAIL_PROVIDER;
  delete process.env.MAIL_OUTBOX;
  delete process.env.MAIL_FROM;
  delete process.env.BREVO_API_KEY;
  delete process.env.SMTP_URL;
};

beforeEach(async () => {
  resetState();
  await seedStore();
  reqHeaders["x-forwarded-for"] = "6.6.6.6";
  noMail();
  process.env.MIEL_ENV = "production"; // the strictest environment: still no failure without email
});
afterEach(() => {
  delete process.env.MIEL_ENV;
  vi.restoreAllMocks();
});

describe("the mail adapter without configuration", () => {
  it("reports not_configured, also for half-configured setups", () => {
    expect(mailConfigured()).toBe(false);
    expect(mailStatus()).toBe("not_configured");
    process.env.MAIL_FROM = "MIEL+ <orders@miel.example>"; // sender but no key
    expect(mailStatus()).toBe("not_configured");
    process.env.BREVO_API_KEY = "k";
    expect(mailStatus()).toBe("configured");
    delete process.env.BREVO_API_KEY;
    process.env.MAIL_PROVIDER = "smtp"; // smtp chosen but no URL
    expect(mailStatus()).toBe("not_configured");
    process.env.SMTP_URL = "smtp://u:p@h:587";
    expect(mailStatus()).toBe("configured");
  });

  it("sendMail is a safe no-op: never throws, returns sent:false, records 'email not sent' with no address and no body", async () => {
    const r = await sendMail({ to: "someone.private@example.com", subject: "Reset your password", text: "secret link https://x/y?token=abc" });
    expect(r).toEqual({ sent: false, reason: "not_configured" });
    const rows = sql().prepare("SELECT actor_email, action, entity, entity_id, details FROM audit_log WHERE action = 'email_not_sent'").all() as Record<string, string>[];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ actor_email: "system", entity: "email", entity_id: "not_configured" });
    expect(JSON.parse(rows[0].details)).toEqual({ reason: "not_configured", subject: "Reset your password" });
    expect(JSON.stringify(rows)).not.toMatch(/someone\.private|token=abc|secret link/);
    expect(outbox()).toEqual([]);
  });

  it("still never throws if the audit log itself is unavailable", async () => {
    sql().exec("ALTER TABLE audit_log RENAME TO audit_log_gone");
    await expect(sendMail({ to: "a@b.test", subject: "s", text: "t" })).resolves.toEqual({ sent: false, reason: "not_configured" });
  });

  it("logs exactly one startup warning, with no secrets in it", () => {
    process.env.AUTH_SECRET = "SECRET-VALUE-THAT-MUST-NOT-APPEAR-1234567890";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    warnIfMailMissing();
    expect(warn).toHaveBeenCalledTimes(1);
    const msg = String(warn.mock.calls[0][0]);
    expect(msg).toMatch(/Email is not configured/);
    expect(msg).not.toContain("SECRET-VALUE");
    expect(msg).not.toMatch(/@|https?:\/\//);
    process.env.MAIL_PROVIDER = "file";
    process.env.MAIL_OUTBOX = path.join(testDir(), "o.jsonl");
    delete process.env.MIEL_ENV;
    warn.mockClear();
    warnIfMailMissing();
    expect(warn).not.toHaveBeenCalled(); // configured: silent
  });

  it("a configured provider that fails is still an error (never silent)", async () => {
    process.env.MAIL_FROM = "MIEL+ <orders@miel.example>";
    process.env.BREVO_API_KEY = "rejected-key";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("nope", { status: 401 }));
    await expect(sendMail({ to: "a@b.test", subject: "s", text: "t" })).rejects.toThrow(/refused the message \(HTTP 401\)/);
  });
});

describe("things that depend on email keep working without it", () => {
  const owner = () => {
    h.user = { id: ID.owner, email: "owner@t.test" };
  };

  it("password reset from Settings > Team gives the owner a one-time link to hand over (and it works once)", async () => {
    owner();
    const { sendReset } = await import("@/app/admin/(app)/settings/team/actions");
    const r = await sendReset(null, form({ id: ID.staff }));
    expect(r).toMatchObject({ ok: expect.stringMatching(/Email isn.t configured yet/), copy: { label: expect.stringMatching(/reset link/) } });
    const link = r!.copy!.value;
    expect(link.startsWith("https://miel.example/admin/set-password?type=reset&token=")).toBe(true);
    const token = new URL(link).searchParams.get("token")!;
    expect(peekToken("reset", token)).toMatchObject({ email: "staff@t.test" });
    await consumeToken("reset", token, "handed over passphrase 99");
    expect(peekToken("reset", token)).toBeNull();
    expect(sql().prepare("SELECT details FROM audit_log WHERE action = 'password_reset_sent'").get()).toEqual({ details: expect.stringContaining("manual_link") });
  });

  it("when email IS configured the link is emailed and NOT shown", async () => {
    delete process.env.MIEL_ENV; // the test-only file mailer is refused in production
    process.env.MAIL_PROVIDER = "file";
    process.env.MAIL_OUTBOX = path.join(testDir(), "outbox.jsonl");
    owner();
    const { sendReset } = await import("@/app/admin/(app)/settings/team/actions");
    const r = await sendReset(null, form({ id: ID.staff }));
    expect(r).toMatchObject({ ok: "Reset link sent to staff@t.test." });
    expect(r!.copy).toBeUndefined();
  });

  it("'Forgot password' says reset needs the owner, makes no token, and gives the same answer for any address", async () => {
    const { requestReset } = await import("@/app/admin/login/actions");
    const a = await requestReset(null, form({ email: "staff@t.test" }));
    const b = await requestReset(null, form({ email: "ghost@t.test" }));
    expect(a).toEqual(b);
    expect(a).toEqual({ ok: expect.stringMatching(/isn.t available yet. Ask the owner/) });
    expect(sql().prepare("SELECT COUNT(*) n FROM password_resets").get()).toEqual({ n: 0 });
  });

  it("an order alert email is skipped without any error and the order is unaffected", async () => {
    sql().prepare("INSERT INTO settings (key, value) VALUES ('notifications', ?)").run(JSON.stringify({ email_on_new_order: true, email: "boss@t.test" }));
    await expect(notifyNewOrder({ number: 1001, total: 30, customer: "A B", phone: "+9613123456", region: "Beirut", lines: [{ name: "GOLD", qty: 1 }] })).resolves.toBeUndefined();
    expect(sql().prepare("SELECT COUNT(*) n FROM audit_log WHERE action = 'email_not_sent'").get()).toEqual({ n: 1 });
  });

  it("the health check stays 200 and reports mail: not_configured", async () => {
    const { GET } = await import("@/app/api/health/route");
    const r = await GET();
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ status: "ok", db: "ok", mail: "not_configured" });
  });

  it("site live + no mail: the app is not blocked (checkout works, admin pages render)", async () => {
    delete process.env.SITE_MODE;
    const { placeOrder } = await import("@/app/actions/checkout");
    const gold = sql().prepare("SELECT id FROM products WHERE slug = 'gold'").get() as { id: string };
    const res = await placeOrder(checkoutInput(gold.id, { name: "Live Customer", phone: "03 222 333" }));
    expect(res).toMatchObject({ ok: true });
    owner();
    const { GET } = await import("@/app/admin/api/notifications/route");
    expect((await GET()).status).toBe(200);
  });

  it("the owner script prints a one-time link (never a password) when email is not configured", async () => {
    const env = {
      PATH: process.env.PATH ?? "",
      SystemRoot: process.env.SystemRoot ?? "",
      DATABASE_PATH: path.join(testDir(), "script.db"),
      AUTH_SECRET: "test-only-auth-secret-at-least-32-characters-long",
      NEXT_PUBLIC_SITE_URL: "https://miel.example",
    };
    const run = () =>
      new Promise<{ code: number | null; out: string }>((resolve) => {
        const c = spawn(process.execPath, ["--import", "tsx", "--conditions=react-server", path.resolve(__dirname, "../../scripts/create-owner.ts"), "--email", "boss@miel.example"], { env: env as unknown as NodeJS.ProcessEnv, cwd: path.resolve(__dirname, "../..") });
        let out = "";
        c.stdout.on("data", (d) => (out += d));
        c.stderr.on("data", (d) => (out += d));
        c.on("close", (code) => resolve({ code, out }));
      });
    const r = await run();
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/Email is not configured, so nothing was sent/);
    const link = r.out.match(/https:\/\/miel\.example\/admin\/set-password\?type=invite&token=\S+/)![0];
    expect(link.length).toBeGreaterThan(60);
    expect(r.out).not.toMatch(/password is|your password:/i);
    void jar;
  }, 60_000);
});
