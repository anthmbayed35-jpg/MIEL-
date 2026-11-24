import { requireAmbassador } from "@/lib/ambassador/auth";
import { resourcesList } from "@/lib/ambassador/portal";
import { getProgram } from "@/lib/program";
import { ActionButton } from "@/components/ambassador/PortalForm";
import { Card, PageTitle } from "@/components/ambassador/ui";
import { rulesReadAction } from "../../actions";

export const metadata = { title: "Resources" };

const RULES = [
  "Mark every post as an ad or partnership (#ad).",
  "No medical or health claims. Never say MIEL+ treats, cures or prevents anything.",
  "Use only your own code and link. Never on your own orders or fake orders.",
  "Be honest and keep it in your own voice.",
  "No spam, no fake accounts, no paid ads on the MIEL+ name without asking us first.",
];

export default async function ResourcesPage() {
  const me = await requireAmbassador();
  const items = resourcesList();
  const program = getProgram();
  return (
    <>
      <PageTitle kicker="TOOLKIT" title="Resources." />
      <Card className="mb-6" >
        <p id="rules" className="mono mb-3">THE RULES</p>
        <ul className="space-y-2 text-[18px] text-fg">{RULES.map((r) => <li key={r} className="flex gap-3"><span aria-hidden className="accent">+</span>{r}</li>)}</ul>
        <p className="mt-4 text-[15px] text-muted">Full terms (version {program.termsVersion}): <a href="/ambassadors/terms" className="accent underline underline-offset-4" target="_blank">read them</a>.</p>
        <div className="mt-5 max-w-sm">
          {me.rules_read_at ? <p className="mono">✓ YOU READ THE RULES</p> : <ActionButton ghost action={rulesReadAction}>I READ THE RULES</ActionButton>}
        </div>
      </Card>
      {items.length === 0 ? (
        <Card><p className="body-lg">Brand assets, captions and photos will appear here.</p></Card>
      ) : (
        <ul className="space-y-3">
          {items.map((r) => (
            <li key={r.id} className="glass-flat rounded-[20px] p-4 md:p-5">
              <p className="mono mb-1">{(r.category || "FILE").toUpperCase()}</p>
              <p className="text-[20px] text-fg">{r.title}</p>
              {r.description && <p className="mt-1 text-[16px] text-body">{r.description}</p>}
              <div className="mt-3">
                <a className="btn-ghost !min-h-12 !w-auto px-5" href={r.url || `/ambassador/files/resources/${r.stored_name}`} target="_blank" rel="noreferrer">OPEN</a>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
