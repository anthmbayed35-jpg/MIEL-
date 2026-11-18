import { photoMeta } from "@/config/photos.generated";

/**
 * Responsive product photo: <picture> with AVIF + WebP at the sizes made by `npm run images`
 * (480/768/1080/1600, never upscaled), explicit width/height, a tiny blurred placeholder,
 * lazy loading unless `priority`. Fill the parent: the parent sets the aspect ratio (4:5).
 *
 * fit="cover" only where the container is also 4:5. Use fit="contain" in any other ratio so packaging is never cropped.
 */
export function Photo({
  src,
  alt,
  sizes,
  priority = false,
  fit = "cover",
  position = "center",
  className = "",
}: {
  src: string;
  alt: string;
  sizes: string;
  priority?: boolean;
  fit?: "cover" | "contain";
  position?: string;
  className?: string;
}) {
  const m = photoMeta[src];
  if (!m) return null;
  const set = (ext: string) => m.widths.map((w) => `${src}-${w}.${ext} ${w}w`).join(", ");
  const mid = m.widths.includes(1080) ? 1080 : m.widths[m.widths.length - 1];
  return (
    <span
      className={`relative block overflow-hidden ${className}`}
      style={fit === "cover" ? { backgroundImage: `url(${m.blur})`, backgroundSize: "cover" } : undefined}
    >
      <picture>
        <source type="image/avif" srcSet={set("avif")} sizes={sizes} />
        <source type="image/webp" srcSet={set("webp")} sizes={sizes} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`${src}-${mid}.webp`}
          alt={alt}
          width={m.width}
          height={m.height}
          sizes={sizes}
          loading={priority ? "eager" : "lazy"}
          decoding={priority ? "sync" : "async"}
          fetchPriority={priority ? "high" : "auto"}
          className={`absolute inset-0 h-full w-full ${fit === "cover" ? "object-cover" : "object-contain"}`}
          style={{ objectPosition: position }}
        />
      </picture>
    </span>
  );
}

/** Preload the LCP photo (call only for the home hero image). */
export function photoPreload(src: string, sizes: string) {
  const m = photoMeta[src];
  if (!m) return null;
  return {
    href: `${src}-${m.widths.includes(1080) ? 1080 : m.widths[m.widths.length - 1]}.avif`,
    imageSrcSet: m.widths.map((w) => `${src}-${w}.avif ${w}w`).join(", "),
    imageSizes: sizes,
  };
}
