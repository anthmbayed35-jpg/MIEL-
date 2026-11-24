import type { SubItem } from "@/components/admin/SubNav";

/** The Affiliates section: Overview, Affiliates, Payouts, Applications (with the number of new ones as a badge). Plain data: it is called on the server. */
export const affiliateTabs = (newApplications = 0): SubItem[] => [
  { href: "/admin/affiliates", label: "Overview", perm: "affiliates.read" },
  { href: "/admin/affiliates/list", label: "Affiliates", perm: "affiliates.read", also: "^/admin/affiliates/(?!list$|payouts|applications)[^/]+$" },
  { href: "/admin/affiliates/payouts", label: "Payouts", perm: "affiliates.read" },
  { href: "/admin/affiliates/applications", label: "Applications", perm: "affiliates.read", badge: newApplications },
];
