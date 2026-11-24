import { DEFAULT_COMMISSION_PERCENT, DEFAULT_CUSTOMER_DISCOUNT_PERCENT } from "@/config/affiliates";
import { requirePerm } from "@/lib/auth";
import { newApplicationCount } from "@/lib/affiliates";
import { AffiliateForm } from "@/components/admin/AffiliateForm";
import { SubNav } from "@/components/admin/SubNav";
import { affiliateTabs } from "@/lib/admin-tabs";
import { Card, PageHeader } from "@/components/admin/ui";

export const metadata = { title: "New affiliate" };

export default async function NewAffiliatePage() {
  const admin = await requirePerm("affiliates.manage");
  return (
    <>
      <PageHeader eyebrow="Influencer codes" title="New affiliate" />
      <SubNav items={affiliateTabs(newApplicationCount())} role={admin.role} />
      <Card><AffiliateForm defaults={{ commission: DEFAULT_COMMISSION_PERCENT, discount: DEFAULT_CUSTOMER_DISCOUNT_PERCENT }} /></Card>
    </>
  );
}
