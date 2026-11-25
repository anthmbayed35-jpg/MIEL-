"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { captureCheckout, placeOrder, quoteAction, type QuoteView } from "@/app/actions/checkout";
import { SACHETS_PER_POUCH } from "@/config/site";
import { money } from "@/lib/format";
import { HEARD_FROM_OPTIONS, zoneForGovernorate } from "@/lib/lebanon";
import type { CheckoutGovernorate } from "@/lib/locations";
import { usePlaceIndex } from "@/lib/use-place-index";
import type { PlaceHit } from "@/lib/place-search";
import { AreaSearch, type Unlisted } from "./AreaSearch";
import { PinPicker, type Pin } from "./PinPicker";
import { SearchSelect, type PlaceOption } from "./SearchSelect";
import { TEST_ORDER_CONFIRMATION } from "@/lib/site-mode";
import { getUtm } from "@/lib/track-client";
import { useRefCode } from "@/lib/use-ref-code";
import { useCart } from "../CartProvider";

type Method = { id: string; label: string; description: string };
type Field = "name" | "phone" | "email" | "governorate" | "district" | "region" | "street" | "landmark" | "payment";

const input =
  "w-full min-h-14 rounded-[14px] bg-white/5 border border-white/15 px-4 py-3 text-fg text-[18px] placeholder:text-body/60 focus:border-acid focus:outline-none aria-[invalid=true]:border-[#FF5C7A]";
const label = "mono block mb-2";

function Err({ id, children }: { id: string; children?: string }) {
  return children ? (
    <p id={id} role="alert" className="mt-2 text-[16px] text-[#FF8AA0]">
      {children}
    </p>
  ) : null;
}

/**
 * /checkout: one page, guest checkout. The cart comes from the browser; EVERYTHING that matters (prices, delivery fee, discount,
 * stock, the zone behind the governorate) is decided again on the server when the order is placed.
 */
export function CheckoutForm({ methods, whatsapp, tree, mapsKey = "", indexVersion = "" }: { methods: Method[]; whatsapp: string; tree: CheckoutGovernorate[]; mapsKey?: string; indexVersion?: string }) {
  const router = useRouter();
  const { lines, products, deliveryFee, ready, preview, clear, setQty } = useCart();
  const ref = useRefCode();
  const idemKey = useRef(""); // one key per attempt: a double click or a retry never places two orders
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [gov, setGov] = useState("");
  const [district, setDistrict] = useState("");
  const [region, setRegion] = useState("");
  const [regions, setRegions] = useState<PlaceOption[]>([]);
  const [regionsLoading, setRegionsLoading] = useState(false);
  const regionCache = useRef<Map<string, PlaceOption[]>>(new Map());
  const [pin, setPin] = useState<Pin | null>(null);
  const [unlisted, setUnlisted] = useState<Unlisted | null>(null); // an area typed by the customer because it is not in the list
  const index = usePlaceIndex(indexVersion); // the search index of every region, loaded when checkout opens
  const [street, setStreet] = useState("");
  const [landmark, setLandmark] = useState("");
  const [notes, setNotes] = useState("");
  const [heard, setHeard] = useState("");
  const [code, setCode] = useState("");
  const [fromLink, setFromLink] = useState(false);
  const [payment, setPayment] = useState(methods[0]?.id ?? "cod");
  const [testOk, setTestOk] = useState(false);
  const [quote, setQuote] = useState<QuoteView | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);

  // a personal link remembered in this browser fills the code field (a code typed by hand wins)
  useEffect(() => {
    if (ref.code) {
      setCode((cur) => cur || ref.code);
      setFromLink(true);
    }
  }, [ref.code]);

  const items = useMemo(
    () =>
      Object.entries(lines)
        .map(([id, qty]) => ({ p: products.find((x) => x.id === id), qty }))
        .filter((x): x is { p: (typeof products)[number]; qty: number } => !!x.p && x.qty > 0),
    [lines, products],
  );
  const cartInput = items.map((i) => ({ productId: i.p.id, qty: i.qty }));
  const cartKey = JSON.stringify(cartInput);
  const zoneName = zoneForGovernorate(gov); // only the free-delivery line depends on the area: the delivery fee is flat
  const govOptions: PlaceOption[] = tree.map((g) => ({ id: g.id, en: g.en, ar: g.ar }));
  const districtOptions: PlaceOption[] = tree.find((g) => g.id === gov)?.districts ?? [];

  // the regions of the chosen district only (loaded from our own database, cached per district)
  useEffect(() => {
    if (!district || index) return; // with the index loaded the lists come from it (below)

    const cached = regionCache.current.get(district);
    if (cached) {
      setRegions(cached);
      return;
    }
    let live = true;
    setRegionsLoading(true);
    fetch(`/api/locations/regions?district=${encodeURIComponent(district)}`)
      .then((r) => (r.ok ? r.json() : { regions: [] }))
      .then((j: { regions: PlaceOption[] }) => {
        if (!live) return;
        regionCache.current.set(district, j.regions);
        setRegions(j.regions);
      })
      .catch(() => live && setRegions([]))
      .finally(() => live && setRegionsLoading(false));
    return () => {
      live = false;
    };
  }, [district, index]);
  const regionOptions: PlaceOption[] = useMemo(() => {
    if (!index || !district) return regions;
    const di = index.data.d.findIndex((d) => d[0] === district);
    return di < 0 ? [] : index.regions.filter((r) => r.di === di).map((r) => ({ id: index.data.r[r.i][0], en: r.en, ar: r.ar }));
  }, [index, district, regions]);
  const subtotal = items.reduce((n, i) => n + i.p.price * i.qty, 0);
  const soldOut = items.filter((i) => i.p.soldOut);

  // live price from the server: the flat delivery fee, a free-delivery line and the discount code
  useEffect(() => {
    if (!cartInput.length) return;
    let live = true;
    quoteAction(cartInput, zoneName ?? "", code).then((q) => live && setQuote(q));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartKey, zoneName, code]);
  const shown = quote?.ok ? quote : null;

  function validate(): Partial<Record<Field, string>> {
    const e: Partial<Record<Field, string>> = {};
    if (name.trim().length < 2) e.name = "Enter your full name.";
    if (phone.replace(/\D/g, "").length < 7) e.phone = "Enter your phone number, for example 03 123 456 or +961 70 123 456.";
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) e.email = "That email address does not look right. You can also leave it empty.";
    if (!gov) e.governorate = "Choose your governorate.";
    else if (!district) e.district = "Choose your district.";
    else if (!region && !unlisted) e.region = "Choose your town or village, or add your area above.";
    if (street.trim().length < 5) e.street = "Enter your street, building and floor so the courier can find you.";
    return e;
  }

  async function submit(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    if (busy) return; // double-click protection (the server also dedupes by key)
    setError("");
    const found = validate();
    setErrors(found);
    const first = (Object.keys(found) as Field[])[0];
    if (first) {
      document.getElementById(first)?.focus();
      return;
    }
    if (!items.length) return setError("Your cart is empty. Add a flavour first.");
    if (soldOut.length) return setError(`${soldOut[0].p.name} is sold out right now. Remove it from your cart to continue.`);
    setBusy(true);
    idemKey.current ||= crypto.randomUUID();
    const res = await placeOrder({
      idempotencyKey: idemKey.current,
      items: cartInput,
      customer: { name: name.trim(), phone: phone.trim(), email: email.trim() },
      delivery: { governorateId: gov, districtId: district, regionId: region, unlistedText: !region && unlisted ? unlisted.text : undefined, street: street.trim(), landmark: landmark.trim(), notes: notes.trim(), pin },
      paymentMethod: payment,
      code,
      attribution: fromLink ? "link" : "code",
      heardFrom: heard,
      utm: getUtm(),
      website: (document.getElementById("website") as HTMLInputElement | null)?.value ?? "",
      confirmation: preview && testOk ? TEST_ORDER_CONFIRMATION : undefined,
    });
    if (!res.ok) {
      setBusy(false);
      idemKey.current = ""; // a refused order may be retried with a fresh key once the customer fixed something
      if (res.field) {
        setErrors({ [res.field]: res.error } as Partial<Record<Field, string>>);
        document.getElementById(res.field)?.focus();
      } else setError(res.error);
      return;
    }
    clear();
    if (res.token) router.push(`/order/${res.token}`);
    else window.location.href = res.whatsappUrl; // no database configured: WhatsApp-only order
  }

  if (!ready) return <p className="body-lg" aria-live="polite">Loading your cart…</p>;
  if (!items.length)
    return (
      <div className="glass p-6 md:p-8">
        <p className="display text-[28px]">Your cart is empty.</p>
        <p className="body-lg mt-3">Pick a flavour and come back here to check out.</p>
        <Link href="/#lineup" className="btn mt-6">
          SHOP THE LINEUP
        </Link>
      </div>
    );

  const summary = (
    <div>
      <ul className="divide-y divide-white/10">
        {items.map(({ p, qty }) => (
          <li key={p.id} className="flex items-start justify-between gap-3 py-3 first:pt-0">
            <div>
              <p className="display text-[18px]">{p.name}</p>
              <p className="text-[15px] text-body">
                {qty} × {SACHETS_PER_POUCH} sachets · {money(p.price)}
              </p>
              {p.soldOut && <p className="text-[15px] text-[#FF8AA0]">Sold out right now.</p>}
              <button type="button" className="link text-[15px]" onClick={() => setQty(p.id, 0)} aria-label={`Remove ${p.name}`}>
                Remove
              </button>
            </div>
            <p className="display text-[18px]">{money(p.price * qty)}</p>
          </li>
        ))}
      </ul>
      <dl className="mt-4 space-y-2 border-t border-white/10 pt-4 text-[17px]">
        <div className="flex justify-between">
          <dt>Subtotal</dt>
          <dd>{money(shown?.subtotal ?? subtotal)}</dd>
        </div>
        {!!shown?.discount && (
          <div className="flex justify-between text-acid">
            <dt>Discount</dt>
            <dd>−{money(shown.discount)}</dd>
          </div>
        )}
        <div className="flex justify-between">
          <dt>Delivery</dt>
          <dd>{shown ? (shown.shipping ? money(shown.shipping) : "Free") : money(deliveryFee)}</dd>
        </div>
        <div className="flex items-baseline justify-between pt-1">
          <dt className="mono">TOTAL</dt>
          <dd className="display accent text-[30px]" data-testid="total">{money(shown?.total ?? subtotal)}</dd>
        </div>
      </dl>
    </div>
  );

  return (
    <form onSubmit={submit} noValidate className="grid gap-8 lg:grid-cols-[1fr_400px] lg:items-start">
      <div className="space-y-8">
        {/* the summary on a phone: collapsed under the title, always showing the total */}
        <details className="glass lg:hidden" open={summaryOpen} onToggle={(e) => setSummaryOpen((e.currentTarget as HTMLDetailsElement).open)}>
          <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-5 py-3 [&::-webkit-details-marker]:hidden">
            <span className="mono">ORDER SUMMARY ({items.reduce((n, i) => n + i.qty, 0)})</span>
            <span className="display accent text-[22px]">{money(shown?.total ?? subtotal)}</span>
          </summary>
          <div className="px-5 pb-5">{summary}</div>
        </details>

        <section className="glass space-y-5 p-5 md:p-8" aria-labelledby="h-contact">
          <h2 id="h-contact" className="display text-[22px]">Contact</h2>
          <div>
            <label htmlFor="name" className={label}>Full name</label>
            <input id="name" name="name" autoComplete="name" className={input} value={name} onChange={(e) => setName(e.target.value)} aria-invalid={!!errors.name} aria-describedby="e-name" />
            <Err id="e-name">{errors.name}</Err>
          </div>
          <div>
            <label htmlFor="phone" className={label}>Phone / WhatsApp</label>
            <input
              id="phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" className={input} placeholder="03 123 456 or +961 70 123 456"
              value={phone} onChange={(e) => setPhone(e.target.value)} aria-invalid={!!errors.phone} aria-describedby="e-phone"
              onBlur={() => phone.replace(/\D/g, "").length >= 7 && captureCheckout({ name, phone, items: cartInput, utm_source: getUtm().source })}
            />
            <Err id="e-phone">{errors.phone}</Err>
          </div>
          <div>
            <label htmlFor="email" className={label}>Email (optional)</label>
            <input id="email" name="email" type="email" autoComplete="email" className={input} value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={!!errors.email} aria-describedby="e-email" />
            <Err id="e-email">{errors.email}</Err>
          </div>
        </section>

        <section className="glass space-y-5 p-5 md:p-8" aria-labelledby="h-delivery">
          <h2 id="h-delivery" className="display text-[22px]">Delivery in Lebanon</h2>
          <div>
            <label htmlFor="area-search" className={label}>Find your area</label>
            <AreaSearch
              index={index}
              tree={tree}
              loading={!!indexVersion}
              onPick={(h: PlaceHit) => {
                setGov(h.governorateId);
                setDistrict(h.districtId);
                setRegion(h.id);
                setUnlisted(null);
                setErrors((e) => ({ ...e, governorate: undefined, district: undefined, region: undefined }));
              }}
              onUnlisted={(u) => {
                setGov(u.governorateId);
                setDistrict(u.districtId);
                setRegion("");
                setUnlisted(u);
                setErrors((e) => ({ ...e, governorate: undefined, district: undefined, region: undefined }));
              }}
            />
            {unlisted && !region && (
              <p role="status" className="mt-3 rounded-2xl border border-acid/40 bg-acid/10 px-4 py-3 text-[17px] text-fg" data-testid="unlisted-notice">
                Your area: <b>{unlisted.text}</b>. It is not in our list yet: we will confirm it with you on WhatsApp.{" "}
                <button type="button" className="link" onClick={() => setUnlisted(null)}>Change</button>
              </p>
            )}
          </div>
          <p className="mono !text-body">OR CHOOSE FROM THE LISTS</p>
          <div className="grid gap-5 md:grid-cols-3">
            <div>
              <label htmlFor="governorate" className={label}>Governorate</label>
              <SearchSelect
                id="governorate" options={govOptions} value={gov} placeholder="Choose your governorate" invalid={!!errors.governorate} describedBy="e-governorate"
                onChange={(id) => {
                  setGov(id);
                  setDistrict(""); // dependent lists: the district and the region start again
                  setRegion("");
                  setUnlisted(null);
                }}
              />
              <Err id="e-governorate">{errors.governorate}</Err>
            </div>
            <div>
              <label htmlFor="district" className={label}>District</label>
              <SearchSelect
                id="district" options={districtOptions} value={district} disabled={!gov} placeholder={gov ? "Choose your district" : "Choose a governorate first"} invalid={!!errors.district} describedBy="e-district"
                onChange={(id) => {
                  setDistrict(id);
                  setRegion(""); // changing the district resets the region
                  setUnlisted(null);
                }}
              />
              <Err id="e-district">{errors.district}</Err>
            </div>
            <div>
              <label htmlFor="region" className={label}>Town / village / area</label>
              <SearchSelect
                id="region" options={regionOptions} value={region} disabled={!district} loading={regionsLoading && !index} placeholder={district ? "Search your town or village" : "Choose a district first"} invalid={!!errors.region} describedBy="e-region"
                onChange={(id) => {
                  setRegion(id);
                  setUnlisted(null);
                }}
              />
              <Err id="e-region">{errors.region}</Err>
            </div>
          </div>
          <div>
            <label htmlFor="street" className={label}>Street, building, floor</label>
            <textarea id="street" name="street" rows={2} autoComplete="street-address" className={input} placeholder="Street name, building, floor, apartment" value={street} onChange={(e) => setStreet(e.target.value)} aria-invalid={!!errors.street} aria-describedby="e-street" />
            <Err id="e-street">{errors.street}</Err>
          </div>
          <div>
            <label htmlFor="landmark" className={label}>Nearest landmark (optional)</label>
            <input id="landmark" name="landmark" className={input} placeholder="Next to a pharmacy, a school, a gas station…" value={landmark} onChange={(e) => setLandmark(e.target.value)} />
          </div>
          <div>
            <label htmlFor="notes" className={label}>Delivery notes (optional)</label>
            <textarea id="notes" name="notes" rows={2} className={input} placeholder="Anything the courier should know" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </section>

        {mapsKey && <PinPicker apiKey={mapsKey} pin={pin} onChange={setPin} />}

        <section className="glass space-y-5 p-5 md:p-8" aria-labelledby="h-pay">
          <h2 id="h-pay" className="display text-[22px]">Payment</h2>
          <div role="radiogroup" aria-label="Payment method" className="space-y-3">
            {methods.map((m) => (
              <label key={m.id} className={`flex min-h-14 cursor-pointer items-start gap-3 rounded-[14px] border p-4 ${payment === m.id ? "border-acid bg-acid/5" : "border-white/15"}`}>
                <input type="radio" name="payment" value={m.id} checked={payment === m.id} onChange={() => setPayment(m.id)} className="mt-1 h-6 w-6 shrink-0 accent-[#DAFC69]" />
                <span>
                  <span className="display block text-[18px]">{m.label}</span>
                  <span className="text-[16px] text-body">{m.description}</span>
                </span>
              </label>
            ))}
          </div>
          <div>
            <label htmlFor="heard_from" className={label}>How did you hear about us? (optional)</label>
            <select id="heard_from" name="heard_from" className={input} value={heard} onChange={(e) => setHeard(e.target.value)}>
              <option value="">Choose one</option>
              {HEARD_FROM_OPTIONS.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="code" className={label}>Discount code (optional)</label>
            <input
              id="code" name="code" className={input} placeholder="CODE" autoCapitalize="characters" autoComplete="off" spellCheck={false}
              value={code} onChange={(e) => { setCode(e.target.value.toUpperCase()); setFromLink(false); }}
            />
            {shown?.codeMessage && <p className={`mt-2 text-[16px] ${shown.discount || shown.freeDelivery ? "text-acid" : "text-body"}`}>{shown.codeMessage}</p>}
          </div>
          {/* honeypot: real people never see or fill this */}
          <input id="website" name="website" tabIndex={-1} autoComplete="off" aria-hidden className="absolute left-[-9999px] h-0 w-0 opacity-0" />
        </section>
      </div>

      <aside className="space-y-4 lg:sticky lg:top-[calc(var(--top-offset,96px)+8px)]" aria-label="Order summary">
        <div className="glass hidden p-6 lg:block">
          <h2 className="display mb-4 text-[22px]">Order summary</h2>
          {summary}
        </div>
        {preview && (
          <label className="flex items-start gap-3 rounded-2xl border border-acid/40 bg-acid/10 p-3 text-[15px] text-fg">
            <input type="checkbox" checked={testOk} onChange={(e) => setTestOk(e.target.checked)} className="mt-1 h-6 w-6 shrink-0 accent-[#DAFC69]" />
            <span>
              <b>This is a test order.</b> The storefront is hidden, so only a clearly marked TEST order can be placed. It takes real stock (cancel it in the admin to restore it) and is not counted in sales.
            </span>
          </label>
        )}
        {error && (
          <p role="alert" className="rounded-2xl border border-[#FF5C7A]/50 bg-[#FF5C7A]/10 p-4 text-[17px] text-fg">
            {error}{" "}
            <a className="underline underline-offset-4" href={`https://wa.me/${whatsapp}`} target="_blank" rel="noopener noreferrer">Message us on WhatsApp</a>
          </p>
        )}
        <button type="submit" disabled={busy || (preview && !testOk)} className="btn btn-block disabled:opacity-60">
          {busy ? "PLACING ORDER…" : preview ? "PLACE TEST ORDER" : "PLACE ORDER"}
        </button>
        <p className="text-center text-[15px] text-body">
          <Link href="/#lineup" className="link">Keep shopping</Link>
        </p>
      </aside>
    </form>
  );
}
