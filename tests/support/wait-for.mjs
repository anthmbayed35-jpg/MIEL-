// Tests only: block until a URL answers 2xx (used so the production build never starts before the mock database is seeded).
const url = process.argv[2];
const deadline = Date.now() + 60_000;
let ok = false;
while (!ok && Date.now() < deadline) {
  try {
    const res = await fetch(url);
    await res.arrayBuffer(); // drain, so no handle is left open when the process ends
    ok = res.ok;
  } catch {}
  if (!ok) await new Promise((r) => setTimeout(r, 300));
}
if (!ok) {
  console.error(`wait-for: ${url} never became ready`);
  process.exitCode = 1;
}
