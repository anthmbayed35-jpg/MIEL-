// Runs before `next build`. Next keeps fetched data (every Supabase read) in .next/cache/fetch-cache, and that
// folder can survive between builds (a local rebuild, or Railway's build cache). A build made soon after the last one
// could then bake the PREVIOUS data into the pages (old product ids, old prices). Always build from live data.
import { rmSync } from "node:fs";
import { join } from "node:path";

rmSync(join(process.cwd(), ".next", "cache", "fetch-cache"), { recursive: true, force: true });
console.log("clean-data-cache: removed .next/cache/fetch-cache");
