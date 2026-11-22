import Link from "next/link";

/** Previous / next links that keep the current filters. Server component. */
export function Pager({ basePath, params, page, pages, total, noun = "result" }: { basePath: string; params: Record<string, string | undefined>; page: number; pages: number; total: number; noun?: string }) {
  const href = (p: number) => {
    const qs = new URLSearchParams(Object.entries({ ...params, page: p > 1 ? String(p) : undefined }).filter(([, v]) => v) as [string, string][]).toString();
    return `${basePath}${qs ? `?${qs}` : ""}`;
  };
  return (
    <nav className="mt-6 flex flex-wrap items-center justify-between gap-3" aria-label="Pagination">
      {page > 1 ? <Link href={href(page - 1)} className="pill-btn pill-glass">← Previous</Link> : <span />}
      <span className="mono !text-body">PAGE {page} / {pages} · {total} {noun}{total === 1 ? "" : "s"}</span>
      {page < pages ? <Link href={href(page + 1)} className="pill-btn pill-glass">Next →</Link> : <span />}
    </nav>
  );
}
