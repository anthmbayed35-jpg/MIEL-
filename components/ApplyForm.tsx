"use client";

import { startTransition, useActionState, useState } from "react";
import { applyAction, type ApplyResult } from "@/app/actions/ambassadors";

const field =
  "w-full min-h-14 bg-white/5 border border-white/15 px-4 py-3 text-fg text-[18px] placeholder:text-body/60 focus:border-acid focus:outline-none";
const label = "mono block mb-2";

function Send({ pending }: { pending: boolean }) {
  return (
    <button type="submit" disabled={pending} className="btn">
      {pending ? "SENDING…" : "SEND APPLICATION"}
    </button>
  );
}

/** Ambassador application. The hidden "website" field is a honeypot; "started" lets the server drop instant bot posts. */
export function ApplyForm() {
  const [started] = useState(() => String(Date.now()));
  const [state, action, pending] = useActionState<ApplyResult | null, FormData>(applyAction, null);
  if (state?.ok) {
    return (
      <div className="glass p-6 md:p-8" role="status">
        <p className="mono mb-2">APPLICATION RECEIVED</p>
        <p className="display text-[28px] leading-tight">Thanks, we received your application.</p>
        <p className="body-lg mt-3">We&apos;ll contact you on WhatsApp soon.</p>
      </div>
    );
  }
  return (
    <form
      // submitted by hand (not as a form action) so a rejected application keeps everything the person typed
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(() => action(fd));
      }}
      className="glass space-y-5 p-5 md:p-8"
    >
      <input type="hidden" name="started" value={started} />
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label>
      </div>
      {state && !state.ok && <p role="alert" className="rounded-2xl border border-[#FF5C7A]/50 bg-[#FF5C7A]/10 px-4 py-3 text-[17px] text-fg">{state.error}</p>}
      <div>
        <label htmlFor="ap-name" className={label}>Your name</label>
        <input id="ap-name" name="name" required minLength={2} maxLength={80} autoComplete="name" className={field} />
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        <div>
          <label htmlFor="ap-ph" className={label}>WhatsApp number (with country code)</label>
          <input id="ap-ph" name="phone" required inputMode="tel" maxLength={30} autoComplete="tel" placeholder="+961 70 123 456" className={field} />
        </div>
        <div>
          <label htmlFor="ap-em" className={label}>Email (optional)</label>
          <input id="ap-em" name="email" type="email" maxLength={120} autoComplete="email" className={field} />
        </div>
        <div>
          <label htmlFor="ap-ig" className={label}>Instagram</label>
          <input id="ap-ig" name="instagram_handle" maxLength={40} placeholder="@yourhandle" autoCapitalize="none" autoCorrect="off" className={field} />
        </div>
        <div>
          <label htmlFor="ap-tt" className={label}>TikTok</label>
          <input id="ap-tt" name="tiktok_handle" maxLength={40} placeholder="@yourhandle" autoCapitalize="none" autoCorrect="off" className={field} />
        </div>
        <div>
          <label htmlFor="ap-f" className={label}>Followers</label>
          <input id="ap-f" name="followers" maxLength={20} inputMode="text" placeholder="e.g. 12k" className={field} />
        </div>
        <div>
          <label htmlFor="ap-c" className={label}>City</label>
          <input id="ap-c" name="city" maxLength={60} autoComplete="address-level2" className={field} />
        </div>
      </div>
      <div>
        <label htmlFor="ap-s" className={label}>Your sport(s)</label>
        <input id="ap-s" name="sport" maxLength={60} placeholder="Running, CrossFit, football…" className={field} />
      </div>
      <div>
        <label htmlFor="ap-m" className={label}>Tell us a bit about you</label>
        <textarea id="ap-m" name="message" rows={4} maxLength={1000} className={field} />
      </div>
      <p className="text-[16px] text-body">Add at least your Instagram or TikTok so we can find you.</p>
      <Send pending={pending} />
    </form>
  );
}
