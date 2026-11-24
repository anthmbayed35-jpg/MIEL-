import QRCode from "qrcode";
import { requireAmbassador } from "@/lib/ambassador/auth";
import { absoluteUrl } from "@/lib/site-url";
import { CopyButton } from "@/components/ambassador/PortalForm";
import { Card, PageTitle } from "@/components/ambassador/ui";

export const metadata = { title: "My link" };

export default async function LinkPage() {
  const me = await requireAmbassador();
  const link = absoluteUrl(`/?ref=${encodeURIComponent(me.code)}`);
  const svg = await QRCode.toString(link, { type: "svg", margin: 1, color: { dark: "#23201C", light: "#F2EFE8" }, errorCorrectionLevel: "M" });
  const pct = me.customer_discount_percent_x100 / 100;
  const story = `Fuel the grind with MIEL+ honey sachets. Use my code ${me.code} for ${pct}% off: ${link} #ad`;
  const bio = `${pct}% off MIEL+ with code ${me.code} · link in bio #ad`;
  return (
    <>
      <PageTitle kicker="SHARE" title="Your code and link.">Anyone who opens your link gets {pct}% off automatically. Anyone who types your code gets the same.</PageTitle>
      <div className="grid gap-5 md:grid-cols-2">
        <Card>
          <p className="mono mb-2">CODE</p>
          <p className="display accent text-[40px] leading-none">{me.code}</p>
          <div className="mt-4"><CopyButton value={me.code}>COPY CODE</CopyButton></div>
          <p className="mono mb-2 mt-8">PERSONAL LINK</p>
          <p className="break-all text-[17px] text-fg">{link}</p>
          <div className="mt-4"><CopyButton value={link}>COPY LINK</CopyButton></div>
        </Card>
        <Card className="text-center">
          <p className="mono mb-3">QR CODE</p>
          <div className="mx-auto w-full max-w-[260px] rounded-2xl bg-[#F2EFE8] p-2 [&>svg]:h-auto [&>svg]:w-full" role="img" aria-label={`QR code for ${link}`} dangerouslySetInnerHTML={{ __html: svg }} />
          <p className="mt-3 text-[15px] text-muted">Screenshot it or show it at the gym.</p>
        </Card>
      </div>
      <Card className="mt-5">
        <p className="mono mb-3">READY-MADE TEXT</p>
        <p className="mono mb-1 text-muted">STORY / CAPTION</p>
        <p className="body-lg text-fg">{story}</p>
        <div className="mb-6 mt-3"><CopyButton value={story}>COPY CAPTION</CopyButton></div>
        <p className="mono mb-1 text-muted">BIO</p>
        <p className="body-lg text-fg">{bio}</p>
        <div className="mt-3"><CopyButton value={bio}>COPY BIO</CopyButton></div>
        <p className="mt-6 text-[15px] text-muted">Always mark your posts as an ad (#ad) and never make health claims.</p>
      </Card>
    </>
  );
}
