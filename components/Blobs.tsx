type Spot = { x: string; y: string; delay?: number; color?: string };

/** Soft glow blobs so the glass has colour to refract. Must sit in a `relative overflow-clip` parent. */
export function Blobs({ spots, float = false }: { spots: Spot[]; float?: boolean }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
      {spots.map((s, i) => (
        <span
          key={i}
          className={float ? "blob blob-float" : "blob"}
          style={{
            left: s.x,
            top: s.y,
            animationDelay: `${s.delay ?? i * -7}s`,
            background: s.color
              ? `radial-gradient(circle, ${s.color} 0%, transparent 70%)`
              : undefined,
          }}
        />
      ))}
    </div>
  );
}
