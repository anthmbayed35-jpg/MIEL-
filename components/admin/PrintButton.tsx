"use client";

export function PrintButton() {
  return (
    <button onClick={() => window.print()} className="pill-btn pill-lime">
      Print / Save as PDF
    </button>
  );
}
