"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { rankPlaces } from "@/lib/search-text";

export type PlaceOption = { id: string; en: string; ar: string };

const input =
  "w-full min-h-14 rounded-[14px] bg-white/5 border border-white/15 px-4 py-3 pr-12 text-fg text-[18px] placeholder:text-body/60 focus:border-acid focus:outline-none aria-[invalid=true]:border-[#FF5C7A] disabled:opacity-50";

/**
 * A searchable select (combobox): tap it, type to filter (English or Arabic), tap a place. Large touch targets and fonts, keyboard
 * support (arrows, Enter, Escape), the Arabic name shown beside the English one. `id` is on the input, so a <label htmlFor> works.
 */
export function SearchSelect({
  id, options, value, onChange, placeholder, disabled, invalid, describedBy, loading, emptyText = "No match",
}: {
  id: string;
  options: PlaceOption[];
  value: string;
  onChange: (id: string) => void;
  placeholder: string;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
  loading?: boolean;
  emptyText?: string;
}) {
  const listId = useId();
  const root = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const selected = options.find((o) => o.id === value);
  const shown = useMemo(() => rankPlaces(options.map((o) => ({ ...o })), query), [options, query]);

  useEffect(() => setActive(0), [query, open]);
  useEffect(() => {
    if (!open) return;
    const el = root.current?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const choose = (o: PlaceOption) => {
    onChange(o.id);
    setOpen(false);
    setQuery("");
  };

  return (
    <div ref={root} className="relative">
      <input
        id={id}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-invalid={invalid}
        aria-describedby={describedBy}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        inputMode="search"
        enterKeyHint="done"
        disabled={disabled}
        className={input}
        placeholder={loading ? "Loading…" : placeholder}
        value={open ? query : selected ? `${selected.en}${selected.ar ? ` · ${selected.ar}` : ""}` : ""}
        onFocus={(e) => {
          setOpen(true);
          setQuery("");
          e.currentTarget.select();
        }}
        onClick={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onBlur={() => {
          setOpen(false);
          setQuery("");
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setActive((a) => Math.min(shown.length - 1, a + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(0, a - 1));
          } else if (e.key === "Enter" && open) {
            e.preventDefault();
            if (shown[active]) choose(shown[active]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      <span aria-hidden className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[18px] text-body">
        ▾
      </span>
      {open && !disabled && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Choices"
          className="glass-strong absolute left-0 right-0 z-30 mt-2 max-h-[min(55vh,360px)] overflow-y-auto overscroll-contain !rounded-[14px] py-1"
        >
          {shown.length === 0 ? (
            <li className="px-4 py-4 text-[17px] text-body" role="option" aria-disabled aria-selected={false}>
              {emptyText}
            </li>
          ) : (
            shown.map((o, i) => (
              <li
                key={o.id}
                role="option"
                aria-selected={o.id === value}
                data-index={i}
                // mouse/touch down is used (not click) so the input does not lose focus and close the list before the choice lands
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(o);
                }}
                onMouseEnter={() => setActive(i)}
                className={`flex min-h-14 cursor-pointer items-center justify-between gap-3 px-4 py-2 text-[18px] ${i === active ? "bg-acid/15" : ""} ${o.id === value ? "text-acid" : "text-fg"}`}
              >
                <span>{o.en}</span>
                {o.ar && (
                  <span lang="ar" dir="rtl" className="shrink-0 text-[18px] text-body">
                    {o.ar}
                  </span>
                )}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
