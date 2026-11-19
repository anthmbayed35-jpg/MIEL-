import { mailConfigured } from "@/lib/mail-config";
import { inMaintenance } from "@/lib/site-mode";

/** Standing notices at the top of every admin page. Rendered on the server from the current environment. */
export function StatusBanners() {
  const hidden = inMaintenance();
  const noMail = !mailConfigured();
  if (!hidden && !noMail) return null;
  return (
    <div className="mb-6 space-y-3">
      {hidden && (
        <p role="status" data-banner="maintenance" className="rounded-2xl border border-acid/50 bg-acid/10 px-4 py-3 text-[15px] text-fg">
          <b>Storefront is hidden from the public.</b> Set SITE_MODE=live to launch.
        </p>
      )}
      {noMail && (
        <p role="status" data-banner="mail" className="rounded-2xl border border-white/25 bg-white/5 px-4 py-3 text-[15px] text-fg">
          <b>Email is not configured yet.</b> Invites and password resets show a one-time link for you to hand over manually, and order alert emails are skipped.
        </p>
      )}
    </div>
  );
}
