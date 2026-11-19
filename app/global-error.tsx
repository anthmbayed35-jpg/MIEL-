"use client";

/** Last resort when even the root layout fails. Self-contained, no stack traces. */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ background: "#23201C", color: "#F2EFE8", fontFamily: "system-ui, sans-serif", margin: 0, display: "grid", minHeight: "100vh", placeItems: "center", padding: 24 }}>
        <div style={{ maxWidth: 420 }}>
          <h1 style={{ fontSize: 28, margin: "0 0 12px" }}>Something went wrong</h1>
          <p style={{ color: "#CFCCC4", lineHeight: 1.55 }}>Please try again in a moment.</p>
          <button onClick={reset} style={{ marginTop: 16, minHeight: 56, padding: "0 28px", borderRadius: 14, border: 0, background: "#DAFC69", color: "#000", fontWeight: 700 }}>
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
