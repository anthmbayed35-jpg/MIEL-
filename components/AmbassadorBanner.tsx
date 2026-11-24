import Link from "next/link";
import { getProgram } from "@/lib/program";

/** A slim strip on the home page that points to /ambassadors. The team switches it on and off in the admin (Ambassadors > Settings). */
export function AmbassadorBanner() {
  const { banner } = getProgram();
  if (!banner.enabled) return null;
  return (
    <aside aria-label="Ambassador program" className="mx-auto mt-[88px] max-w-7xl px-5 md:px-8">
      <Link href="/ambassadors" className="glass-flat flex min-h-14 items-center justify-between gap-4 rounded-2xl px-5 text-[17px] text-fg">
        <span>{banner.text}</span>
        <span className="mono shrink-0">APPLY →</span>
      </Link>
    </aside>
  );
}
