import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ambassador portal", robots: { index: false, follow: false, nocache: true } };

/** The old private-token stats link. Stats now live in the ambassador portal behind a login, so every old link lands on the login page (the token is never read or checked). */
export default function PartnerRedirect() {
  redirect("/ambassador/login");
}
