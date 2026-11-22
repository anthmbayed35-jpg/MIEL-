/**
 * In-process event bus behind the admin's live alerts (Server-Sent Events, app/admin/api/events).
 * One server process = one bus, which is exactly the single-replica setup. If the app is ever run with more than one
 * instance this must move to a shared channel, otherwise an admin would only see events from "their" instance.
 */
export type LiveEvent =
  | { type: "order.created"; orderId: string; number: number; total: number }
  | { type: "order.status"; orderId: string; number: number; status: string }
  | { type: "stock.changed"; itemId?: string }
  | { type: "application.created"; id: string }
  | { type: "kpi.refresh" };

export type Stamped = LiveEvent & { id: number; at: string };
type Listener = (e: Stamped) => void;

const g = globalThis as unknown as { __mielBus?: { listeners: Set<Listener>; seq: number } };
const bus = () => (g.__mielBus ??= { listeners: new Set(), seq: 0 });

export function publish(e: LiveEvent) {
  const b = bus();
  const stamped = { ...e, id: ++b.seq, at: new Date().toISOString() } as Stamped;
  for (const l of b.listeners) {
    try {
      l(stamped);
    } catch {
      // a broken listener must never break an order
    }
  }
}

export function subscribe(fn: Listener): () => void {
  const b = bus();
  b.listeners.add(fn);
  return () => b.listeners.delete(fn);
}

export const listenerCount = () => bus().listeners.size;
