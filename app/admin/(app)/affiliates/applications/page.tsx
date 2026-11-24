import { requirePerm } from "@/lib/auth";
import { newApplicationCount } from "@/lib/affiliates";
import { listApplications } from "@/lib/affiliates";
import { ActionForm, SubmitButton } from "@/components/admin/ActionForm";
import { SubNav } from "@/components/admin/SubNav";
import { affiliateTabs } from "@/lib/admin-tabs";
import { Card, Empty, PageHeader } from "@/components/admin/ui";
import { approveApplicationAction, rejectApplicationAction } from "../actions";

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
                  <p className="mt-1 text-[15px] text-body">{[a.followers && `${a.followers} followers`, a.city, a.sport, day(a.created_at)].filter(Boolean).join(" · ")}</p>
                </div>
                <span className={`status ${cls[a.status]}`}>{a.status}</span>
              </div>
              {a.message && <p className="mt-3 whitespace-pre-line rounded-2xl bg-white/5 p-3 text-[16px] text-fg">{a.message}</p>}
              {/* the forms stay mounted after the decision, so their confirmation message stays on screen */}
              <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                <ActionForm action={approveApplicationAction} className="contents">
                  <input type="hidden" name="id" value={a.id} />
                  {a.status === "new" && <SubmitButton variant="lime" confirm={`Approve ${a.name}? This creates an affiliate with a generated code.`}>Approve and create affiliate</SubmitButton>}
                </ActionForm>
                <ActionForm action={rejectApplicationAction} className="contents">
                  <input type="hidden" name="id" value={a.id} />
                  {a.status === "new" && <SubmitButton variant="glass" confirm={`Reject ${a.name}'s application?`}>Reject</SubmitButton>}
                </ActionForm>
              </div>
            </Card>
          ))}
        </ul>
      )}
    </>
  );
}
