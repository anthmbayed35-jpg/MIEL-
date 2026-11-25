"use client";

import { useId, useMemo, useRef, useState } from "react";
import { searchPlaces, type PlaceHit, type SearchIndex } from "@/lib/place-search";
import type { CheckoutGovernorate } from "@/lib/locations";
import { SearchSelect, type PlaceOption } from "./SearchSelect";

const input =
  "w-full min-h-14 rounded-[14px] bg-white/5 border border-white/15 px-4 py-3 pr-14 text-fg text-[18px] placeholder:text-body/60 focus:border-acid focus:outline-none";

export type Unlisted = { text: string; governorateId: string; districtId: string };

/**
 * "Type your area": instant suggestions from ALL regions of Lebanon (searched in the browser, no server call per keystroke), each shown with
 * its district and governorate. Picking one fills governorate, district and region. When nothing matches, "Can't find your area? Add it"
 * lets the customer type the name and choose the district: the order is then placed with that text and the team checks it later.
 */
export function AreaSearch({
  index, tree, loading, onPick, onUnlisted,
}: {
  index: SearchIndex | null;
  tree: CheckoutGovernorate[];
  loading: boolean;
  onPick: (hit: PlaceHit) => void;
  onUnlisted: (u: Unlisted) => void;
}) {
  const listId = useId();
  const box = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [adding, setAdding] = useState(false);
  const [addName, setAddName] = useState("");
  const [addDistrict, setAddDistrict] = useState("");

  const hits = useMemo(() => (index && q.trim() ? searchPlaces(index, q, 8) : []), [index, q]);
  const districtOptions: PlaceOption[] = useMemo(() => tree.flatMap((g) => g.districts.map((d) => ({ id: d.id, en: `${d.en}, ${g.en}`, ar: d.ar }))), [tree]);
  const none = !!index && q.trim().length >= 2 && hits.length === 0;

  const pick = (h: PlaceHit) => {
    onPick(h);
    setQ("");
    setOpen(false);
    setAdding(false);
  };

  return (
    <div className="space-y-3">
      <div className="relative">
        <input
          ref={box}
          id="area-search"
          type="search"
          role="combobox"
          aria-expanded={open && (hits.length > 0 || none)}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="search"
          className={input}
          placeholder="Type your area · اكتب منطقتك"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
            setActive(0);
            setAdding(false);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(hits.length - 1, a + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(0, a - 1));
            } else if (e.key === "Enter" && open && hits[active]) {
              e.preventDefault();
              pick(hits[active]);
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
        />
        {q && (
          <button
            type="button"
            aria-label="Clear"
            className="absolute right-1 top-1/2 grid h-12 w-12 -translate-y-1/2 place-items-center text-[26px] leading-none text-body hover:text-fg"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setQ("");
              setAdding(false);
              box.current?.focus();
            }}
          >
            <span aria-hidden>×</span>
          </button>
        )}
        {open && hits.length > 0 && (
          <ul id={listId} role="listbox" aria-label="Suggested areas" className="glass-strong absolute left-0 right-0 z-30 mt-2 max-h-[min(60vh,420px)] overflow-y-auto overscroll-contain !rounded-[14px] py-1">
            {hits.map((h, i) => (
              <li
                key={h.id}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(h);
                }}
                onMouseEnter={() => setActive(i)}
                className={`flex min-h-14 cursor-pointer items-center justify-between gap-3 px-4 py-2 ${i === active ? "bg-acid/15" : ""}`}
              >
                <span className="min-w-0">
                  <span className="block truncate text-[18px] text-fg">{h.en}</span>
                  <span className="block truncate text-[15px] text-body">
                    {h.district}
                    {h.district !== h.governorate ? `, ${h.governorate}` : ""}
                    {h.via ? ` · ${h.via}` : ""}
                  </span>
                </span>
                {h.ar && (
                  <span lang="ar" dir="rtl" className="shrink-0 text-[18px] text-body">
                    {h.ar}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      {loading && !index && <p className="text-[15px] text-body">Loading the list of areas…</p>}

      {none && !adding && (
        <button
          type="button"
          className="btn-ghost"
          onClick={() => {
            setAdding(true);
            setAddName(q.trim());
          }}
        >
          CAN&apos;T FIND YOUR AREA? ADD IT
        </button>
      )}
      {adding && (
        <div className="space-y-4 rounded-2xl border border-white/15 bg-white/5 p-4" role="group" aria-label="Add your area">
          <p className="text-[17px] text-fg">No problem: tell us the name and the district. Your order is never blocked, we check the area with you on WhatsApp.</p>
          <div>
            <label htmlFor="unlisted-name" className="mono mb-2 block">Name of your area</label>
            <input id="unlisted-name" className={input} value={addName} maxLength={60} onChange={(e) => setAddName(e.target.value)} />
          </div>
          <div>
            <label htmlFor="unlisted-district" className="mono mb-2 block">District</label>
            <SearchSelect id="unlisted-district" options={districtOptions} value={addDistrict} onChange={setAddDistrict} placeholder="Choose your district" />
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              className="btn"
              disabled={addName.trim().length < 3 || !addDistrict}
              onClick={() => {
                const g = tree.find((t) => t.districts.some((d) => d.id === addDistrict));
                if (!g) return;
                onUnlisted({ text: addName.trim(), governorateId: g.id, districtId: addDistrict });
                setAdding(false);
                setQ("");
              }}
            >
              USE THIS AREA
            </button>
            <button type="button" className="btn-ghost" onClick={() => setAdding(false)}>
              CANCEL
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
