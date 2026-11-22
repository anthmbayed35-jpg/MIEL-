"use client";

import { useState } from "react";

/** A read-only value (a link) with a Copy button, for things the team hands over by hand. */
export function CopyField({ label, value, note }: { label: string; value: string; note?: string }) {
  const [done, setDone] = useState(false);
  return (
    <div role="group" aria-label={label}>
      <p className="a-label">{label}</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input readOnly value={value} onFocus={(e) => e.currentTarget.select()} aria-label={label} className="a-input !text-[14px]" />
        <button
          type="button"
          className="pill-btn pill-lime shrink-0"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
              setDone(true);
              setTimeout(() => setDone(false), 2000);
            } catch {
              setDone(false); // clipboard blocked: the text above is selectable
            }
          }}
        >
          {done ? "Copied" : "Copy link"}
        </button>
      </div>
      {note && <p className="mt-2 text-[14px] text-body">{note}</p>}
    </div>
  );
}
