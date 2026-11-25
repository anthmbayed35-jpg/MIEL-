import { requirePerm } from "@/lib/auth";
import { newApplicationCount } from "@/lib/affiliates";
import { listApplications } from "@/lib/affiliates";
import { ActionForm, SubmitButton } from "@/components/admin/ActionForm";
import { SubNav } from "@/components/admin/SubNav";
import { affiliateTabs } from "@/lib/admin-tabs";
import { Card, Empty, PageHeader } from "@/components/admin/ui";
import { approveApplicationAction, createAccountAction, rejectApplicationAction } from "../actions";
import { waLink } from "@/lib/phone";
import { saveApplicationNotesAction } from "../program/actions";

export const metadata = { title: "Affiliate applications" };
export const dynamic = "force-dynamic";

const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { timeZone: "Asia/Beirut", day: "numeric", month: "short", year: "numeric" });
const cls: Record<string, string> = { new: "st-new", approved: "st-delivered", rejected: "st-cancelled" };

export default async function ApplicationsPage() {
  const admin = await requirePerm("affiliates.read");
  const apps = listApplications();
  return (
    <>
      <PageHeader eyebrow="From /ambassadors" title="Applications" />
      <SubNav items={affiliateTabs(newApplicationCount())} role={admin.role} />
      {apps.length === 0 ? (
        <Card><Empty title="No applications yet." hint="People apply on the Ambassadors page of the store." /></Card>
      ) : (
        <ul className="space-y-4">
          {apps.map((a) => (
            <Card as="li" key={a.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-[20px] font-semibold text-fg">{a.name}</h2>
                  <p className="mt-1 text-[16px] text-body">
                    {a.instagram_handle && <span>Instagram <a className="text-fg underline underline-offset-4" href={`https://instagram.com/${a.instagram_handle}`} target="_blank" rel="noopener noreferrer">@{a.instagram_handle}</a></span>}
                    {a.instagram_handle && a.tiktok_handle && " · "}
                    {a.tiktok_handle && <span>TikTok <a className="text-fg underline underline-offset-4" href={`https://tiktok.com/@${a.tiktok_handle}`} target="_blank" rel="noopener noreferrer">@{a.tiktok_handle}</a></span>}
                  </p>
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                    <span className="text-[22px] font-semibold text-fg">{a.phone || "No WhatsApp number"}</span>
                    {a.phone && <a href={waLink(a.phone, `Hi ${a.name.split(" ")[0]}, this is MIEL+. Thanks for applying to become an ambassador.`)} target="_blank" rel="noopener noreferrer" className="pill-btn pill-lime">Open WhatsApp</a>}
                  </div>
                  {a.email && <p className="mt-2 text-[15px] text-body">{a.email}</p>}
                  <p className="mt-1 text-[15px] text-body">{[a.followers && `${a.followers} followers`, a.city, a.sport, day(a.created_at)].filter(Boolean).join(" · ")}</p>
                </div>
                <span className={`status ${cls[a.status]}`}>{a.status}</span>
              </div>
              {a.message && <p className="mt-3 whitespace-pre-line rounded-2xl bg-white/5 p-3 text-[16px] text-fg">{a.message}</p>}
              <ActionForm action={saveApplicationNotesAction} className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end">
                <input type="hidden" name="id" value={a.id} />
                <label className="block flex-1"><span className="a-label">Internal notes</span><textarea name="notes" defaultValue={a.admin_notes ?? ""} maxLength={1000} rows={2} className="a-input" /></label>
                <SubmitButton variant="glass">Save notes</SubmitButton>
              </ActionForm>
              {/* the forms stay mounted after the decision, so their confirmation message stays on screen */}
              <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                <ActionForm action={approveApplicationAction} className="contents">
                  <input type="hidden" name="id" value={a.id} />
                  {a.status === "new" && <SubmitButton variant="lime" confirm={`Approve ${a.name}? This only changes the status. No account is created and nothing is sent.`}>Approve</SubmitButton>}
                </ActionForm>
                <ActionForm action={rejectApplicationAction} className="contents">
                  <input type="hidden" name="id" value={a.id} />
                  {a.status === "new" && <SubmitButton variant="glass" confirm={`Reject ${a.name}'s application?`}>Reject</SubmitButton>}
                </ActionForm>
              </div>
              {a.status === "approved" && (
                // stays mounted after the account is made, so the invite link and its WhatsApp button stay on screen
                <ActionForm action={createAccountAction} className="mt-3">
                  <input type="hidden" name="id" value={a.id} />
                  {!a.affiliate_id && (
                    <>
                      <SubmitButton variant="glass" confirm={`Create the ambassador account for ${a.name} and make the invite link? Press this only after talking to them on WhatsApp.`}>Create account / send invite</SubmitButton>
                      <p className="mt-2 text-[14px] text-body">Manual step: nothing is sent automatically. You get the link to send on WhatsApp.</p>
                    </>
                  )}
                  {a.affiliate_id && <p className="text-[15px] text-body">An ambassador account exists for this application.</p>}
                </ActionForm>
              )}
            </Card>
          ))}
        </ul>
      )}
    </>
  );
}
