import { afterEach, describe, expect, it, vi } from "vitest";

const state = { mode: "supabase" as "supabase" | "none", error: null as null | { message: string }, hang: false };
vi.mock("@/lib/db", () => ({
  dbMode: () => state.mode,
  getDb: () => ({
    from: () => ({ select: () => ({ limit: () => (state.hang ? new Promise(() => {}) : Promise.resolve({ data: [], error: state.error })) }) }),
  }),
}));

afterEach(() => { state.mode = "supabase"; state.error = null; state.hang = false; vi.useRealTimers(); });

describe("GET /api/health", () => {
  it("200 when the database answers", async () => {
    const { GET } = await import("@/app/api/health/route");
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok", db: "ok" });
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
  it("503 (no details) when the database returns an error", async () => {
    state.error = { message: "password authentication failed for user secret" };
    const { GET } = await import("@/app/api/health/route");
    const res = await GET();
    expect(res.status).toBe(503);
    const body = JSON.stringify(await res.json());
    expect(body).toBe('{"status":"error","db":"unreachable"}');
  });
  it("503 when the database never answers (5 s timeout)", async () => {
    vi.useFakeTimers();
    state.hang = true;
    const { GET } = await import("@/app/api/health/route");
    const pending = GET();
    await vi.advanceTimersByTimeAsync(5100);
    expect((await pending).status).toBe(503);
  });
  it("200 when no database is configured (local development only)", async () => {
    state.mode = "none";
    const { GET } = await import("@/app/api/health/route");
    expect(await (await GET()).json()).toEqual({ status: "ok", db: "not_configured" });
  });
});
