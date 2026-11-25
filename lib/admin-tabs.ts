import type { SubItem } from "@/components/admin/SubNav";

/** The Ambassadors section (the URLs stay under /admin/affiliates). `newApplications` is the badge on the Applications tab. Plain data: it is called on the server. */
export const affiliateTabs = (newApplications = 0): SubItem[] => [
  { href: "/admin/affiliates", label: "Overview", perm: "affiliates.read" },
  { href: "/admin/affiliates/list", label: "Ambassadors", perm: "affiliates.read", also: "^/admin/affiliates/(?!list$|payouts|applications|missions|kits|content|settings|reports|new$)[^/]+$" },
  { href: "/admin/affiliates/applications", label: "Applications", perm: "affiliates.read", badge: newApplications },
  { href: "/admin/affiliates/payouts", label: "Payouts", perm: "affiliates.read" },
  { href: "/admin/affiliates/missions", label: "Missions", perm: "affiliates.read" },
  { href: "/admin/affiliates/kits", label: "Kits", perm: "affiliates.read" },
  { href: "/admin/affiliates/content", label: "Content", perm: "affiliates.read" },
  { href: "/admin/affiliates/reports", label: "Reports", perm: "affiliates.read" },
  { href: "/admin/affiliates/settings", label: "Settings", perm: "affiliates.manage" },
];

/** The Settings tabs with the number of unlisted areas (what customers typed because their area was not in the list) as a badge. Plain data: called on the server. */
export const settingsTabs = (unlisted = 0): SubItem[] => [
  { href: "/admin/settings", label: "Store", perm: "settings.read" },
  { href: "/admin/settings/shipping", label: "Shipping & delivery", perm: "shipping.manage" },
  { href: "/admin/settings/locations", label: "Locations", perm: "shipping.manage" },
  { href: "/admin/settings/locations/unlisted", label: "Unlisted areas", perm: "shipping.manage", badge: unlisted },
  { href: "/admin/settings/team", label: "Team", perm: "team.manage" },
  { href: "/admin/settings/activity", label: "Activity log", perm: "audit.read" },
];
