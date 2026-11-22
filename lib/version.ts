/** Optimistic locking for admin forms: the form carries the record's `version`; a save made from a stale page is refused. */
export const formVersion = (fd: FormData): number | undefined => {
  const n = Number(fd.get("version"));
  return Number.isInteger(n) && n > 0 ? n : undefined;
};

/** Applies the form's version (when it has one) to an update. */
export function guarded<T extends { ifVersion(v: number): unknown }>(q: T, fd: FormData): T {
  const v = formVersion(fd);
  if (v !== undefined) q.ifVersion(v);
  return q;
}

/** Runs a save and turns a thrown error (a stale version, a constraint) into the form's error message instead of a raw crash. */
export async function orFail<T>(fn: () => Promise<T>): Promise<T | { error: string }> {
  try {
    return await fn();
  } catch (e) {
    // redirects, 401/403/404 (digest) and the permission gate are never turned into a form message
    if ((e as { digest?: string }).digest || /^(HTTP_|NEXT_)/.test((e as Error).message)) throw e;
    return { error: e instanceof Error ? e.message : "Something went wrong." };
  }
}
