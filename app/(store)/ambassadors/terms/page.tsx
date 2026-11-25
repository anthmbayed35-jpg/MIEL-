import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** The terms are not public any more: they are shown inside the ambassador portal (and on the invite page) once the team has spoken to the person. */
export default function OldTermsPage() {
  redirect("/ambassadors");
}
