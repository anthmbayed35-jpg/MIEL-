import { AFFILIATE_TIERS } from "@/config/affiliates";
import { requirePerm } from "@/lib/auth";
import { newApplicationCount } from "@/lib/affiliates";
import { getProgram, programVersion } from "@/lib/program";
import { ActionForm, SubmitButton } from "@/components/admin/ActionForm";
import { SubNav } from "@/components/admin/SubNav";
import { affiliateTabs } from "@/lib/admin-tabs";
import { Card, Field, PageHeader, SectionTitle } from "@/components/admin/ui";
import { saveProgramAction } from "../program/actions";

export const metadata = { title: "Ambassador settings" };
export const dynamic = "force-dynamic";

/** Ambassadors, Settings: everything the program runs on. Editing the terms text raises the terms version, so everyone accepts it again. */
export default async function ProgramSettingsPage() {
  const admin = await requirePerm("affiliates.manage");
  const p = getProgram();
  return (
    <>
      <PageHeader eyebrow="Ambassador program" title="Settings" />
      <SubNav items={affiliateTabs(newApplicationCount())} role={admin.role} />
      <ActionForm action={saveProgramAction} className="space-y-5">
        <input type="hidden" name="version" value={programVersion()} />
        <Card>
          <SectionTitle>Levels</SectionTitle>
          <div className="grid gap-5 lg:grid-cols-3">
            {AFFILIATE_TIERS.map((t) => (
              <div key={t} className="space-y-3 rounded-2xl bg-white/5 p-4">
                <Field label="Name"><input name={`${t}_label`} defaultValue={p.tiers[t].label} maxLength={30} required className="a-input" /></Field>
                <Field label="Delivered orders needed" hint={t === "seed" ? "The first level always starts at 0." : undefined}><input name={`${t}_min`} type="number" min={0} defaultValue={p.tiers[t].minDelivered} required className="a-input" /></Field>
                <Field label="Commission %"><input name={`${t}_commission`} type="number" min={0} max={100} step="0.5" defaultValue={p.tiers[t].commissionPercent} required className="a-input" /></Field>
                <Field label="Perks (one per line)"><textarea name={`${t}_perks`} rows={5} defaultValue={p.tiers[t].perks.join("\n")} className="a-input" /></Field>
              </div>
            ))}
          </div>
          <label className="mt-5 flex min-h-12 items-start gap-3 text-[17px] text-fg">
            <input type="checkbox" name="auto_upgrade" defaultChecked={p.autoUpgrade} className="mt-1 size-6" />
            <span>Upgrade levels automatically when the delivered-orders threshold is reached (otherwise you approve each upgrade on the ambassador page).</span>
          </label>
        </Card>

        <Card>
          <SectionTitle>Money</SectionTitle>
          <div className="grid gap-5 sm:grid-cols-3">
            <Field label="Follower discount %" hint="Applies to new ambassadors from now on."><input name="discount" type="number" min={0} max={100} step="0.5" defaultValue={p.customerDiscountPercent} required className="a-input" /></Field>
            <Field label="Hold period (days)" hint="Days after delivery before a commission is approved."><input name="hold" type="number" min={0} max={365} defaultValue={p.holdDays} required className="a-input" /></Field>
            <Field label="Minimum payout ($)"><input name="min_payout" type="number" min={1} step="0.5" defaultValue={p.minPayoutCents / 100} required className="a-input" /></Field>
          </div>
        </Card>

        <Card>
          <SectionTitle>Home page banner</SectionTitle>
          <label className="flex min-h-12 items-center gap-3 text-[17px] text-fg"><input type="checkbox" name="banner_on" defaultChecked={p.banner.enabled} className="size-6" /> Show the ambassador banner on the home page</label>
          <Field label="Banner text" className="mt-3"><input name="banner_text" defaultValue={p.banner.text} maxLength={140} className="a-input" /></Field>
        </Card>

        <Card>
          <SectionTitle right={<span className="mono !text-[14px]">Version {p.termsVersion}</span>}>Terms</SectionTitle>
          <p className="mb-3 text-[15px] text-body">The text below is shown to ambassadors inside their portal and accepted when they set their password. It is not public. Change it and the version goes up: every ambassador accepts it again at their next login. Have a lawyer review it before you rely on it.</p>
          <textarea name="terms" rows={16} defaultValue={p.termsText} className="a-input" aria-label="Terms text" />
        </Card>
        <SubmitButton variant="lime">Save settings</SubmitButton>
      </ActionForm>
    </>
  );
}
