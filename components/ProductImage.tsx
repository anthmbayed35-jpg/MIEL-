import Image from "next/image";

/** Real image via next/image when `src` exists, otherwise a placeholder rectangle. */
export function ProductImage({
  src,
  alt,
  label,
  className = "",
  priority = false,
}: {
  src: string | null;
  alt: string;
  label: string;
  className?: string;
  priority?: boolean;
}) {
  if (src) {
    return (
      <div className={`relative overflow-hidden ${className}`}>
        <Image
          src={src}
          alt={alt}
          fill
          sizes="(min-width: 1024px) 33vw, 100vw"
          className="object-contain"
          priority={priority}
          loading={priority ? undefined : "lazy"}
        />
      </div>
    );
  }
  return (
    <div role="img" aria-label={`${alt} (image placeholder)`} className={`flex items-center justify-center ${className}`}>
      <span className="mono !text-body text-center opacity-70">{label}</span>
    </div>
  );
}
