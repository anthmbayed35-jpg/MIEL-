import { getAdmin } from "@/lib/auth";
import { can } from "@/lib/roles";
import { getAmbassador } from "@/lib/ambassador/auth";
import { getEngine } from "@/lib/db";
import { FILE_NAME_RE, readUpload, typeOf } from "@/lib/ambassador/files";

export const dynamic = "force-dynamic";

/**
 * Serves resources (any signed-in ambassador or team member) and proof screenshots (only the ambassador who uploaded it, or a team
 * member who can manage ambassadors). Exact file-name pattern only; never cached by shared caches.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ kind: string; name: string }> }) {
  const { kind, name } = await ctx.params;
  if ((kind !== "resources" && kind !== "proofs") || !FILE_NAME_RE.test(name)) return new Response("Not found", { status: 404 });
  const me = await getAmbassador();
  const admin = me ? null : await getAdmin();
  const staff = !!admin && can(admin.role, "affiliates.read");
  if (!me && !staff) return new Response("Sign in required", { status: 401 });
  if (kind === "proofs" && !staff) {
    const own = getEngine().sqlite.prepare("SELECT 1 FROM mission_submissions WHERE proof_file = ? AND affiliate_id = ?").get(name, me!.id);
    if (!own) return new Response("Not found", { status: 404 });
  }
  const data = readUpload(kind, name);
  if (!data) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(data), {
    headers: { "Content-Type": typeOf(name), "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Disposition": `${typeOf(name) === "application/pdf" ? "attachment" : "inline"}; filename="${name}"` },
  });
}
