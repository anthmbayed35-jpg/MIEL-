import { getAdmin, sessionToken } from "@/lib/auth";
import { subscribe, type Stamped } from "@/lib/events";
import { can } from "@/lib/roles";
import { lookupSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Live alerts for the admin (Server-Sent Events): new orders, status changes, stock changes and dashboard refreshes.
 * Needs a signed-in admin who may read orders; the session is re-checked every minute while the stream is open, so a
 * deactivated or signed-out person stops receiving events. One server process = one in-memory bus (single replica).
 * The browser reconnects by itself (retry: 3000) and the client refetches on reconnect; if the stream is down it
 * falls back to polling every 30 s.
 */
export async function GET(req: Request) {
  const admin = await getAdmin();
  if (!admin) return Response.json({ error: "Authentication required" }, { status: 401 });
  if (!can(admin.role, "orders.read")) return Response.json({ error: "Forbidden" }, { status: 403 });
  const token = await sessionToken();

  const enc = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (chunk: string) => {
        try {
          controller.enqueue(enc.encode(chunk));
        } catch {
          cleanup();
        }
      };
      const onEvent = (e: Stamped) => send(`id: ${e.id}\nevent: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`);
      const unsub = subscribe(onEvent);
      send(`retry: 3000\nevent: hello\ndata: {"ok":true}\n\n`);
      const beat = setInterval(() => send(`: ping\n\n`), 20_000);
      const recheck = setInterval(() => {
        if (!lookupSession(token).ok) {
          send(`event: auth\ndata: {"signedOut":true}\n\n`);
          cleanup();
        }
      }, 60_000);
      cleanup = () => {
        clearInterval(beat);
        clearInterval(recheck);
        unsub();
        try {
          controller.close();
        } catch {}
      };
      req.signal.addEventListener("abort", cleanup);
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform", // no-transform: the server must not gzip-buffer the stream
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
