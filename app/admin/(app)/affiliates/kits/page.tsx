import Link from "next/link";
import { requirePerm } from "@/lib/auth";
import { newApplicationCount } from "@/lib/affiliates";
import { listKits } from "@/lib/ambassador/admin";
import { ActionForm } from "@/components/admin/ActionForm";
import { SubNav } from "@/components/admin/SubNav";
import { affiliateTabs } from "@/lib/admin-tabs";
import { Card, Empty, PageHeader } from "@/components/admin/ui";
import { setKitStatusAction } from "../program/actions";

export const metadata = { title: "Ambassador kits" };
export const dynamic = "force-dynamic";

const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { timeZone: "Asia/Beirut", day: "numeric", month: "short" });

/** Starter kits (created on approval) and monthly pouches (asked for by Athlete and above): requested, shipped, delivered. */
export default async function KitsPage() {
  const admin = await requirePerm("affiliates.read");
  const rows = listKits();
  return (
    <>
      <PageHeader eyebrow="Ambassador program" title="Kits" />
      <SubNav items={affiliateTabs(newApplicationCount())} role={admin.role} />
      <Card>
        {rows.length === 0 ? (
          <Empty title="No kit requests yet." hint="A starter kit is added when you approve an application." />
        ) : (
          <ul className="space-y-3">
            {rows.map((k) => (
              <li key={k.id} className="rounded-2xl bg-white/5 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[17px] text-fg"><Link href={`/admin/affiliates/${k.affiliate_id}`} className="inline-flex min-h-12 items-center underline underline-offset-4">{k.name}</Link> <span className="mono !text-[13px]">{k.code}</span></p>
                    <p className="text-[15px] text-body">{k.kind === "starter" ? "Starter kit" : "Monthly pouch"} · asked {day(k.created_at)}{k.phone ? ` · ${k.phone}` : ""}</p>
                  </div>
                  <span className={`status ${k.status === "delivered" ? "st-delivered" : k.status === "shipped" ? "st-out_for_delivery" : "st-packed"}`}>{k.status}</span>
                </div>
                {k.status !== "delivered" && (
                  <ActionForm action={setKitStatusAction} className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
                    <input type="hidden" name="id" value={k.id} />
                    <input name="note" maxLength={200} defaultValue={k.note} placeholder="Note for them (optional)" className="a-input" aria-label="Note" />
                    {k.status === "requested" && <button name="status" value="shipped" className="pill-btn pill-lime">Mark shipped</button>}
                    <button name="status" value="delivered" className="pill-btn pill-glass">Mark delivered</button>
                  </ActionForm>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
