import { getEngine } from "../../lib/db/core";

/** The real database client of the current test (a temporary SQLite file). Kept under the old name for the existing tests. */
export const createLocalClient = () => getEngine();
export const resetLocalDb = () => {};
