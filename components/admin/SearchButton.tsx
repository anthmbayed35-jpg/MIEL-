"use client";

export function SearchButton() {
  return (
    <button onClick={() => window.dispatchEvent(new Event("admin:search"))} aria-label="Search (Ctrl or Cmd + K)" className="icon-btn !border-white/20 bg-black/25">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden>
        <circle cx="11" cy="11" r="6.5" />
        <path d="m20 20-4-4" />
      </svg>
    </button>
  );
}
