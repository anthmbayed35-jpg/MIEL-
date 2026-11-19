/**
 * Child process for the multi-process stock test: opens the SAME database file as its own connection and tries to
 * buy one pouch N times. Prints one JSON line {ok, failed} at the end.
 *   tsx --conditions=react-server tests/support/order-worker.ts <productId> <attempts> <workerNo>
 */
import { placeOrder } from "../../lib/orders";

const [productId, attempts, worker] = [process.argv[2], Number(process.argv[3]), Number(process.argv[4])];
let ok = 0;
let failed = 0;
for (let i = 0; i < attempts; i++) {
  try {
    placeOrder({
      customer: { name: `Worker ${worker}`, phone: `03 ${String(worker).padStart(2, "0")}${String(i).padStart(4, "0")}`, address: "Hamra, Bldg 5" },
      items: [{ productId, qty: 1 }],
      region: "Beirut",
      source: "web",
      actor: "customer",
    });
    ok++;
  } catch {
    failed++;
  }
}
console.log(JSON.stringify({ ok, failed }));
